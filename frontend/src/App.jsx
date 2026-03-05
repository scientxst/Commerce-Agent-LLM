import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/layout/Header'
import CartDrawer from './components/layout/CartDrawer'
import ChatPage from './pages/ChatPage'

export default function App() {
  return (
    <div className="min-h-screen relative overflow-x-hidden bg-gradient-to-b from-indigo-50 via-slate-50 to-white dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 transition-colors">

      {/* Decorative glow blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-48 h-[34rem] w-[34rem] rounded-full bg-sky-400/20 blur-3xl dark:bg-sky-500/10" />

      <div className="relative z-10">
        <Header />
        <CartDrawer />

        {/* This is what makes your pages show up */}
        <Routes>
          <Route path="/" element={<ChatPage />} />
          {/* optional: redirect unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}