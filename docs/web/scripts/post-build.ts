import { copyFileSync } from 'node:fs'

// GitHub Pages serves 404.html for any unknown path; the router renders its not-found route there.
copyFileSync(new URL('../build/client/index.html', import.meta.url), new URL('../build/client/404.html', import.meta.url))
