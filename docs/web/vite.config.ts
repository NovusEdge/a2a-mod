import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readMetas } from './pages.ts'

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  define: { __NAV__: JSON.stringify(readMetas().map(({ slug, title, section }) => ({ slug, title, section }))) },
})
