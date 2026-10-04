import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '../lib/source'

const server = createFromSource(source)

// Prerendered to a static index; the browser runs the search (see components/search.tsx).
export async function loader() {
  return server.staticGET()
}
