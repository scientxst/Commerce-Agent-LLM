import { X, Plus, Minus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useCartStore from '../../stores/cartStore'

export default function CartDrawer() {
  const navigate = useNavigate()
  const { isOpen, closeCart, items, subtotal, tax, total, removeItem, updateQuantity } = useCartStore()

  // Group items by merchant
  const itemsByMerchant = items.reduce((acc, item) => {
    const merchantName = item.merchant_name || 'Unknown Merchant'
    if (!acc[merchantName]) {
      acc[merchantName] = []
    }
    acc[merchantName].push(item)
    return acc
  }, {})

  const handleCheckout = () => {
    closeCart()
    navigate('/checkout')
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 transition-opacity"
          onClick={closeCart}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md z-50 bg-white dark:bg-gray-800 shadow-lg transition-transform duration-300 ease-in-out transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Shopping Cart</h2>
            <button
              onClick={closeCart}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close cart"
            >
              <X size={20} className="text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 chat-scroll">
            {items.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Your cart is empty
              </p>
            ) : (
              <div className="space-y-6">
                {Object.entries(itemsByMerchant).map(([merchantName, merchantItems]) => (
                  <div key={merchantName}>
                    {/* Merchant Header */}
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                      {merchantName}
                    </h3>

                    {/* Items */}
                    <div className="space-y-3">
                      {merchantItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-3 pb-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          {/* Item Details */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {item.name}
                            </p>
                            {(item.selected_size || item.selected_color) && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {item.selected_size && <span>{item.selected_size}</span>}
                                {item.selected_size && item.selected_color && <span> • </span>}
                                {item.selected_color && <span>{item.selected_color}</span>}
                              </p>
                            )}
                            <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 mt-2">
                              ${item.line_total.toFixed(2)}
                            </p>
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={16} className="text-gray-600 dark:text-gray-300" />
                            </button>
                            <span className="w-6 text-center text-sm font-medium text-gray-900 dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus size={16} className="text-gray-600 dark:text-gray-300" />
                            </button>
                          </div>

                          {/* Remove Button */}
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-red-500"
                            aria-label="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
              {/* Summary */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Tax:</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Total:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-2">
                <button
                  onClick={closeCart}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Continue Shopping
                </button>
                <button
                  onClick={handleCheckout}
                  className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors"
                >
                  Proceed to Checkout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
