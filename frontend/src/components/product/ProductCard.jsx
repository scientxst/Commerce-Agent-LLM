import { useState } from 'react'
import useCartStore from '../../stores/cartStore'

const CATEGORY_ICONS = {
  electronics: '📱',
  clothing: '👕',
  books: '📚',
  home: '🏠',
  sports: '⚽',
  toys: '🧸',
  beauty: '💄',
  food: '🍕',
  shoes: '👟',
  accessories: '⌚',
  default: '🛍️',
}

export default function ProductCard({ product, variant = 'carousel' }) {
  const [selectedSize, setSelectedSize] = useState(null)
  const [selectedColor, setSelectedColor] = useState(null)
  const { addItem } = useCartStore()

  const inStock = product.stock > 0
  const hasSizes = product.attributes?.sizes && product.attributes.sizes.length > 0
  const hasColors = product.attributes?.colors && product.attributes.colors.length > 0
  const isGrid = variant === 'grid'

  const getCategoryIcon = () => {
    const category = product.category?.toLowerCase() || 'default'
    return CATEGORY_ICONS[category] || CATEGORY_ICONS.default
  }

  const handleAddToCart = () => {
    addItem(product.id, 1, selectedSize, selectedColor)
  }

  const renderStars = (rating) => {
    const stars = []
    const filledStars = Math.floor(rating)
    for (let i = 0; i < 5; i++) {
      stars.push(
        <span key={i} className={i < filledStars ? 'text-yellow-400' : 'text-gray-300'}>
          ★
        </span>
      )
    }
    return stars
  }

  return (
    <div
  className={`${isGrid ? 'w-full' : 'flex-shrink-0 w-72'} bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden border border-gray-200/70 dark:border-gray-700`}
>
{/* Header */}
<div className="px-4 pt-4 flex items-start justify-between gap-3">
  <div className="min-w-0">
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200">
      {product.merchant_name}
    </span>
  </div>
  <div className="h-10 w-10 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-xl border border-gray-200/70 dark:border-gray-600">
    {getCategoryIcon()}
  </div>
</div>

      {/* Product Info */}
      <div className="px-4 pt-4 pb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 text-[13px] leading-snug mb-2">
          {product.name}
        </h3>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-2">
          <div className="flex text-sm">{renderStars(product.rating || 0)}</div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {product.rating ? `(${product.rating.toFixed(1)})` : '(New)'}
          </span>
        </div>

        {/* Price */}
        <p className="text-lg font-bold text-purple-600 dark:text-purple-400 mb-3">
          ${product.price.toFixed(2)}
        </p>

        {/* Stock Status */}
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium mb-3 ${
            inStock
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {inStock ? `${product.stock} in stock` : 'Out of stock'}
        </span>

        {/* Size Selector */}
        {hasSizes && (
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Size
            </label>
            <div className="flex flex-wrap gap-2">
              {product.attributes.sizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    selectedSize === size
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-purple-400'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Color Selector */}
        {hasColors && (
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {product.attributes.colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    selectedColor === color
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-purple-400'
                  }`}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add to Cart Button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleAddToCart}
          disabled={!inStock}
          className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
            inStock
              ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }`}
        >
          {inStock ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    </div>
  )
}
