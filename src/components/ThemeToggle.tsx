import { useEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'hot-creator.theme'

type Theme = 'light' | 'dark'

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const nextTheme = theme === 'light' ? 'dark' : 'light'
  const accessibleLabel = nextTheme === 'dark' ? '切换到深色主题' : '切换到浅色主题'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Theme switching must remain available when browser storage is unavailable.
    }
  }, [theme])

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={theme === 'dark'}
      title={accessibleLabel}
      onClick={() => setTheme(nextTheme)}
    >
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
    </button>
  )
}

export default ThemeToggle
