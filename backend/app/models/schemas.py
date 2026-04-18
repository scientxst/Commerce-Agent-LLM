"""Data models for the shopping assistant."""
import re
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator

# Reusable patterns for narrow-scoped string fields crossing the network
# boundary. The review flagged these as missing (finding 2.6).
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,80}$")
_PRODUCT_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,80}$")


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
    product_url: Optional[str] = None
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
    session_id: str = Field(max_length=80)
    message: str = Field(min_length=1, max_length=4000)
    category: Optional[str] = Field(default=None, max_length=40)
    idempotency_key: Optional[str] = Field(default=None, max_length=80)

    @field_validator("session_id")
    @classmethod
    def _valid_session_id(cls, v: str) -> str:
        if not _SESSION_ID_RE.match(v):
            raise ValueError("session_id must be alphanumeric / _ / - only, up to 80 chars")
        return v

    @field_validator("idempotency_key")
    @classmethod
    def _valid_idem_key(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not _SESSION_ID_RE.match(v):
            raise ValueError("idempotency_key must be alphanumeric / _ / -")
        return v


class ChatResponse(BaseModel):
    message: str
    product_cards: Optional[List[Dict[str, Any]]] = None
    suggested_actions: Optional[List[str]] = None


class AddToCartRequest(BaseModel):
    product_id: str = Field(max_length=80)
    quantity: int = Field(default=1, ge=1, le=99)
    selected_size: Optional[str] = Field(default=None, max_length=40)
    selected_color: Optional[str] = Field(default=None, max_length=40)

    @field_validator("product_id")
    @classmethod
    def _valid_product_id(cls, v: str) -> str:
        if not _PRODUCT_ID_RE.match(v):
            raise ValueError("product_id must be alphanumeric / _ / -")
        return v


class UpdateCartRequest(BaseModel):
    quantity: int = Field(ge=0, le=99)


class CheckoutRequest(BaseModel):
    shipping_name: str = Field(default="", max_length=200)
    shipping_address: str = Field(default="", max_length=500)
    shipping_city: str = Field(default="", max_length=100)
    shipping_state: str = Field(default="", max_length=100)
    shipping_zip: str = Field(default="", max_length=20)


class CartMergeRequest(BaseModel):
    """Merge a guest cart into the authenticated user's cart. Accepts the
    previous guest JWT in the body; server verifies it was a guest token
    before copying items."""
    guest_token: str = Field(min_length=20, max_length=2000)


class CheckoutResponse(BaseModel):
    checkout_url: Optional[str] = None
    session_id: Optional[str] = None
    order_summary: Optional[CartSummary] = None
    error: Optional[str] = None
