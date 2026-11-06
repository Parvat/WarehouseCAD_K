import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Dev only: a change to a non-component file (src/**\/*.js — the store, utils, constants, hooks) reloads the whole page
   instead of hot-swapping it. A hot swap re-runs the components that import it against a second copy of the canvas
   store, so half the screen reads one store while clicks write the other (a click selects nothing, Lock shows no
   state). Components (.jsx) keep Fast Refresh; CSS still hot-swaps. */
const reloadOnModuleChange = () => ({
  name: 'reload-on-module-change',
  apply: 'serve',
  handleHotUpdate({ file, server }) {
    if (/\/src\/.*\.js$/.test(file.replace(/\\/g, '/'))) {
      server.ws.send({ type: 'full-reload', path: '*' })
      return []
    }
  },
})

export default defineConfig({
  plugins: [react(), reloadOnModuleChange()],
  test: {
    environment: 'node',
    globals: true,
    // a few plan tests run Generate on a 1080 × 410 building (2–4 s alone); under the full suite's
    // parallel load that passes the 5 s default
    testTimeout: 20000,
  },
})
