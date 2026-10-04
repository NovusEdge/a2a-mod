import { copyFileSync } from 'node:fs'

// GitHub Pages serves 404.html for any unknown path. The SPA fallback is the bare app shell, so the
// router renders its not-found route there instead of flashing the home page.
copyFileSync(new URL('../build/client/__spa-fallback.html', import.meta.url), new URL('../build/client/404.html', import.meta.url))
