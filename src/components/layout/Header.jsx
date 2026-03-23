import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Sun, Moon, LogOut, UserCircle } from 'lucide-react'
import useCartStore from '../../stores/cartStore'
import useThemeStore from '../../stores/themeStore'
import useAuthStore from '../../stores/authStore'

export default function Header() {
  const { toggleCart, itemCount } = useCartStore()
  const { dark, toggle } = useThemeStore()
  const { user, isGuest, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40">
      <div className="relative bg-white/60 dark:bg-gray-950/40 backdrop-blur-xl border-b border-white/40 dark:border-gray-800">
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
              {/* User info + guest badge */}
              {user && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/50 dark:bg-gray-900/50 border border-white/40 dark:border-gray-800 text-xs text-gray-700 dark:text-gray-300">
                  <UserCircle size={15} className="text-indigo-500" />
                  <span className="font-medium max-w-[100px] truncate">{user.name}</span>
                  {isGuest && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                      Guest
                    </span>
                  )}
                </div>
              )}

              {/* Back to login (guest only) */}
              {isGuest && (
                <button
                  onClick={handleLogout}
                  type="button"
                  title="Back to login"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800"
                >
                  Sign In
                </button>
              )}

              {/* Dark mode */}
              <button
                onClick={toggle}
                type="button"
                className="p-2 rounded-xl bg-white/50 hover:bg-white/80 dark:bg-gray-900/50 dark:hover:bg-gray-900/80 border border-white/40 dark:border-gray-800 text-gray-800 dark:text-gray-100 transition-colors"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              {/* Cart */}
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

              {/* Logout */}
              <button
                onClick={handleLogout}
                type="button"
                title="Sign out"
                className="p-2 rounded-xl bg-white/50 hover:bg-white/80 dark:bg-gray-900/50 dark:hover:bg-gray-900/80 border border-white/40 dark:border-gray-800 text-gray-500 hover:text-rose-500 dark:text-gray-400 dark:hover:text-rose-400 transition-colors"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
