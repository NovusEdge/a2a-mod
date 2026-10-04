import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import { RootProvider } from 'fumadocs-ui/provider/react-router'
import type { Route } from './+types/root'
import StaticSearchDialog from './components/search'
import { Footer } from './lib/layout.shared'
import './app.css'

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231a1a1a'/%3E%3Ctext x='16' y='23' font-size='20' font-weight='900' text-anchor='middle' fill='%23d4a03c' font-family='sans-serif'%3Ea%3C/text%3E%3C/svg%3E" },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap' },
  { rel: 'preconnect', href: 'https://api.fontshare.com' },
  { rel: 'stylesheet', href: 'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap' },
  { rel: 'stylesheet', href: 'https://api.fontshare.com/v2/css?f[]=amulya@400,500,700,900&display=swap' },
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
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog: StaticSearchDialog }}>{children}</RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <>
      <div className="a2a-main">
        <Outlet />
      </div>
      <Footer />
    </>
  )
}
