# Vercel deployment notes
# change

## What changed
- Frontend chat now uses `POST /api/chat` instead of a browser WebSocket connection.
- Added `api/index.py` as the Vercel Python entrypoint.
- Added `vercel.json` rewrites for `/api/*`, `/auth/*`, and SPA routing.
- Kept `BrowserRouter` so Google/Microsoft auth redirects still work cleanly.
- Updated Stripe success/cancel URLs to use the current site origin or `PUBLIC_BASE_URL`.

## Required environment variables
Backend:
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `ENVIRONMENT=production`

Optional backend:
- `LLM_MODEL`
- `EMBEDDING_MODEL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_BASE_URL`
- `GOOGLE_CLIENT_ID`
- `MICROSOFT_CLIENT_ID`

Frontend:
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_MICROSOFT_CLIENT_ID`

## Local dev
- Frontend: `npm install && npm run dev`
- Backend: `pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000`

The Vite dev server proxies both `/api` and `/auth` to `localhost:8000`.
