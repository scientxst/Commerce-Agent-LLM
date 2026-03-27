"""SerpAPI Google Shopping client."""
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.utils.config import settings

log = logging.getLogger(__name__)

SERPAPI_BASE_URL = "https://serpapi.com/search"


class SerpAPIClient:
    """Client for Google Shopping results via SerpAPI."""

    def __init__(self):
        self._api_key = settings.SERPAPI_KEY

    async def search(
        self,
        query: str,
        limit: int = 20,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search Google Shopping and return a list of shopping result dicts."""
        params: Dict[str, Any] = {
            "engine": "google_shopping",
            "q": query,
            "api_key": self._api_key,
            "num": str(min(limit, 40)),
            "gl": "us",
            "hl": "en",
        }

        if filters:
            price_parts = []
            if "min_price" in filters:
                price_parts.append(f"ppr_min:{int(filters['min_price'])}")
            if "max_price" in filters:
                price_parts.append(f"ppr_max:{int(filters['max_price'])}")
            if price_parts:
                params["tbs"] = "mr:1,price:1," + ",".join(price_parts)

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(SERPAPI_BASE_URL, params=params)

        if resp.status_code != 200:
            log.warning(
                "SerpAPI search error %s: %s", resp.status_code, resp.text[:300]
            )
            return []

        return resp.json().get("shopping_results", [])

    async def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full product details via Google Product engine."""
        params = {
            "engine": "google_product",
            "product_id": product_id,
            "api_key": self._api_key,
            "gl": "us",
            "hl": "en",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(SERPAPI_BASE_URL, params=params)

        if resp.status_code != 200:
            log.warning(
                "SerpAPI product detail error %s for %s",
                resp.status_code,
                product_id,
            )
            return None

        return resp.json().get("product_results")
