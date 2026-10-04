import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import { RootProvider } from 'fumadocs-ui/provider/react-router'
import type { Route } from './+types/root'
import './app.css'
import SearchDialog from '@/components/search'
import { repoUrl } from '@/lib/shared'
import NotFound from './routes/not-found'

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231a1a1a'/%3E%3Ctext x='16' y='23' font-size='20' font-weight='900' text-anchor='middle' fill='%23d4a03c' font-family='sans-serif'%3Ea%3C/text%3E%3C/svg%3E" },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={{ SearchDialog }}>{children}</RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

function Footer() {
  return (
    <footer className="border-t text-sm text-fd-muted-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-6">
        <span className="flex flex-wrap items-center gap-3">
          MIT licence
          <code className="rounded border px-1.5 py-0.5 text-xs">A2A 1.0 | 0.3</code>
        </span>
        <nav aria-label="Project" className="flex flex-wrap gap-x-5 gap-y-2">
          <a className="hover:text-fd-foreground" href={`${repoUrl}/blob/main/CHANGELOG.md`}>Changelog</a>
          <Link className="hover:text-fd-foreground" to="/security">Security</Link>
          <a className="hover:text-fd-foreground" href={repoUrl}>GitHub</a>
        </nav>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!'
  let details = 'An unexpected error occurred.'
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return <NotFound />
    message = 'Error'
    details = error.statusText
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="pt-16 p-4 w-full max-w-[1400px] mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
