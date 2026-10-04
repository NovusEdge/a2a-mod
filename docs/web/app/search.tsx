import { Command } from 'cmdk'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

type Hit = { url: string; title: string; excerpt: string }
type Pagefind = {
  debouncedSearch(q: string, opts?: object, ms?: number): Promise<{ results: { data(): Promise<{ url: string; meta: { title?: string }; excerpt: string; sub_results: { url: string }[] }> }[] } | null>
}

let loading: Promise<Pagefind | null> | undefined
// The index only exists in a built site, so `react-router dev` gets no results.
const PAGEFIND_URL = '/pagefind/pagefind.js'
const pagefind = () =>
  (loading ??= import(/* @vite-ignore */ PAGEFIND_URL).then((m: Pagefind) => m, () => null))

export function Search() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [state, setState] = useState<'idle' | 'busy' | 'unavailable'>('idle')
  const navigate = useNavigate()
  const latest = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open || !q.trim()) { setHits([]); setState('idle'); return }
    const run = ++latest.current
    setState('busy')
    void (async () => {
      const pf = await pagefind()
      if (!pf) { if (run === latest.current) setState('unavailable'); return }
      const res = await pf.debouncedSearch(q, {}, 120)
      if (!res || run !== latest.current) return
      const top = await Promise.all(res.results.slice(0, 8).map(r => r.data()))
      if (run !== latest.current) return
      setHits(top.map(d => ({ url: d.sub_results[0]?.url ?? d.url, title: d.meta.title ?? d.url, excerpt: d.excerpt })))
      setState('idle')
    })()
  }, [q, open])

  const go = (url: string) => {
    setOpen(false)
    setQ('')
    navigate(url.replace(/\.html$/, ''))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-(--line) bg-transparent px-2.5 text-sm text-(--muted) transition hover:text-(--fg)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-(--line) px-1.5 font-(family-name:--font-mono) text-[11px] sm:inline">&#8984;K</kbd>
      </button>
      <Command.Dialog open={open} onOpenChange={setOpen} label="Search the docs" shouldFilter={false}>
        <Command.Input value={q} onValueChange={setQ} placeholder="Search the docs" />
        <Command.List>
          {hits.map(h => (
            <Command.Item key={h.url} value={h.url} onSelect={() => go(h.url)}>
              <span className="t">{h.title}</span>
              <span className="x" dangerouslySetInnerHTML={{ __html: h.excerpt }} />
            </Command.Item>
          ))}
          {q.trim() && state === 'idle' && !hits.length && <Command.Empty>No results for &ldquo;{q}&rdquo;.</Command.Empty>}
          {state === 'unavailable' && <Command.Empty>Search works on the built site only.</Command.Empty>}
        </Command.List>
      </Command.Dialog>
    </>
  )
}
