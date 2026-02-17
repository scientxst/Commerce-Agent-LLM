import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import useCartStore from '../stores/cartStore'
import { createCheckoutSession } from '../lib/api'

const TAX_RATE = 0.08

export default function CheckoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, subtotal, total, closeCart } = useCartStore()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  })

  // Group items by merchant
  const itemsByMerchant = items.reduce((acc, item) => {
    const merchantName = item.merchant_name || 'Unknown Merchant'
    if (!acc[merchantName]) {
      acc[merchantName] = []
    }
    acc[merchantName].push(item)
    return acc
  }, {})

  const isSuccess = location.pathname === '/checkout/success'
  const isCancel = location.pathname === '/checkout/cancel'

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePayment = async () => {
    if (!formData.name || !formData.address || !formData.city || !formData.state || !formData.zip) {
      alert('Please fill in all shipping details')
      return
    }

    setIsLoading(true)
    try {
      const response = await createCheckoutSession({
        items: items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          size: item.selected_size,
          color: item.selected_color,
        })),
        shippingInfo: formData,
        subtotal,
        tax: total - subtotal,
        total,
      })

      if (response.checkout_url) {
        window.location.href = response.checkout_url
      } else {
        alert('Payment processing not configured. Order summary displayed for demo.')
      }
    } catch (error) {
      console.error('Payment error:', error)
      alert('Payment failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToShopping = () => {
    navigate('/')
  }

  // Success page
  if (isSuccess) {
    return (
      <div className="pt-16 min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Order Placed Successfully!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Thank you for your purchase. You'll receive a confirmation email shortly.
            </p>
            <button
              onClick={handleBackToShopping}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors"
            >
              <ArrowLeft size={18} />
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Cancel page
  if (isCancel) {
    return (
      <div className="pt-16 min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Payment Cancelled
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Your order was not completed. Your items are still in your cart.
            </p>
            <button
              onClick={handleBackToShopping}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Checkout form
  if (items.length === 0) {
    return (
      <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="text-6xl mb-4">🛒</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Your cart is empty
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Add some items to your cart before checking out.
            </p>
            <button
              onClick={handleBackToShopping}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={handleBackToShopping}
          className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mb-8"
        >
          <ArrowLeft size={18} />
          Back to Shopping
        </button>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Order Summary */}
          <div className="md:col-span-2 order-2 md:order-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Order Summary
              </h2>

              {Object.entries(itemsByMerchant).map(([merchantName, merchantItems]) => (
                <div key={merchantName} className="mb-8 last:mb-0">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                    {merchantName}
                  </h3>
                  <div className="space-y-4">
                    {merchantItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {item.name}
                          </p>
                          {(item.selected_size || item.selected_color) && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {item.selected_size && <span>{item.selected_size}</span>}
                              {item.selected_size && item.selected_color && <span> • </span>}
                              {item.selected_color && <span>{item.selected_color}</span>}
                            </p>
                          )}
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Qty: {item.quantity}
                          </p>
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          ${item.line_total.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Shipping Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Shipping Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Street Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="123 Main St"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="NY"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    name="zip"
                    value={formData.zip}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="10001"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Totals Sidebar */}
          <div className="order-1 md:order-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sticky top-24">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
                Order Total
              </h3>

              <div className="space-y-3 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Tax (8%):</span>
                  <span>${(total - subtotal).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-lg font-bold text-gray-900 dark:text-white mb-6">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>

              <button
                onClick={handlePayment}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Pay with Stripe'}
              </button>

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
                Your payment information is secure
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
