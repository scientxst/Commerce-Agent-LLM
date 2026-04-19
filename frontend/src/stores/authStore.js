import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── API helpers ───────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Request failed')
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Server did not respond in time. Please try again.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// OAuth2PasswordRequestForm expects form-encoded, not JSON
async function apiLoginForm(email, password) {
  const form = new URLSearchParams()
  form.set('username', email)
  form.set('password', password)
  const res = await fetch(`${BACKEND_URL}/auth/login/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Login failed')
  return data
}

// After a successful register/login where the previous session was a guest,
// move cart items from the old guest `sub` to the new user `sub` so the
// cart doesn't silently disappear on upgrade (adversarial review 2.2).
async function mergeGuestCartIfNeeded(prevToken, prevWasGuest, newToken) {
  if (!prevToken || !prevWasGuest || !newToken) return
  try {
    await apiPost('/api/cart/merge', { guest_token: prevToken }, newToken)
  } catch (err) {
    console.warn('Guest cart merge failed (non-fatal):', err.message)
  }
}

// ── Store ─────────────────────────────────────────────────────────

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isGuest: false,
      loading: false,
      error: null,

      // ── Email register ──────────────────────────────────────────
      registerWithEmail: async (name, email, password) => {
        const prev = get()
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/register', { name, email, password })
          await mergeGuestCartIfNeeded(prev.token, prev.isGuest, data.access_token)
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Email login ─────────────────────────────────────────────
      loginWithEmail: async (email, password) => {
        const prev = get()
        set({ loading: true, error: null })
        try {
          const data = await apiLoginForm(email, password)
          await mergeGuestCartIfNeeded(prev.token, prev.isGuest, data.access_token)
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Google (ID token from @react-oauth/google) ──────────────
      loginWithGoogle: async (idToken) => {
        const prev = get()
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/google', { token: idToken })
          await mergeGuestCartIfNeeded(prev.token, prev.isGuest, data.access_token)
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Microsoft (access token from MSAL) ──────────────────────
      loginWithMicrosoft: async (accessToken) => {
        const prev = get()
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/microsoft', { token: accessToken })
          await mergeGuestCartIfNeeded(prev.token, prev.isGuest, data.access_token)
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Guest ───────────────────────────────────────────────────
      continueAsGuest: async () => {
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/guest', {})
          set({
            token: data.access_token,
            user: data.user,
            isAuthenticated: true,
            isGuest: true,
            loading: false,
          })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Logout ──────────────────────────────────────────────────
      logout: async () => {
        const { token } = get()
        if (token) {
          try {
            await apiPost('/auth/logout', {}, token)
          } catch (err) {
            // Best-effort; server-side revocation is a nice-to-have.
            // Local state still clears below so the user is logged out
            // from this device regardless.
            console.warn('Server logout failed:', err.message)
          }
        }
        set({ isAuthenticated: false, isGuest: false, user: null, token: null, error: null })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'shopassist-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        isGuest: state.isGuest,
      }),
    }
  )
)

export default useAuthStore
