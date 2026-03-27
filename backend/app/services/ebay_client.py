"""eBay Browse API client with OAuth token management."""
import base64
import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from app.utils.config import settings

log = logging.getLogger(__name__)

EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
EBAY_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item"
EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope"


class EbayClient:
    """Handles eBay OAuth tokens and Browse API calls."""

    def __init__(self):
        self._access_token: Optional[str] = None
        self._token_expires: float = 0

    async def _get_token(self) -> str:
        if self._access_token and time.time() < self._token_expires - 60:
            return self._access_token

        credentials = base64.b64encode(
            f"{settings.EBAY_CLIENT_ID}:{settings.EBAY_CLIENT_SECRET}".encode()
        ).decode()

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                EBAY_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials", "scope": EBAY_SCOPE},
            )
            resp.raise_for_status()
            data = resp.json()
            self._access_token = data["access_token"]
            self._token_expires = time.time() + data["expires_in"]
            log.info("eBay access token refreshed")
            return self._access_token

    async def search(
        self,
        query: str,
        limit: int = 20,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search eBay listings and return itemSummaries."""
        token = await self._get_token()

        params: Dict[str, str] = {
            "q": query,
            "limit": str(min(limit, 50)),
        }

        filter_parts: List[str] = []
        if filters:
            if "max_price" in filters and "min_price" in filters:
                filter_parts.append(f"price:[{filters['min_price']}..{filters['max_price']}],priceCurrency:USD")
            elif "max_price" in filters:
                filter_parts.append(f"price:[..{filters['max_price']}],priceCurrency:USD")
            elif "min_price" in filters:
                filter_parts.append(f"price:[{filters['min_price']}..],priceCurrency:USD")

            if "category" in filters:
                # Append category to query for better results
                params["q"] = f"{query} {filters['category']}"

        if filter_parts:
            params["filter"] = ",".join(filter_parts)

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                EBAY_SEARCH_URL,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )

        if resp.status_code != 200:
            log.warning("eBay search error %s: %s", resp.status_code, resp.text[:300])
            return []

        return resp.json().get("itemSummaries", [])

    async def get_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full item detail by eBay item ID."""
        token = await self._get_token()

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{EBAY_ITEM_URL}/{item_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"fieldgroups": "PRODUCT,ADDITIONAL_SELLER_DETAILS"},
            )

        if resp.status_code != 200:
            log.warning("eBay item fetch error %s for %s", resp.status_code, item_id)
            return None

        return resp.json()
