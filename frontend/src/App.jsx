import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Sun, Moon, LogOut, UserCircle } from 'lucide-react'
import Sidebar, { SIDEBAR_WIDTH } from './components/layout/Sidebar'
import CartDrawer from './components/layout/CartDrawer'
import ChatPage from './pages/ChatPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import SavedPage from './pages/SavedPage'
import useAuthStore from './stores/authStore'
import useThemeStore from './stores/themeStore'

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

// ── Profile slide-in panel ────────────────────────────────────────
function ProfilePanel({ onClose }) {
  const { user, isGuest, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const providerLabel = {
    google: 'Google',
    microsoft: 'Microsoft',
    email: 'Email',
    guest: 'Guest',
  }[user?.provider] || user?.provider || 'Unknown'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-white">Profile</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
      </div>

      {/* Avatar + info */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white text-xl font-bold shadow-md">
          {initials}
        </div>
        <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">{user?.name || 'User'}</h3>
        {user?.email && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 break-all">{user.email}</p>
        )}
        <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
          <UserCircle size={12} />
          via {providerLabel}
        </span>
        {isGuest && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg">
            You're browsing as a guest. Sign in to save your cart and history.
          </p>
        )}
      </div>

      <div className="flex-1" />

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 transition-colors"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  )
}

// ── Settings slide-in panel ───────────────────────────────────────
function SettingsPanel({ onClose }) {
  const { dark, toggle } = useThemeStore()

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-white">Settings</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
      </div>

      <div className="space-y-4">
        {/* Dark mode toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            {dark ? <Moon size={16} className="text-indigo-400" /> : <Sun size={16} className="text-amber-500" />}
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{dark ? 'On' : 'Off'}</p>
            </div>
          </div>
          <button
            onClick={toggle}
            className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
              dark ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                dark ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">App Version</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">ShopAssist v1.0 · AI-powered shopping</p>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────
export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [activePanel, setActivePanel] = useState(null) // 'profile' | 'settings' | null

  // Keep-alive ping
  useEffect(() => {
    const API_URL = import.meta.env.VITE_BACKEND_URL || ''
    if (!API_URL) return
    const ping = () => fetch(`${API_URL}/health`).catch(() => {})
    ping()
    const id = setInterval(ping, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-white dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 transition-colors">

      {isAuthenticated && (
        <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />
      )}
      {isAuthenticated && <CartDrawer />}

      {/* Profile panel */}
      {isAuthenticated && activePanel === 'profile' && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setActivePanel(null)}
        >
          <div
            className="absolute top-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl p-6 overflow-y-auto"
            style={{ left: SIDEBAR_WIDTH }}
            onClick={(e) => e.stopPropagation()}
          >
            <ProfilePanel onClose={() => setActivePanel(null)} />
          </div>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40" style={{ left: SIDEBAR_WIDTH + 288 }} />
        </div>
      )}

      {/* Settings panel */}
      {isAuthenticated && activePanel === 'settings' && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setActivePanel(null)}
        >
          <div
            className="absolute top-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl p-6 overflow-y-auto"
            style={{ left: SIDEBAR_WIDTH }}
            onClick={(e) => e.stopPropagation()}
          >
            <SettingsPanel onClose={() => setActivePanel(null)} />
          </div>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40" style={{ left: SIDEBAR_WIDTH + 288 }} />
        </div>
      )}

      {/* Page content — offset right of sidebar when authenticated */}
      <div style={isAuthenticated ? { paddingLeft: SIDEBAR_WIDTH } : {}}>
        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
          />

          {/* Protected */}
          <Route path="/" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="/saved" element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
          <Route path="/checkout/success" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
          <Route path="/checkout/cancel" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route
            path="*"
            element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </div>
    </div>
  )
}
