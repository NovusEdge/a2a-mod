import { readdirSync } from 'node:fs'

// One Markdown or MDX file per page; index is `/`. Shared by the router config and the link checker.
// Relative to the working directory, which is docs/web for every script.
export const slugs = (): string[] =>
  readdirSync('content')
    .filter(f => /\.mdx?$/.test(f))
    .map(f => f.replace(/\.mdx?$/, ''))
    .sort()

export const pathOf = (slug: string) => (slug === 'index' ? '/' : `/${slug}`)

// The raw-Markdown copy of each page, which the page-actions bar links to.
export const llmsPath = (slug: string) => `/llms.mdx${slug === 'index' ? '' : `/${slug}`}/content.md`
