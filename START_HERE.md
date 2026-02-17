# 🚀 Quick Start Guide

## Prerequisites

Before you begin, ensure you have:
- ✅ Python 3.9 or higher
- ✅ Node.js 16 or higher
- ✅ Docker and Docker Compose
- ✅ OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

## Step-by-Step Setup (5 minutes)

### 1. Configure OpenAI API Key

```bash
# Navigate to project directory
cd ai-shopping-assistant

# Copy the environment template
cp .env.example .env

# Edit .env and add your OpenAI API key
# Replace 'your_openai_api_key_here' with your actual key
```

### 2. Start Infrastructure Services

```bash
# Start Milvus (vector database) and Redis
docker-compose up -d

# Wait 30-60 seconds for services to initialize
# You can check status with:
docker-compose ps
```

### 3. Start Backend (Terminal 1)

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Start the FastAPI server
python -m app.main

# ✅ Backend running at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 4. Start Frontend (Terminal 2)

```bash
# Open a NEW terminal window
cd frontend

# Install Node dependencies
npm install

# Start React development server
npm start

# ✅ Frontend will open at http://localhost:3000
```

## 🎉 You're Ready!

The chat interface should now be open in your browser. Try asking:

- "I need comfortable shoes for a wedding under $150"
- "Show me the latest smartphones"
- "What headphones are good for travel?"

## 📊 What's Happening Behind the Scenes

When you send a message:

1. **Intent Classification**: GPT-4 classifies your intent (Search, Browse, Purchase, etc.)
2. **Plan Generation**: Creates an execution plan
3. **Guardrails Check**: Validates against business rules
4. **Tool Execution**: Searches products using hybrid search (semantic + keyword)
5. **Response Generation**: GPT-4 generates natural language response
6. **Streaming**: Response streams back token-by-token via WebSocket

## 🔍 Explore the Code

### Key Files:

**Backend:**
- `backend/app/core/orchestrator.py` - Main ReAct loop
- `backend/app/services/vector_db.py` - RAG system with Milvus
- `backend/app/tools/executor.py` - Tool implementations
- `backend/app/main.py` - FastAPI server

**Frontend:**
- `frontend/src/components/ChatInterface.jsx` - Main chat UI
- `frontend/src/components/ProductCard.jsx` - Product display

## 🛠️ Troubleshooting

### Backend won't start?
- Check that Docker services are running: `docker-compose ps`
- Verify your OpenAI API key in `.env`
- Check for port conflicts on 8000

### Frontend won't connect?
- Ensure backend is running on port 8000
- Check browser console for errors
- Try hard refresh (Ctrl+Shift+R)

### Milvus connection issues?
```bash
# Restart Docker services
docker-compose restart

# View logs
docker-compose logs milvus
```

## 📚 Next Steps

1. Read the full [README.md](README.md) for architecture details
2. Explore the API docs at http://localhost:8000/docs
3. Modify `backend/data/sample_products.json` to add your products
4. Customize the system prompt in `orchestrator.py`

## 💡 Tips

- The system uses GPT-4 Turbo for best results
- Products are embedded into Milvus on first startup
- Conversation context is maintained per session
- Try natural language queries - the system understands intent!

---

Need help? Check the README.md or open an issue on GitHub.

Enjoy your AI shopping assistant! 🛍️✨
