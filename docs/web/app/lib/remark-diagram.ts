import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

// A paragraph holding only {{diagram}} becomes <Diagram />, so the pages stay plain .md.
export function remarkDiagram() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      const [only] = node.children
      if (!parent || index === undefined || node.children.length !== 1 || only?.type !== 'text' || only.value.trim() !== '{{diagram}}') return
      parent.children[index] = { type: 'mdxJsxFlowElement', name: 'Diagram', attributes: [], children: [] } as never
    })
  }
}
