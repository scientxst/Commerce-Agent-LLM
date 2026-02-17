"""Tool execution — dispatches tool calls from the ReAct loop."""
import json
import logging
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

    async def run(self, tool_name: str, args: Dict[str, Any], user_id: str = "default") -> str:
        """Execute a tool call and return JSON string result."""
        handler = self._dispatch.get(tool_name)
        if not handler:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
        try:
            result = await handler(args, user_id)
            serialized = json.dumps(result, default=str)
            if len(serialized) > 6000:
                # Truncate product lists to fit context window
                if isinstance(result, dict) and "products" in result:
                    result["products"] = result["products"][:4]
                    result["truncated"] = True
                    serialized = json.dumps(result, default=str)
            return serialized
        except Exception as exc:
            log.error("Tool %s failed: %s", tool_name, exc)
            return json.dumps({"error": str(exc)})

    async def _search_products(self, args: Dict, user_id: str) -> Any:
        """Hybrid search: semantic (vector) + keyword, merged via RRF."""
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
            query=query, top_k=10, filters=filters if filters else None
        )

        # Keyword search
        keyword_results = await self.product_db.search(
            query=query, filters=filters if filters else None
        )

        # Reciprocal Rank Fusion
        fused = self._rrf(semantic_results, keyword_results)

        # Enrich top results with full product data
        enriched = []
        for item in fused[:6]:
            product = await self.product_db.get_product(item["id"])
            if product:
                enriched.append(product.dict())
            else:
                enriched.append(item)

        return {"products": enriched, "count": len(enriched)}

    async def _get_product_details(self, args: Dict, user_id: str) -> Any:
        product = await self.product_db.get_product(args.get("product_id", ""))
        if not product:
            return {"error": "Product not found"}
        return product.dict()

    async def _add_to_cart(self, args: Dict, user_id: str) -> Any:
        product_id = args.get("product_id", "")
        quantity = args.get("quantity", 1)

        product = await self.product_db.get_product(product_id)
        if not product:
            return {"success": False, "message": "Product not found"}
        if product.stock < quantity:
            return {"success": False, "message": f"Only {product.stock} in stock"}

        cart = await self.user_db.add_to_cart(
            user_id=user_id,
            item=CartItem(product_id=product_id, quantity=quantity),
        )
        total = await self._calculate_cart_total(cart)
        return {
            "success": True,
            "message": f"Added {product.name} to cart",
            "cart_count": sum(i.quantity for i in cart),
            "cart_total": total,
        }

    async def _get_cart(self, args: Dict, user_id: str) -> Any:
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

    async def _get_order_status(self, args: Dict, user_id: str) -> Any:
        order = await self.user_db.get_order_status(args.get("order_id", ""))
        if not order:
            return {"error": "Order not found"}
        return order.dict()

    async def _browse_category(self, args: Dict, user_id: str) -> Any:
        category = args.get("category", "")
        limit = args.get("limit", 6)
        products = await self.product_db.get_by_category(category, limit)
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
