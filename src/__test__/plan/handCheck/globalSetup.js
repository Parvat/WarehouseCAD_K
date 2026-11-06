// The hand check's app server, once per test run (vite.config.js test.globalSetup): one Vite dev server for every REG
// shard's Chromium (handCheck/browser.js startApp takes its URL with inject('regAppUrl')).
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default async function setup({ provide }) {
  const { createServer } = await import('vite')
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5290, strictPort: false, hmr: false } })
  await server.listen()
  provide('regAppUrl', server.resolvedUrls.local[0])
  return async () => { await server.close() }
}
