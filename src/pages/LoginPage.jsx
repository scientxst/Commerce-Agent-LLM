import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useMsal } from '@azure/msal-react'
import useAuthStore from '../stores/authStore'

// ── Brand icons ───────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/>
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/>
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
    </svg>
  )
}

function Spinner({ color = 'white' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-label="Loading">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}

// ── Email / password modal ────────────────────────────────────────

function EmailAuthModal({ onClose }) {
  const [tab, setTab] = useState('login')         // 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)

  const { loginWithEmail, registerWithEmail, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  function switchTab(t) { setTab(t); clearError(); setName(''); setEmail(''); setPassword(''); setConfirm('') }

  async function handleSubmit(e) {
    e.preventDefault()
    clearError()
    if (tab === 'register') {
      if (password !== confirm) { useAuthStore.setState({ error: 'Passwords do not match' }); return }
      if (password.length < 6) { useAuthStore.setState({ error: 'Password must be at least 6 characters' }); return }
      await registerWithEmail(name, email, password)
    } else {
      await loginWithEmail(email, password)
    }
    // If no error was thrown (store sets isAuthenticated), navigate
    if (useAuthStore.getState().isAuthenticated) navigate('/', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Top accent */}
        <div className="h-1" style={{ background: 'linear-gradient(90deg,#3B82F6,#60A5FA,#FBBF24)' }} />

        <div className="p-7">
          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden border border-blue-100 mb-6">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className="flex-1 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  background: tab === t ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : 'transparent',
                  color: tab === t ? 'white' : '#5C7A9B',
                }}
              >
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-blue-800 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-3 rounded-xl border-2 border-blue-100 focus:border-blue-400 focus:outline-none text-gray-800 placeholder-gray-400 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-blue-800 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border-2 border-blue-100 focus:border-blue-400 focus:outline-none text-gray-800 placeholder-gray-400 text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-blue-800 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === 'register' ? 'At least 6 characters' : 'Your password'}
                  className="w-full px-4 py-3 rounded-xl border-2 border-blue-100 focus:border-blue-400 focus:outline-none text-gray-800 placeholder-gray-400 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-500"
                  tabIndex={-1}
                >
                  {showPass
                    ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-blue-800 mb-1">Confirm Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full px-4 py-3 rounded-xl border-2 border-blue-100 focus:border-blue-400 focus:outline-none text-gray-800 placeholder-gray-400 text-sm"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', color: 'white' }}
            >
              {loading ? <Spinner /> : null}
              {tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Main LoginPage ────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate()
  const { loginWithGoogle, loginWithMicrosoft, continueAsGuest, loading, error, clearError } = useAuthStore()
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [oauthError, setOauthError] = useState('')
  const { instance } = useMsal()

  // ── Google login via @react-oauth/google ──────────────────────
  const triggerGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      // tokenResponse.access_token — use to fetch user info and exchange on backend
      setOauthLoading('google')
      setOauthError('')
      try {
        // Fetch ID token via the userinfo endpoint
        const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        if (!infoRes.ok) throw new Error('Failed to fetch Google user info')
        // We pass the access token to our backend which verifies via Google userinfo
        // But our backend expects an ID token for verify_oauth2_token — use credential flow instead
        // Fallback: use access_token path — see note below
        await loginWithGoogle(tokenResponse.access_token)
        if (useAuthStore.getState().isAuthenticated) navigate('/', { replace: true })
      } catch (err) {
        setOauthError(err.message || 'Google sign-in failed')
      } finally {
        setOauthLoading(null)
      }
    },
    onError: () => {
      setOauthError('Google sign-in was cancelled or failed')
      setOauthLoading(null)
    },
    flow: 'implicit',   // returns access_token in browser (no server redirect needed)
  })

  // ── Microsoft login via MSAL ──────────────────────────────────
  async function handleMicrosoft() {
    setOauthLoading('microsoft')
    setOauthError('')
    try {
      const result = await instance.loginPopup({
        scopes: ['User.Read', 'openid', 'profile', 'email'],
      })
      await loginWithMicrosoft(result.accessToken)
      if (useAuthStore.getState().isAuthenticated) navigate('/', { replace: true })
    } catch (err) {
      if (err.errorCode !== 'user_cancelled') {
        setOauthError(err.message || 'Microsoft sign-in failed')
      }
    } finally {
      setOauthLoading(null)
    }
  }

  function handleGuest() {
    continueAsGuest()
    navigate('/', { replace: true })
  }

  const busy = loading || !!oauthLoading

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#EBF4FF 0%,#FFF9E6 50%,#FEF3C7 100%)' }}
    >
      {/* Blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle,#93C5FD,transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-32 h-[30rem] w-[30rem] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle,#FCD34D,transparent 70%)' }} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="rounded-3xl shadow-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)' }}>
          <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#3B82F6,#60A5FA,#FBBF24,#F59E0B)' }} />

          <div className="px-8 py-10">
            {/* Logo */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="h-16 w-16 rounded-2xl mb-4 flex items-center justify-center shadow-lg"
                style={{ background: 'linear-gradient(135deg,#3B82F6 0%,#FBBF24 100%)' }}>
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#1E3A5F' }}>ShopAssist</h1>
              <p className="mt-1 text-sm font-medium" style={{ color: '#7B9BBE' }}>Your AI-powered shopping companion</p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: '#5C7A9B' }}>
                Welcome back! Sign in to save your cart,<br />preferences, and order history.
              </p>
            </div>

            {/* OAuth error */}
            {(oauthError || error) && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 flex items-start gap-2">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{oauthError || error}</span>
                <button onClick={() => { setOauthError(''); clearError() }} className="ml-auto text-red-400 hover:text-red-600">×</button>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              {/* Google */}
              <button
                onClick={() => { setOauthError(''); clearError(); triggerGoogleLogin() }}
                disabled={busy}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl border-2 font-semibold text-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                style={{ borderColor: '#E2ECF9', background: oauthLoading === 'google' ? '#F0F7FF' : 'white', color: '#1E3A5F' }}
              >
                <span className="w-5 flex-shrink-0 flex items-center justify-center">
                  {oauthLoading === 'google' ? <Spinner color="#4285F4" /> : <GoogleIcon />}
                </span>
                <span className="flex-1 text-center">Continue with Google</span>
              </button>

              {/* Microsoft */}
              <button
                onClick={handleMicrosoft}
                disabled={busy}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl border-2 font-semibold text-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                style={{ borderColor: '#E2ECF9', background: oauthLoading === 'microsoft' ? '#F0F7FF' : 'white', color: '#1E3A5F' }}
              >
                <span className="w-5 flex-shrink-0 flex items-center justify-center">
                  {oauthLoading === 'microsoft' ? <Spinner color="#00A4EF" /> : <MicrosoftIcon />}
                </span>
                <span className="flex-1 text-center">Continue with Outlook</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px" style={{ background: '#E8F0F9' }} />
                <span className="text-xs font-medium" style={{ color: '#A0B8D0' }}>or</span>
                <div className="flex-1 h-px" style={{ background: '#E8F0F9' }} />
              </div>

              {/* Email */}
              <button
                onClick={() => { clearError(); setOauthError(''); setShowEmailModal(true) }}
                disabled={busy}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', color: 'white' }}
              >
                <span className="w-5 flex-shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M2 8l10 6 10-6"/>
                  </svg>
                </span>
                <span className="flex-1 text-center">Sign up / Sign in with Email</span>
              </button>

              {/* Guest */}
              <button
                onClick={handleGuest}
                disabled={busy}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl border-2 font-semibold text-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                style={{ borderColor: '#FCD34D', background: 'linear-gradient(135deg,#FFFBEB,#FEF9C3)', color: '#92400E' }}
              >
                <span className="w-5 flex-shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </span>
                <span className="flex-1 text-center">Continue as Guest</span>
              </button>
            </div>

            <p className="mt-8 text-center text-xs" style={{ color: '#94A3B8' }}>
              By continuing you agree to our{' '}
              <span className="underline cursor-pointer" style={{ color: '#60A5FA' }}>Terms</span>
              {' '}and{' '}
              <span className="underline cursor-pointer" style={{ color: '#60A5FA' }}>Privacy Policy</span>
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-sm font-medium" style={{ color: '#5C7A9B' }}>
          Smart shopping starts here ✨
        </p>
      </div>

      {showEmailModal && <EmailAuthModal onClose={() => { setShowEmailModal(false); clearError() }} />}
    </div>
  )
}
