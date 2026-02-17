import ProductCard from './ProductCard'

export default function ProductGrid({ products }) {
  if (!products || products.length === 0) {
    return null
  }

  return (
    <div className="product-scroll overflow-x-auto pb-2 -mx-4 px-4">
      <div className="flex gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}
