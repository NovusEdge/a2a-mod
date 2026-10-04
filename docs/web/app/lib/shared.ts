import { createGetUrl } from 'fumadocs-core/source'

export const appName = 'a2a-mod'
export const docsRoute = '/'
export const docsContentRoute = '/llms.mdx'

export const gitConfig = { user: 'NovusEdge', repo: 'a2a-mod', branch: 'main' }
export const repoUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`
export const contentUrl = (path: string, mode: 'blob' | 'edit') =>
  `${repoUrl}/${mode}/${gitConfig.branch}/docs/web/content/${path}`

const getContentUrl = createGetUrl(docsContentRoute)

export function getPageMarkdownUrl(page: { slugs: string[] }) {
  return getContentUrl([...page.slugs, 'content.md'])
}
