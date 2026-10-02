import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // a few plan tests run Generate on a 1080 × 410 building (2–4 s alone); under the full suite's
    // parallel load that passes the 5 s default
    testTimeout: 20000,
  },
})