import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { llmsPath, pathOf, slugs } from '../pages.ts'

const root = fileURLToPath(new URL('../build/client/', import.meta.url))
const problems: string[] = []

if (!existsSync(root)) {
  console.error('build/client does not exist; run `pnpm build` first')
  process.exit(1)
}

const fileOf = (route: string) => join(root, route.replace(/\/$/, ''), 'index.html')

for (const slug of slugs()) {
  if (!existsSync(fileOf(pathOf(slug)))) problems.push(`no prerendered HTML for ${pathOf(slug)}`)
}
for (const f of ['404.html', 'api/search', 'llms.txt', ...slugs().map(s => llmsPath(s).slice(1))]) {
  if (!existsSync(join(root, f))) problems.push(`build output is missing ${f}`)
}
if (existsSync(join(root, 'api/search')) && JSON.parse(readFileSync(join(root, 'api/search'), 'utf8')).type !== 'advanced') {
  problems.push('api/search is not a search index')
}

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'assets' ? [] : htmlFiles(p)
    return name.endsWith('.html') ? [p] : []
  })

const idsCache = new Map<string, Set<string>>()
const idsOf = (file: string) => {
  let ids = idsCache.get(file)
  if (!ids) {
    ids = new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]!))
    idsCache.set(file, ids)
  }
  return ids
}

for (const file of htmlFiles(root)) {
  const here = '/' + file.slice(root.length).replace(/(^|\/)index\.html$/, '')
  for (const [, raw] of readFileSync(file, 'utf8').matchAll(/<a\s[^>]*?href="([^"]*)"/g)) {
    const href = raw!.replaceAll('&amp;', '&')
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) continue
    const [target, hash] = href.split('#') as [string, string | undefined]
    const route = target ? posix.resolve(here.endsWith('/') ? here : here + '/', target) : here
    const page = existsSync(fileOf(route)) ? fileOf(route) : undefined
    const asset = !page && existsSync(join(root, route)) && statSync(join(root, route)).isFile()
    if (!page && !asset) problems.push(`${here}: link to ${href} has no target page`)
    else if (hash && page && !idsOf(page).has(decodeURIComponent(hash))) problems.push(`${here}: link to ${href} has no such anchor`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`links ok: ${idsCache.size ? idsCache.size + ' pages with anchors, ' : ''}${slugs().length} routes`)
