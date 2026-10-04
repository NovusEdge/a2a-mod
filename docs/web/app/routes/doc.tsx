import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { readMetas } from '../../pages'
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

function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | undefined>(ids[0])
  useEffect(() => {
    setActive(ids[0])
    const seen = new Set<string>()
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)
        const first = ids.find(id => seen.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-80px 0px -70% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids.join('|')])
  return active
}

export default function Doc({ loaderData: d }: Route.ComponentProps) {
  const navigate = useNavigate()
  const active = useActiveHeading(d.toc.map(t => t.id))

  // The page body is an HTML string, so copy buttons and internal links are handled here.
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    const copy = target.closest<HTMLButtonElement>('[data-copy]')
    if (copy) {
      const text = copy.closest('.codeblock')?.querySelector('pre')?.textContent ?? ''
      navigator.clipboard?.writeText(text).catch(() => {})
      copy.textContent = 'copied'
      setTimeout(() => { copy.textContent = 'copy' }, 1500)
      return
    }
    const a = target.closest('a')
    const href = a?.getAttribute('href')
    if (a && href?.startsWith('/') && !href.startsWith('//') && !a.target && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) {
      e.preventDefault()
      navigate(href)
    }
  }

  return (
    <>
      <article className="prose-doc min-w-0 max-w-[760px]" data-pagefind-body onClick={onClick}>
        <p className="label mb-3 !text-(--accent)" data-pagefind-ignore>{d.section} / {d.title}</p>
        <h1>{d.title}</h1>
        <p className="lead">{d.description}</p>
        <div dangerouslySetInnerHTML={{ __html: d.html }} />

        <div data-pagefind-ignore>
          <p className="mt-12 mb-0 text-sm">
            <a href={`${REPO}/edit/main/docs/web/content/${d.slug}.md`} className="text-(--muted)">Edit this page</a>
          </p>
          <nav aria-label="Previous and next" className="mt-6 flex items-center justify-between gap-4 border-t border-(--line) pt-6 text-sm">
            {d.prev ? <Link to={pathOf(d.prev.slug)} className="text-(--muted) hover:text-(--fg)">&larr; {d.prev.title}</Link> : <span />}
            {d.next ? <Link to={pathOf(d.next.slug)} className="text-right text-(--accent)">{d.next.title} &rarr;</Link> : <span />}
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
