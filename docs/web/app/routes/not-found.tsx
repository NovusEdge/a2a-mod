import { Link } from 'react-router'
import type { Route } from './+types/not-found'

export const meta: Route.MetaFunction = () => [{ title: 'Page not found · a2a-mod' }]

export default function NotFound() {
  return (
    <article className="prose-doc min-w-0 max-w-[760px] lg:col-span-1">
      <p className="label mb-3 !text-(--accent)">404</p>
      <h1>Page not found</h1>
      <p className="lead">There is no page at this address. <Link to="/">Go to the overview</Link>.</p>
    </article>
  )
}
