import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

// Serves build/client the way GitHub Pages does: /page redirects to /page/, and unknown paths get 404.html.
// `vite preview` falls back to the root index.html instead, which hides routing bugs.
const root = fileURLToPath(new URL('../build/client/', import.meta.url))
const port = Number(process.env.PORT ?? 4173)
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.data': 'text/x-script', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  const file = normalize(join(root, decodeURIComponent(pathname)))
  const dir = existsSync(file) && statSync(file).isDirectory()
  if (!file.startsWith(root)) { res.writeHead(403).end(); return }
  if (dir && !pathname.endsWith('/')) { res.writeHead(301, { Location: pathname + '/' }).end(); return }
  const target = dir ? join(file, 'index.html') : file
  if (existsSync(target) && statSync(target).isFile()) {
    res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' }).end(readFileSync(target))
  } else {
    res.writeHead(404, { 'Content-Type': types['.html']! }).end(readFileSync(join(root, '404.html')))
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`))
