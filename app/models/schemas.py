"""Data models for the shopping assistant."""
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class Intent(str, Enum):
    BROWSE = "BROWSE"
    SEARCH = "SEARCH"
    PURCHASE = "PURCHASE"
    SUPPORT = "SUPPORT"
    INQUIRY = "INQUIRY"


class IntentClassification(BaseModel):
    intent: Intent
    confidence: float
    entities: Dict[str, Any] = Field(default_factory=dict)


class Merchant(BaseModel):
    id: str
    name: str
    logo_url: Optional[str] = None
    rating: Optional[float] = None


class Product(BaseModel):
    id: str
    sku: str
    name: str
    description: str
    category: str
    price: float
    stock: int
    rating: float
    image_url: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    key_features: List[str] = Field(default_factory=list)
    review_count: int = 0
    category_path: List[str] = Field(default_factory=list)
    merchant_id: str = "default"
    merchant_name: str = "Our Store"


class CartItem(BaseModel):
    product_id: str
    quantity: int
    variant_id: Optional[str] = None
    selected_size: Optional[str] = None
    selected_color: Optional[str] = None


class CartItemDetail(BaseModel):
    """Cart item enriched with product info for display."""
    product_id: str
    name: str
    price: float
    quantity: int
    image_url: Optional[str] = None
    merchant_id: str
    merchant_name: str
    selected_size: Optional[str] = None
    selected_color: Optional[str] = None
    line_total: float


class CartSummary(BaseModel):
    """Full cart summary grouped by merchant."""
    items: List[CartItemDetail] = Field(default_factory=list)
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    item_count: int = 0
    merchants: List[str] = Field(default_factory=list)


class CartResponse(BaseModel):
    success: bool
    message: str
    cart: Optional[List[CartItem]] = None
    total: Optional[float] = None


class OrderStatus(BaseModel):
    order_id: str
    status: str
    shipped_at: Optional[str] = None
    estimated_delivery: Optional[str] = None
    current_location: Optional[str] = None
    tracking_url: Optional[str] = None


class UserPreferences(BaseModel):
    brands: List[str] = Field(default_factory=list)
    sizes: List[str] = Field(default_factory=list)
    styles: List[str] = Field(default_factory=list)
    price_range: Optional[Dict[str, float]] = None


class ConversationContext(BaseModel):
    user_id: str
    session_id: str
    messages: List[Dict[str, str]] = Field(default_factory=list)
    user_preferences: Optional[UserPreferences] = None
    session_data: Dict[str, Any] = Field(default_factory=dict)
    recent_products: List[str] = Field(default_factory=list)
    cart_items: List[CartItem] = Field(default_factory=list)


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str


class ChatResponse(BaseModel):
    message: str
    product_cards: Optional[List[Dict[str, Any]]] = None
    suggested_actions: Optional[List[str]] = None


class AddToCartRequest(BaseModel):
    user_id: str
    product_id: str
    quantity: int = 1
    selected_size: Optional[str] = None
    selected_color: Optional[str] = None


class UpdateCartRequest(BaseModel):
    quantity: int


class CheckoutRequest(BaseModel):
    user_id: str
    shipping_name: str = ""
    shipping_address: str = ""
    shipping_city: str = ""
    shipping_state: str = ""
    shipping_zip: str = ""


class CheckoutResponse(BaseModel):
    checkout_url: Optional[str] = None
    session_id: Optional[str] = None
    order_summary: Optional[CartSummary] = None
    error: Optional[str] = None
