import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '@/lib/source'

const server = createFromSource(source, { language: 'english' })

// Prerendered to a static index; the browser runs the search.
export async function loader() {
  return server.staticGET()
}
