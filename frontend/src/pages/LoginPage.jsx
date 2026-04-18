import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useMsal } from '@azure/msal-react'
import useAuthStore from '../stores/authStore'
import ShopAssistLogo from '../components/ShopAssistLogo'

// ── Icons ─────────────────────────────────────────────────────────

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
    </svg>
  )
}

function Spinner({ color = 'white' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-label="Loading">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

// ── Full Sign-In Modal ────────────────────────────────────────────

function SignInModal({ onClose }) {
  const [view, setView] = useState('main')       // 'main' | 'email'
  const [tab, setTab] = useState('login')        // 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [oauthError, setOauthError] = useState('')

  const { loginWithGoogle, loginWithMicrosoft, loginWithEmail, registerWithEmail, continueAsGuest, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const { instance } = useMsal()
  const busy = loading || !!oauthLoading

  function switchTab(t) {
    setTab(t); clearError(); setName(''); setEmail(''); setPassword(''); setConfirm('')
  }

  async function handleGoogleSuccess(credentialResponse) {
    setOauthLoading('google'); setOauthError('')
    try {
      await loginWithGoogle(credentialResponse.credential)
      if (useAuthStore.getState().isAuthenticated) navigate('/', { replace: true })
    } catch (err) {
      setOauthError(err.message || 'Google sign-in failed')
    } finally { setOauthLoading(null) }
  }

  async function handleMicrosoft() {
    setOauthLoading('microsoft'); setOauthError('')
    try {
      const result = await instance.loginPopup({ scopes: ['User.Read', 'openid', 'profile', 'email'] })
      await loginWithMicrosoft(result.accessToken)
      if (useAuthStore.getState().isAuthenticated) navigate('/', { replace: true })
    } catch (err) {
      if (err.errorCode !== 'user_cancelled') setOauthError(err.message || 'Microsoft sign-in failed')
    } finally { setOauthLoading(null) }
  }

  async function handleGuest() {
    try {
      await continueAsGuest()
      navigate('/', { replace: true })
    } catch (err) {
      setOauthError(err.message || 'Could not start guest session')
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault(); clearError()
    if (tab === 'register') {
      if (password !== confirm) { useAuthStore.setState({ error: 'Passwords do not match' }); return }
      if (password.length < 6) { useAuthStore.setState({ error: 'Password must be at least 6 characters' }); return }
      await registerWithEmail(name, email, password)
    } else {
      await loginWithEmail(email, password)
    }
    if (useAuthStore.getState().isAuthenticated) navigate('/', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm overflow-hidden"
        style={{
          background: 'rgba(10, 10, 20, 0.92)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(0, 210, 230, 0.25)',
          boxShadow: '0 0 40px rgba(0, 200, 230, 0.2), 0 25px 60px rgba(0,0,0,0.6)',
          borderRadius: '20px',
        }}
      >
        {/* Cyan top accent line */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,210,230,0.6), transparent)' }} />

        <div className="p-7">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">
                {view === 'main' ? 'Sign in to ShopAssist' : (tab === 'login' ? 'Welcome back' : 'Create account')}
              </h2>
              <p className="text-xs text-white/40 mt-0.5">
                {view === 'main' ? 'Choose how you want to continue' : 'Enter your details below'}
              </p>
            </div>
            {view === 'email' && (
              <button
                onClick={() => { setView('main'); clearError() }}
                className="text-white/40 hover:text-white/70 transition text-xs flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Back
              </button>
            )}
          </div>

          {/* Error banner */}
          {(oauthError || error) && (
            <div className="mb-4 px-3 py-2.5 rounded-xl text-xs text-red-300 flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{oauthError || error}</span>
              <button onClick={() => { setOauthError(''); clearError() }} className="ml-auto text-red-400/60 hover:text-red-300">×</button>
            </div>
          )}

          {/* ── MAIN OPTIONS ── */}
          {view === 'main' && (
            <div className="space-y-3">
              {/* Google */}
              <div className="w-full flex justify-center [&>div]:w-full [&_iframe]:w-full">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => { setOauthError('Google sign-in was cancelled or failed'); setOauthLoading(null) }}
                  width="304"
                  theme="filled_black"
                />
              </div>

              {/* Microsoft */}
              <button
                onClick={handleMicrosoft}
                disabled={busy}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all hover:bg-white/10 active:scale-[0.98] disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}
              >
                <span className="w-5 flex-shrink-0 flex items-center justify-center">
                  {oauthLoading === 'microsoft' ? <Spinner color="#00A4EF" /> : <MicrosoftIcon />}
                </span>
                <span className="flex-1 text-center">Continue with Microsoft</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                <span className="text-xs text-white/30">or</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              </div>

              {/* Email */}
              <button
                onClick={() => { clearError(); setOauthError(''); setView('email') }}
                disabled={busy}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,200,230,0.18), rgba(0,150,210,0.22))',
                  border: '1px solid rgba(0,210,230,0.35)',
                  color: 'white',
                }}
              >
                <span className="w-5 flex-shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(0,220,240,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8l10 6 10-6" />
                  </svg>
                </span>
                <span className="flex-1 text-center">Sign up / Sign in with Email</span>
              </button>

              {/* Guest */}
              <button
                onClick={handleGuest}
                disabled={busy}
                className="w-full py-2.5 text-xs font-medium transition-colors text-white/30 hover:text-white/55"
              >
                Continue as Guest
              </button>
            </div>
          )}

          {/* ── EMAIL FORM ── */}
          {view === 'email' && (
            <div>
              {/* Tab switcher */}
              <div className="flex rounded-xl overflow-hidden mb-5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {['login', 'register'].map((t) => (
                  <button
                    key={t}
                    onClick={() => switchTab(t)}
                    className="flex-1 py-2.5 text-sm font-semibold transition-colors"
                    style={{
                      background: tab === t
                        ? 'linear-gradient(135deg, rgba(0,200,230,0.22), rgba(0,150,210,0.28))'
                        : 'transparent',
                      color: tab === t ? 'white' : 'rgba(255,255,255,0.35)',
                      borderRight: t === 'login' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}
                  >
                    {t === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                {tab === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Full Name</label>
                    <input
                      type="text" required value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', }}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Email Address</label>
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'} required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={tab === 'register' ? 'At least 6 characters' : 'Your password'}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none pr-10"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <button
                      type="button" onClick={() => setShowPass((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      tabIndex={-1}
                    >
                      {showPass
                        ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      }
                    </button>
                  </div>
                </div>

                {tab === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Confirm Password</label>
                    <input
                      type={showPass ? 'text' : 'password'} required value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 mt-1"
                  style={{ background: 'linear-gradient(135deg, rgba(0,200,230,0.3), rgba(0,150,210,0.4))', border: '1px solid rgba(0,210,230,0.4)', color: 'white' }}
                >
                  {loading && <Spinner />}
                  {tab === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>
            </div>
          )}

          <p className="mt-5 text-center text-xs text-white/20">
            By continuing you agree to our{' '}
            <span className="text-white/40 underline cursor-pointer hover:text-white/60 transition">Terms</span>
            {' '}and{' '}
            <span className="text-white/40 underline cursor-pointer hover:text-white/60 transition">Privacy Policy</span>
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/25 hover:text-white/55 transition"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Shared glass modal wrapper ────────────────────────────────────

function GlassModal({ onClose, children, maxWidth = 'max-w-sm' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full ${maxWidth} overflow-hidden`}
        style={{
          background: 'rgba(10, 10, 20, 0.92)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(0, 210, 230, 0.25)',
          boxShadow: '0 0 40px rgba(0, 200, 230, 0.2), 0 25px 60px rgba(0,0,0,0.6)',
          borderRadius: '20px',
        }}
      >
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,210,230,0.6), transparent)' }} />
        <div className="p-7">{children}</div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/25 hover:text-white/55 transition"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Features modal ────────────────────────────────────────────────

const FEATURES = [
  { icon: '🔍', title: 'Natural Language Search', desc: 'Describe what you want in plain English — brand, budget, size, color. No filters or menus.' },
  { icon: '⚡', title: 'Instant Live Results', desc: 'Real-time product data pulled from multiple sources and ranked by relevance to your query.' },
  { icon: '🧠', title: 'AI Recommendations', desc: 'The assistant understands context mid-session — "show me something cheaper" just works.' },
  { icon: '🛒', title: 'Smart Cart', desc: 'Add items conversationally: "add the blue one in size M". No clicking through product pages.' },
  { icon: '💬', title: 'Conversational Memory', desc: 'Follow-up questions, comparisons, and refinements — the AI remembers what you asked.' },
  { icon: '🔒', title: 'Secure Checkout', desc: 'Stripe-powered checkout with per-merchant order dispatching and real-time confirmation.' },
]

function FeaturesModal({ onClose }) {
  return (
    <GlassModal onClose={onClose} maxWidth="max-w-2xl">
      <h2 className="text-lg font-bold text-white mb-1">What ShopAssist can do</h2>
      <p className="text-xs text-white/40 mb-5">AI-powered shopping, built for how people actually think</p>
      <div className="grid grid-cols-2 gap-3">
        {FEATURES.map(({ icon, title, desc }) => (
          <div
            key={title}
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="text-2xl mb-2">{icon}</div>
            <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</p>
          </div>
        ))}
      </div>
    </GlassModal>
  )
}

// ── Pricing modal ─────────────────────────────────────────────────

const PLANS = [
  {
    name: 'Guest',
    price: 'Free',
    sub: 'No account needed',
    highlight: false,
    features: ['AI product search', 'Live results', 'Basic cart', 'Guest session only'],
    cta: 'Start searching',
  },
  {
    name: 'Pro',
    price: '$9',
    sub: 'per month',
    highlight: true,
    features: ['Everything in Guest', 'Saved items & history', 'Multi-device sync', 'Priority AI results', 'Early feature access'],
    cta: 'Get Pro',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    sub: 'contact us',
    highlight: false,
    features: ['Everything in Pro', 'REST API access', 'Custom integrations', 'White-label option', 'Dedicated support'],
    cta: 'Contact us',
  },
]

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(0,210,235,0.85)" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function PricingModal({ onClose }) {
  return (
    <GlassModal onClose={onClose} maxWidth="max-w-3xl">
      <h2 className="text-lg font-bold text-white mb-1">Simple pricing</h2>
      <p className="text-xs text-white/40 mb-6">Start free. Upgrade when you're ready.</p>
      <div className="grid grid-cols-3 gap-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="p-5 rounded-xl flex flex-col relative"
            style={{
              background: plan.highlight ? 'rgba(0,200,230,0.07)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${plan.highlight ? 'rgba(0,210,230,0.35)' : 'rgba(255,255,255,0.09)'}`,
              boxShadow: plan.highlight ? '0 0 24px rgba(0,200,230,0.12)' : 'none',
            }}
          >
            {plan.highlight && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, rgba(0,200,230,0.85), rgba(0,150,210,0.95))', color: 'white' }}
              >
                Most Popular
              </div>
            )}
            <p className="text-sm font-bold text-white mb-1">{plan.name}</p>
            <div className="flex items-baseline gap-1 mb-0.5">
              <span className="text-2xl font-bold text-white">{plan.price}</span>
              {plan.price !== 'Free' && plan.price !== 'Custom' && (
                <span className="text-xs text-white/40">{plan.sub}</span>
              )}
            </div>
            <p className="text-xs text-white/30 mb-4">{plan.price === 'Free' || plan.price === 'Custom' ? plan.sub : ''}</p>
            <ul className="space-y-2 flex-1 mb-5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.58)' }}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: plan.highlight ? 'linear-gradient(135deg, rgba(0,200,230,0.28), rgba(0,150,210,0.38))' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${plan.highlight ? 'rgba(0,210,230,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: 'white',
              }}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </GlassModal>
  )
}

// ── About modal ───────────────────────────────────────────────────

const TECH = ['React', 'FastAPI', 'OpenAI GPT-4o', 'WebSockets', 'SerpAPI', 'Stripe', 'Tailwind CSS', 'Python']

function AboutModal({ onClose }) {
  return (
    <GlassModal onClose={onClose} maxWidth="max-w-md">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🛍️</div>
        <h2 className="text-lg font-bold text-white">About ShopAssist</h2>
        <p className="text-xs text-white/40 mt-1">Built at the intersection of AI and e-commerce</p>
      </div>
      <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.58)' }}>
        ShopAssist is an AI-native shopping assistant that understands how people actually shop.
        Instead of filters and dropdowns, just describe what you're looking for — and the AI pulls
        live results, compares options, and guides you to checkout conversationally.
      </p>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Built with</p>
        <div className="flex flex-wrap gap-2">
          {TECH.map((t) => (
            <span
              key={t}
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(0,200,230,0.08)', border: '1px solid rgba(0,210,230,0.2)', color: 'rgba(255,255,255,0.65)' }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div
        className="p-4 rounded-xl text-xs leading-relaxed"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}
      >
        🎓 Built as a capstone project exploring agentic AI systems, RAG architecture, real-time WebSocket streaming, and conversational product intelligence.
      </div>
    </GlassModal>
  )
}

// ── Privacy modal ────────────────────────────────────────────────

function PrivacyModal({ onClose }) {
  const sections = [
    {
      title: '📦 What we collect',
      body: 'Search queries and filters you enter, session preferences (brand, size, budget), OAuth profile info (name and email) if you sign in, and cart activity for the duration of your session.',
    },
    {
      title: '🔍 How we use it',
      body: 'To personalise search results, re-rank products by your stated preferences, maintain your cart across the session, and improve the quality of AI recommendations.',
    },
    {
      title: '🔗 Third-party services',
      body: 'Google / Microsoft OAuth for sign-in, SerpAPI for live product data, and Stripe for checkout. Each operates under their own privacy policy. We never sell your data.',
    },
    {
      title: '🗂 Data retention',
      body: 'Guest sessions are entirely in-memory and discarded when the session ends. Signed-in accounts retain preferences across sessions. You can delete your account at any time.',
    },
    {
      title: '✅ Your rights',
      body: 'You can use ShopAssist as a guest with zero data stored. If signed in, you may request access, correction, or deletion of your data by contacting us.',
    },
  ]

  return (
    <GlassModal onClose={onClose} maxWidth="max-w-lg">
      <h2 className="text-lg font-bold text-white mb-1">Privacy Policy</h2>
      <p className="text-xs text-white/40 mb-5">Last updated April 2026 · We keep it simple.</p>
      <div className="space-y-4">
        {sections.map(({ title, body }) => (
          <div key={title} className="p-3.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-semibold text-white mb-1">{title}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>{body}</p>
          </div>
        ))}
      </div>
    </GlassModal>
  )
}

// ── Terms modal ───────────────────────────────────────────────────

function TermsModal({ onClose }) {
  const sections = [
    {
      title: '1. Acceptance',
      body: 'By accessing or using ShopAssist you agree to these terms. If you disagree, please discontinue use. Guest access requires no account but is still subject to these terms.',
    },
    {
      title: '2. What ShopAssist does',
      body: 'ShopAssist is an AI-powered shopping assistant. It searches live product databases, provides recommendations, and facilitates checkout. It does not itself sell products — transactions are fulfilled by third-party merchants.',
    },
    {
      title: '3. Permitted use',
      body: 'You may use ShopAssist for personal, non-commercial shopping purposes. You agree not to scrape, reverse-engineer, or abuse the platform, its APIs, or the AI system in any way.',
    },
    {
      title: '4. AI limitations',
      body: 'Product information (prices, stock, descriptions) is sourced live from third-party APIs and may change. ShopAssist AI responses are not guaranteed to be accurate. Always verify details before purchasing.',
    },
    {
      title: '5. Limitation of liability',
      body: 'ShopAssist is provided "as is" without warranties of any kind. We are not liable for purchase decisions made based on AI recommendations, third-party merchant fulfilment, or data inaccuracies.',
    },
    {
      title: '6. Changes',
      body: 'We may update these terms at any time. Continued use after changes constitutes acceptance. Check this page periodically for updates.',
    },
  ]

  return (
    <GlassModal onClose={onClose} maxWidth="max-w-lg">
      <h2 className="text-lg font-bold text-white mb-1">Terms of Service</h2>
      <p className="text-xs text-white/40 mb-5">Last updated April 2026 · Please read carefully.</p>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {sections.map(({ title, body }) => (
          <div key={title} className="p-3.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-semibold text-white mb-1">{title}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>{body}</p>
          </div>
        ))}
      </div>
    </GlassModal>
  )
}

// ── Contact modal ─────────────────────────────────────────────────

function ContactModal({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setSent(true)
  }

  return (
    <GlassModal onClose={onClose} maxWidth="max-w-md">
      {sent ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-lg font-bold text-white mb-2">Message received!</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.48)' }}>
            We'll get back to you at <span className="text-white/70">{form.email}</span> within 24–48 hours.
          </p>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(0,200,230,0.25), rgba(0,150,210,0.35))', border: '1px solid rgba(0,210,230,0.4)', color: 'white' }}
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-white mb-1">Contact us</h2>
          <p className="text-xs text-white/40 mb-5">We read every message — usually reply within 24 hours.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Name</label>
              <input
                type="text" required value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input
                type="email" required value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Message</label>
              <textarea
                required rows={4} value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="What can we help you with?"
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] mt-1"
              style={{ background: 'linear-gradient(135deg, rgba(0,200,230,0.3), rgba(0,150,210,0.4))', border: '1px solid rgba(0,210,230,0.4)', color: 'white' }}
            >
              Send message
            </button>
          </form>
        </>
      )}
    </GlassModal>
  )
}

// ── Landing Page ──────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'Tech', emoji: '🤖' },
  { name: 'Fashion', emoji: '👗' },
  { name: 'Home', emoji: '🏡' },
]

export default function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(false)
  const [activeModal, setActiveModal] = useState(null) // 'features' | 'pricing' | 'about'
  const [activeTab, setActiveTab] = useState('Tech')
  const [searchQuery, setSearchQuery] = useState('')
  const { continueAsGuest } = useAuthStore()
  const navigate = useNavigate()

  async function handleSearchSubmit() {
    if (!searchQuery.trim()) return
    sessionStorage.setItem('pendingQuery', searchQuery.trim())
    sessionStorage.setItem('pendingCategory', activeTab.toLowerCase())
    try {
      await continueAsGuest()
      navigate('/', { replace: true })
    } catch {
      sessionStorage.removeItem('pendingQuery')
      sessionStorage.removeItem('pendingCategory')
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col text-white select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #0d1322 0%, #07080e 55%, #050507 100%)',
      }}
    >
      {/* Ambient glow blobs */}
      <div
        aria-hidden
        className="pointer-events-none fixed"
        style={{
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '400px',
          background: 'radial-gradient(ellipse, rgba(0,180,230,0.07) 0%, transparent 70%)',
          filter: 'blur(10px)',
        }}
      />

      {/* ── Navigation ── */}
      <nav className="flex items-center justify-between px-8 py-5 relative z-10">
        <div className="flex items-center gap-2.5">
          <ShopAssistLogo />
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: 'white', letterSpacing: '-0.02em' }}
          >
            ShopAssist
          </span>
        </div>

        <div className="flex items-center gap-8">
          {['Features', 'Pricing', 'About'].map((link) => (
            <button
              key={link}
              onClick={() => setActiveModal(link.toLowerCase())}
              className="text-sm font-medium transition-colors"
              style={{ color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
            >
              {link}
            </button>
          ))}
          <button
            onClick={() => setShowSignIn(true)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'white',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.11)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10" style={{ marginTop: '-40px' }}>
        {/* Glowing search container */}
        <div
          style={{
            background: 'rgba(10, 11, 20, 0.72)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(0, 210, 235, 0.28)',
            boxShadow: [
              '0 0 0 1px rgba(0, 210, 235, 0.06)',
              '0 0 30px rgba(0, 200, 230, 0.28)',
              '0 0 80px rgba(0, 180, 220, 0.12)',
              '0 0 160px rgba(0, 160, 210, 0.06)',
              'inset 0 0 40px rgba(0, 200, 230, 0.03)',
              '0 24px 60px rgba(0,0,0,0.5)',
            ].join(', '),
            borderRadius: '28px',
            padding: '20px',
            width: '100%',
            maxWidth: '930px',
          }}
        >
          {/* Category tabs */}
          <div className="flex justify-center gap-2 mb-4 px-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveTab(cat.name)}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-base font-medium transition-all"
                style={{
                  background: activeTab === cat.name
                    ? 'rgba(0, 200, 230, 0.12)'
                    : 'transparent',
                  border: activeTab === cat.name
                    ? '1px solid rgba(0, 200, 230, 0.28)'
                    : '1px solid transparent',
                  color: activeTab === cat.name
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.45)',
                }}
              >
                <span style={{ fontSize: '20px', lineHeight: 1 }}>{cat.emoji}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Search input */}
          <div
            className="flex items-center gap-4 px-5"
            style={{
              background: 'rgba(18, 19, 32, 0.65)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '15px',
              height: '64px',
            }}
          >
            <svg
              viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search for anything..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit() }}
              className="flex-1 bg-transparent border-none outline-none text-base"
              style={{ color: 'rgba(255,255,255,0.85)', caretColor: 'rgba(0,210,235,0.9)' }}
            />
            {searchQuery.trim() && (
              <button
                onClick={handleSearchSubmit}
                className="shrink-0 p-2 rounded-xl transition-colors"
                style={{ background: 'rgba(0,200,230,0.15)', border: '1px solid rgba(0,200,230,0.3)' }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(0,210,235,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Tagline */}
        <div className="mt-9 text-center space-y-1">
          <p
            className="text-[1.6rem] font-semibold leading-tight"
            style={{ color: 'rgba(255,255,255,0.88)' }}
          >
            Your Intelligent Shopping Companion.
          </p>
          <p
            className="text-[1.6rem] font-semibold leading-tight"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            Find the best products, instantly.
          </p>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-6 text-center relative z-10">
        <div className="flex justify-center gap-6 mb-2">
          {['Privacy', 'Terms', 'Contact'].map((link) => (
            <button
              key={link}
              onClick={() => setActiveModal(link.toLowerCase())}
              className="text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
            >
              {link}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>
          © copyright ShopAssist. All rights reserved.
        </p>
      </footer>

      {/* Sign-in modal */}
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}

      {/* Nav modals */}
      {activeModal === 'features' && <FeaturesModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'pricing'  && <PricingModal  onClose={() => setActiveModal(null)} />}
      {activeModal === 'about'    && <AboutModal    onClose={() => setActiveModal(null)} />}

      {/* Footer modals */}
      {activeModal === 'privacy' && <PrivacyModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'terms'   && <TermsModal   onClose={() => setActiveModal(null)} />}
      {activeModal === 'contact' && <ContactModal onClose={() => setActiveModal(null)} />}
    </div>
  )
}
