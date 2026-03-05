import { ShoppingCart, Sun, Moon } from 'lucide-react'
import useCartStore from '../../stores/cartStore'
import useThemeStore from '../../stores/themeStore'

export default function Header() {
  const { toggleCart, itemCount } = useCartStore()
  const { dark, toggle } = useThemeStore()

  return (
    <header className="fixed top-0 left-0 right-0 z-40">
      {/* Glass + subtle gradient tint */}
      <div className="relative bg-white/60 dark:bg-gray-950/40 backdrop-blur-xl border-b border-white/40 dark:border-gray-800">
        {/* Accent gradient line */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 shadow-sm" />
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                ShopAssist
              </h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={toggle}
                type="button"
                className="p-2 rounded-xl bg-white/50 hover:bg-white/80 dark:bg-gray-900/50 dark:hover:bg-gray-900/80 border border-white/40 dark:border-gray-800 text-gray-800 dark:text-gray-100 transition-colors"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <button
                onClick={toggleCart}
                type="button"
                className="relative p-2 rounded-xl bg-white/50 hover:bg-white/80 dark:bg-gray-900/50 dark:hover:bg-gray-900/80 border border-white/40 dark:border-gray-800 text-gray-800 dark:text-gray-100 transition-colors"
                aria-label="Toggle shopping cart"
              >
                <ShoppingCart size={20} />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}