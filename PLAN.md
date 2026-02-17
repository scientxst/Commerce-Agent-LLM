# Conversational Commerce Platform — Implementation Plan

## Current State
The codebase is a partially-working skeleton with several files in a hybrid state (old + new code fragments mixed). The orchestrator still uses the old IntentClassifier → PlanGenerator → GuardrailsEngine.validate(plan) flow. Vector DB still references Milvus/pymilvus. Memory still references Redis. No merchant, checkout, or payment code exists.

## What We're Building
A chat-first shopping platform where users talk to an AI assistant that shows interactive product cards from multiple merchants, with a persistent cart, tax calculation, and Stripe sandbox checkout.

---

## Phase 1: Backend Foundation (fix hybrid state + add merchant/checkout)

### 1a. Clean up the hybrid files
- **vector_db.py** — Replace Milvus implementation with the working numpy-based local vector store (the one that passed all tests earlier). Remove pymilvus imports and leftover cache fragments.
- **registry.py** — Clean up: keep ONLY the proper OpenAI function-calling format (TOOL_DEFINITIONS). Remove the duplicate old TOOLS list and ToolRegistry class.
- **orchestrator.py** — Replace the old intent→plan→validate→execute chain with the real ReAct loop using OpenAI function calling directly. Remove Message import (doesn't exist in schemas).
- **memory.py** — Keep the user's version (Redis-compatible with fallback). It works fine with `redis_client=None`.
- **main.py** — Fix constructor calls to match whichever version of orchestrator/memory we settle on.
- **config.py** — Remove MILVUS_HOST/PORT, REDIS_HOST/PORT if still present. Add MAX_REACT_ITERATIONS.
- **requirements.txt** — Remove pymilvus, redis. Keep numpy.

### 1b. Add merchant support to data model
- **schemas.py** — Add `merchant_id`, `merchant_name` fields to Product. Add new `Merchant` model. Add `CheckoutRequest`, `CheckoutResponse`, `OrderCreate` schemas.
- **sample_products.json** — Add `merchant_id` and `merchant_name` to every product, distributing across 5-6 merchants (e.g., "TechHub Direct", "Sole Comfort Co.", "HomeStyle Essentials", "ActiveWear Pro", "Luxe Beauty").
- **product_db.py** — Add `get_by_merchant()` method.

### 1c. Enhanced cart + tax + checkout endpoints
- **user_db.py** — Enhance cart to store variant selections (size/color strings). Add `create_order()` method.
- **executor.py** — Update `_calculate_cart_total()` to include tax calculation (configurable rate, default 8%). Add `get_cart_summary()` that groups items by merchant.
- **main.py** — Add new REST endpoints:
  - `POST /api/cart/add` — Direct cart add (not just via chat)
  - `GET /api/cart/{user_id}` — Get cart with merchant grouping
  - `DELETE /api/cart/{user_id}/{product_id}` — Remove item
  - `PATCH /api/cart/{user_id}/{product_id}` — Update quantity
  - `POST /api/checkout/create-session` — Create Stripe checkout session
  - `POST /api/checkout/webhook` — Stripe webhook for payment confirmation
  - `GET /api/merchants` — List merchants

### 1d. Stripe integration
- Add `stripe` to requirements.txt
- New file: **backend/app/services/payment.py** — Stripe service with:
  - `create_checkout_session(cart_items, user_id)` — Creates Stripe Checkout Session with line items grouped by merchant
  - `handle_webhook(payload, sig)` — Processes payment confirmation
- Uses Stripe test/sandbox keys from .env

---

## Phase 2: Frontend Rebuild (Vite + React + Tailwind)

### 2a. Migrate from CRA to Vite + Tailwind
- Scaffold new Vite React project in `frontend/`
- Install: `tailwindcss`, `@headlessui/react`, `lucide-react`, `zustand`, `markdown-to-jsx`, `@stripe/stripe-js`, `@stripe/react-stripe-js`
- Configure Tailwind with dark mode (`class` strategy)
- Move existing component logic into new structure

### 2b. New page layout
```
┌────────────────────────────────────────────────┐
│  Header: Logo | "Shopping Assistant" | 🌙/☀ | 🛒(3) │
├────────────────────────────────────────────────┤
│                                                │
│  Chat area (full width, scrollable)            │
│  ┌──────────────────────────────────────────┐  │
│  │ Assistant: "Welcome! What can I help..."  │  │
│  │ You: "Show me running shoes under $150"   │  │
│  │ Assistant: "Here are some great options:" │  │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │ │ Card 1  │ │ Card 2  │ │ Card 3  │      │  │
│  │ │ Nike    │ │ Adidas  │ │ ASICS   │      │  │
│  │ │ $129.99 │ │ $119.99 │ │ $139.99 │      │  │
│  │ │[Add🛒]  │ │[Add🛒]  │ │[Add🛒]  │      │  │
│  │ └─────────┘ └─────────┘ └─────────┘      │  │
│  └──────────────────────────────────────────┘  │
│                                                │
├────────────────────────────────────────────────┤
│  Input: [Type your message...        ] [Send]  │
└────────────────────────────────────────────────┘
```

### 2c. Component architecture
```
src/
├── App.jsx                    # Router + theme provider
├── main.jsx                   # Vite entry
├── index.css                  # Tailwind imports + globals
├── stores/
│   ├── cartStore.js           # Zustand cart state (persisted)
│   └── themeStore.js          # Zustand dark/light mode
├── components/
│   ├── layout/
│   │   ├── Header.jsx         # Logo, theme toggle, cart icon with badge
│   │   └── CartDrawer.jsx     # Slide-out cart panel (grouped by merchant)
│   ├── chat/
│   │   ├── ChatInterface.jsx  # Main chat container + WS logic
│   │   ├── Message.jsx        # Single message (markdown for assistant)
│   │   └── TypingIndicator.jsx
│   ├── product/
│   │   ├── ProductCard.jsx    # Card with image, size/color selectors, add-to-cart
│   │   └── ProductGrid.jsx    # Horizontal scroll grid of cards in chat
│   └── checkout/
│       ├── CheckoutPage.jsx   # Shipping + payment + order review
│       ├── OrderSummary.jsx   # Cart summary grouped by merchant, subtotals, tax, total
│       └── StripePayment.jsx  # Stripe Elements wrapper
├── pages/
│   ├── ChatPage.jsx           # Main chat view
│   └── CheckoutPage.jsx       # Checkout flow
└── lib/
    └── api.js                 # REST API helpers
```

### 2d. Cart Drawer (the cart icon dropdown)
- Persistent cart icon in header with item count badge
- Click opens a slide-out drawer from the right
- Groups items by merchant name with merchant headers
- Each item shows: name, size/color selected, quantity +/- controls, price, remove button
- Footer shows: subtotal, estimated tax, total
- "Proceed to Checkout" button at bottom

### 2e. Product cards (interactive)
- Product image (or category placeholder icon)
- Merchant name badge (small pill above product name)
- Star rating
- Price
- Size selector (dropdown or pill buttons, from product.attributes.sizes)
- Color selector (color swatches, from product.attributes.colors)
- "Add to Cart" button — sends item + selected variant to cart store AND backend
- Out of stock = disabled

### 2f. Checkout page
- Step 1: Order Summary — items grouped by merchant, subtotals, tax (8%), grand total
- Step 2: Shipping info form (name, address, city, state, zip)
- Step 3: Payment — Stripe Checkout (redirect to Stripe-hosted page) or embedded Stripe Elements
- Order confirmation message after successful payment

### 2g. Dark/Light mode
- Toggle button in header (sun/moon icon)
- Tailwind `dark:` classes throughout
- Persisted in localStorage via Zustand

---

## Phase 3: Integration & Polish

- Wire up frontend cart actions to backend REST endpoints
- Wire up "Add to Cart" on product cards to both Zustand store (instant UI) AND backend API (persistent)
- Wire up checkout flow to Stripe sandbox
- Update the AI system prompt to mention merchant names when presenting products
- Test full flow: chat → search → see products → add to cart → view cart → checkout → Stripe payment
- Update test_system.py with new endpoint tests

---

## Files Changed (estimated)

**Backend (modify):** config.py, schemas.py, vector_db.py, registry.py, orchestrator.py, executor.py, main.py, user_db.py, product_db.py, sample_products.json, requirements.txt, .env, .env.example
**Backend (new):** payment.py
**Frontend (rebuild):** All files in frontend/ — new Vite setup, Tailwind config, all components rewritten
**Root:** docker-compose.yml, test_system.py
