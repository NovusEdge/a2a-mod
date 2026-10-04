import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Search } from '../search'
import { ThemeToggle } from '../theme'
import { REPO } from '../site'

// Injected by vite.config.ts. A layout route cannot have a loader when prerendering with ssr: false.
const pages = __NAV__

const pathOf = (slug: string) => (slug === 'index' ? '/' : `/${slug}`)

export default function Shell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  const groups: { section: string; items: typeof pages }[] = []
  for (const p of pages) {
    const g = groups.find(x => x.section === p.section)
    if (g) g.items.push(p)
    else groups.push({ section: p.section, items: [p] })
  }

  return (
    <>
      <a href="#content" className="skip">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-(--line) bg-(--bg)/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="btn-ico md:hidden"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="sidenav"
            onClick={() => setOpen(o => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Link to="/" aria-label="a2a-mod home" className="font-(family-name:--font-display) text-xl font-black tracking-tight">a2a-mod</Link>
          <div className="ml-auto flex items-center gap-3">
            <a href={REPO} className="hidden text-sm text-(--muted) hover:text-(--fg) sm:block">GitHub</a>
            <Search />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {open && <div className="drawer-scrim md:hidden" onClick={() => setOpen(false)} />}

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-x-10 px-4 pb-12 pt-8 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_200px]">
        <nav id="sidenav" aria-label="Docs" data-open={open} className="sidenav space-y-7 text-sm md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:self-start md:overflow-y-auto">
          {groups.map(g => (
            <div key={g.section}>
              <p className="label mb-2">{g.section}</p>
              <ul className="m-0 list-none space-y-0.5 p-0">
                {g.items.map(i => (
                  <li key={i.slug}>
                    <NavLink to={pathOf(i.slug)} end className={({ isActive }) => (isActive ? 'cur' : '')}>{i.title}</NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main id="content" className="contents">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-(--line)">
        <div className="foot mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-8 text-sm text-(--muted) sm:px-6">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>MIT licence</span>
            <span className="rounded border border-(--line) px-1.5 py-0.5 font-(family-name:--font-mono) text-xs">A2A 1.0 | 0.3</span>
          </span>
          <nav aria-label="Project" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={`${REPO}/blob/main/CHANGELOG.md`}>Changelog</a>
            <Link to="/security">Security</Link>
            <a href={REPO}>GitHub</a>
          </nav>
        </div>
      </footer>
    </>
  )
}
