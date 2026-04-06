import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Search, PanelRightOpen } from 'lucide-react'
import ShopAssistLogo from '../ShopAssistLogo'
import useCartStore from '../../stores/cartStore'
import Message from './Message'
import ProductGrid from '../product/ProductGrid'

const SUGGESTIONS = [
  'red running shoes under $80',
  'ergonomic desk chair for long hours',
  'black hoodie size M',
  'wireless earbuds with ANC',
  'standing desk under $300',
  'gift ideas for a college student under $50',
]
// testing
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
  const inputRef = useRef(null)
  const pendingQuerySentRef = useRef(false)

  // Generate stable session ID
  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    }
  }, [])

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      if (!userId || !sessionIdRef.current) return

      const wsBase = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
      const wsUrl = `${wsBase}/ws/chat/${userId}/${sessionIdRef.current}`

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
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [userId])

  // Handle WebSocket messages
  const handleMessage = (data) => {
    if (data.type === 'text') {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1 ? { ...msg, content: msg.content + data.content } : msg
          )
        }
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
      })
    } else if (data.type === 'products') {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.role === 'assistant') {
          return prev.map((msg, idx) => (idx === prev.length - 1 ? { ...msg, products: data.products } : msg))
        }
        return prev
      })
    } else if (data.type === 'done') {
      setMessages((prev) => prev.map((msg, idx) => (idx === prev.length - 1 ? { ...msg, isStreaming: false } : msg)))
      setIsLoading(false)
      refreshCart()
    }
  }

  // Auto-send query from landing page (guest flow)
  useEffect(() => {
    if (!isConnected || pendingQuerySentRef.current) return
    const pending = sessionStorage.getItem('pendingQuery')
    if (!pending) return
    sessionStorage.removeItem('pendingQuery')
    pendingQuerySentRef.current = true
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: pending,
      products: [],
      isStreaming: false,
    }
    setMessages([userMessage])
    setIsLoading(true)
    wsRef.current.send(JSON.stringify({ type: 'message', content: pending }))
  }, [isConnected])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const latestProducts = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m?.role === 'assistant' && m?.products?.length) return m.products
    }
    return []
  }, [messages])

  const lastUserQuery = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m?.role === 'user' && m?.content) return m.content
    }
    return ''
  }, [messages])

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

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

  const applySuggestion = (text) => {
    setInput(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="h-full grid grid-rows-[1fr] lg:grid-cols-12 lg:divide-x divide-gray-200 dark:divide-gray-800">
      {/* Left: Chat */}
      <div className="lg:col-span-6 xl:col-span-7 h-full">
        <div className="h-full bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShopAssistLogo size={36} />
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Shopping Assistant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ask naturally — we’ll surface the best matches.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  isConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto chat-scroll px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="max-w-md">
                  <div className="mx-auto flex items-center justify-center">
                    <ShopAssistLogo size={56} />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Welcome to ShopAssist</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Describe what you want — brand, budget, size, color — and I’ll pull up options.
                  </p>

                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.slice(0, 4).map((s) => (
                      <button
                        key={s}
                        onClick={() => applySuggestion(s)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200/70 dark:border-gray-600 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id}>
                <Message message={message} />
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-gray-200/70 dark:border-gray-700 p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Try: ‘red shoes size 10 under $90’"
                  disabled={!isConnected || isLoading}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Enter to send • Shift+Enter for a new line</p>
              </div>

              <button
                onClick={sendMessage}
                disabled={!isConnected || isLoading || !input.trim()}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-sky-600 text-white rounded-2xl font-medium hover:from-indigo-700 hover:to-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Results — always visible */}
      <div className="lg:col-span-6 xl:col-span-5 h-full">
          <div className="h-full bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                  <Search size={18} className="text-gray-700 dark:text-gray-200" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Results</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {latestProducts.length
                      ? `${latestProducts.length} items found${lastUserQuery ? ` for “${lastUserQuery}”` : ''}`
                      : 'Products will appear as you chat.'}
                  </p>
                </div>
              </div>

              {!latestProducts.length && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                  <PanelRightOpen size={14} />
                  Waiting for results
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto chat-scroll p-5">
              {!latestProducts.length ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                    Ask for something (brand, price, size), and we’ll populate this panel with matches you can add to cart.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => applySuggestion(s)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ProductGrid products={latestProducts} variant="grid" />
              )}
            </div>
          </div>
      </div>
    </div>
  )
}