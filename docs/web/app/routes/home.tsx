import { Bell, KeyRound, Plug, Zap } from 'lucide-react'
import { Card, Cards } from 'fumadocs-ui/components/card'
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'
import { DocsBody } from 'fumadocs-ui/layouts/docs/page'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { use } from 'react'
import { Link } from 'react-router'
import { useMDXComponents } from '@/components/mdx'
import { baseOptions } from '@/lib/layout.shared'
import { loadPage, pageAt } from '@/lib/page'
import { contentUrl, repoUrl } from '@/lib/shared'
import { Diagram } from '../diagram'
import type { Route } from './+types/home'

const TAGLINE = 'Hand a task to another AI agent from Claude Code. Claude keeps working and gets the result when it lands.'

export async function loader({ request }: Route.LoaderArgs) {
  return loadPage(request)
}

export function meta({}: Route.MetaArgs) {
  return [{ title: 'a2a-mod docs' }, { name: 'description', content: TAGLINE }]
}

function Overview({ path }: { path: string }) {
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
  return (
    <HomeLayout {...baseOptions()} links={[{ text: 'Docs', url: '/quick-start', active: 'nested-url' }]}>
      <main className="flex flex-col flex-1">
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-fd-primary)_14%,transparent),transparent)]"
          />
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-16 pb-12 text-center md:pt-24">
            <h1 className="text-5xl font-bold tracking-tight md:text-7xl">a2a-mod</h1>
            <p className="mt-5 max-w-xl text-lg text-fd-muted-foreground">{TAGLINE}</p>
            <div className="mt-8 flex flex-row flex-wrap items-center justify-center gap-3">
              <Link className="rounded-full bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground" to="/quick-start">
                Get started
              </Link>
              <a className="rounded-full border bg-fd-secondary px-5 py-2.5 text-sm font-medium text-fd-secondary-foreground hover:bg-fd-accent" href={repoUrl}>
                GitHub
              </a>
            </div>
            <div className="mt-10 w-full max-w-xl text-left">
              <CodeBlock title="Claude Code">
                <Pre>{'/plugin marketplace add NovusEdge/a2a-mod\n/plugin install a2a-mod@a2a-mod'}</Pre>
              </CodeBlock>
              <p className="mt-1 text-sm text-fd-muted-foreground">Needs Claude Code 2.1.287 or later, the first release with mods.</p>
            </div>
            <img
              className="mt-10 w-full rounded-xl border shadow-lg"
              src="/demo.gif"
              width={1243}
              height={714}
              alt="Claude Code adds a fake worker, hands it a slow task, and gets the result back"
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12">
          <Cards className="sm:grid-cols-2">
            <Card icon={<Zap />} title="Hand off, keep working" href="/how-it-works">
              A slow task never blocks Claude. After about 7 seconds it gets a task id and moves on.
            </Card>
            <Card icon={<Bell />} title="Woken with the result" href="/quick-start">
              The mod polls the worker and wakes Claude when the task ends. Try it with the fake worker.
            </Card>
            <Card icon={<KeyRound />} title="Tokens stay out of the transcript" href="/tokens">
              Read a bearer token from a setting, a command or a file, never from the chat.
            </Card>
            <Card icon={<Plug />} title="Any A2A worker" href="/write-a-worker">
              ADK, AG2, LangGraph or @a2a-js/sdk. A minimal worker and a checklist for other stacks.
            </Card>
          </Cards>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4">
          <Diagram />
        </section>

        <article className="mx-auto w-full max-w-3xl px-4 pb-12">
          <Overview path={loaderData.path} />
          <a className="text-sm text-fd-muted-foreground hover:text-fd-foreground" href={contentUrl(loaderData.path, 'edit')}>
            Edit this page
          </a>
        </article>
      </main>
    </HomeLayout>
  )
}
