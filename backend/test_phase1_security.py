"""Phase 1 security regression tests.

Run against a locally running backend:
    python -m app.main &
    python test_phase1_security.py

Exits 0 on pass, non-zero on any failure.
"""
import asyncio
import base64
import json
import sys
import time
import uuid

import httpx
import websockets
from jose import jwt

BASE = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"

passes: list[str] = []
fails: list[str] = []
skips: list[str] = []


def _ok(label: str) -> None:
    passes.append(label)
    print(f"PASS  {label}")


def _fail(label: str, detail: str) -> None:
    fails.append(f"{label}: {detail}")
    print(f"FAIL  {label} :: {detail}")


def _skip(label: str, reason: str) -> None:
    skips.append(f"{label}: {reason}")
    print(f"SKIP  {label} :: {reason}")


async def check_cors_locked() -> None:
    label = "CORS rejects evil.com"
    async with httpx.AsyncClient() as c:
        r = await c.options(
            f"{BASE}/api/cart/me",
            headers={
                "Origin": "https://evil.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
    acao = r.headers.get("access-control-allow-origin", "")
    if acao == "*" or acao == "https://evil.com":
        _fail(label, f"ACAO header echoed unsafe origin: {acao!r}")
    else:
        _ok(label)


async def check_cart_requires_auth() -> None:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/cart/me")
        if r.status_code in (401, 403):
            _ok("GET /api/cart/me requires auth")
        else:
            _fail("GET /api/cart/me requires auth", f"status={r.status_code}")

        r = await c.post(
            f"{BASE}/api/cart/add",
            json={"product_id": "anything", "quantity": 1},
        )
        if r.status_code in (401, 403):
            _ok("POST /api/cart/add requires auth")
        else:
            _fail("POST /api/cart/add requires auth", f"status={r.status_code}")

        r = await c.post(
            f"{BASE}/api/checkout/create-session",
            json={"shipping_name": "x"},
        )
        if r.status_code in (401, 403):
            _ok("POST /api/checkout/create-session requires auth")
        else:
            _fail(
                "POST /api/checkout/create-session requires auth",
                f"status={r.status_code}",
            )


async def check_ws_requires_auth() -> None:
    # With first-frame auth the TCP connection opens before auth; the
    # server closes with 4401 when the first frame is missing or bad.
    label = "WebSocket rejects missing/bad first-frame auth"
    try:
        async with websockets.connect(
            f"{WS_BASE}/ws/chat/test-session", open_timeout=3
        ) as ws:
            # Send a non-auth first frame to provoke immediate 4401.
            await ws.send(json.dumps({"type": "hello", "not": "auth"}))
            try:
                await asyncio.wait_for(ws.recv(), timeout=3)
                _fail(label, "server sent data without auth_ok")
            except (
                websockets.exceptions.ConnectionClosedError,
                websockets.exceptions.ConnectionClosedOK,
            ) as exc:
                if exc.code in (1008, 4401, 4403):
                    _ok(label)
                else:
                    _fail(label, f"closed with unexpected code {exc.code}")
            except asyncio.TimeoutError:
                _fail(label, "server did not close within 3s of bad first frame")
    except websockets.exceptions.InvalidStatus as exc:
        if exc.response.status_code in (401, 403):
            _ok(label)
        else:
            _fail(label, f"unexpected HTTP status {exc.response.status_code}")
    except Exception as exc:
        _fail(label, f"unexpected exception {type(exc).__name__}: {exc}")

    # Query-string fallback path (deprecated, still live for one release):
    # a bad token there must still be rejected before accept().
    label = "WebSocket rejects bad ?token= query-string"
    try:
        async with websockets.connect(
            f"{WS_BASE}/ws/chat/test-session?token=not-a-real-jwt",
            open_timeout=3,
        ) as ws:
            try:
                await asyncio.wait_for(ws.recv(), timeout=2)
            except Exception:
                pass
        _fail(label, "connection stayed open with bad query token")
    except websockets.exceptions.InvalidStatus as exc:
        if exc.response.status_code in (401, 403):
            _ok(label)
        else:
            _fail(label, f"unexpected HTTP status {exc.response.status_code}")
    except websockets.exceptions.ConnectionClosed as exc:
        if exc.code in (1008, 4401, 4403):
            _ok(label)
        else:
            _fail(label, f"closed with unexpected code {exc.code}")
    except Exception as exc:
        _fail(label, f"unexpected exception {type(exc).__name__}: {exc}")


async def check_guest_flow_works() -> None:
    """Guest JWT should let a guest use the cart endpoints."""
    label = "guest JWT flow works"
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{BASE}/auth/guest")
        if r.status_code != 200:
            _fail(label, f"/auth/guest returned {r.status_code}")
            return
        data = r.json()
        tok = data.get("access_token")
        if not tok:
            _fail(label, "no access_token in /auth/guest response")
            return
        headers = {"Authorization": f"Bearer {tok}"}
        r = await c.get(f"{BASE}/api/cart/me", headers=headers)
        if r.status_code != 200:
            _fail(label, f"GET /api/cart/me with guest token returned {r.status_code}")
            return
    _ok(label)


def check_jwt_secret_validator() -> None:
    """Instantiating Settings with the placeholder should raise.

    Import Settings first (module body uses the real secret from .env),
    then instantiate a second time with the placeholder to force the
    validator path.
    """
    # Import with good secret in place
    from app.utils.config import Settings

    label = "JWT_SECRET validator rejects placeholder"
    try:
        Settings(
            OPENAI_API_KEY="dummy",
            JWT_SECRET="change-me-in-production-use-a-long-random-secret",
            _env_file=None,
        )
    except Exception:
        _ok(label)
        return
    _fail(label, "Settings() accepted placeholder JWT_SECRET")


async def _mint_guest(c: httpx.AsyncClient) -> tuple[str, str]:
    r = await c.post(f"{BASE}/auth/guest")
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"]["id"]


# ── Negative JWT tests (finding 1.3) ──────────────────────────────

async def check_jwt_alg_none_rejected() -> None:
    """A token with header alg=none must never be accepted."""
    label = "JWT alg=none rejected"
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps({
        "sub": "attacker", "jti": "x", "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
    }).encode()).rstrip(b"=").decode()
    forged = f"{header}.{body}."
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {forged}"})
    if r.status_code == 401:
        _ok(label)
    else:
        _fail(label, f"status={r.status_code}")


async def check_jwt_wrong_key_rejected() -> None:
    """Token signed with a different key must be rejected."""
    label = "JWT signed with wrong key rejected"
    forged = jwt.encode(
        {
            "sub": "attacker", "email": "a@a.com", "name": "A", "provider": "email",
            "jti": uuid.uuid4().hex, "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        },
        "not-the-real-secret-but-long-enough-to-look-legit-xxxxxx",
        algorithm="HS256",
    )
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {forged}"})
    if r.status_code == 401:
        _ok(label)
    else:
        _fail(label, f"status={r.status_code}")


# ── Cross-user isolation (finding 3.1) ────────────────────────────

async def check_cross_user_cart_isolation() -> None:
    """Two guests must see independent carts. A product added by one
    must not appear in the other's cart (derive user_id from sub only)."""
    label = "cross-user cart isolation"
    async with httpx.AsyncClient() as c:
        tok_a, _ = await _mint_guest(c)
        tok_b, _ = await _mint_guest(c)

        # Pick an actual product id
        r = await c.get(f"{BASE}/api/products?limit=1")
        if r.status_code != 200 or not r.json():
            _skip(label, "local product DB is empty")
            return
        pid = r.json()[0]["id"]

        r = await c.post(
            f"{BASE}/api/cart/add",
            headers={"Authorization": f"Bearer {tok_a}"},
            json={"product_id": pid, "quantity": 1},
        )
        if r.status_code != 200:
            _fail(label, f"guest A add status={r.status_code}")
            return

        # Guest B must see an empty cart.
        r = await c.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {tok_b}"})
        if r.status_code != 200:
            _fail(label, f"guest B cart status={r.status_code}")
            return
        if r.json().get("item_count", 0) != 0:
            _fail(label, "guest B sees items from guest A")
            return
    _ok(label)


# ── Logout revocation ────────────────────────────────────────────

async def check_logout_revokes_jti() -> None:
    label = "logout revokes jti (token no longer works)"
    async with httpx.AsyncClient() as c:
        tok, _ = await _mint_guest(c)
        r = await c.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {tok}"})
        if r.status_code != 200:
            _fail(label, f"pre-logout cart status={r.status_code}")
            return
        r = await c.post(f"{BASE}/auth/logout", headers={"Authorization": f"Bearer {tok}"})
        if r.status_code != 200:
            _fail(label, f"logout status={r.status_code}")
            return
        # Same token must now be rejected.
        r = await c.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {tok}"})
        if r.status_code == 401:
            _ok(label)
        else:
            _fail(label, f"token still works after logout, status={r.status_code}")


# ── Rate limit on /auth/guest ────────────────────────────────────

async def check_guest_rate_limit() -> None:
    """11 rapid mints from the same IP should hit a 429 on the 11th."""
    label = "guest mint rate-limited per IP"
    got_429 = False
    async with httpx.AsyncClient() as c:
        for _ in range(12):
            r = await c.post(f"{BASE}/auth/guest")
            if r.status_code == 429:
                got_429 = True
                break
    if got_429:
        _ok(label)
    else:
        _fail(label, "never saw 429 in 12 rapid mints")


# ── Input validation ─────────────────────────────────────────────

async def check_bad_session_id_rejected() -> None:
    """A crafted session_id with special chars must be rejected at the
    schema layer before reaching orchestrator."""
    label = "REST /api/chat rejects bad session_id"
    async with httpx.AsyncClient() as c:
        tok, _ = await _mint_guest(c)
        r = await c.post(
            f"{BASE}/api/chat",
            headers={"Authorization": f"Bearer {tok}"},
            json={"session_id": "../../etc/passwd", "message": "hi"},
        )
    if r.status_code == 422:
        _ok(label)
    else:
        _fail(label, f"status={r.status_code}")


async def check_oversize_message_rejected() -> None:
    label = "REST /api/chat rejects oversize message"
    async with httpx.AsyncClient(timeout=10) as c:
        tok, _ = await _mint_guest(c)
        r = await c.post(
            f"{BASE}/api/chat",
            headers={"Authorization": f"Bearer {tok}"},
            json={"session_id": "ok", "message": "x" * 5000},
        )
    if r.status_code == 422:
        _ok(label)
    else:
        _fail(label, f"status={r.status_code}")


# ── Checkout price integrity ──────────────────────────────────────

async def check_checkout_uses_server_price() -> None:
    """Even if a client sends an unexpected field, the server builds the
    Stripe line item from the catalog price, not anything in the body."""
    label = "checkout uses server-side price (body fields ignored)"
    async with httpx.AsyncClient() as c:
        tok, _ = await _mint_guest(c)
        r = await c.get(f"{BASE}/api/products?limit=1")
        if r.status_code != 200 or not r.json():
            _skip(label, "local product DB is empty")
            return
        p = r.json()[0]
        real_price = float(p["price"])
        pid = p["id"]

        await c.post(
            f"{BASE}/api/cart/add",
            headers={"Authorization": f"Bearer {tok}"},
            json={"product_id": pid, "quantity": 1},
        )

        # Send tampered extras that a naive implementation might honor.
        r = await c.post(
            f"{BASE}/api/checkout/create-session",
            headers={"Authorization": f"Bearer {tok}"},
            json={
                "shipping_name": "Evil User",
                "shipping_address": "1 Attacker Way",
                "shipping_city": "City", "shipping_state": "CA", "shipping_zip": "00000",
                # None of these are in the schema; extras should be silently ignored
                "price": 0.01,
                "total": 0.01,
                "line_items": [{"product_id": pid, "price": 0.01}],
            },
        )
        # Accept any response — 200 (with/without Stripe URL) or 400 if cart
        # path fails. What matters is summary.items[*].price == catalog price.
        if r.status_code != 200:
            _fail(label, f"status={r.status_code}")
            return
        summary = r.json().get("order_summary") or {}
        items = summary.get("items") or []
        if not items:
            _fail(label, "no items in order_summary")
            return
        got = float(items[0]["price"])
        if abs(got - real_price) > 0.001:
            _fail(label, f"tampered price honored: got={got} expected={real_price}")
        else:
            _ok(label)

        # Clean up
        await c.delete(
            f"{BASE}/api/cart/me/{pid}",
            headers={"Authorization": f"Bearer {tok}"},
        )


async def main() -> None:
    await check_cors_locked()
    await check_cart_requires_auth()
    await check_ws_requires_auth()
    await check_guest_flow_works()
    check_jwt_secret_validator()

    # Adversarial review follow-ups
    await check_jwt_alg_none_rejected()
    await check_jwt_wrong_key_rejected()
    await check_cross_user_cart_isolation()
    await check_logout_revokes_jti()
    await check_bad_session_id_rejected()
    await check_oversize_message_rejected()
    await check_checkout_uses_server_price()
    # Run rate-limit last — it burns the per-IP bucket and would skew
    # subsequent guest-mint flows in this run.
    await check_guest_rate_limit()

    print()
    print(f"{len(passes)} passed, {len(fails)} failed, {len(skips)} skipped")
    if skips:
        for s in skips:
            print(f"  skip: {s}")
    if fails:
        for f in fails:
            print(f"  fail: {f}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
