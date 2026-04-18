import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Search, PanelRightOpen } from 'lucide-react'
import ShopAssistLogo from '../ShopAssistLogo'
import useCartStore from '../../stores/cartStore'
import useAuthStore from '../../stores/authStore'
import Message from './Message'
import ProductGrid from '../product/ProductGrid'

function newIdemKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '')
  } catch {}
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

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
  const { refreshCart } = useCartStore()
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('chatMessages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [showDisconnectBanner, setShowDisconnectBanner] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const [activeCategory, setActiveCategory] = useState(() => {
    const saved = sessionStorage.getItem('pendingCategory')
    return saved || 'tech'
  })

  const messagesEndRef = useRef(null)
  const wsRef = useRef(null)
  const sessionIdRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const inputRef = useRef(null)
  const pendingQuerySentRef = useRef(false)
  const pendingMessageRef = useRef(null)
  const retryCountRef = useRef(0)
  const heartbeatRef = useRef(null)
  const heartbeatTimeoutRef = useRef(null)
  const loadingTimeoutRef = useRef(null)
  const disconnectBannerTimeoutRef = useRef(null)

  // Generate stable session ID (persisted across page reloads)
  useEffect(() => {
    if (!sessionIdRef.current) {
      const saved = sessionStorage.getItem('chatSessionId')
      if (saved) {
        sessionIdRef.current = saved
      } else {
        sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
        sessionStorage.setItem('chatSessionId', sessionIdRef.current)
      }
    }
  }, [])

  // WebSocket connection
  useEffect(() => {
    let cancelled = false

    const connectWebSocket = () => {
      if (cancelled || !token || !sessionIdRef.current) return

      // Close any existing connection before opening a new one.
      // Null ALL handlers so a late onopen/onmessage from the old socket
      // cannot clobber heartbeatRef/wsRef on the new socket.
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onerror = null
        wsRef.current.onclose = null
        wsRef.current.close()
      }

      // WS auth is via first-frame `{type:"auth",token}` (server also still
      // accepts ?token= as a deprecated fallback for one release).
      const wsBase = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
      const wsUrl = `${wsBase}/ws/chat/${sessionIdRef.current}`

      try {
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          if (cancelled) { ws.close(); return }
          setIsConnected(true)
          // Clear any pending "connection lost" banner trigger
          if (disconnectBannerTimeoutRef.current) {
            clearTimeout(disconnectBannerTimeoutRef.current)
            disconnectBannerTimeoutRef.current = null
          }
          setShowDisconnectBanner(false)
          console.log('WebSocket open — sending auth frame')

          // Send auth as the first frame. Server replies {type:"auth_ok"}
          // or closes with 4401. We defer heartbeats + message sends until
          // auth_ok arrives.
          try {
            ws.send(JSON.stringify({ type: 'auth', token }))
          } catch (err) {
            console.error('Failed to send auth frame:', err)
          }
        }

        ws.onmessage = (event) => {
          // Any inbound message proves the server is alive — cancel pending timeout
          if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
          let data
          try { data = JSON.parse(event.data) } catch { return }
          if (data.type === 'pong') return

          if (data.type === 'auth_ok') {
            setIsAuthed(true)
            // Start heartbeat only after auth succeeds
            if (heartbeatRef.current) clearInterval(heartbeatRef.current)
            if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
            heartbeatRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }))
                if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
                heartbeatTimeoutRef.current = setTimeout(() => {
                  console.log('Heartbeat timeout — closing stale connection')
                  ws.close()
                }, 30000)
              }
            }, 15000)
            return
          }

          if (data.type === 'error' && data.code === 'concurrency_cap') {
            setMessages((prev) => [...prev, {
              id: `msg_cap_${Date.now()}`,
              role: 'assistant',
              content: data.message || 'Too many active connections.',
              products: [], isStreaming: false,
            }])
            return
          }

          handleMessage(data)
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          setIsConnected(false)
        }

        ws.onclose = (ev) => {
          setIsConnected(false)
          setIsAuthed(false)
          if (heartbeatRef.current) clearInterval(heartbeatRef.current)
          if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)

          // 4401 = auth rejected (invalid/expired token). Stop the retry
          // loop, surface a "session expired" prompt, and clear auth state.
          if (ev && ev.code === 4401) {
            setSessionExpired(true)
            setShowDisconnectBanner(false)
            setIsLoading(false)
            logout()
            return
          }

          // Only show the "Connection lost" banner if we stay disconnected
          // for >1.5s. Brief reconnects (token change, normal hiccup) pass
          // without a visible flicker.
          if (disconnectBannerTimeoutRef.current) clearTimeout(disconnectBannerTimeoutRef.current)
          disconnectBannerTimeoutRef.current = setTimeout(() => {
            setShowDisconnectBanner(true)
          }, 1500)
          setIsLoading((prev) => {
            if (prev) {
              setMessages((msgs) => {
                const last = msgs[msgs.length - 1]
                if (last && last.role === 'assistant' && last.isStreaming) {
                  return msgs.map((msg, idx) =>
                    idx === msgs.length - 1 ? { ...msg, isStreaming: false } : msg
                  )
                }
                return msgs
              })
            }
            return false
          })
          if (!cancelled) {
            console.log('WebSocket disconnected, reconnecting in 3s...')
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
          }
        }

        wsRef.current = ws
      } catch (error) {
        console.error('Failed to connect WebSocket:', error)
        if (!cancelled) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
        }
      }
    }

    connectWebSocket()

    return () => {
      cancelled = true
      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onerror = null
        wsRef.current.onclose = null
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
      if (disconnectBannerTimeoutRef.current) clearTimeout(disconnectBannerTimeoutRef.current)
    }
  }, [token])

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
      pendingMessageRef.current = null
      retryCountRef.current = 0
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current)
      refreshCart()
    }
  }

  // Auto-send query from landing page (guest flow)
  useEffect(() => {
    if (!isAuthed || pendingQuerySentRef.current) return
    const pending = sessionStorage.getItem('pendingQuery')
    if (!pending) return
    const pendingCat = sessionStorage.getItem('pendingCategory') || 'tech'
    sessionStorage.removeItem('pendingQuery')
    sessionStorage.removeItem('pendingCategory')
    setActiveCategory(pendingCat)
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
    wsRef.current.send(JSON.stringify({
      type: 'message', content: pending, category: pendingCat,
      idempotency_key: newIdemKey(),
    }))
  }, [isAuthed])

  // Persist messages to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('chatMessages', JSON.stringify(messages))
  }, [messages])

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
    if (!isAuthed) return

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

    pendingMessageRef.current = { content: input, category: activeCategory }

    // Safety timeout: if no response in 30s, unblock UI
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current)
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      pendingMessageRef.current = null
      retryCountRef.current = 0
      setMessages((prev) => [...prev, {
        id: `msg_timeout_${Date.now()}`, role: 'assistant',
        content: 'The request timed out. Please try again or reload the page.',
        products: [], isStreaming: false,
      }])
    }, 30000)

    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        content: input,
        category: activeCategory,
        idempotency_key: newIdemKey(),
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

          {/* Reconnection banner (debounced: only after 1.5s of disconnect) */}
          {showDisconnectBanner && !sessionExpired && messages.length > 0 && (
            <div className="px-5 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs text-center border-b border-amber-200 dark:border-amber-800">
              Connection lost. Reconnecting...
            </div>
          )}

          {/* Session expired (token rejected; reconnect loop stopped) */}
          {sessionExpired && (
            <div className="px-5 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs text-center border-b border-rose-200 dark:border-rose-800">
              Session expired. Please refresh the page to sign in again.
            </div>
          )}

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