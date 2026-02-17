# Monitoring & Debugging Guide — AI Shopping Assistant

## Quick Start: Running the System

```bash
# Terminal 1 — Backend (from project root)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend --reload

# Terminal 2 — Frontend (from frontend/)
cd frontend && npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 1. Backend Logs (Terminal 1)

All backend activity prints to the terminal where you started uvicorn. Here's what each log line means:

### Startup Logs

```
HH:MM:SS  INFO   app.main                  Starting up
HH:MM:SS  INFO   app.services.vector_db    Loaded 42 embeddings from cache
HH:MM:SS  INFO   app.main                  Ready — 42 products indexed
```

If you see `Could not generate embeddings ... Semantic search disabled`:
- Your OpenAI API key is missing or invalid in `.env`
- The system still works using keyword search only (no semantic/AI search)
- Fix: add a valid `OPENAI_API_KEY` to your `.env` file

### Per-Request Logs

Every chat message shows this flow:

```
HH:MM:SS  INFO   app.main                  WS message from user123: show me running shoes
HH:MM:SS  INFO   app.core.orchestrator     ReAct iter 0: search_products({'query': 'running shoes'})
HH:MM:SS  INFO   app.core.orchestrator     ReAct iter 0: search_products returned 6 products
```

**Key things to watch for:**

| Log Pattern | Meaning |
|------------|---------|
| `WS message from ...` | User sent a chat message (shows parsed text, not raw JSON) |
| `ReAct iter N: tool_name(args)` | The LLM decided to call a tool — this is the AI "thinking" |
| `BLOCKED (off-topic)` | Guardrails blocked the message before it reached the LLM |
| `BLOCKED (competitor)` | User mentioned a competitor brand |
| `No tools called — running fallback search` | The LLM didn't use any tools, so we auto-searched |
| `LLM call failed` | OpenAI API is unreachable — check your API key and internet |
| `LLM streaming failed` | OpenAI failed during response generation — fallback text was sent |
| `Tool X failed` | A specific tool (search, cart, etc.) threw an error |

### Error Diagnosis

**"I'm a shopping assistant..." response for everything:**
- This was the old bug (fixed). The guardrails were blocking legitimate queries.
- If you still see `BLOCKED (off-topic)` in logs for shopping queries, the guardrails need tuning.

**No products showing in chat:**
- Check logs for `ReAct iter` lines — if missing, the LLM isn't calling tools
- Check for `fallback search` — should appear if no tools were called
- Check for `products` in the WebSocket chunks being sent

**"Connection error" in logs:**
- OpenAI API is unreachable. Check your `OPENAI_API_KEY` in `.env`
- Verify you have internet access
- The system falls back to keyword search + canned response

---

## 2. Frontend Debugging (Browser DevTools)

### Console Logs (F12 → Console)

```
WebSocket connected                    ← Connection established
WebSocket disconnected, reconnecting   ← Connection lost, auto-retry in 3s
```

### Network Tab (F12 → Network → WS)

Click on the WebSocket connection to see individual frames:

**Outgoing frames (what you send):**
```json
{"type":"message","content":"show me shoes"}
```

**Incoming frames (what the server returns):**
```json
{"type":"text","content":"Here are some great shoes"}     ← Streaming text
{"type":"products","products":[{...},{...}]}               ← Product cards
{"type":"done"}                                            ← Message complete
```

**If you see no `products` frame:** the orchestrator didn't find/return products.

### REST API Testing

You can test endpoints directly in your browser or with curl:

```bash
# Health check
curl http://localhost:8000/health

# List all products
curl http://localhost:8000/api/products

# List merchants
curl http://localhost:8000/api/merchants

# Test chat (non-streaming)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","session_id":"test","message":"show me laptops"}'

# Add to cart
curl -X POST http://localhost:8000/api/cart/add \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","product_id":"prod_001","quantity":1}'

# View cart
curl http://localhost:8000/api/cart/test

# Remove from cart
curl -X DELETE http://localhost:8000/api/cart/test/prod_001
```

---

## 3. Running Tests

```bash
# Unit tests (no server needed) — tests all components in isolation
python test_system.py --unit

# HTTP smoke tests (server must be running on port 8000)
python test_system.py
```

The unit tests cover: product DB, keyword search, guardrails (input blocking + output scrubbing), memory, cart CRUD, tool registry, executor search, and cart summary with tax.

---

## 4. Common Issues & Fixes

### Products not displaying in chat
1. Open browser DevTools → Network → WS tab
2. Send a message and look for `{"type":"products",...}` frame
3. If no products frame: check backend logs for `BLOCKED`, `LLM call failed`, or errors
4. If products frame exists but UI is empty: check browser Console for JS errors

### Cart not updating
1. Check Network tab for `POST /api/cart/add` response
2. Should return `200` with `CartSummary` JSON
3. If `404`: product ID doesn't exist
4. If `400`: out of stock

### WebSocket keeps disconnecting
1. Check if backend is running (`curl http://localhost:8000/health`)
2. Check if the Vite proxy is configured (port 3000 → 8000)
3. Look for CORS errors in browser Console

### Stripe checkout not working
1. Verify `STRIPE_SECRET_KEY` is set in `.env` (starts with `sk_test_`)
2. If not set, checkout returns the order summary without a payment URL (demo mode)
3. Get test keys from https://dashboard.stripe.com/test/apikeys

---

## 5. Architecture Flow

```
User types message
       ↓
Frontend (WebSocket) → sends {"type":"message","content":"..."}
       ↓
Backend (main.py) → parses JSON, extracts content
       ↓
Guardrails (check_input) → blocks off-topic / competitors
       ↓
Memory (get_context) → loads conversation history
       ↓
Orchestrator (ReAct loop):
  1. Sends message + tools to OpenAI
  2. If LLM calls tools → execute them, collect products
  3. Repeat until LLM gives final answer
  4. If no tools called → fallback keyword search
       ↓
Stream final response → {"type":"text",...} chunks
       ↓
Send products → {"type":"products","products":[...]}
       ↓
Guardrails (check_output) → scrubs PII, promo codes
       ↓
Memory (save) → stores for next turn
       ↓
{"type":"done"}
```

---

## 6. Key Files to Watch

| File | What it does |
|------|-------------|
| `backend/app/main.py` | API routes, WebSocket handler, startup |
| `backend/app/core/orchestrator.py` | ReAct loop, LLM calls, fallback search |
| `backend/app/core/guardrails.py` | Input blocking, output scrubbing |
| `backend/app/tools/executor.py` | Tool dispatch, search, cart operations |
| `backend/app/services/vector_db.py` | Semantic search (OpenAI embeddings) |
| `backend/app/services/product_db.py` | Keyword search, product catalog |
| `frontend/src/components/chat/ChatInterface.jsx` | WebSocket, message handling |
| `frontend/src/stores/cartStore.js` | Cart state management |
| `.env` | API keys, config (NEVER commit this) |
