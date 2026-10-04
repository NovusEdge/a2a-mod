import { defineConfig } from 'fumadocs-mdx/config'
import remarkGfm from 'remark-gfm'
import { remarkDiagram } from './app/lib/remark-diagram.ts'

export default defineConfig({
  mdxOptions: {
    remarkPlugins: v => [remarkGfm, remarkDiagram, ...v],
  },
})
