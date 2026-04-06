import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home, Bookmark, ShoppingCart,
  User, Settings, HelpCircle, LogOut,
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useCartStore from '../../stores/cartStore'
import useSavedStore from '../../stores/savedStore'
import ShopAssistLogo from '../ShopAssistLogo'

const SIDEBAR_WIDTH = 102

function SidebarBtn({ icon: Icon, label, onClick, active, badge }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all"
      style={{
        width: '82px',
        height: '62px',
        background: active
          ? 'rgba(0, 200, 230, 0.13)'
          : 'transparent',
        border: active
          ? '1px solid rgba(0, 200, 230, 0.32)'
          : '1px solid transparent',
        color: active
          ? 'rgba(0, 220, 245, 0.95)'
          : 'rgba(255,255,255,0.42)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,0.42)'
        }
      }}
    >
      <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
      <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.02em' }}>
        {label}
      </span>
      {badge > 0 && (
        <span
          className="absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center leading-none"
          style={{ background: 'rgba(99,102,241,0.95)' }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

export default function Sidebar({ activePanel, setActivePanel }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuthStore()
  const { toggleCart, itemCount } = useCartStore()
  const savedCount = useSavedStore((s) => s.savedItems.length)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function togglePanel(panel) {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 flex flex-col items-center py-5 z-40"
      style={{
        width: `${SIDEBAR_WIDTH}px`,
        background: 'rgba(7, 8, 18, 0.78)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        borderRight: '1px solid rgba(0, 200, 230, 0.15)',
        boxShadow: '2px 0 30px rgba(0, 180, 220, 0.07), inset -1px 0 0 rgba(0, 200, 230, 0.08)',
      }}
    >
      {/* Logo */}
      <button
        onClick={() => { navigate('/'); setActivePanel(null) }}
        title="ShopAssist"
        className="flex items-center justify-center mb-7 transition-all hover:opacity-90"
      >
        <ShopAssistLogo size={44} />
      </button>

      {/* Main nav */}
      <nav className="flex-1 flex flex-col items-center gap-2">
        <SidebarBtn
          icon={Home}
          label="Home"
          onClick={() => { navigate('/'); setActivePanel(null) }}
          active={location.pathname === '/' && activePanel === null}
        />
        <SidebarBtn
          icon={Bookmark}
          label="Saved"
          onClick={() => { navigate('/saved'); setActivePanel(null) }}
          active={location.pathname === '/saved' && activePanel === null}
          badge={savedCount}
        />
        <SidebarBtn
          icon={ShoppingCart}
          label="Cart"
          onClick={toggleCart}
          badge={itemCount}
          active={false}
        />
        <SidebarBtn
          icon={User}
          label="Profile"
          onClick={() => togglePanel('profile')}
          active={activePanel === 'profile'}
        />
        <SidebarBtn
          icon={Settings}
          label="Settings"
          onClick={() => togglePanel('settings')}
          active={activePanel === 'settings'}
        />
      </nav>

      {/* Divider */}
      <div
        className="w-14 mb-3"
        style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }}
      />

      {/* Bottom */}
      <div className="flex flex-col items-center gap-2">
        <SidebarBtn icon={HelpCircle} label="Help" onClick={() => {}} active={false} />
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all"
          title="Sign out"
          style={{
            width: '82px',
            height: '62px',
            color: 'rgba(255,255,255,0.35)',
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
            e.currentTarget.style.color = 'rgba(248,113,113,0.9)'
            e.currentTarget.style.border = '1px solid rgba(239,68,68,0.25)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
            e.currentTarget.style.border = '1px solid transparent'
          }}
        >
          <LogOut size={22} strokeWidth={1.8} />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Sign out</span>
        </button>
      </div>
    </aside>
  )
}

export { SIDEBAR_WIDTH }
