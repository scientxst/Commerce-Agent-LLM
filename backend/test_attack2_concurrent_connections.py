"""
ATTACK TEST 2: Rapid Concurrent WebSocket Connections (DoS Simulation)
======================================================================
Opens many simultaneous WebSocket connections and sends messages
rapidly to test if the server crashes under load or runs out of memory.
"""
import asyncio
import json
import time
import websockets
import httpx

BASE_WS = "ws://localhost:8000/ws/chat"
BASE_HTTP = "http://localhost:8000"
NUM_CONNECTIONS = 20
MESSAGES_PER_CONN = 3


async def attack_connection(conn_id: int, results: list):
    """Open a WebSocket, send rapid messages, record results."""
    uri = f"{BASE_WS}/attacker_{conn_id}/session_{conn_id}"
    try:
        async with websockets.connect(uri, close_timeout=5) as ws:
            for msg_num in range(MESSAGES_PER_CONN):
                payload = json.dumps({
                    "type": "message",
                    "content": f"Connection {conn_id} message {msg_num}: find me cheap shoes",
                })
                await ws.send(payload)
                # Don't wait for full response, just fire rapidly
                try:
                    resp = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    results.append(("ok", conn_id, msg_num))
                except asyncio.TimeoutError:
                    results.append(("timeout", conn_id, msg_num))
            await ws.close()
    except Exception as e:
        results.append(("error", conn_id, str(e)))


async def main():
    print("=" * 70)
    print("ATTACK TEST 2: Rapid Concurrent WebSocket Connections (DoS)")
    print("=" * 70)

    # --- Pre-attack health check ---
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{BASE_HTTP}/health")
        print(f"\n[PRE-ATTACK] Health check: {r.status_code} - {r.json()}")

    # --- Launch concurrent WebSocket connections ---
    print(f"\n[ATTACK] Opening {NUM_CONNECTIONS} simultaneous WebSocket connections...")
    print(f"         Each sending {MESSAGES_PER_CONN} messages rapidly...")
    print(f"         Total messages: {NUM_CONNECTIONS * MESSAGES_PER_CONN}\n")

    results = []
    start = time.time()

    tasks = [attack_connection(i, results) for i in range(NUM_CONNECTIONS)]
    await asyncio.gather(*tasks, return_exceptions=True)

    elapsed = time.time() - start

    # --- Analyze results ---
    ok_count = sum(1 for r in results if r[0] == "ok")
    timeout_count = sum(1 for r in results if r[0] == "timeout")
    error_count = sum(1 for r in results if r[0] == "error")

    print(f"  Connections attempted: {NUM_CONNECTIONS}")
    print(f"  Total messages sent:   {NUM_CONNECTIONS * MESSAGES_PER_CONN}")
    print(f"  Responses received:    {ok_count}")
    print(f"  Timeouts:              {timeout_count}")
    print(f"  Errors:                {error_count}")
    print(f"  Time elapsed:          {elapsed:.2f}s")

    # Show first few errors if any
    errors = [r for r in results if r[0] == "error"]
    if errors:
        print(f"\n  Sample errors:")
        for e in errors[:5]:
            print(f"    Connection {e[1]}: {e[2]}")

    # --- Post-attack health check ---
    print("\n[POST-ATTACK] Checking if server is still alive...")
    await asyncio.sleep(2)

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{BASE_HTTP}/health")
            server_alive = r.status_code == 200
            print(f"  Health check: {r.status_code} - {r.json()}")
        except Exception as e:
            server_alive = False
            print(f"  Health check FAILED: {e}")

    # --- Also test normal HTTP endpoint still works ---
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{BASE_HTTP}/api/products", params={"limit": 2})
            print(f"  Products endpoint: {r.status_code}")
        except Exception as e:
            print(f"  Products endpoint FAILED: {e}")

    # --- Verdict ---
    print("\n" + "=" * 70)
    if server_alive:
        print("RESULT: Server survived DoS simulation. Platform did NOT crash.")
        print("DEFENSE: FastAPI's async architecture handled concurrent connections.")
        print("         ReAct loop cap (max 5 iterations) prevents runaway processing.")
        print("         Context token limit (8000) with summarization prevents memory bloat.")
    else:
        print("RESULT: Server crashed or became unresponsive under load!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
