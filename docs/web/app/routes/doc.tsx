import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { readMetas } from '../../pages'
import { Diagram } from '../diagram'
import { loadPage } from '../markdown.server'
import { REPO } from '../site'
import type { Route } from './+types/doc'

export async function loader({ request }: Route.LoaderArgs) {
  // Prerendering also requests `<path>.data`, and `/_.data` for the index route.
  const path = new URL(request.url).pathname.replace(/\.data$/, '').replace(/\/+$/, '')
  const slug = path === '' || path === '/_' ? 'index' : path.slice(1)
  const metas = readMetas()
  const at = metas.findIndex(m => m.slug === slug)
  const { html, toc, title, description, section } = await loadPage(slug)
  const pick = (m?: { slug: string; title: string }) => (m ? { slug: m.slug, title: m.title } : null)
  return { slug, title, description, section, html, toc, prev: pick(metas[at - 1]), next: pick(metas[at + 1]) }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData.slug === 'index' ? 'a2a-mod docs' : `${loaderData.title} · a2a-mod` },
  { name: 'description', content: loaderData.description },
]

const pathOf = (slug: string) => (slug === 'index' ? '/' : `/${slug}`)

// A heading is current only once the reader has scrolled; at the very top nothing is.
const TOP = 24

function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | undefined>(undefined)
  useEffect(() => {
    setActive(undefined)
    const seen = new Set<string>()
    const update = () => {
      if (scrollY < TOP) return setActive(undefined)
      const first = ids.find(id => seen.has(id))
      if (first) setActive(first)
    }
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)
        update()
      },
      { rootMargin: '-80px 0px -70% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    addEventListener('scroll', update, { passive: true })
    return () => { io.disconnect(); removeEventListener('scroll', update) }
  }, [ids.join('|')])
  return active
}

const SLOT = /<div data-diagram(?:="")?><\/div>/

const COPY_ICON = (
  <>
    <svg className="cp" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>
    <svg className="ok" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
  </>
)

function Hero({ tagline }: { tagline: string }) {
  return (
    <header className="hero" data-pagefind-ignore>
      <h1>a2a-mod</h1>
      <p className="tag">{tagline}</p>
      <div className="codeblock">
        <div className="codehead">
          <span>claude code</span>
          <button type="button" data-copy aria-label="Copy code" title="Copy code">{COPY_ICON}</button>
        </div>
        <pre>{'/plugin marketplace add NovusEdge/a2a-mod\n/plugin install a2a-mod@a2a-mod'}</pre>
      </div>
      <p className="req">Needs Claude Code 2.1.287 or later, the first release with mods.</p>
      <Diagram />
      <nav className="cards" aria-label="Start here">
        <Link to="/quick-start"><b>Quick start</b><span>Run the fake worker and watch a result come back.</span></Link>
        <Link to="/tokens"><b>Connect a real worker</b><span>Give it a bearer token without typing the token.</span></Link>
        <Link to="/write-a-worker"><b>Write a worker</b><span>A minimal @a2a-js/sdk worker and a checklist.</span></Link>
      </nav>
    </header>
  )
}

export default function Doc({ loaderData: d }: Route.ComponentProps) {
  const navigate = useNavigate()
  const active = useActiveHeading(d.toc.map(t => t.id))
  const home = d.slug === 'index'

  // The page body is an HTML string, so copy buttons and internal links are handled here.
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    const copy = target.closest<HTMLButtonElement>('[data-copy]')
    if (copy) {
      const text = copy.closest('.codeblock')?.querySelector('pre')?.textContent ?? ''
      navigator.clipboard?.writeText(text).catch(() => {})
      copy.setAttribute('data-copied', '')
      copy.setAttribute('aria-label', 'Copied')
      setTimeout(() => { copy.removeAttribute('data-copied'); copy.setAttribute('aria-label', 'Copy code') }, 1500)
      return
    }
    const a = target.closest('a')
    const href = a?.getAttribute('href')
    if (a && href?.startsWith('/') && !href.startsWith('//') && !a.target && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) {
      e.preventDefault()
      navigate(href)
    }
  }

  const parts = d.html.split(SLOT)

  return (
    <>
      <article className="prose-doc min-w-0 max-w-[760px]" data-pagefind-body onClick={onClick}>
        {home ? <Hero tagline={d.description} /> : <h1>{d.title}</h1>}
        {parts.map((html, i) => (
          <div key={i} className="contents">
            {i > 0 && <Diagram />}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ))}

        <div data-pagefind-ignore>
          <p className="mt-12 mb-0 text-sm">
            <a href={`${REPO}/edit/main/docs/web/content/${d.slug}.md`} className="text-(--muted) hover:text-(--fg)">Edit this page</a>
          </p>
          <nav aria-label="Previous and next" className="pn">
            {d.prev ? (
              <Link to={pathOf(d.prev.slug)} className="prev" rel="prev"><span className="dir">Previous</span><span className="ttl">{d.prev.title}</span></Link>
            ) : <span className="hidden sm:block" />}
            {d.next ? (
              <Link to={pathOf(d.next.slug)} className="next" rel="next"><span className="dir">Next</span><span className="ttl">{d.next.title}</span></Link>
            ) : null}
          </nav>
        </div>
      </article>

      <aside className="hidden lg:block" aria-label="On this page">
        {d.toc.length > 0 && (
          <div className="toc sticky top-24 text-sm">
            <p className="label mb-3">On this page</p>
            <ul className="m-0 list-none border-l border-(--line) p-0">
              {d.toc.map(t => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className={t.depth === 3 ? 'd3' : ''} aria-current={active === t.id}>{t.text}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </>
  )
}
