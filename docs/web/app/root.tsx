import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import type { Route } from './+types/root'
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

// Sets the theme before first paint. Storage can throw (private windows, blocked site data).
const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem('a2a-theme')}catch(e){}if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t})()`

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}
