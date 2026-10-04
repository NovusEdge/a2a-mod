import { useEffect } from 'react'

const KEY = 'a2a-theme'

const stored = () => {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function ThemeToggle() {
  // Until the user picks a theme, follow the system.
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const follow = () => {
      if (!stored()) document.documentElement.dataset.theme = mq.matches ? 'light' : 'dark'
    }
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [])

  const toggle = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(KEY, next) } catch { /* the choice lasts until reload */ }
  }

  return (
    <button type="button" onClick={toggle} className="btn-ico" aria-label="Toggle light and dark" title="Toggle theme">
      <svg className="sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      <svg className="moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>
    </button>
  )
}
