# Crash Testing Results: Commerce Agent LLM Platform (Round 2)

This document captures three additional resilience tests that extend the three already recorded in `DS 440/resilience_testing_report.docx` (API failure, concurrent DoS, malicious input). Each test below follows the same format as `docs/crash_test_guide.md`: what the test measures, UI steps, expected outcome, observed outcome, and verdict.

Screenshots go in `docs/crash_tests/` with the naming convention `test{N}_{baseline|during|recovery}.png`.

## Prerequisites

Same as `docs/crash_test_guide.md`: backend on port 8000, frontend on port 3000, Chrome (unless otherwise noted). For these tests, also have a terminal open running `tail -f` on the backend log and `lsof -nP -iTCP:8000 -sTCP:ESTABLISHED` ready to check WebSocket connection count.

---

## Test 4: Network Interruption Mid-Stream

### What This Tests

The platform streams chat responses over a WebSocket. If the user's network drops partway through a streaming response, the UI must not freeze, must not duplicate the reply on reconnect, and the backend must not leak a half-open connection. This also validates that the heartbeat debounce and the handler-nulling fix in `ChatInterface.jsx` work as intended.

### How to Perform (UI Steps)

1. Open a fresh Chrome window in Incognito mode, navigate to `http://localhost:3000`, click "Continue as Guest."
2. In the chat, send: `find me running shoes under $80`. Screenshot as `test4_baseline.png` once the table begins streaming.
3. **As soon as the first row appears, toggle Wi-Fi OFF** via the macOS Control Center. Wait 8 seconds. Screenshot as `test4_during.png` during the outage (banner should appear, reconnecting state visible).
4. Toggle Wi-Fi back ON. Observe the reconnect banner disappears within about 3 seconds. Screenshot as `test4_recovery.png` showing the final chat state.
5. Verification query: send `what's the cheapest?` and confirm the assistant answers without re-running the full search (proves session memory persisted and no duplicate message appeared).

### Expected Outcome

- No duplicate assistant reply after reconnect.
- Input box re-enables on its own (no frozen UI).
- "Connection lost" banner shown only during the outage window, not during the brief reconnect transitions.
- Verification query succeeds.
- Backend log shows one `Client disconnected` and one new accepted WebSocket, not several.

### Observed Outcome

_Fill in during the run._

- Baseline response streamed successfully: ☐
- Banner appeared within: ___ seconds of Wi-Fi off
- Banner disappeared within: ___ seconds of Wi-Fi on
- Duplicate assistant reply seen: ☐ yes / ☐ no
- Input remained responsive: ☐ yes / ☐ no
- Verification query returned: ☐ yes / ☐ no
- Backend log shows orphan WebSocket: ☐ yes / ☐ no (check with `lsof -nP -iTCP:8000 -sTCP:ESTABLISHED`)

### Verdict

☐ PASS  ☐ FAIL (notes: _____)

### Defensive Measures in Place

- All WebSocket event handlers (`onopen`, `onmessage`, `onerror`, `onclose`) are nulled on the old socket before a new one is opened, so a late-firing `onopen` cannot clobber the new socket's heartbeat state.
- Auto-retry of the pending message was removed: the server may have already processed the original request, so resending would duplicate billing and the assistant reply.
- The "Connection lost" banner is debounced by 1.5 seconds to avoid flicker on fast reconnects.
- Backend watchdog caps any single message at 60 seconds of processing time.

---

## Test 5: Browser and Platform Matrix

### What This Tests

The app was developed and exercised primarily in Chrome. Safari and Firefox differ in WebSocket close-code semantics, sessionStorage quota defaults, markdown-table rendering, and cookie scoping. This test confirms the platform is not silently Chrome-only.

### How to Perform (UI Steps)

In each browser, in order: Chrome, Safari, Firefox.

1. Clear the browser's cache/site data for `localhost`.
2. Open `http://localhost:3000`. Screenshot the landing page as `test5_{chrome,safari,firefox}_landing.png`.
3. Click "Continue as Guest." Screenshot as `test5_{browser}_chat.png`.
4. Send: `hello`. Wait for the reply. Screenshot as `test5_{browser}_reply.png`.
5. Open DevTools and confirm:
   - No errors in the console (`Console` tab).
   - No 4xx/5xx responses in the network panel (`Network` tab).
   - The WebSocket entry shows state `101 Switching Protocols` followed by no close frame.

### Expected Outcome

- All three browsers render the landing page identically (minor font differences are acceptable).
- Guest login succeeds on all three.
- Chat reply renders within 5 seconds.
- No console errors on any browser.

### Observed Outcome

| Browser | Version | Landing OK | Guest login | Chat reply | Console clean | WebSocket stays OPEN |
|---------|---------|------------|-------------|------------|---------------|----------------------|
| Chrome  |         | ☐          | ☐           | ☐          | ☐             | ☐                    |
| Safari  |         | ☐          | ☐           | ☐          | ☐             | ☐                    |
| Firefox |         | ☐          | ☐           | ☐          | ☐             | ☐                    |

### Verdict

☐ PASS  ☐ FAIL (notes: _____)

### Defensive Measures in Place

- `VITE_BACKEND_URL` / `VITE_WS_URL` environment-driven; no localhost hardcoded in the frontend source.
- CORS is restricted to a concrete origin list (Phase 1 security fix), not a wildcard, so credentialed cross-origin attacks are rejected uniformly across browsers.
- WebSocket URL uses a `?token=` query param (plain string), avoiding browser-specific cookie scoping.
- `sessionStorage` persistence uses a try/catch on the parse step so a malformed entry (possible under Safari private mode quota policies) does not crash the chat component.

---

## Test 6: Rapid Authentication Churn

### What This Tests

Logging out and back in repeatedly (guest to guest) should not leak cart contents, chat history, or pending messages between identities, and should not leak WebSocket connections or backend memory. This validates the Phase 1 JWT-based identity isolation under rapid state change.

### How to Perform (UI Steps)

Before starting, in a separate terminal:
```
watch -n 2 'lsof -nP -iTCP:8000 -sTCP:ESTABLISHED | wc -l'
```

1. In Chrome, navigate to `http://localhost:3000` and click "Continue as Guest."
2. In the chat, send: `add sunglasses to my cart`. Open the cart drawer. Screenshot as `test6_cycle1_cart.png`.
3. Click Logout (or the avatar menu). Confirm you land on the login page.
4. Click "Continue as Guest" again. Open the cart drawer. It must be empty. Screenshot as `test6_cycle2_cart.png`.
5. Repeat the logout-then-continue-as-guest cycle five more times, quickly (target total elapsed time about 20 seconds).
6. After cycle 7, check the terminal: the ESTABLISHED WebSocket count should be at most 1 (the current active session).

### Expected Outcome

- Each new guest starts with an empty cart and empty chat history.
- No 401 errors in the browser console at any point.
- WebSocket count stays at most 1 at all times (no orphan `ESTABLISHED` sockets).
- Backend process memory does not grow by more than ~5 MB per cycle (check `ps -o rss= -p <pid>` before and after).

### Observed Outcome

- All 7 guests started with empty cart: ☐ yes / ☐ no
- Any 401 seen in console: ☐ yes / ☐ no
- Max concurrent WebSocket count observed: _____
- Backend RSS delta over all cycles: _____ MB
- Chat messages from prior guest leaked into new session: ☐ yes / ☐ no

### Verdict

☐ PASS  ☐ FAIL (notes: _____)

### Defensive Measures in Place

- Guest identity is a server-minted UUID (`/auth/guest` endpoint), not a client-predictable string, so two guests never collide.
- All cart and chat endpoints derive `user_id` from the JWT `sub`, so switching tokens switches identity server-side even if the client does not clear state.
- `cartStore.js` does not persist items; on reload, the cart is pulled from the server via `/api/cart/me`.
- The WebSocket's `ws.onclose` no longer auto-retries the pending message, so a logout mid-send does not cause the next login to replay the old user's message.
- Handler nulling before WebSocket close prevents a stale socket from invoking `setIsConnected(true)` after the new identity is active.

---

## Summary

| Test | Category                    | Pass/Fail | Notes |
|------|-----------------------------|-----------|-------|
| 4    | Network interruption        | ☐ / ☐     |       |
| 5    | Browser platform matrix     | ☐ / ☐     |       |
| 6    | Auth churn / state isolation| ☐ / ☐     |       |

Failure modes found: _list any bugs or regressions surfaced during testing; file them as GitHub issues or NOTES.md entries._
