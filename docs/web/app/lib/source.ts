import { loader } from 'fumadocs-core/source'
import { defineDocs } from 'fumadocs-mdx/macro'

export const docs = defineDocs({ dir: 'content', docs: { async: true } })

// Pages sit at the site root: /quick-start, not /docs/quick-start. index.md is `/`.
export const source = loader({ baseUrl: '/', source: docs.toFumadocsSource() })

export const REPO = 'https://github.com/NovusEdge/a2a-mod'
