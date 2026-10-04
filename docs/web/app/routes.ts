import { index, route, layout, type RouteConfig } from '@react-router/dev/routes'
import { pathOf, slugs } from '../pages.ts'

export default [
  layout('routes/shell.tsx', [
    ...slugs().map(slug =>
      slug === 'index'
        ? index('routes/doc.tsx', { id: 'doc-index' })
        : route(pathOf(slug), 'routes/doc.tsx', { id: `doc-${slug}` }),
    ),
    route('*', 'routes/not-found.tsx'),
  ]),
] satisfies RouteConfig
