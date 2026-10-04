import { readFileSync } from 'node:fs'
import rehypeShiki from '@shikijs/rehype'
import type { Element, Root as HastRoot } from 'hast'
import { toString } from 'hast-util-to-string'
import type { Root as MdastRoot } from 'mdast'
import rehypeAutolink from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import { CONTENT_DIR, type Meta } from '../pages.ts'

export type TocItem = { id: string; text: string; depth: 2 | 3 }
export type Page = Meta & { slug: string; html: string; toc: TocItem[] }

type Data = { meta?: Meta; toc?: TocItem[] }

function frontmatter() {
  return (tree: MdastRoot, file: { data: object }) => {
    const node = tree.children.find(n => n.type === 'yaml')
    if (!node || node.type !== 'yaml') throw new Error('page has no frontmatter')
    const m = parseYaml(node.value) as Partial<Meta>
    for (const key of ['title', 'description', 'order', 'section'] as const) {
      if (m[key] === undefined) throw new Error(`frontmatter is missing ${key}`)
    }
    ;(file.data as Data).meta = m as Meta
  }
}

// Wraps each code block in a header with a title and a copy button. Runs before Shiki, which
// still finds the pre inside the wrapper. The title comes from the fence: ```sh title="shell".
function codeFrame() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return
      const code = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code')
      if (!code) return
      const lang = String(((code.properties.className as string[] | undefined) ?? []).find(c => c.startsWith('language-'))?.slice(9) ?? 'text')
      const meta = (code.data as { meta?: string } | undefined)?.meta ?? ''
      const title = /title="([^"]*)"/.exec(meta)?.[1] ?? lang
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['codeblock'] },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['codehead'], 'data-pagefind-ignore': '' },
            children: [
              { type: 'element', tagName: 'span', properties: {}, children: [{ type: 'text', value: title }] },
              {
                type: 'element',
                tagName: 'button',
                properties: { type: 'button', 'data-copy': '', ariaLabel: 'Copy code' },
                children: [{ type: 'text', value: 'copy' }],
              },
            ],
          },
          node,
        ],
      }
      return 'skip'
    })
  }
}

function collectToc() {
  return (tree: HastRoot, file: { data: object }) => {
    const toc: TocItem[] = []
    visit(tree, 'element', (node: Element) => {
      if ((node.tagName === 'h2' || node.tagName === 'h3') && typeof node.properties.id === 'string') {
        toc.push({ id: node.properties.id, text: toString(node), depth: node.tagName === 'h2' ? 2 : 3 })
      }
    })
    ;(file.data as Data).toc = toc
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(frontmatter)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(codeFrame)
  .use(rehypeShiki, {
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    langs: ['sh', 'json', 'ts'],
    fallbackLanguage: 'text',
  })
  .use(rehypeSlug)
  .use(collectToc)
  .use(rehypeAutolink, { behavior: 'wrap' })
  .use(rehypeStringify)

export async function loadPage(slug: string): Promise<Page> {
  const source = readFileSync(new URL(`${slug}.md`, CONTENT_DIR), 'utf8')
  const file = await processor.process(source)
  const data = file.data as Data
  return { ...data.meta!, slug, html: String(file), toc: data.toc ?? [] }
}
