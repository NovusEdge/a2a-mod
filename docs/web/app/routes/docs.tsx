import { useFumadocsLoader } from 'fumadocs-core/source/client'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import { use } from 'react'
import { useMDXComponents } from '../components/mdx'
import { baseOptions } from '../lib/layout.shared'
import { loadPage, pageAt } from '../lib/page'
import { REPO } from '../lib/source'
import type { Route } from './+types/docs'

export async function loader({ request }: Route.LoaderArgs) {
  return loadPage(request)
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const page = pageAt(loaderData.path)
  return [{ title: `${page.title} · a2a-mod` }, { name: 'description', content: page.description }]
}

function Content({ path }: { path: string }) {
  const page = pageAt(path)
  const { toc } = use(page.load())
  const Mdx = page.body
  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        <Mdx components={useMDXComponents()} />
      </DocsBody>
      <a className="a2a-edit" href={`${REPO}/edit/main/docs/web/content/${path}`}>Edit this page</a>
    </DocsPage>
  )
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { path, pageTree } = useFumadocsLoader(loaderData)
  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Content path={path} />
    </DocsLayout>
  )
}
