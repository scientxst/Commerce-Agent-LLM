"""FastAPI application for the shopping assistant."""
import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.guardrails import GuardrailsEngine
from app.core.orchestrator import OrchestrationEngine
from app.tools.executor import ToolExecutor
from app.services.vector_db import VectorDBService
from app.services.product_db import ProductDBService
from app.services.user_db import UserDBService
from app.services.auth_db import AuthDBService
from app.services.memory import MemoryService
from app.routers.auth import router as auth_router, set_auth_db, current_user, decode_jwt
from fastapi import Depends, Query
from app.models.schemas import (
    ChatRequest, ChatResponse, AddToCartRequest,
    UpdateCartRequest, CheckoutRequest, CheckoutResponse, CartSummary,
    CartMergeRequest, CartItem,
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
    allow_origins=settings.frontend_origins,
    allow_origin_regex=settings.FRONTEND_URL_PATTERN or None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Security headers middleware ─────────────────────────────────
# httpOnly cookies are deferred to Phase 2; in the meantime these headers
# reduce the blast radius of XSS against tokens in localStorage (finding 1.4).
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self' https: wss: ws:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'",
    )
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    return response


app.include_router(auth_router)


# ── WebSocket concurrency cap (per sub) ──────────────────────────
# Finding 2.3: prevent a single abusive client from pinning many sockets.
_WS_CAP_PER_SUB = 10
_ws_conns_by_sub: Dict[str, Set[str]] = defaultdict(set)
_ws_conns_lock = asyncio.Lock()


async def _register_ws(sub: str, conn_id: str) -> bool:
    async with _ws_conns_lock:
        if len(_ws_conns_by_sub[sub]) >= _WS_CAP_PER_SUB:
            return False
        _ws_conns_by_sub[sub].add(conn_id)
        return True


async def _unregister_ws(sub: str, conn_id: str) -> None:
    async with _ws_conns_lock:
        bucket = _ws_conns_by_sub.get(sub)
        if bucket:
            bucket.discard(conn_id)
            if not bucket:
                _ws_conns_by_sub.pop(sub, None)


# ── Idempotency dedupe (60s) ─────────────────────────────────────
# Replaces the removed client-side auto-retry (finding 2.1). Client sends
# {"idempotency_key": "<uuid>"} per user-initiated message; server drops
# duplicates inside the window so reconnect retries are safe.
_IDEM_TTL = 60.0
_idem_seen: Dict[str, float] = {}


def _idem_check_and_set(key: str) -> bool:
    """Return True if this key is NEW (should be processed)."""
    now = time.monotonic()
    # Sweep opportunistically
    if len(_idem_seen) > 2000:
        for k in [k for k, t in _idem_seen.items() if now - t > _IDEM_TTL]:
            _idem_seen.pop(k, None)
    prev = _idem_seen.get(key)
    if prev is not None and now - prev < _IDEM_TTL:
        return False
    _idem_seen[key] = now
    return True


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
async def search_test(q: str = "Nike shoes", category: str = None):
    """Test endpoint — runs a live search through whichever API is active and
    returns the raw results so you can confirm the integration is working."""
    from app.services.search_intent import classify_search_intent
    intent = classify_search_intent(q, category_hint=category)

    sources = {
        "serpapi": bool(product_db and product_db._use_serpapi),
        "rapidapi": bool(product_db and product_db._use_rapidapi),
        "scraperapi": bool(product_db and product_db._use_scraperapi),
        "rainforest": bool(product_db and product_db._use_rainforest),
        "asos": bool(product_db and product_db._use_asos),
        "homedepot": bool(product_db and product_db._use_homedepot),
        "openfoodfacts": bool(product_db and product_db._use_openfoodfacts),
    }

    results = await product_db.search(q, category_hint=category)
    return {
        "category_routing": intent,
        "sources_configured": sources,
        "query": q,
        "result_count": len(results),
        "results": results[:3],  # preview first 3
    }


# ──────────────────────────── Chat ────────────────────────────

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, payload: dict = Depends(current_user)):
    if not orchestrator:
        raise HTTPException(503, "Service not ready")

    # Idempotency dedupe: if client retries with the same key inside the window,
    # return an empty-but-valid response instead of re-running the LLM call.
    if request.idempotency_key and not _idem_check_and_set(
        f"{payload['sub']}:{request.idempotency_key}"
    ):
        return ChatResponse(message="", product_cards=[], suggested_actions=[])

    text = ""
    products = []
    async for chunk in orchestrator.process_message(
        user_id=payload["sub"],
        session_id=request.session_id,
        message=request.message,
        category=request.category,
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


@app.websocket("/ws/chat/{session_id}")
async def websocket_chat(
    websocket: WebSocket, session_id: str, token: str = Query(default=""),
):
    """Authenticate, then stream chat events.

    Auth is accepted in two shapes (finding 1.2):
      1. Preferred: first client frame is `{"type":"auth","token":"<jwt>"}`.
      2. Deprecated fallback: ``?token=<jwt>`` query-string, kept for one
         release so in-flight tabs don't break. Emits a warning log.
    """
    # If a token was provided via query string, accept it but warn (logged
    # token replay risk described in the review).
    payload: dict = {}
    auth_source = ""

    if token:
        try:
            payload = decode_jwt(token)
            auth_source = "query"
            log.warning(
                "WS auth via query string used (deprecated, plan to remove). "
                "sub=%s session=%s", payload.get("sub", "-"), session_id,
            )
        except HTTPException:
            await websocket.close(code=4401)
            return

    if not payload:
        # First-frame auth path. Accept the socket, then read exactly one
        # frame with a short timeout; close 4401 on any failure.
        await websocket.accept()
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get("type") != "auth":
                raise ValueError("first frame must be type=auth")
            ft = data.get("token", "")
            if not ft:
                raise ValueError("missing token")
            payload = decode_jwt(ft)
            auth_source = "first_frame"
        except Exception as exc:
            log.info("WS auth first-frame failed: %s", exc)
            try:
                await websocket.close(code=4401)
            except Exception:
                pass
            return
        # Ack so the client knows auth succeeded.
        try:
            await websocket.send_json({"type": "auth_ok"})
        except Exception:
            return
    else:
        await websocket.accept()

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4401)
        return

    # Concurrent-WS cap per sub (finding 2.3).
    conn_id = uuid.uuid4().hex
    if not await _register_ws(user_id, conn_id):
        log.warning("WS cap exceeded for sub=%s (limit=%d)", user_id, _WS_CAP_PER_SUB)
        try:
            await websocket.send_json({
                "type": "error",
                "code": "concurrency_cap",
                "message": f"Too many active connections (max {_WS_CAP_PER_SUB}).",
            })
        except Exception:
            pass
        await websocket.close(code=4409)
        return

    log.info("WS connected sub=%s session=%s via=%s", user_id, session_id, auth_source)

    try:
        while True:
            raw = await websocket.receive_text()

            # The frontend may send JSON like {"type":"message","content":"...","category":"tech"}
            # or plain text.  Extract the actual user message either way.
            category = None
            idem_key = None
            frame = None
            try:
                frame = json.loads(raw)
                message = frame.get("content", frame.get("message", raw))
                category = frame.get("category")
                idem_key = frame.get("idempotency_key")
            except (json.JSONDecodeError, TypeError):
                message = raw

            # Handle heartbeat ping
            if isinstance(frame, dict) and frame.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # Idempotency dedupe: drop duplicate retries within 60s.
            if idem_key and not _idem_check_and_set(f"{user_id}:{idem_key}"):
                log.info("WS dropping duplicate idem_key=%s sub=%s", idem_key, user_id)
                await websocket.send_json({"type": "done"})
                continue

            # Length cap: keep prompt-injection / token-burn payloads bounded.
            if not isinstance(message, str) or len(message) > 4000:
                await websocket.send_json({
                    "type": "text",
                    "content": "Message too long. Please shorten to under 4000 characters.",
                })
                await websocket.send_json({"type": "done"})
                continue

            log.info("WS message from %s (cat=%s): %s", user_id, category, message[:120])

            start = time.monotonic()
            try:
                async for chunk in orchestrator.process_message(
                    user_id=user_id, session_id=session_id, message=message,
                    category=category,
                ):
                    await websocket.send_json(chunk)
                    if time.monotonic() - start > 60:
                        await websocket.send_json({"type": "text", "content": "\n\nSorry, this is taking too long. Please try again."})
                        break
            except Exception as exc:
                correlation_id = uuid.uuid4().hex[:12]
                log.error("Message processing error [corr=%s]: %s", correlation_id, exc)
                try:
                    await websocket.send_json({
                        "type": "text",
                        "content": f"Something went wrong. Reference: {correlation_id}",
                    })
                except Exception:
                    pass
            finally:
                try:
                    await websocket.send_json({"type": "done"})
                except Exception:
                    pass
    except WebSocketDisconnect:
        log.info("Client %s disconnected", user_id)
    except Exception as exc:
        correlation_id = uuid.uuid4().hex[:12]
        log.error("WebSocket error [corr=%s]: %s", correlation_id, exc)
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        await _unregister_ws(user_id, conn_id)


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
async def add_to_cart(req: AddToCartRequest, payload: dict = Depends(current_user)):
    if not executor:
        raise HTTPException(503, "Service not ready")

    uid = payload["sub"]
    from app.models.schemas import CartItem
    product = await product_db.get_product(req.product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if product.stock < req.quantity:
        raise HTTPException(400, f"Only {product.stock} in stock")

    await user_db.add_to_cart(
        user_id=uid,
        item=CartItem(
            product_id=req.product_id,
            quantity=req.quantity,
            selected_size=req.selected_size,
            selected_color=req.selected_color,
        ),
    )
    summary = await executor.get_cart_summary(uid)
    return summary.dict()


@app.get("/api/cart/me", response_model=CartSummary)
async def get_my_cart(payload: dict = Depends(current_user)):
    if not executor:
        raise HTTPException(503, "Service not ready")
    return await executor.get_cart_summary(payload["sub"])


@app.delete("/api/cart/me/{product_id}")
async def remove_from_my_cart(product_id: str, payload: dict = Depends(current_user)):
    if not user_db:
        raise HTTPException(503, "Service not ready")
    uid = payload["sub"]
    await user_db.remove_from_cart(uid, product_id)
    summary = await executor.get_cart_summary(uid)
    return summary.dict()


@app.patch("/api/cart/me/{product_id}")
async def update_my_cart_item(product_id: str, req: UpdateCartRequest, payload: dict = Depends(current_user)):
    if not user_db:
        raise HTTPException(503, "Service not ready")
    uid = payload["sub"]
    await user_db.update_cart_quantity(uid, product_id, req.quantity)
    summary = await executor.get_cart_summary(uid)
    return summary.dict()


@app.post("/api/cart/merge", response_model=CartSummary)
async def merge_guest_cart(req: CartMergeRequest, payload: dict = Depends(current_user)):
    """Merge a guest cart into the authenticated user's cart.

    Addresses finding 2.2: when a guest registers or logs in, their cart
    would silently disappear because cart identity is keyed on the JWT
    `sub`. The frontend calls this immediately after a successful
    register/login if the previous session was a guest.

    Security: we accept the old guest token in the body and verify it
    was actually a guest token. We do NOT accept arbitrary user tokens
    here (no "I want to merge user X's cart into mine").
    """
    try:
        guest_payload = decode_jwt(req.guest_token)
    except HTTPException:
        raise HTTPException(400, "Invalid guest token")

    if guest_payload.get("provider") != "guest":
        raise HTTPException(400, "Merge source must be a guest token")

    src = guest_payload.get("sub", "")
    dst = payload["sub"]
    if not src or src == dst:
        summary = await executor.get_cart_summary(dst)
        return summary

    guest_cart = await user_db.get_cart(src) or []
    for item in guest_cart:
        await user_db.add_to_cart(
            user_id=dst,
            item=CartItem(
                product_id=item.product_id,
                quantity=item.quantity,
                selected_size=item.selected_size,
                selected_color=item.selected_color,
            ),
        )
    await user_db.clear_cart(src)

    log.info("Cart merged: %s -> %s (%d items)", src, dst, len(guest_cart))
    return await executor.get_cart_summary(dst)


# ──────────────────────────── Checkout ────────────────────────────

@app.post("/api/checkout/create-session", response_model=CheckoutResponse)
async def create_checkout_session(req: CheckoutRequest, payload: dict = Depends(current_user)):
    """Create a Stripe Checkout Session for the user's cart."""
    if not executor:
        raise HTTPException(503, "Service not ready")

    uid = payload["sub"]
    summary = await executor.get_cart_summary(uid)
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
            success_url=f"{settings.canonical_frontend_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.canonical_frontend_url}/checkout/cancel",
            metadata={
                "user_id": uid,
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
            error="Checkout temporarily unavailable. Please try again.",
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
