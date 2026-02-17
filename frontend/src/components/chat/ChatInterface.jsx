import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import useCartStore from '../../stores/cartStore'
import Message from './Message'
import ProductGrid from '../product/ProductGrid'

export default function ChatInterface() {
  const { userId, refreshCart } = useCartStore()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef(null)
  const wsRef = useRef(null)
  const sessionIdRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  // Generate stable session ID
  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }, [])

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      if (!userId || !sessionIdRef.current) return

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/chat/${userId}/${sessionIdRef.current}`

      try {
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          setIsConnected(true)
          console.log('WebSocket connected')
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          handleMessage(data)
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          setIsConnected(false)
        }

        ws.onclose = () => {
          setIsConnected(false)
          console.log('WebSocket disconnected, reconnecting in 3s...')
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
        }

        wsRef.current = ws
      } catch (error) {
        console.error('Failed to connect WebSocket:', error)
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
      }
    }

    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [userId])

  // Handle WebSocket messages
  const handleMessage = (data) => {
    if (data.type === 'text') {
      // Streaming text message
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: msg.content + data.content }
              : msg
          )
        } else {
          return [
            ...prev,
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: data.content,
              products: [],
              isStreaming: true,
            },
          ]
        }
      })
    } else if (data.type === 'products') {
      // Products in current message
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.role === 'assistant') {
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, products: data.products }
              : msg
          )
        }
        return prev
      })
    } else if (data.type === 'done') {
      // Message complete
      setMessages((prev) =>
        prev.map((msg, idx) =>
          idx === prev.length - 1
            ? { ...msg, isStreaming: false }
            : msg
        )
      )
      setIsLoading(false)
      refreshCart()
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      products: [],
      isStreaming: false,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Send to backend
    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        content: input,
      })
    )
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Connection Status */}
      <div className="px-4 py-2 flex items-center gap-2 text-xs">
        <div
          className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className="text-gray-600 dark:text-gray-400">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">👜</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to ShopAssist
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-xs">
              Tell me what you're looking for, and I'll help you find the perfect items!
            </p>
          </div>
        )}

        {messages.map((message, idx) => (
          <div key={message.id}>
            <Message message={message} />
            {message.products && message.products.length > 0 && (
              <div className="mt-3 ml-4">
                <ProductGrid products={message.products} />
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell me what you're looking for..."
          disabled={!isConnected || isLoading}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            onClick={sendMessage}
            disabled={!isConnected || isLoading || !input.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Press Shift + Enter for a new line
        </p>
      </div>
    </div>
  )
}
