# AI-Native E-Commerce Shopping Assistant


A production-ready AI shopping assistant built with GPT-4, RAG (Retrieval-Augmented Generation), and ReAct (Reasoning + Acting) architecture.

## Features

- **Conversational AI**: Natural language product search and recommendations
- **Hybrid Search**: Combines semantic (vector) and keyword search with Reciprocal Rank Fusion
- **Intent Classification**: Automatically detects user intent (Browse, Search, Purchase, Support, Inquiry)
- **Guardrails**: Enforces business rules and prevents hallucinations
- **Streaming Responses**: Real-time WebSocket-based chat with token streaming
- **Product Cards**: Beautiful UI with product details, ratings, and stock status
- **Memory Management**: Context-aware conversations with short and long-term memory
- **Real-time Updates**: Live price and stock information

## Architecture

## System Components

```
┌─────────────────────────────────────────────────────────┐
│                    INTERACTION LAYER                     │
│  Web UI  │ Widget SDK │ REST API             │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│                    REASONING LAYER                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │         ORCHESTRATION ENGINE (ReAct)              │   │
│  │  Intent → Plan → Guardrails → LLM + Tools        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│                  SERVICES/DATA LAYER                     │
│  Vector DB (Milvus) │ Product DB │ User DB │ Redis      │
└─────────────────────────────────────────────────────────┘
```

### Core Components

1. **Orchestration Engine**: Manages conversation flow using ReAct pattern
2. **Intent Classifier**: Classifies user messages into actionable intents
3. **Plan Generator**: Creates execution plans for each intent
4. **Guardrails Engine**: Validates responses against business rules
5. **Tool Executor**: Executes function calls (search, cart, orders)
6. **RAG System**: Vector search with Milvus for semantic product search
7. **Memory Service**: Manages conversation context and history


### Prerequisites

- Python 3.10+
- Node.js 18+
- An OpenAI API key (https://platform.openai.com/api-keys)
- (Optional) Stripe test keys for the checkout demo (https://dashboard.stripe.com/test/apikeys)
- (Optional) Docker — only needed if you want to run Milvus/Redis locally; the app falls back to an in-memory vector cache + sample-product data if neither is available, so Docker is **not required for the demo**.

### 1. Clone and Setup

```bash
git clone https://github.com/scientxst/Commerce-Agent-LLM.git
cd Commerce-Agent-LLM

# Copy environment file
cp .env.example .env

# Edit .env. At minimum you must set:
#   OPENAI_API_KEY=sk-proj-...
#   JWT_SECRET=any-long-random-string
# For the checkout demo, also set:
#   STRIPE_SECRET_KEY=sk_test_...
#   STRIPE_WEBHOOK_SECRET=whsec_...    (from `stripe listen`)
# All other keys in .env.example are optional — the app degrades gracefully.
open -e .env    # macOS — opens in TextEdit. Or use nano / vim / VS Code.
```

### 2. Install Backend Dependencies

```bash
cd backend
pip3 install -r requirements.txt
# If you see "externally-managed-environment" on macOS Homebrew Python, use:
#   pip3 install --break-system-packages -r requirements.txt
cd ..
```

### 3. Start Backend Server

```bash
cd backend
python3 -m uvicorn app.main:app --reload --port 8000

# Server starts on http://localhost:8000
# Interactive API docs at http://localhost:8000/docs
# Look for: "Ready — 96 products indexed"
```

On first start the backend will:
- Load sample products from `data/sample_products.json`
- Generate (or load cached) embeddings
- Initialize all services

### 4. Install and Start Frontend

```bash
# In a NEW terminal window — leave the backend running
cd frontend
npm install
npm run dev

# Frontend serves at http://localhost:3000
```

### 5. (Optional) Stripe webhook listener for checkout demo

```bash
# Install once
brew install stripe/stripe-cli/stripe

# Pair the CLI to your Stripe account (browser opens)
stripe login

# In a third terminal — leave it running while you test checkout
stripe listen --forward-to localhost:8000/api/checkout/webhook

# Copy the printed `whsec_...` value into STRIPE_WEBHOOK_SECRET in .env
# and restart the backend so it picks up the new secret.
```

##Usage

###Example Queries

**Search Queries:**
- "I need comfortable shoes for a wedding under $150"
- "Show me the latest smartphones"
- "Looking for noise cancelling headphones for travel"

**Product Inquiries:**
- "Is this waterproof?"
- "What colors is this available in?"
- "How long does shipping take?"

**Cart Operations:**
- "Add this to my cart"
- "What's in my cart?"

**Order Tracking:**
- "Where is my order ORD-2024-001?"
- "When will it arrive?"

## Project Structure

```
ai-shopping-assistant/
├── backend/
│   ├── app/
│   │   ├── core/                 # Core components
│   │   │   ├── intent_classifier.py
│   │   │   ├── plan_generator.py
│   │   │   ├── guardrails.py
│   │   │   └── orchestrator.py
│   │   ├── services/             # Data services
│   │   │   ├── vector_db.py
│   │   │   ├── product_db.py
│   │   │   ├── user_db.py
│   │   │   └── memory.py
│   │   ├── tools/                # Tool system
│   │   │   ├── registry.py
│   │   │   └── executor.py
│   │   ├── models/               # Data models
│   │   │   └── schemas.py
│   │   └── main.py              # FastAPI application
│   ├── data/
│   │   └── sample_products.json
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx
│   │   │   ├── Message.jsx
│   │   │   └── ProductCard.jsx
│   │   ├── styles/
│   │   └── App.js
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Configuration

### Environment Variables

The full list lives in [`.env.example`](.env.example). The minimum needed to start the app:

```env
# OpenAI — required
OPENAI_API_KEY=sk-proj-...
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# Auth — required (any long random string for local dev)
JWT_SECRET=change-me-to-a-long-random-string

# Stripe — required ONLY if demoing checkout
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OAuth providers — optional, leave blank to disable Google/Microsoft sign-in
GOOGLE_CLIENT_ID=
MICROSOFT_CLIENT_ID=

# Application
MAX_CONTEXT_TOKENS=8000
MAX_REACT_ITERATIONS=5
TAX_RATE=0.08
ENVIRONMENT=development
```

External product-search APIs (RapidAPI, SerpAPI, Rainforest, ScraperAPI, etc.) are all optional — without them the app uses sample product data. See `.env.example` for the full list.

## Key Features Explained

### 1. Hybrid Search

Combines semantic and keyword search for best results:
- **Semantic Search**: Understands intent ("comfortable wedding shoes")
- **Keyword Search**: Exact matches (SKU, brand names)
- **Reciprocal Rank Fusion**: Intelligently merges results

### 2. Guardrails System

Prevents AI from:
- Making up discounts or prices
- Mentioning competitor products
- Claiming items are in stock without verification
- Exposing user PII

### 3. ReAct Pattern

Reasoning + Acting loop:
1. User sends message
2. System classifies intent
3. Generates execution plan
4. Validates with guardrails
5. Executes tools (search, fetch data)
6. Generates natural response

### 4. Streaming Responses

WebSocket-based streaming for:
- Real-time token-by-token responses
- Better user experience
- Lower perceived latency

## 📊 API Endpoints

### REST API

- `POST /api/chat` - Send message (non-streaming)
- `GET /api/products` - List products
- `GET /api/products/{id}` - Get product details
- `GET /health` - Health check

### WebSocket

- `WS /ws/chat/{user_id}/{session_id}` - Streaming chat

## 🧪 Testing

Test the system with curl:

```bash
# Send chat message
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "session_id": "test_session",
    "message": "I need comfortable wedding shoes under $150"
  }'

# Get products
curl http://localhost:8000/api/products

# Health check
curl http://localhost:8000/health
```

## Production Deployment

### Recommended Changes

1. **Security**:
   - Use proper authentication (OAuth, JWT)
   - Set up API rate limiting
   - Configure CORS properly
   - Use HTTPS

2. **Scalability**:
   - Deploy Milvus cluster (not standalone)
   - Use Redis Cluster for high availability
   - Implement connection pooling
   - Add load balancer

3. **Monitoring**:
   - Set up DataDog/Prometheus
   - Track key metrics (latency, errors, conversions)
   - Implement structured logging
   - Set up alerts

4. **Database**:
   - Use PostgreSQL for user/order data
   - Integrate with actual e-commerce backend (Magento, Shopify)
   - Implement proper caching strategy

## Troubleshooting

### Milvus Connection Failed

```bash
# Check if Milvus is running
docker-compose ps

# Restart services
docker-compose restart

# Check logs
docker-compose logs milvus
```

### OpenAI API Errors

- Verify API key is correct in `.env`
- Check API quota and rate limits
- Ensure internet connectivity

### Frontend Can't Connect to Backend

- Verify backend is running on port 8000
- Check CORS configuration
- Inspect browser console for errors

## 📝 Future Enhancements

- [ ] Multi-modal input (image search)
- [ ] Voice interface
- [ ] AR try-on integration
- [ ] Proactive recommendations
- [ ] Multi-language support
- [ ] Purchase execution (autonomous agent)

## 📄 License

MIT License - feel free to use for your projects!

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

For questions or issues, please open a GitHub issue.

---

Built with integrating GPT-4, LangChain, FastAPI, React, and Milvus
