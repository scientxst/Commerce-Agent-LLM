import { create } from 'zustand'

const applyTheme = (isDark) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

const getInitialTheme = () => {
  if (typeof window === 'undefined') return false

  const saved = localStorage.getItem('theme')
  if (saved === 'dark') return true
  if (saved === 'light') return false

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
}

const initialDark = getInitialTheme()
applyTheme(initialDark)

const useThemeStore = create((set) => ({
  dark: initialDark,
  setDark: (value) =>
    set(() => {
      localStorage.setItem('theme', value ? 'dark' : 'light')
      applyTheme(value)
      return { dark: value }
    }),
  toggle: () =>
    set((s) => {
      const next = !s.dark
      localStorage.setItem('theme', next ? 'dark' : 'light')
      applyTheme(next)
      return { dark: next }
    }),
}))

export default useThemeStore