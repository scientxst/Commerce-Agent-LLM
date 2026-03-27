"""Product database service with multi-source product fetching.

Source priority:
  1. RapidAPI Real-Time Product Search (if RAPIDAPI_KEY is set)
  2. eBay Browse API (if EBAY_CLIENT_ID + EBAY_CLIENT_SECRET are set)
  3. Local sample_products.json (fallback for development)
"""
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.schemas import Product
from app.utils.config import settings

log = logging.getLogger(__name__)

_DEFAULT_DATA_FILE = str(
    Path(__file__).resolve().parent.parent.parent / "data" / "sample_products.json"
)

# Broad queries run at startup to pre-populate the vector index
_WARMUP_QUERIES = [
    "shoes",
    "sneakers",
    "laptops",
    "headphones",
    "smartphones",
    "clothing",
    "watches",
    "handbags",
]

_SEARCH_CACHE_TTL = 1800   # 30 minutes
_PRODUCT_CACHE_TTL = 3600  # 1 hour


def _map_rapidapi_product(item: Dict[str, Any]) -> Product:
    """Convert a RapidAPI Real-Time Product Search result to our Product schema."""
    product_id = item.get("product_id", "")
    title = item.get("product_title", "Unknown Product")
    description = item.get("product_description") or title

    # Images
    photos = item.get("product_photos", [])
    image_url = photos[0] if photos else None

    # Rating & reviews
    try:
        rating = float(item.get("product_rating") or 0)
    except (TypeError, ValueError):
        rating = 0.0
    review_count = int(item.get("product_num_reviews") or 0)

    # Price — prefer the first offer, fall back to typical_price_range
    offer = item.get("offer") or {}
    price_str = offer.get("price_without_symbol") or offer.get("price", "0")
    try:
        price = float(str(price_str).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        price = 0.0

    if price == 0.0:
        price_range = item.get("typical_price_range", [])
        for pr in price_range:
            try:
                price = float(str(pr).replace(",", "").replace("$", "").strip())
                break
            except (TypeError, ValueError):
                continue

    # Merchant
    merchant_name = offer.get("store_name", "Online Retailer")

    # Attributes (brand, color, size, etc.)
    raw_attrs: Dict[str, Any] = item.get("product_attributes") or {}
    attrs_lower = {k.lower(): v for k, v in raw_attrs.items()}
    brand = attrs_lower.get("brand", "")
    sizes = [v for k, v in attrs_lower.items() if "size" in k and v]
    colors = [v for k, v in attrs_lower.items() if "color" in k and v]

    # Category — not provided by the API; use first breadcrumb or default
    categories = item.get("product_breadcrumbs", [])
    category = categories[-1] if categories else "General"

    product_url = item.get("product_page_url") or offer.get("offer_page_url")

    return Product(
        id=product_id,
        sku=product_id,
        name=title,
        description=description,
        category=category,
        category_path=categories,
        price=price,
        stock=10,  # RapidAPI doesn't expose stock counts
        rating=round(min(rating, 5.0), 1),
        review_count=review_count,
        image_url=image_url,
        merchant_id=merchant_name,
        merchant_name=merchant_name,
        product_url=product_url,
        attributes={
            "brand": brand,
            "sizes": sizes,
            "colors": colors,
            "condition": "New",
        },
        key_features=[f"Sold by {merchant_name}"],
    )


def _map_ebay_item(item: Dict[str, Any]) -> Product:
    """Convert an eBay itemSummary or item-detail dict to our Product schema."""
    item_id = item.get("itemId", "")

    # Aspects from item detail (localizedAspects) or search (not usually present)
    aspects: Dict[str, str] = {}
    for aspect in item.get("localizedAspects", []):
        aspects[aspect.get("name", "").lower()] = aspect.get("value", "")

    brand = aspects.get("brand", "")
    sizes = [v for k, v in aspects.items() if "size" in k and v]
    colors = [v for k, v in aspects.items() if "color" in k and v]

    seller = item.get("seller", {})
    merchant_name = seller.get("username", "eBay Seller")
    feedback = int(seller.get("feedbackScore", 0))

    # Normalize feedback score → 0-5 rating (1 000 → ~4.0, 100 000 → ~4.9)
    rating = round(min(4.0 + feedback / 100_000, 5.0), 1) if feedback else 4.0

    # Stock from estimated availability
    avail_list = item.get("estimatedAvailabilities", [{}])
    threshold = avail_list[0].get("availabilityThreshold", 10) if avail_list else 10
    stock = int(threshold) if isinstance(threshold, (int, float)) else 10

    # Price
    price = float(item.get("price", {}).get("value", 0) or 0)

    # Category
    cats = item.get("categories", [{}])
    category = cats[0].get("categoryName", "General") if cats else "General"
    category_path = [c.get("categoryName", "") for c in cats]

    # Image (prefer full image over thumbnail)
    image_url = item.get("image", {}).get("imageUrl")
    if not image_url:
        thumbs = item.get("thumbnailImages", [])
        if thumbs:
            image_url = thumbs[0].get("imageUrl")

    condition = item.get("condition", "New")
    title = item.get("title", "Unknown Product")
    description = (
        item.get("shortDescription")
        or item.get("description")
        or title
    )

    return Product(
        id=item_id,
        sku=item_id,
        name=title,
        description=description,
        category=category,
        category_path=category_path,
        price=price,
        stock=stock,
        rating=rating,
        review_count=feedback,
        image_url=image_url,
        merchant_id=merchant_name,
        merchant_name=merchant_name,
        product_url=item.get("itemWebUrl"),
        attributes={
            "brand": brand,
            "sizes": sizes,
            "colors": colors,
            "condition": condition,
        },
        key_features=[condition, f"Sold by {merchant_name}"],
    )


class ProductDBService:
    """Fetches products from multiple APIs with in-memory caching.

    Source priority:
      1. RapidAPI Real-Time Product Search (RAPIDAPI_KEY set)
      2. eBay Browse API (EBAY_CLIENT_ID + EBAY_CLIENT_SECRET set)
      3. Local sample_products.json (fallback)
    """

    def __init__(self, data_file: str = _DEFAULT_DATA_FILE):
        self._use_rapidapi = bool(getattr(settings, "RAPIDAPI_KEY", ""))
        self._use_ebay = bool(
            getattr(settings, "EBAY_CLIENT_ID", "") and
            getattr(settings, "EBAY_CLIENT_SECRET", "")
        )

        # id/sku → (Product, expires_at)
        self._product_cache: Dict[str, tuple] = {}
        # cache_key → (results_list, expires_at)
        self._search_cache: Dict[str, tuple] = {}

        if self._use_rapidapi:
            from app.services.rapidapi_client import RapidAPIProductClient
            self._rapidapi = RapidAPIProductClient()
            log.info("ProductDBService: using RapidAPI Real-Time Product Search")
        else:
            self._rapidapi = None

        if self._use_ebay:
            from app.services.ebay_client import EbayClient
            self._ebay = EbayClient()
            if not self._use_rapidapi:
                log.info("ProductDBService: using eBay Browse API")
        else:
            self._ebay = None

        if not self._use_rapidapi and not self._use_ebay:
            log.warning(
                "No external product API configured — "
                "falling back to sample product data"
            )
            self._load_sample_products(data_file)

    # ── Fallback: local sample data ──────────────────────────────────────────

    def _load_sample_products(self, data_file: str):
        try:
            with open(data_file) as f:
                for product_data in json.load(f):
                    product = Product(**product_data)
                    self._cache_product(product, ttl=86400)
        except FileNotFoundError:
            log.warning("Sample product file %s not found", data_file)

    # ── Cache helpers ────────────────────────────────────────────────────────

    def _cache_product(self, product: Product, ttl: int = _PRODUCT_CACHE_TTL):
        expires = time.time() + ttl
        self._product_cache[product.id] = (product, expires)
        self._product_cache[product.sku] = (product, expires)

    def _get_cached_product(self, key: str) -> Optional[Product]:
        entry = self._product_cache.get(key)
        if entry and time.time() < entry[1]:
            return entry[0]
        return None

    # ── Public interface ─────────────────────────────────────────────────────

    async def get_product(self, product_id: str) -> Optional[Product]:
        cached = self._get_cached_product(product_id)
        if cached:
            return cached

        if self._use_rapidapi:
            item = await self._rapidapi.get_product(product_id)
            if item:
                product = _map_rapidapi_product(item)
                self._cache_product(product)
                return product

        if self._use_ebay:
            item = await self._ebay.get_item(product_id)
            if item:
                product = _map_ebay_item(item)
                self._cache_product(product)
                return product

        return None

    async def search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        cache_key = f"{query}|{filters}"
        entry = self._search_cache.get(cache_key)
        if entry and time.time() < entry[1]:
            return entry[0]

        if self._use_rapidapi:
            items = await self._rapidapi.search(query, limit=20, filters=filters)
            results = []
            for item in items:
                product = _map_rapidapi_product(item)
                self._cache_product(product)
                results.append(product.dict())
            self._search_cache[cache_key] = (results, time.time() + _SEARCH_CACHE_TTL)
            return results

        if self._use_ebay:
            items = await self._ebay.search(query, limit=20, filters=filters)
            results = []
            for item in items:
                product = _map_ebay_item(item)
                self._cache_product(product)
                results.append(product.dict())
            self._search_cache[cache_key] = (results, time.time() + _SEARCH_CACHE_TTL)
            return results

        return self._keyword_search_sample(query, filters)

    async def get_by_category(self, category: str, limit: int = 10) -> List[Product]:
        if not self._use_rapidapi and not self._use_ebay:
            return self._sample_by_category(category, limit)

        cache_key = f"cat:{category}:{limit}"
        entry = self._search_cache.get(cache_key)
        if entry and time.time() < entry[1]:
            return [Product(**d) for d in entry[0]]

        if self._use_rapidapi:
            items = await self._rapidapi.search(category, limit=limit)
            products = [_map_rapidapi_product(i) for i in items]
        else:
            items = await self._ebay.search(category, limit=limit)
            products = [_map_ebay_item(i) for i in items]

        for p in products:
            self._cache_product(p)

        self._search_cache[cache_key] = (
            [p.dict() for p in products],
            time.time() + _SEARCH_CACHE_TTL,
        )
        return products

    def get_all_products(self) -> List[Product]:
        """Return all currently cached products (used to build the vector index)."""
        seen: set = set()
        products: List[Product] = []
        for key, (product, expires) in self._product_cache.items():
            if product.id == key and product.id not in seen and time.time() < expires:
                seen.add(product.id)
                products.append(product)
        return products

    async def warmup(self):
        """Pre-populate the cache by searching common categories on startup."""
        if not self._use_rapidapi and not self._use_ebay:
            return
        source = "RapidAPI" if self._use_rapidapi else "eBay"
        log.info("Warming up %s product cache...", source)
        for query in _WARMUP_QUERIES:
            try:
                await self.search(query)
                log.info("  cached results for '%s'", query)
            except Exception as exc:
                log.warning("  warmup failed for '%s': %s", query, exc)
        log.info("Warmup complete — %d products cached", len(self.get_all_products()))

    # ── Sample-data helpers (fallback only) ──────────────────────────────────

    def _keyword_search_sample(
        self, query: str, filters: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        tokens = query.lower().split()
        results = []
        seen: set = set()
        for key, (product, expires) in self._product_cache.items():
            if product.id != key or product.id in seen:
                continue
            seen.add(product.id)
            text = f"{product.name} {product.description} {product.category}".lower()
            if tokens and not all(t in text for t in tokens):
                continue
            if filters:
                if "max_price" in filters and product.price > filters["max_price"]:
                    continue
                if "min_price" in filters and product.price < filters["min_price"]:
                    continue
                if "category" in filters and filters["category"].lower() not in product.category.lower():
                    continue
                if "brand" in filters:
                    brand = product.attributes.get("brand", "").lower()
                    if filters["brand"].lower() not in brand:
                        continue
            results.append(product.dict())
        return results

    def _sample_by_category(self, category: str, limit: int) -> List[Product]:
        cat_lower = category.lower()
        results = []
        seen: set = set()
        for key, (product, _) in self._product_cache.items():
            if product.id != key or product.id in seen:
                continue
            seen.add(product.id)
            if cat_lower in product.category.lower():
                results.append(product)
                if len(results) >= limit:
                    break
        return results
