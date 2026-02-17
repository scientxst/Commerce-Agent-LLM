import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/layout/Header'
import CartDrawer from './components/layout/CartDrawer'
import ChatPage from './pages/ChatPage'
import CheckoutPage from './pages/CheckoutPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <Header />
        <CartDrawer />
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/success" element={<CheckoutPage />} />
          <Route path="/checkout/cancel" element={<CheckoutPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
