import React, { useState, useRef, useEffect, useCallback } from 'react';
import Message from './Message';
import ProductCard from './ProductCard';
import '../styles/ChatInterface.css';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ChatInterface = () => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey! I can help you find products, manage your cart, or track an order. What are you looking for?",
      products: []
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const userIdRef = useRef('user_' + Math.random().toString(36).substr(2, 9));
  const sessionIdRef = useRef('sess_' + Date.now().toString(36));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}/ws/chat/${userIdRef.current}/${sessionIdRef.current}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setWsConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (event) => {
      const chunk = JSON.parse(event.data);

      if (chunk.type === 'text') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + chunk.content }
            ];
          }
          return [...prev, { role: 'assistant', content: chunk.content, products: [], isStreaming: true }];
        });
      } else if (chunk.type === 'products') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last) return prev;
          return [...prev.slice(0, -1), { ...last, products: chunk.products }];
        });
      } else if (chunk.type === 'done') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last) return prev;
          return [...prev.slice(0, -1), { ...last, isStreaming: false }];
        });
        setIsLoading(false);
      }
    };

    ws.onerror = () => setWsConnected(false);

    ws.onclose = () => {
      setWsConnected(false);
      reconnectTimer.current = setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWebSocket]);

  const sendViaRest = async (userMessage) => {
    try {
      const resp = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userIdRef.current,
          session_id: sessionIdRef.current,
          message: userMessage
        })
      });
      const data = await resp.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        products: data.product_cards || []
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please try again in a moment.',
        products: []
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: userMessage, products: [] }]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(userMessage);
    } else {
      sendViaRest(userMessage);
    }
  };

  const handleAddToCart = (productId) => {
    const msg = `Add ${productId} to my cart`;
    setInput('');
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: msg, products: [] }]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    } else {
      sendViaRest(msg);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Shopping Assistant</h1>
        <span className={`status-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index}>
            <Message message={message} />
            {message.products && message.products.length > 0 && (
              <div className="products-grid">
                {message.products.map((product, pIdx) => (
                  <ProductCard
                    key={product.id || pIdx}
                    product={product}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && !messages[messages.length - 1]?.isStreaming && (
          <div className="loading-indicator">
            <div className="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for products, ask questions, track orders..."
          rows="1"
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
