import type { Config } from '@react-router/dev/config'
import { pathOf, slugs } from './pages.ts'

export default {
  ssr: false,
  prerender: [...slugs().map(pathOf), '/api/search'],
} satisfies Config
