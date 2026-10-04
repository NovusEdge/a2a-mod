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

const el = (tagName: string, properties: Element['properties'], children: Element['children'] = []): Element => ({ type: 'element', tagName, properties, children })
const icon = (className: string, ...paths: Element[]) =>
  el('svg', { className: [className], width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true' }, paths)

// Wraps each code block in a header with a lowercase label and an icon copy button. Runs before
// Shiki, which still finds the pre inside the wrapper. The label comes from the fence:
// ```sh title="shell". Blocks in the `text` language wrap long lines instead of scrolling.
function codeFrame() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return
      const code = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code')
      if (!code) return
      const lang = String(((code.properties.className as string[] | undefined) ?? []).find(c => c.startsWith('language-'))?.slice(9) ?? 'text')
      const meta = (code.data as { meta?: string } | undefined)?.meta ?? ''
      const title = (/title="([^"]*)"/.exec(meta)?.[1] ?? lang).toLowerCase()
      parent.children[index] = el('div', { className: lang === 'text' ? ['codeblock', 'is-text'] : ['codeblock'] }, [
        el('div', { className: ['codehead'], 'data-pagefind-ignore': '' }, [
          el('span', {}, [{ type: 'text', value: title }]),
          el('button', { type: 'button', 'data-copy': '', ariaLabel: 'Copy code', title: 'Copy code' }, [
            icon('cp', el('rect', { x: '9', y: '9', width: '11', height: '11', rx: '2' }), el('path', { d: 'M5 15V6a2 2 0 0 1 2-2h8' })),
            icon('ok', el('path', { d: 'm5 12.5 4.5 4.5L19 7.5' })),
          ]),
        ]),
        node,
      ])
      return 'skip'
    })
  }
}

// The first paragraph of a page is its lead.
function leadParagraph() {
  return (tree: HastRoot) => {
    const first = tree.children.find((n): n is Element => n.type === 'element')
    if (first?.tagName === 'p') first.properties.className = ['lead']
  }
}

// Inline code short enough to read as one token stays on one line.
function keepShortCodeTogether() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, _i, parent) => {
      if (node.tagName !== 'code' || (parent as Element | undefined)?.tagName === 'pre') return
      if (toString(node).length < 24) node.properties.className = ['nw']
    })
  }
}

// A paragraph that holds only {{diagram}} becomes a slot the route fills with the diagram.
function diagramSlot() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'p' || !parent || index === undefined || toString(node).trim() !== '{{diagram}}') return
      parent.children[index] = el('div', { 'data-diagram': '' })
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
  .use(leadParagraph)
  .use(diagramSlot)
  .use(keepShortCodeTogether)
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
