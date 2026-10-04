import { useFumadocsLoader } from 'fumadocs-core/source/client'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page'
import { use } from 'react'
import { useMDXComponents } from '@/components/mdx'
import { baseOptions } from '@/lib/layout.shared'
import { loadPage, pageAt } from '@/lib/page'
import { contentUrl } from '@/lib/shared'
import type { Route } from './+types/docs'

export async function loader({ request }: Route.LoaderArgs) {
  return loadPage(request)
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const page = pageAt(loaderData.path)
  return [{ title: `${page.title} · a2a-mod` }, { name: 'description', content: page.description }]
}

function Content({ path, markdownUrl }: { path: string; markdownUrl: string }) {
  const page = pageAt(path)
  const { toc } = use(page.load())
  const Mdx = page.body

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={contentUrl(path, 'blob')} />
      </div>
      <DocsBody>
        <Mdx components={useMDXComponents()} />
      </DocsBody>
      <a className="text-sm text-fd-muted-foreground hover:text-fd-foreground" href={contentUrl(path, 'edit')}>
        Edit this page
      </a>
    </DocsPage>
  )
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { pageTree, path, markdownUrl } = useFumadocsLoader(loaderData)

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Content path={path} markdownUrl={markdownUrl} />
    </DocsLayout>
  )
}
