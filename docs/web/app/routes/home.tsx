import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'
import { DocsBody } from 'fumadocs-ui/layouts/docs/page'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { use } from 'react'
import { Link } from 'react-router'
import { useMDXComponents } from '../components/mdx'
import { Diagram } from '../diagram'
import { baseOptions } from '../lib/layout.shared'
import { loadPage, pageAt } from '../lib/page'
import { REPO } from '../lib/source'
import type { Route } from './+types/home'

export async function loader({ request }: Route.LoaderArgs) {
  return loadPage(request)
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: 'a2a-mod docs' },
  { name: 'description', content: pageAt(loaderData.path).description },
]

function Body({ path }: { path: string }) {
  const page = pageAt(path)
  use(page.load())
  const Mdx = page.body
  return (
    <DocsBody>
      <Mdx components={useMDXComponents()} />
    </DocsBody>
  )
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const page = pageAt(loaderData.path)
  return (
    <HomeLayout {...baseOptions()} links={[{ text: 'Docs', url: '/quick-start', active: 'nested-url' }]}>
      <div className="a2a-home">
        <header className="a2a-hero">
          <h1>a2a-mod</h1>
          <p className="tag">{page.description}</p>
          <CodeBlock title="claude code">
            <Pre>{'/plugin marketplace add NovusEdge/a2a-mod\n/plugin install a2a-mod@a2a-mod'}</Pre>
          </CodeBlock>
          <p className="req">Needs Claude Code 2.1.287 or later, the first release with mods.</p>
          <img className="a2a-demo" src="/demo.gif" alt="Claude Code handing a task to a worker and getting the result back" />
          <Diagram />
          <nav className="a2a-cards" aria-label="Start here">
            <Link to="/quick-start"><b>Quick start</b><span>Run the fake worker and watch a result come back.</span></Link>
            <Link to="/tokens"><b>Connect a real worker</b><span>Give it a bearer token without typing the token.</span></Link>
            <Link to="/write-a-worker"><b>Write a worker</b><span>A minimal @a2a-js/sdk worker and a checklist.</span></Link>
          </nav>
        </header>
        <Body path={loaderData.path} />
        <a className="a2a-edit" href={`${REPO}/edit/main/docs/web/content/${loaderData.path}`}>Edit this page</a>
      </div>
    </HomeLayout>
  )
}
