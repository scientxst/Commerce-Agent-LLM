import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/layout/Header'
import CartDrawer from './components/layout/CartDrawer'
import ChatPage from './pages/ChatPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import useAuthStore from './stores/authStore'

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-gradient-to-b from-indigo-50 via-slate-50 to-white dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 transition-colors">

      {/* Decorative glow blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-48 h-[34rem] w-[34rem] rounded-full bg-sky-400/20 blur-3xl dark:bg-sky-500/10" />

      <div className="relative z-10">
        {/* Only show Header/Cart when logged in */}
        {isAuthenticated && <Header />}
        {isAuthenticated && <CartDrawer />}

        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={
              isAuthenticated
                ? <Navigate to="/" replace />
                : <LoginPage />
            }
          />

          {/* Protected */}
          <Route
            path="/"
            element={
              <ProtectedRoute><ChatPage /></ProtectedRoute>
            }
          />
          <Route
            path="/checkout"
            element={
              <ProtectedRoute><CheckoutPage /></ProtectedRoute>
            }
          />
          <Route
            path="/checkout/success"
            element={
              <ProtectedRoute><CheckoutPage /></ProtectedRoute>
            }
          />
          <Route
            path="/checkout/cancel"
            element={
              <ProtectedRoute><CheckoutPage /></ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route
            path="*"
            element={
              isAuthenticated
                ? <Navigate to="/" replace />
                : <Navigate to="/login" replace />
            }
          />
        </Routes>
      </div>
    </div>
  )
}
