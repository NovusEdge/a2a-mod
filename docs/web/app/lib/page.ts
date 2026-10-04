import { docs, source } from './source'
import { getPageMarkdownUrl } from './shared'

// Prerendering also requests `<path>.data`, and `/_.data` for the index route.
export async function loadPage(request: Request) {
  const path = new URL(request.url).pathname.replace(/\.data$/, '').replace(/\/+$/, '')
  const slug = path === '' || path === '/_' ? 'index' : path.slice(1)
  const page = source.getPage(slug === 'index' ? [] : [slug])
  if (!page) throw new Response('Not found', { status: 404 })
  await docs.getPage(page.path)?.preload()
  return {
    path: page.path,
    markdownUrl: getPageMarkdownUrl(page),
    pageTree: await source.serializePageTree(source.getPageTree()),
  }
}

export function pageAt(path: string) {
  const page = docs.getPage(path)
  if (!page) throw new Error(`unknown page: ${path}`)
  return page
}
