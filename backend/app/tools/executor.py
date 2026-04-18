"""Tool execution — dispatches tool calls from the ReAct loop."""
import json
import logging
import uuid
from typing import Dict, Any, Optional, List

from app.models.schemas import Product, CartResponse, CartItem, CartItemDetail, CartSummary
from app.utils.config import settings

log = logging.getLogger(__name__)


class ToolExecutor:
    """Dispatches tool calls and returns JSON-serializable results."""

    def __init__(self, vector_db, product_db, user_db):
        self.vector_db = vector_db
        self.product_db = product_db
        self.user_db = user_db

        self._dispatch = {
            "search_products": self._search_products,
            "get_product_details": self._get_product_details,
            "add_to_cart": self._add_to_cart,
            "get_cart": self._get_cart,
            "get_order_status": self._get_order_status,
            "browse_category": self._browse_category,
        }

    async def run(
        self, tool_name: str, args: Dict[str, Any],
        user_id: str = "default", category: Optional[str] = None,
    ) -> str:
        """Execute a tool call and return JSON string result."""
        handler = self._dispatch.get(tool_name)
        if not handler:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
        try:
            result = await handler(args, user_id, category=category)
            serialized = json.dumps(result, default=str)
            if len(serialized) > 6000:
                # Truncate product lists to fit context window
                if isinstance(result, dict) and "products" in result:
                    result["products"] = result["products"][:4]
                    result["truncated"] = True
                    serialized = json.dumps(result, default=str)
            return serialized
        except Exception as exc:
            correlation_id = uuid.uuid4().hex[:12]
            log.error("Tool %s failed [corr=%s]: %s", tool_name, correlation_id, exc)
            return json.dumps({
                "error": "Tool execution failed.",
                "correlation_id": correlation_id,
            })

    async def _search_products(self, args: Dict, user_id: str, category: Optional[str] = None, **kwargs) -> Any:
        """
        Hybrid search: semantic (vector) + keyword via RRF, then preference re-rank.

        BEFORE: Results were ranked purely by RRF score — every user got the same
                ordering regardless of stated preferences. The user_id param was
                accepted but never used.
        AFTER:  After RRF, stored user preferences (brand, price ceiling, sizes,
                styles) are read and used to float matching products to the top
                without demoting non-matching ones. A user who said "I always buy
                Nike under $100" will consistently see Nike products priced under
                $100 ranked first across all future searches this session.
        """
        query = args.get("query", "")
        filters = {}
        if args.get("category"):
            filters["category"] = args["category"]
        if args.get("max_price"):
            filters["max_price"] = args["max_price"]
        if args.get("brand"):
            filters["brand"] = args["brand"]

        # Semantic search
        semantic_results = await self.vector_db.search(
            query=query, top_k=12, filters=filters if filters else None
        )

        # Keyword search (category-aware routing)
        keyword_results = await self.product_db.search(
            query=query, filters=filters if filters else None,
            category_hint=category,
        )

        # Reciprocal Rank Fusion
        fused = self._rrf(semantic_results, keyword_results)

        # Preference-based re-ranking (stable — boosts matches, never demotes)
        user_prefs = await self.user_db.get_preferences(user_id)
        if user_prefs and (user_prefs.brands or user_prefs.price_range or
                           user_prefs.sizes or user_prefs.styles):
            fused = self._rerank_by_preferences(fused, user_prefs)
            log.info(
                "Re-ranked %d results by preferences for %s (brands=%s price=%s)",
                len(fused), user_id, user_prefs.brands, user_prefs.price_range,
            )

        # Enrich top results with full product data
        enriched = []
        for item in fused[:8]:
            product = await self.product_db.get_product(item["id"])
            if product:
                enriched.append(product.dict())
            else:
                enriched.append(item)

        return {"products": enriched, "count": len(enriched)}

    async def _get_product_details(self, args: Dict, user_id: str, **kwargs) -> Any:
        product = await self.product_db.get_product(args.get("product_id", ""))
        if not product:
            return {"error": "Product not found"}
        return product.dict()

    async def _add_to_cart(self, args: Dict, user_id: str, **kwargs) -> Any:
        product_id = args.get("product_id", "")
        quantity = args.get("quantity", 1)

        product = await self.product_db.get_product(product_id)
        if not product:
            return {"success": False, "message": "Product not found"}
        if product.stock < quantity:
            return {"success": False, "message": f"Only {product.stock} in stock"}

        cart = await self.user_db.add_to_cart(
            user_id=user_id,
            item=CartItem(
                product_id=product_id,
                quantity=quantity,
                selected_size=args.get("selected_size"),
                selected_color=args.get("selected_color"),
            ),
        )
        total = await self._calculate_cart_total(cart)
        return {
            "success": True,
            "message": f"Added {product.name} to cart",
            "cart_count": sum(i.quantity for i in cart),
            "cart_total": total,
        }

    async def _get_cart(self, args: Dict, user_id: str, **kwargs) -> Any:
        cart = await self.user_db.get_cart(user_id)
        if not cart:
            return {"items": [], "total": 0, "message": "Cart is empty"}

        items = []
        for ci in cart:
            product = await self.product_db.get_product(ci.product_id)
            if product:
                items.append({
                    "product_id": ci.product_id,
                    "name": product.name,
                    "price": product.price,
                    "quantity": ci.quantity,
                    "merchant_name": product.merchant_name,
                    "line_total": product.price * ci.quantity,
                })
        total = sum(i["line_total"] for i in items)
        return {"items": items, "total": round(total, 2)}

    async def _get_order_status(self, args: Dict, user_id: str, **kwargs) -> Any:
        order = await self.user_db.get_order_status(args.get("order_id", ""))
        if not order:
            return {"error": "Order not found"}
        return order.dict()

    async def _browse_category(self, args: Dict, user_id: str, category: Optional[str] = None, **kwargs) -> Any:
        browse_cat = args.get("category", "")
        limit = args.get("limit", 6)
        products = await self.product_db.get_by_category(browse_cat, limit)
        return {"products": [p.dict() for p in products], "count": len(products)}

    async def get_cart_summary(self, user_id: str) -> CartSummary:
        """Build a full cart summary with tax, grouped by merchant."""
        cart = await self.user_db.get_cart(user_id)
        items = []
        merchants = set()

        for ci in cart:
            product = await self.product_db.get_product(ci.product_id)
            if not product:
                continue
            line_total = product.price * ci.quantity
            items.append(CartItemDetail(
                product_id=ci.product_id,
                name=product.name,
                price=product.price,
                quantity=ci.quantity,
                image_url=product.image_url,
                merchant_id=product.merchant_id,
                merchant_name=product.merchant_name,
                selected_size=ci.selected_size,
                selected_color=ci.selected_color,
                line_total=round(line_total, 2),
            ))
            merchants.add(product.merchant_name)

        subtotal = round(sum(i.line_total for i in items), 2)
        tax = round(subtotal * settings.TAX_RATE, 2)
        total = round(subtotal + tax, 2)

        return CartSummary(
            items=items,
            subtotal=subtotal,
            tax=tax,
            total=total,
            item_count=sum(i.quantity for i in items),
            merchants=sorted(merchants),
        )

    async def _calculate_cart_total(self, cart: List[CartItem]) -> float:
        total = 0.0
        for item in cart:
            product = await self.product_db.get_product(item.product_id)
            if product:
                total += product.price * item.quantity
        return round(total, 2)

    @staticmethod
    def _rerank_by_preferences(products: List[Dict], prefs) -> List[Dict]:
        """
        Stable preference re-ranking: products matching stored user preferences
        float upward; non-matching products keep their original RRF positions.

        Scoring:
          +2.0  brand match (strongest signal — explicit stated preference)
          +1.0  within stated price ceiling
          +0.5  available in preferred size
          +0.5  style keyword match in name/description
        """
        def pref_score(p: Dict) -> float:
            score = 0.0
            attrs = p.get("attributes", {}) or {}
            name_desc = (
                (p.get("name", "") or "") + " " + (p.get("description", "") or "")
            ).lower()

            if prefs.brands:
                brand = (attrs.get("brand", "") or "").lower()
                if any(b.lower() in brand or b.lower() in name_desc for b in prefs.brands):
                    score += 2.0

            if prefs.price_range:
                try:
                    price = float(p.get("price", 99999))
                    max_p = float(prefs.price_range.get("max", 99999))
                    if price <= max_p:
                        score += 1.0
                except (TypeError, ValueError):
                    pass

            if prefs.sizes:
                sizes = attrs.get("sizes", []) or []
                if any(s in sizes for s in prefs.sizes):
                    score += 0.5

            if prefs.styles:
                if any(st.lower() in name_desc for st in prefs.styles):
                    score += 0.5

            return score

        # Sort by (-score, original_index) for stable ordering
        return [
            p for _, p in sorted(
                enumerate(products),
                key=lambda x: (-pref_score(x[1]), x[0]),
            )
        ]

    @staticmethod
    def _rrf(semantic: List[Dict], keyword: List[Dict], k: int = 60) -> List[Dict]:
        """Reciprocal Rank Fusion to merge two ranked lists."""
        scores = {}
        data = {}
        for rank, r in enumerate(semantic, 1):
            pid = r["id"]
            scores[pid] = scores.get(pid, 0) + 1 / (k + rank)
            data[pid] = r
        for rank, r in enumerate(keyword, 1):
            pid = r["id"]
            scores[pid] = scores.get(pid, 0) + 1 / (k + rank)
            if pid not in data:
                data[pid] = r
        ranked_ids = sorted(scores, key=scores.get, reverse=True)
        return [data[pid] for pid in ranked_ids]
