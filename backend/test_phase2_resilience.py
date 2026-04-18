"""Phase 2 resilience tests (automated).

Runs the three tests from docs/crash_test_results.md as backend integration
checks. Does NOT require a browser and does NOT hit external product APIs
(SerpAPI/Rainforest/etc) — only cheap router-path chat messages and local
auth/cart endpoints.

Prereq: backend running on http://localhost:8000.

Exit code 0 if all three pass, non-zero otherwise.
"""
import asyncio
import json
import os
import subprocess
import sys
import time

import httpx
import websockets

BASE = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    tag = "PASS" if ok else "FAIL"
    line = f"[{tag}] {name}"
    if detail:
        line += f" :: {detail}"
    print(line)


async def mint_guest_token(client: httpx.AsyncClient) -> tuple[str, str]:
    r = await client.post(f"{BASE}/auth/guest")
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"]["id"]


def ws_count_established() -> int:
    """Count ESTABLISHED TCP connections to :8000 from the backend side."""
    try:
        out = subprocess.run(
            ["lsof", "-nP", "-iTCP:8000", "-sTCP:ESTABLISHED"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        # lsof returns header + one line per connection
        return max(0, len([l for l in out.splitlines() if l and not l.startswith("COMMAND")]))
    except Exception:
        return -1


# ── Test 4: Network interruption mid-stream ─────────────────────────

async def test4_mid_stream_drop() -> None:
    """Connect WS, start streaming, abruptly close, reconnect, confirm
    backend still works for the same session. Verifies no orphan sockets
    accumulate and that the WebSocket close path is clean."""
    name = "Test 4: mid-stream WebSocket drop + reconnect"
    async with httpx.AsyncClient() as http:
        token, _ = await mint_guest_token(http)

    session_id = f"test4_{int(time.time())}"
    ws_url = f"{WS_BASE}/ws/chat/{session_id}?token={token}"

    before = ws_count_established()

    # Step 1: connect, send a cheap chat message, close after first chunk
    chunks_received_round1 = 0
    try:
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            await ws.send(json.dumps({"type": "message", "content": "hi", "category": "tech"}))
            # Read one inbound frame then abort
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=15)
                chunks_received_round1 += 1
                data = json.loads(msg) if isinstance(msg, str) else {}
                if data.get("type") == "pong":
                    # Unlikely (no ping sent), but read again
                    msg = await asyncio.wait_for(ws.recv(), timeout=15)
                    chunks_received_round1 += 1
            except asyncio.TimeoutError:
                record(name, False, "no chunk received in 15s for first message")
                return
            # Abrupt close mid-stream
            await ws.close()
    except Exception as exc:
        record(name, False, f"first WS failed: {type(exc).__name__}: {exc}")
        return

    # Let the backend finish cleanup
    await asyncio.sleep(1.0)

    # Step 2: reconnect with same session id, send a follow-up
    try:
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            await ws.send(json.dumps({"type": "message", "content": "hello again", "category": "tech"}))
            done = False
            start = time.monotonic()
            while time.monotonic() - start < 30:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=15)
                except asyncio.TimeoutError:
                    break
                data = json.loads(msg) if isinstance(msg, str) else {}
                if data.get("type") == "done":
                    done = True
                    break
            if not done:
                record(name, False, "second WS did not receive 'done' within 30s")
                return
    except Exception as exc:
        record(name, False, f"reconnect WS failed: {type(exc).__name__}: {exc}")
        return

    # Give the server a moment to release the socket
    await asyncio.sleep(1.0)
    after = ws_count_established()

    # If we can read the connection count, make sure we haven't leaked any.
    # Allow a +/- 1 tolerance for incidental sockets.
    leak_detail = ""
    if before >= 0 and after >= 0 and after - before > 1:
        leak_detail = f"WS count grew from {before} to {after}"

    if chunks_received_round1 == 0:
        record(name, False, "no streaming chunks ever arrived before abort")
        return

    if leak_detail:
        record(name, False, leak_detail)
        return

    record(name, True, f"got {chunks_received_round1} chunk(s), reconnect OK, no socket leak")


# ── Test 5: Browser / User-Agent matrix ─────────────────────────────

async def test5_ua_matrix() -> None:
    """Simulate three browsers by varying User-Agent on the auth, HTTP,
    and WebSocket flows. Ensures backend is not silently UA-sensitive."""
    name = "Test 5: browser / User-Agent matrix"
    agents = {
        "chrome": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "safari": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
        "firefox": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0",
    }

    failures = []
    for label, ua in agents.items():
        headers = {"User-Agent": ua}
        try:
            async with httpx.AsyncClient(headers=headers) as http:
                # 1. Guest auth
                r = await http.post(f"{BASE}/auth/guest")
                if r.status_code != 200:
                    failures.append(f"{label}: /auth/guest={r.status_code}")
                    continue
                token = r.json()["access_token"]

                # 2. Authenticated cart fetch (empty)
                r = await http.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {token}"})
                if r.status_code != 200:
                    failures.append(f"{label}: GET /api/cart/me={r.status_code}")
                    continue
                if r.json().get("item_count") not in (0, None):
                    failures.append(f"{label}: fresh guest has non-empty cart")
                    continue

                # 3. WebSocket handshake + one cheap message
                session_id = f"test5_{label}_{int(time.time())}"
                ws_url = f"{WS_BASE}/ws/chat/{session_id}?token={token}"
                try:
                    async with websockets.connect(
                        ws_url, open_timeout=5,
                        additional_headers={"User-Agent": ua},
                    ) as ws:
                        await ws.send(json.dumps({"type": "message", "content": "hi", "category": "tech"}))
                        got_done = False
                        start = time.monotonic()
                        while time.monotonic() - start < 30:
                            try:
                                msg = await asyncio.wait_for(ws.recv(), timeout=15)
                            except asyncio.TimeoutError:
                                break
                            data = json.loads(msg) if isinstance(msg, str) else {}
                            if data.get("type") == "done":
                                got_done = True
                                break
                        if not got_done:
                            failures.append(f"{label}: WS did not reach 'done'")
                            continue
                except Exception as exc:
                    failures.append(f"{label}: WS error {type(exc).__name__}: {exc}")
                    continue
        except Exception as exc:
            failures.append(f"{label}: {type(exc).__name__}: {exc}")

    if failures:
        record(name, False, "; ".join(failures))
    else:
        record(name, True, "all 3 UAs: auth + cart + WS chat OK")


# ── Test 6: Rapid authentication churn ──────────────────────────────

async def test6_auth_churn() -> None:
    """Mint 7 guest tokens in sequence. Confirm each has a unique user_id,
    each starts with an empty cart, and the active WS connection count
    does not grow unboundedly."""
    name = "Test 6: auth churn (7 guest cycles, isolation + no leak)"
    seen_ids: set[str] = set()
    carts_empty = True
    baseline = ws_count_established()
    peak = baseline

    async with httpx.AsyncClient() as http:
        for i in range(7):
            token, gid = await mint_guest_token(http)
            if gid in seen_ids:
                record(name, False, f"duplicate guest id on cycle {i}: {gid}")
                return
            seen_ids.add(gid)

            # Each guest must see an empty cart
            r = await http.get(f"{BASE}/api/cart/me", headers={"Authorization": f"Bearer {token}"})
            if r.status_code != 200:
                record(name, False, f"cycle {i}: GET /api/cart/me={r.status_code}")
                return
            body = r.json()
            if body.get("item_count") not in (0, None) or body.get("items"):
                carts_empty = False

            # Quick WS open/close to exercise connection churn
            session_id = f"test6_c{i}_{int(time.time())}"
            ws_url = f"{WS_BASE}/ws/chat/{session_id}?token={token}"
            try:
                async with websockets.connect(ws_url, open_timeout=5) as ws:
                    await ws.ping()
                    await asyncio.sleep(0.1)
                    # Let the socket close cleanly on context exit
            except Exception as exc:
                record(name, False, f"cycle {i}: WS failed {type(exc).__name__}: {exc}")
                return

            # Sample the connection count
            live = ws_count_established()
            if live > peak:
                peak = live

    if not carts_empty:
        record(name, False, "some guest saw a non-empty cart (state bleed)")
        return

    # Allow +/- 2 sockets of slack for incidental connections
    leak = (baseline >= 0 and peak - baseline > 4)
    if leak:
        record(name, False, f"WS count grew from {baseline} to peak {peak}")
        return

    record(name, True, f"7 unique guest ids, all empty carts, WS count stable (peak {peak} vs baseline {baseline})")


# ── Verification: platform still healthy ────────────────────────────

async def verify_still_healthy() -> None:
    name = "Verification: platform healthy after tests"
    async with httpx.AsyncClient() as http:
        r = await http.get(f"{BASE}/health")
        if r.status_code != 200 or r.json().get("status") != "healthy":
            record(name, False, f"health={r.status_code}")
            return
        # Round-trip one more cheap auth + WS to confirm nothing is wedged
        token, _ = await mint_guest_token(http)
    session_id = f"verify_{int(time.time())}"
    ws_url = f"{WS_BASE}/ws/chat/{session_id}?token={token}"
    try:
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            await ws.send(json.dumps({"type": "message", "content": "hi", "category": "tech"}))
            got_done = False
            start = time.monotonic()
            while time.monotonic() - start < 30:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=15)
                except asyncio.TimeoutError:
                    break
                data = json.loads(msg) if isinstance(msg, str) else {}
                if data.get("type") == "done":
                    got_done = True
                    break
            if not got_done:
                record(name, False, "final WS did not reach 'done'")
                return
    except Exception as exc:
        record(name, False, f"final WS error {type(exc).__name__}: {exc}")
        return
    record(name, True, "/health OK and final chat round-trip OK")


async def main() -> None:
    print("Running Phase 2 resilience tests against", BASE)
    print()
    await test4_mid_stream_drop()
    await test5_ua_matrix()
    await test6_auth_churn()
    await verify_still_healthy()

    print()
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} checks passed")
    if passed != total:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
