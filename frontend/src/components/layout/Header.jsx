import { ShoppingCart, Sun, Moon } from 'lucide-react'
import useCartStore from '../../stores/cartStore'
import useThemeStore from '../../stores/themeStore'

export default function Header() {
  const { toggleCart, itemCount } = useCartStore()
  const { dark, toggle } = useThemeStore()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-900 dark:to-blue-900 shadow-lg transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Title */}
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-white">ShopAssist</h1>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors text-white"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Cart Icon */}
            <button
              onClick={toggleCart}
              className="relative p-2 rounded-lg hover:bg-white/20 transition-colors text-white"
              aria-label="Toggle shopping cart"
            >
              <ShoppingCart size={20} />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
