import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Sparkles, Search, PanelRightOpen } from 'lucide-react'
import useCartStore from '../../stores/cartStore'
import { sendChatMessage } from '../../lib/api'
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

export default function ChatInterface() {
  const { userId, refreshCart } = useCartStore()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const messagesEndRef = useRef(null)
  const sessionIdRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const latestProducts = useMemo(() => {
    const assistantMessages = [...messages].reverse().find((m) => m.role === 'assistant' && m.products?.length)
    return assistantMessages?.products || []
  }, [messages])

  const lastUserQuery = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'user')
    return last?.content || ''
  }, [messages])

  const isReady = Boolean(userId && sessionIdRef.current)
  const showResultsPanel = useMemo(() => messages.length > 0, [messages.length])

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading || !userId || !sessionIdRef.current) return

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
      products: [],
      isStreaming: false,
    }

    const assistantMessageId = `msg_${Date.now()}_assistant`

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        products: [],
        isStreaming: true,
      },
    ])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendChatMessage(userId, sessionIdRef.current, trimmed)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: response?.message || 'Sorry, I could not generate a response.',
                products: response?.product_cards || [],
                isStreaming: false,
              }
            : msg
        )
      )
      await refreshCart()
    } catch (error) {
      console.error('Chat request failed:', error)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: 'The assistant is unavailable right now. Check your Vercel environment variables and try again.',
                products: [],
                isStreaming: false,
              }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const applySuggestion = (text) => {
    setInput(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div
      className={
        showResultsPanel
          ? 'h-full grid grid-rows-[1fr] lg:grid-cols-12 gap-6'
          : 'h-full flex items-center justify-center'
      }
    >
      <div className={showResultsPanel ? 'lg:col-span-7 xl:col-span-8 h-full' : 'w-full max-w-4xl'}>
        <div
          className={`rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col overflow-hidden ${
            showResultsPanel ? 'h-full' : 'min-h-[70vh]'
          }`}
        >
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 text-white flex items-center justify-center shadow-sm">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Shopping Assistant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ask naturally — we’ll surface the best matches.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  isReady
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                {isReady ? 'Ready' : 'Starting'}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto chat-scroll px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="max-w-md">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-2xl border border-purple-100 dark:border-purple-800">
                    👜
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

          <div className="border-t border-gray-200/70 dark:border-gray-700 p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Try: ‘red shoes size 10 under $90’"
                  disabled={!isReady || isLoading}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Enter to send • Shift+Enter for a new line</p>
              </div>

              <button
                onClick={() => void sendMessage()}
                disabled={!isReady || isLoading || !input.trim()}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-sky-600 text-white rounded-2xl font-medium hover:from-indigo-700 hover:to-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showResultsPanel && (
        <div className="lg:col-span-5 xl:col-span-4 h-full">
          <div className="h-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
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
      )}
    </div>
  )
}
