"""User database service (in-memory storage)."""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from app.models.schemas import CartItem, OrderStatus, UserPreferences


class UserDBService:
    """In-memory user data store for carts, orders, and preferences."""

    def __init__(self):
        self.carts: Dict[str, List[CartItem]] = {}
        self.preferences: Dict[str, UserPreferences] = {}
        self.orders: Dict[str, OrderStatus] = self._create_mock_orders()

    def _create_mock_orders(self) -> Dict[str, OrderStatus]:
        now = datetime.now()
        return {
            "ORD-2024-001": OrderStatus(
                order_id="ORD-2024-001",
                status="In Transit",
                shipped_at=(now - timedelta(days=2)).isoformat(),
                estimated_delivery=(now + timedelta(days=3)).isoformat(),
                current_location="Distribution Center - Los Angeles",
                tracking_url="https://tracking.example.com/ORD-2024-001",
            ),
            "ORD-2024-002": OrderStatus(
                order_id="ORD-2024-002",
                status="Delivered",
                shipped_at=(now - timedelta(days=5)).isoformat(),
                estimated_delivery=(now - timedelta(days=1)).isoformat(),
                current_location="Delivered",
                tracking_url="https://tracking.example.com/ORD-2024-002",
            ),
        }

    async def add_to_cart(self, user_id: str, item: CartItem) -> List[CartItem]:
        if user_id not in self.carts:
            self.carts[user_id] = []

        existing = next(
            (ci for ci in self.carts[user_id]
             if ci.product_id == item.product_id and ci.variant_id == item.variant_id),
            None,
        )
        if existing:
            existing.quantity += item.quantity
            if item.selected_size:
                existing.selected_size = item.selected_size
            if item.selected_color:
                existing.selected_color = item.selected_color
        else:
            self.carts[user_id].append(item)

        return self.carts[user_id]

    async def get_cart(self, user_id: str) -> List[CartItem]:
        return self.carts.get(user_id, [])

    async def remove_from_cart(self, user_id: str, product_id: str):
        if user_id in self.carts:
            self.carts[user_id] = [
                ci for ci in self.carts[user_id] if ci.product_id != product_id
            ]

    async def update_cart_quantity(self, user_id: str, product_id: str, quantity: int):
        if user_id not in self.carts:
            return
        if quantity <= 0:
            await self.remove_from_cart(user_id, product_id)
            return
        for ci in self.carts[user_id]:
            if ci.product_id == product_id:
                ci.quantity = quantity
                break

    async def clear_cart(self, user_id: str):
        if user_id in self.carts:
            self.carts[user_id] = []

    async def get_order_status(self, order_id: str) -> Optional[OrderStatus]:
        return self.orders.get(order_id)

    async def get_preferences(self, user_id: str) -> UserPreferences:
        if user_id not in self.preferences:
            self.preferences[user_id] = UserPreferences(
                brands=["Nike", "Clarks", "Apple"],
                sizes=["8", "M", "L"],
                styles=["casual", "comfortable", "modern"],
                price_range={"min": 0, "max": 500},
            )
        return self.preferences[user_id]

    async def update_preferences(self, user_id: str, preferences: UserPreferences):
        self.preferences[user_id] = preferences
