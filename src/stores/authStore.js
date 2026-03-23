import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── API helpers ───────────────────────────────────────────────────

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data
}

// OAuth2PasswordRequestForm expects form-encoded, not JSON
async function apiLoginForm(email, password) {
  const form = new URLSearchParams()
  form.set('username', email)
  form.set('password', password)
  const res = await fetch('/auth/login/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Login failed')
  return data
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
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/register', { name, email, password })
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Email login ─────────────────────────────────────────────
      loginWithEmail: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const data = await apiLoginForm(email, password)
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Google (ID token from @react-oauth/google) ──────────────
      loginWithGoogle: async (idToken) => {
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/google', { token: idToken })
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Microsoft (access token from MSAL) ──────────────────────
      loginWithMicrosoft: async (accessToken) => {
        set({ loading: true, error: null })
        try {
          const data = await apiPost('/auth/microsoft', { token: accessToken })
          set({ token: data.access_token, user: data.user, isAuthenticated: true, isGuest: false, loading: false })
        } catch (err) {
          set({ loading: false, error: err.message })
          throw err
        }
      },

      // ── Guest ───────────────────────────────────────────────────
      continueAsGuest: () => {
        set({
          isAuthenticated: true,
          isGuest: true,
          token: null,
          user: { id: 'guest-' + Date.now(), name: 'Guest', email: null, provider: 'guest' },
          error: null,
        })
      },

      // ── Logout ──────────────────────────────────────────────────
      logout: () => set({ isAuthenticated: false, isGuest: false, user: null, token: null, error: null }),

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
