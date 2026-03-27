"""Real-Time Product Search client (RapidAPI)."""
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.utils.config import settings

log = logging.getLogger(__name__)

RAPIDAPI_HOST = "real-time-product-search.p.rapidapi.com"
RAPIDAPI_BASE_URL = f"https://{RAPIDAPI_HOST}"


class RapidAPIProductClient:
    """Client for the Real-Time Product Search API via RapidAPI.

    Searches across multiple retailers (Amazon, Walmart, Target, etc.)
    using the real-time-product-search endpoint.
    """

    def __init__(self):
        self._headers = {
            "X-RapidAPI-Key": settings.RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
        }

    async def search(
        self,
        query: str,
        limit: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
    ) -> List[Dict[str, Any]]:
        """Search products via /search-v2 and return a list of product dicts."""
        params: Dict[str, Any] = {
            "q": query,
            "country": "us",
            "language": "en",
            "page": str(page),
            "limit": str(min(limit, 10)),
            "sort_by": "BEST_MATCH",
            "product_condition": "ANY",
            "return_filters": "true",
        }

        if filters:
            if "min_price" in filters:
                params["min_price"] = str(filters["min_price"])
            if "max_price" in filters:
                params["max_price"] = str(filters["max_price"])

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{RAPIDAPI_BASE_URL}/search-v2",
                headers=self._headers,
                params=params,
            )

        if resp.status_code != 200:
            log.warning(
                "RapidAPI search error %s: %s", resp.status_code, resp.text[:300]
            )
            return []

        data = resp.json()
        # search-v2 nests results under data.products or data.items
        products = (
            data.get("data", {}).get("products")
            or data.get("data", {}).get("items")
            or []
        )
        return products

    async def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full product details by product ID."""
        params = {
            "product_id": product_id,
            "country": "us",
            "language": "en",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{RAPIDAPI_BASE_URL}/product-details",
                headers=self._headers,
                params=params,
            )

        if resp.status_code != 200:
            log.warning(
                "RapidAPI product detail error %s for %s",
                resp.status_code,
                product_id,
            )
            return None

        return resp.json().get("data", {}).get("product")
