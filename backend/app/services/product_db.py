"""Product database service (mock implementation)."""
import json
from typing import List, Dict, Any, Optional
from app.models.schemas import Product


class ProductDBService:
    """Mock product database service."""

    def __init__(self, data_file: str = "backend/data/sample_products.json"):
        """Initialize product database."""
        self.data_file = data_file
        self.products = {}
        self._load_products()

    def _load_products(self):
        """Load products from JSON file."""
        try:
            with open(self.data_file, 'r') as f:
                products_list = json.load(f)
                for product_data in products_list:
                    product = Product(**product_data)
                    self.products[product.id] = product
                    self.products[product.sku] = product  # Also index by SKU
        except FileNotFoundError:
            print(f"Warning: Product data file {self.data_file} not found")
            self.products = {}

    async def get_product(self, product_id: str) -> Optional[Product]:
        """
        Get product by ID or SKU.

        Args:
            product_id: Product ID or SKU

        Returns:
            Product if found, None otherwise
        """
        return self.products.get(product_id)

    async def search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Keyword search for products.

        Args:
            query: Search query
            filters: Optional filters

        Returns:
            List of matching products
        """
        query_lower = query.lower()
        query_tokens = query_lower.split()
        results = []

        for product in self.products.values():
            # Skip duplicates (indexed by both ID and SKU)
            if isinstance(product, Product):
                # Build searchable text from all product fields
                text = f"{product.sku} {product.name} {product.description} {product.category}".lower()
                if product.key_features:
                    text += " " + " ".join(product.key_features).lower()
                if product.merchant_name:
                    text += " " + product.merchant_name.lower()

                # Match if ALL query tokens appear in the text (empty query matches everything)
                if not query_tokens or all(tok in text for tok in query_tokens):

                    # Apply filters
                    if filters:
                        if "category" in filters and filters["category"] not in product.category:
                            continue
                        if "min_price" in filters and product.price < filters["min_price"]:
                            continue
                        if "max_price" in filters and product.price > filters["max_price"]:
                            continue
                        if "brand" in filters:
                            product_brand = product.attributes.get("brand", "").lower()
                            if filters["brand"].lower() not in product_brand:
                                continue
                        if filters.get("in_stock_only", True) and product.stock <= 0:
                            continue

                    results.append(product.dict())

        # Remove duplicates by ID
        seen_ids = set()
        unique_results = []
        for result in results:
            if result["id"] not in seen_ids:
                seen_ids.add(result["id"])
                unique_results.append(result)

        return unique_results

    async def get_by_category(
        self,
        category: str,
        limit: int = 10
    ) -> List[Product]:
        """
        Get products by category.

        Args:
            category: Category name or path
            limit: Maximum results

        Returns:
            List of products in category
        """
        category_lower = category.lower()
        results = []

        for product_id, product in self.products.items():
            # Only process Product objects (not duplicates from SKU index)
            if isinstance(product, Product):
                if category_lower in product.category.lower():
                    results.append(product)
                    if len(results) >= limit:
                        break

        return results

    def get_all_products(self) -> List[Product]:
        """Get all products (for embedding generation)."""
        seen_ids = set()
        products = []
        for product in self.products.values():
            if isinstance(product, Product) and product.id not in seen_ids:
                seen_ids.add(product.id)
                products.append(product)
        return products
