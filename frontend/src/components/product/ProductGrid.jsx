import ProductCard from './ProductCard'

/**
 * variant:
 * - "carousel" (default): horizontal scroll list (good under messages)
 * - "grid": responsive grid (good for a dedicated results panel)
 */
export default function ProductGrid({ products, variant = 'carousel' }) {
  if (!products || products.length === 0) return null

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} variant="grid" />
        ))}
      </div>
    )
  }

  return (
    <div className="product-scroll overflow-x-auto pb-2 -mx-4 px-4">
      <div className="flex gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} variant="carousel" />
        ))}
      </div>
    </div>
  )
}