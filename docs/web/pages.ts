import { readdirSync } from 'node:fs'

// One Markdown file per page; index.md is `/`. Shared by the router config and the link checker.
// Relative to the working directory, which is docs/web for every script.
export const slugs = (): string[] =>
  readdirSync('content')
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort()

export const pathOf = (slug: string) => (slug === 'index' ? '/' : `/${slug}`)
