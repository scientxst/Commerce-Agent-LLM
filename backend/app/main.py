"""FastAPI application for the shopping assistant."""
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.guardrails import GuardrailsEngine
from app.core.orchestrator import OrchestrationEngine
from app.tools.executor import ToolExecutor
from app.services.vector_db import VectorDBService
from app.services.product_db import ProductDBService
from app.services.user_db import UserDBService
from app.services.auth_db import AuthDBService
from app.services.memory import MemoryService
from app.routers.auth import router as auth_router, set_auth_db
from app.models.schemas import (
    ChatRequest, ChatResponse, AddToCartRequest,
    UpdateCartRequest, CheckoutRequest, CheckoutResponse, CartSummary,
)
from app.utils.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(name)-30s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

product_db: ProductDBService = None
user_db: UserDBService = None
auth_db: AuthDBService = None
vector_db: VectorDBService = None
executor: ToolExecutor = None
orchestrator: OrchestrationEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global product_db, user_db, auth_db, vector_db, executor, orchestrator

    log.info("Starting up")

    product_db = ProductDBService()
    user_db = UserDBService()
    auth_db = AuthDBService()
    set_auth_db(auth_db)
    vector_db = VectorDBService()

    await product_db.warmup()
    products = product_db.get_all_products()
    await vector_db.build_index([p.dict() for p in products])

    executor = ToolExecutor(vector_db, product_db, user_db)
    memory = MemoryService(user_db=user_db)

    orchestrator = OrchestrationEngine(
        guardrails=GuardrailsEngine(),
        tool_executor=executor,
        memory=memory,
    )

    log.info("Ready — %d products indexed", len(products))
    yield
    log.info("Shutting down")


app = FastAPI(title="Shopping Assistant API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


# ──────────────────────────── Health ────────────────────────────

@app.get("/")
async def root():
    return {"status": "running", "service": "shopping-assistant"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "products_loaded": product_db is not None and len(product_db.get_all_products()) > 0,
        "vector_index": vector_db is not None and vector_db.num_entities > 0,
        "orchestrator": orchestrator is not None,
    }


@app.get("/api/search-test")
async def search_test(q: str = "Nike shoes"):
    """Test endpoint — runs a live search through whichever API is active and
    returns the raw results so you can confirm the integration is working."""
    sources = {
        "serpapi": bool(product_db and product_db._use_serpapi),
        "rapidapi": bool(product_db and product_db._use_rapidapi),
        "ebay": bool(product_db and product_db._use_ebay),
    }
    active_source = next((k for k, v in sources.items() if v), "sample_data")

    results = await product_db.search(q)
    return {
        "active_source": active_source,
        "sources_configured": sources,
        "query": q,
        "result_count": len(results),
        "results": results[:3],  # preview first 3
    }


# ──────────────────────────── Chat ────────────────────────────

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not orchestrator:
        raise HTTPException(503, "Service not ready")

    text = ""
    products = []
    async for chunk in orchestrator.process_message(
        user_id=request.user_id,
        session_id=request.session_id,
        message=request.message,
    ):
        if chunk["type"] == "text":
            text += chunk["content"]
        elif chunk["type"] == "products":
            products = chunk["products"]

    return ChatResponse(
        message=text,
        product_cards=products,
        suggested_actions=["View cart", "Continue shopping", "Track order"],
    )


@app.websocket("/ws/chat/{user_id}/{session_id}")
async def websocket_chat(websocket: WebSocket, user_id: str, session_id: str):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()

            # The frontend may send JSON like {"type":"message","content":"..."}
            # or plain text.  Extract the actual user message either way.
            try:
                payload = json.loads(raw)
                message = payload.get("content", payload.get("message", raw))
            except (json.JSONDecodeError, TypeError):
                message = raw

            log.info("WS message from %s: %s", user_id, message[:120])

            async for chunk in orchestrator.process_message(
                user_id=user_id, session_id=session_id, message=message
            ):
                await websocket.send_json(chunk)
    except WebSocketDisconnect:
        log.info("Client %s disconnected", user_id)
    except Exception as exc:
        log.error("WebSocket error: %s", exc)
        try:
            await websocket.close()
        except Exception:
            pass


# ──────────────────────────── Products ────────────────────────────

@app.get("/api/products")
async def list_products(category: str = None, limit: int = 20):
    if not product_db:
        raise HTTPException(503, "Service not ready")
    if category:
        products = await product_db.get_by_category(category, limit)
    else:
        products = product_db.get_all_products()[:limit]
    return [p.dict() for p in products]


@app.get("/api/products/{product_id}")
async def get_product(product_id: str):
    if not product_db:
        raise HTTPException(503, "Service not ready")
    product = await product_db.get_product(product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product.dict()


@app.get("/api/merchants")
async def list_merchants():
    """Return distinct merchants from the product catalog."""
    if not product_db:
        raise HTTPException(503, "Service not ready")
    merchants = {}
    for p in product_db.get_all_products():
        if p.merchant_id not in merchants:
            merchants[p.merchant_id] = {
                "id": p.merchant_id,
                "name": p.merchant_name,
            }
    return list(merchants.values())


# ──────────────────────────── Cart ────────────────────────────

@app.post("/api/cart/add")
async def add_to_cart(req: AddToCartRequest):
    if not executor:
        raise HTTPException(503, "Service not ready")

    from app.models.schemas import CartItem
    product = await product_db.get_product(req.product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if product.stock < req.quantity:
        raise HTTPException(400, f"Only {product.stock} in stock")

    await user_db.add_to_cart(
        user_id=req.user_id,
        item=CartItem(
            product_id=req.product_id,
            quantity=req.quantity,
            selected_size=req.selected_size,
            selected_color=req.selected_color,
        ),
    )
    summary = await executor.get_cart_summary(req.user_id)
    return summary.dict()


@app.get("/api/cart/{user_id}", response_model=CartSummary)
async def get_cart(user_id: str):
    if not executor:
        raise HTTPException(503, "Service not ready")
    return await executor.get_cart_summary(user_id)


@app.delete("/api/cart/{user_id}/{product_id}")
async def remove_from_cart(user_id: str, product_id: str):
    if not user_db:
        raise HTTPException(503, "Service not ready")
    await user_db.remove_from_cart(user_id, product_id)
    summary = await executor.get_cart_summary(user_id)
    return summary.dict()


@app.patch("/api/cart/{user_id}/{product_id}")
async def update_cart_item(user_id: str, product_id: str, req: UpdateCartRequest):
    if not user_db:
        raise HTTPException(503, "Service not ready")
    await user_db.update_cart_quantity(user_id, product_id, req.quantity)
    summary = await executor.get_cart_summary(user_id)
    return summary.dict()


# ──────────────────────────── Checkout ────────────────────────────

@app.post("/api/checkout/create-session", response_model=CheckoutResponse)
async def create_checkout_session(req: CheckoutRequest):
    """Create a Stripe Checkout Session for the user's cart."""
    if not executor:
        raise HTTPException(503, "Service not ready")

    summary = await executor.get_cart_summary(req.user_id)
    if not summary.items:
        raise HTTPException(400, "Cart is empty")

    if not settings.STRIPE_SECRET_KEY:
        # Return the summary without a Stripe URL for demo purposes
        return CheckoutResponse(
            order_summary=summary,
            error="Stripe not configured — set STRIPE_SECRET_KEY in .env",
        )

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        line_items = []
        for item in summary.items:
            line_items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": item.name,
                        "metadata": {
                            "merchant": item.merchant_name,
                            "product_id": item.product_id,
                        },
                    },
                    "unit_amount": int(item.price * 100),
                },
                "quantity": item.quantity,
            })

        # Add tax as a line item
        if summary.tax > 0:
            line_items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": "Sales Tax"},
                    "unit_amount": int(summary.tax * 100),
                },
                "quantity": 1,
            })

        # Build per-merchant order payload (to be dispatched after payment)
        merchant_orders = {}
        for item in summary.items:
            mid = item.merchant_id
            if mid not in merchant_orders:
                merchant_orders[mid] = {"merchant": item.merchant_name, "items": []}
            merchant_orders[mid]["items"].append({
                "product_id": item.product_id,
                "name": item.name,
                "quantity": item.quantity,
                "price": item.price,
                "size": item.selected_size,
                "color": item.selected_color,
            })

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            success_url=f"{settings.FRONTEND_URL}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/checkout/cancel",
            metadata={
                "user_id": req.user_id,
                "shipping_name": req.shipping_name,
                "shipping_address": req.shipping_address,
                "shipping_city": req.shipping_city,
                "shipping_state": req.shipping_state,
                "shipping_zip": req.shipping_zip,
                "merchants": ",".join(merchant_orders.keys()),
            },
        )

        return CheckoutResponse(
            checkout_url=session.url,
            session_id=session.id,
            order_summary=summary,
        )

    except Exception as exc:
        log.error("Stripe session creation failed: %s", exc)
        return CheckoutResponse(
            order_summary=summary,
            error=str(exc),
        )


@app.post("/api/checkout/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    if not settings.STRIPE_SECRET_KEY or not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(400, "Stripe not configured")

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    payload = await request.body()
    sig = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(400, "Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        meta = session.get("metadata", {})
        uid = meta.get("user_id")
        if uid:
            # Capture full order with merchant breakdown
            cart_summary = await executor.get_cart_summary(uid)
            merchant_dispatch = {}
            for item in cart_summary.items:
                mid = item.merchant_id
                if mid not in merchant_dispatch:
                    merchant_dispatch[mid] = {
                        "merchant_name": item.merchant_name,
                        "shipping": {
                            "name": meta.get("shipping_name", ""),
                            "address": meta.get("shipping_address", ""),
                            "city": meta.get("shipping_city", ""),
                            "state": meta.get("shipping_state", ""),
                            "zip": meta.get("shipping_zip", ""),
                        },
                        "items": [],
                        "subtotal": 0.0,
                    }
                merchant_dispatch[mid]["items"].append({
                    "product_id": item.product_id,
                    "name": item.name,
                    "quantity": item.quantity,
                    "price": item.price,
                    "size": item.selected_size,
                    "color": item.selected_color,
                    "line_total": item.line_total,
                })
                merchant_dispatch[mid]["subtotal"] += item.line_total

            # Log each merchant's order (in production, POST to merchant webhook/API)
            for mid, order in merchant_dispatch.items():
                log.info(
                    "ORDER DISPATCH → merchant=%s customer=%s items=%d subtotal=$%.2f",
                    order["merchant_name"],
                    order["shipping"].get("name", "unknown"),
                    len(order["items"]),
                    order["subtotal"],
                )

            await user_db.clear_cart(uid)
            log.info("Payment complete for user %s — %d merchant order(s) dispatched, cart cleared",
                     uid, len(merchant_dispatch))

    return {"received": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
