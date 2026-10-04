import type { Config } from '@react-router/dev/config'
import { llmsPath, pathOf, slugs } from './pages.ts'

export default {
  ssr: false,
  prerender: [...slugs().flatMap(slug => [pathOf(slug), llmsPath(slug)]), '/api/search', '/llms.txt', '/llms-full.txt'],
} satisfies Config
