import { index, route, type RouteConfig } from '@react-router/dev/routes'
import { pathOf, slugs } from '../pages.ts'

export default [
  ...slugs().map(slug =>
    slug === 'index'
      ? index('routes/home.tsx')
      : route(pathOf(slug), 'routes/docs.tsx', { id: `doc-${slug}` }),
  ),
  route('api/search', 'routes/search.ts'),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig
