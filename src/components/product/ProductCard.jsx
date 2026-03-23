import { useState } from 'react'
import useCartStore from '../../stores/cartStore'

const BRAND_URLS = {
  'nike':           q => `https://www.nike.com/search?q=${q}`,
  'adidas':         q => `https://www.adidas.com/us/search?q=${q}`,
  'new balance':    q => `https://www.newbalance.com/search?q=${q}`,
  'hoka':           q => `https://www.hoka.com/en/us/search?q=${q}`,
  'vans':           q => `https://www.vans.com/en-us/search?q=${q}`,
  'converse':       q => `https://www.converse.com/shop/searchresults?q=${q}`,
  'puma':           q => `https://us.puma.com/en_US/search?q=${q}`,
  'reebok':         q => `https://www.reebok.com/us/search?q=${q}`,
  'timberland':     q => `https://www.timberland.com/en-us/c/search?q=${q}`,
  'clarks':         q => `https://www.clarks.com/en-us/search?q=${q}`,
  'cole haan':      q => `https://www.colehaan.com/search?q=${q}`,
  'naturalizer':    q => `https://www.naturalizer.com/search?q=${q}`,
  'apple':          q => `https://www.apple.com/shop/product/search?q=${q}`,
  'samsung':        q => `https://www.samsung.com/us/search/searchMain/N?searchword=${q}`,
  'google':         q => `https://store.google.com/us/search?q=${q}`,
  'dell':           q => `https://www.dell.com/en-us/search/${encodeURIComponent(q)}/N`,
  'hp':             q => `https://www.hp.com/us-en/shop/searchresult/search-result.aspx?q=${q}`,
  'lenovo':         q => `https://www.lenovo.com/us/en/search/?q=${q}`,
  'asus':           q => `https://www.asus.com/us/search/?q=${q}`,
  'microsoft':      q => `https://www.microsoft.com/en-us/search/shop/results?q=${q}`,
  'sony':           q => `https://electronics.sony.com/search?q=${q}`,
  'bose':           q => `https://www.bose.com/en_us/search.html?q=${q}`,
  'logitech':       q => `https://www.logitech.com/search/results?q=${q}`,
  'anker':          q => `https://www.anker.com/pages/search-results?q=${q}`,
  'fitbit':         q => `https://www.fitbit.com/global/us/products`,
  'garmin':         q => `https://www.garmin.com/en-US/search/#q=${q}`,
  'fossil':         q => `https://www.fossil.com/en-us/search?q=${q}`,
  'ralph lauren':   q => `https://www.ralphlauren.com/search?q=${q}`,
  'tommy hilfiger': q => `https://usa.tommy.com/en/search?q=${q}`,
  'calvin klein':   q => `https://www.calvinklein.com/en/search?q=${q}`,
  'gap':            q => `https://www.gap.com/browse/search.do?searchText=${q}`,
  'levi\'s':        q => `https://www.levi.com/US/en_US/search?q=${q}`,
  'zara':           q => `https://www.zara.com/us/en/search?q=${q}`,
  'free people':    q => `https://www.freepeople.com/search/?search_query=${q}`,
  'lululemon':      q => `https://shop.lululemon.com/search?Ntt=${q}`,
  'patagonia':      q => `https://www.patagonia.com/search/?q=${q}`,
  'the north face': q => `https://www.thenorthface.com/en-us/search?q=${q}`,
  'canada goose':   q => `https://www.canadagoose.com/us/en/search?q=${q}`,
  'under armour':   q => `https://www.underarmour.com/en-us/search?q=${q}`,
  'brooks brothers':q => `https://www.brooksbrothers.com/search?q=${q}`,
  'coach':          q => `https://www.coach.com/search?q=${q}`,
  'michael kors':   q => `https://www.michaelkors.com/search?q=${q}`,
  'tumi':           q => `https://www.tumi.com/search?q=${q}`,
  'herschel':       q => `https://www.herschel.com/search?q=${q}`,
  'samsonite':      q => `https://shop.samsonite.com/search?q=${q}`,
  'ray-ban':        q => `https://www.ray-ban.com/usa/search?q=${q}`,
  'pandora':        q => `https://us.pandora.net/en/search/?search_string=${q}`,
  'l\'oreal':       q => `https://www.lorealparisusa.com/search?q=${q}`,
  'neutrogena':     q => `https://www.neutrogena.com/search?q=${q}`,
  'estée lauder':   q => `https://www.esteelauder.com/search/?q=${q}`,
  'maybelline':     q => `https://www.maybelline.com/search?q=${q}`,
  'cerave':         q => `https://www.cerave.com/search?q=${q}`,
  'olaplex':        q => `https://olaplex.com/search?q=${q}`,
  'jo malone':      q => `https://www.jomalone.com/search?q=${q}`,
  'oral-b':         q => `https://oralb.com/en-us/search?q=${q}`,
  'vitamix':        q => `https://www.vitamix.com/us/en_us/search?q=${q}`,
  'ninja':          q => `https://www.ninjakitchen.com/search?q=${q}`,
  'keurig':         q => `https://www.keurig.com/search?q=${q}`,
  'breville':       q => `https://www.breville.com/us/en/search?q=${q}`,
  'kitchenaid':     q => `https://www.kitchenaid.com/search?q=${q}`,
  'le creuset':     q => `https://www.lecreuset.com/search?q=${q}`,
  'instant pot':    q => `https://www.instantpot.com/search?q=${q}`,
  'dyson':          q => `https://www.dyson.com/search#q=${q}`,
  'cuisinart':      q => `https://www.cuisinart.com/search?q=${q}`,
  'hydro flask':    q => `https://www.hydroflask.com/search?q=${q}`,
  'theragun':       q => `https://www.therabody.com/search?q=${q}`,
  'bowflex':        q => `https://www.bowflex.com/search?q=${q}`,
  'coleman':        q => `https://www.coleman.com/catalogsearch/result/?q=${q}`,
  'manduka':        q => `https://www.manduka.com/search?q=${q}`,
  'yeti':           q => `https://www.yeti.com/search?q=${q}`,
}

function getMerchantUrl(product) {
  if (product.product_url) return product.product_url
  const brand = (product.attributes?.brand || '').toLowerCase()
  const query = encodeURIComponent(product.name)
  const fn = BRAND_URLS[brand]
  if (fn) return fn(query)
  // Fallback: Google Shopping search
  return `https://www.google.com/search?tbm=shop&q=${query}`
}

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

      {/* Buttons */}
      <div className="px-4 pb-4 flex flex-col gap-2">
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
        <a
          href={getMerchantUrl(product)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2 rounded-lg font-medium text-sm text-center border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
        >
          View on {product.attributes?.brand || product.merchant_name} ↗
        </a>
      </div>
    </div>
  )
}
