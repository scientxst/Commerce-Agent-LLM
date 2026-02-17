"""Tool definitions in OpenAI function-calling format."""

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search the product catalog using natural language. Returns products matching the query with prices, ratings, and availability.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query (e.g. 'comfortable running shoes under $150')",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter (e.g. 'Electronics', 'Women\\'s Shoes')",
                    },
                    "max_price": {
                        "type": "number",
                        "description": "Maximum price filter",
                    },
                    "brand": {
                        "type": "string",
                        "description": "Brand filter",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Get full details for a specific product including real-time price, stock, sizes, and colors.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "string",
                        "description": "Product ID (e.g. 'prod_001') or SKU",
                    },
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_cart",
            "description": "Add a product to the user's shopping cart.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "string",
                        "description": "Product ID to add",
                    },
                    "quantity": {
                        "type": "integer",
                        "description": "Number of items (default 1)",
                        "default": 1,
                    },
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cart",
            "description": "Retrieve the current contents and total of the user's shopping cart.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_order_status",
            "description": "Look up shipping and delivery status for an order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "Order ID (e.g. 'ORD-2024-001')",
                    },
                },
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browse_category",
            "description": "List products in a given category for casual browsing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Category name (e.g. 'Electronics', 'Women\\'s Shoes', 'Home & Kitchen')",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of products to return (default 6)",
                        "default": 6,
                    },
                },
                "required": ["category"],
            },
        },
    },
]
