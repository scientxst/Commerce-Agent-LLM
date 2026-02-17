"""Local vector database using numpy for semantic search."""
import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np
from openai import AsyncOpenAI

from app.utils.config import settings

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
EMBEDDINGS_CACHE = DATA_DIR / "embeddings_cache.json"


class VectorDBService:
    """In-process vector store backed by numpy.

    On first run, generates embeddings via OpenAI and caches them to disk.
    Subsequent startups load from cache instantly.
    """

    def __init__(self):
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._ids: List[str] = []
        self._metadata: List[Dict[str, Any]] = []
        self._vectors: Optional[np.ndarray] = None

    @property
    def num_entities(self) -> int:
        return len(self._ids)

    async def build_index(self, products: List[Dict[str, Any]]):
        """Build or load the vector index for a list of products.

        Gracefully degrades to metadata-only (no vectors) if embeddings
        cannot be generated (e.g. OpenAI unreachable).
        """
        # Always populate metadata so keyword/filter search works
        self._ids = [p["id"] for p in products]
        self._metadata = [
            {
                "id": p["id"],
                "sku": p["sku"],
                "name": p["name"],
                "category": p["category"],
                "brand": p.get("attributes", {}).get("brand", ""),
                "price": p["price"],
                "stock": p["stock"],
                "rating": p["rating"],
                "merchant_id": p.get("merchant_id", "default"),
                "merchant_name": p.get("merchant_name", "Our Store"),
            }
            for p in products
        ]

        # Try loading cached embeddings
        cached = self._load_cache()
        cached_ids = set(cached["ids"]) if cached else set()
        product_ids = {p["id"] for p in products}

        if cached and cached_ids == product_ids:
            self._vectors = np.array(cached["vectors"], dtype=np.float32)
            log.info("Loaded %d embeddings from cache", len(self._ids))
            return

        # Try generating fresh embeddings
        try:
            log.info("Generating embeddings for %d products", len(products))
            texts = []
            for p in products:
                text = f"{p['name']}. {p['description']}"
                if p.get("key_features"):
                    text += " Features: " + ", ".join(p["key_features"])
                if p.get("merchant_name"):
                    text += f" Sold by {p['merchant_name']}."
                texts.append(text)

            embeddings = await self._embed_batch(texts)
            self._vectors = np.array(embeddings, dtype=np.float32)
            self._save_cache()
            log.info("Built index with %d vectors", len(self._ids))
        except Exception as exc:
            log.warning("Could not generate embeddings (%s). Semantic search disabled, keyword search still works.", exc)
            self._vectors = None

    async def search(
        self,
        query: str = "",
        vector: Optional[List[float]] = None,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """Cosine similarity search over the product index.

        Falls back to filter-only search if vectors are not available.
        """
        if len(self._ids) == 0:
            return []

        # If we have vectors, do semantic search
        if self._vectors is not None:
            if vector is None:
                try:
                    vector = await self.embed_query(query)
                except Exception:
                    vector = None

            if vector is not None:
                q = np.array(vector, dtype=np.float32)
                q_norm = q / (np.linalg.norm(q) + 1e-9)
                norms = np.linalg.norm(self._vectors, axis=1, keepdims=True) + 1e-9
                similarities = (self._vectors / norms) @ q_norm
                ranked = np.argsort(-similarities)
            else:
                # No vector available — fall through to filter-only
                similarities = None
                ranked = list(range(len(self._ids)))
        else:
            similarities = None
            ranked = list(range(len(self._ids)))

        results = []
        for idx in ranked:
            idx = int(idx)
            meta = self._metadata[idx]
            if filters:
                if "category" in filters and filters["category"].lower() not in meta.get("category", "").lower():
                    continue
                if "max_price" in filters and meta["price"] > filters["max_price"]:
                    continue
                if "min_price" in filters and meta["price"] < filters["min_price"]:
                    continue
                if "brand" in filters and filters["brand"].lower() not in meta.get("brand", "").lower():
                    continue
                if filters.get("in_stock_only", True) and meta["stock"] <= 0:
                    continue
            score = float(similarities[idx]) if similarities is not None else 0.0
            results.append({**meta, "score": score})
            if len(results) >= top_k:
                break

        return results

    async def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query string."""
        resp = await self._client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=text,
        )
        return resp.data[0].embedding

    async def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a batch of texts."""
        batch_size = 100
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = await self._client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=batch,
            )
            all_embeddings.extend([d.embedding for d in resp.data])
        return all_embeddings

    def _load_cache(self) -> Optional[Dict]:
        if not EMBEDDINGS_CACHE.exists():
            return None
        try:
            with open(EMBEDDINGS_CACHE) as f:
                return json.load(f)
        except (json.JSONDecodeError, KeyError):
            return None

    def _save_cache(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "ids": self._ids,
            "metadata": self._metadata,
            "vectors": self._vectors.tolist() if self._vectors is not None else [],
        }
        with open(EMBEDDINGS_CACHE, "w") as f:
            json.dump(payload, f)
