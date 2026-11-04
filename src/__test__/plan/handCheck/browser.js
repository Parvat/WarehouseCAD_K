// The hand check's real-click harness (REG_handCheck.test.js): the app on its own Vite server, Chromium driven by
// playwright-core — real mouse and keys on the real canvas, nothing called directly. A test opens a saved layout the
// way the app does (its autosave, restored on load), then clicks.
//
//   - fixtures (this folder): older-*.wcad were saved by 86b4db1's Generate (its Building layer locked, no hand-lock
//     flag); crowded-*.wcad by today's, then crowded: a rack 3″ off a wall, a rack 3″ off a column, the view with the
//     building's top wall 150 px down so the selection bar sits right over its labels (`handCheck` names them).
//   - the browser: playwright-core's own Chromium, else any build under %LOCALAPPDATA%/ms-playwright
//     (`npx playwright-core install chromium` if there is none). A missing browser fails the suite — never skips it.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
export const FIXTURES = ['older-horizontal', 'older-vertical', 'crowded-horizontal', 'crowded-vertical']
export const fixture = (name) => readFileSync(new URL(`./${name}.wcad`, import.meta.url), 'utf8')

function chromiumPath(chromium) {
  const own = chromium.executablePath()
  if (own && existsSync(own)) return own
  const base = join(process.env.LOCALAPPDATA || '', 'ms-playwright')
  const dirs = existsSync(base) ? readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse() : []
  for (const d of dirs) { const p = join(base, d, 'chrome-win64', 'chrome.exe'); if (existsSync(p)) return p }
  throw new Error('REG_handCheck needs Chromium: run `npx playwright-core install chromium`')
}

/** The app served and a browser up; `close()` stops both. */
export async function startApp() {
  const { createServer } = await import('vite')
  const { chromium } = await import('playwright-core')
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5290, strictPort: false, hmr: false } })
  await server.listen()
  const url = server.resolvedUrls.local[0]
  const browser = await chromium.launch({ executablePath: chromiumPath(chromium) })
  return { url, browser, close: async () => { await browser.close(); await server.close() } }
}

/** A page with the saved layout `json` open (restored from the autosave, as a reload restores it); its helpers. */
export async function openLayout(app, json) {
  const page = await app.browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(app.url)
  await page.evaluate((j) => { localStorage.clear(); localStorage.setItem('warehousecad_autosave', j) }, json)
  await page.reload()
  await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 120000 })
  await page.getByRole('button', { name: /^Draw/ }).click()
  await page.waitForSelector('.konvajs-content')
  // the app's own modules, for reading state and placing the mouse (a string: the test runner rewrites import() in
  // functions it hands the page)
  await page.evaluate(`(async () => { window.__hc = {
    S: (await import('/src/store/useCanvasStore.js')).useCanvasStore, H: await import('/src/canvas2/hitTest.js'),
    RG: await import('/src/utils/rowGroupTool.js'), RW: await import('/src/utils/rowGroup.js'), SL: await import('/src/utils/saveLoad.js'),
    LS: await import('/src/render/labelSize.js'), P: await import('/src/canvas2/labelPrefs.js'),
    HG: await import('/src/canvas2/handleGeometry.js'), SC: await import('/src/canvas2/sections.js').catch(() => null), N: await import('/src/utils/notice.js'),
    AP: await import('/src/utils/rackingAreaTool.js'), CP: await import('/src/canvas2/columnPick.js').catch(() => null) } })()`)
  await page.waitForFunction(() => window.__hc.S.getState().objects.length > 0, null, { timeout: 30000 })
  await page.waitForTimeout(400)
  // a layout opens with Pan (the store's default tool): V for Select, as a user would
  await page.mouse.move(5, 890); await page.keyboard.press('v'); await page.waitForTimeout(100)
  if (await page.evaluate(() => window.__hc.S.getState().activeTool) !== 'select') throw new Error('V did not turn Select on')
  /** Runs `src` in the page with S (the canvas store), H (canvas2/hitTest), RG (utils/rowGroupTool), RW (utils/rowGroup),
   *  SL (utils/saveLoad), LS (render/labelSize), P (canvas2/labelPrefs) and `arg`. */
  const S = (src, arg) => page.evaluate(({ src, arg }) => {
    const m = window.__hc
    return new Function('S', 'H', 'RG', 'RW', 'SL', 'LS', 'P', 'HG', 'SC', 'N', 'AP', 'CP', 'arg', src)(m.S, m.H, m.RG, m.RW, m.SL, m.LS, m.P, m.HG, m.SC, m.N, m.AP, m.CP, arg)
  }, { src, arg })
  const cv = await page.locator('#canvas2-container').boundingBox()
  /** A world point → the page point the mouse goes to (the live view). */
  const toScreen = async (w) => { const v = await S('const s = S.getState(); return { z: s.zoom, x: s.panX, y: s.panY }'); return { x: cv.x + w.x * v.z + v.x, y: cv.y + w.y * v.z + v.y } }
  const click = async (w, opts) => { const p = await toScreen(w); await page.mouse.click(p.x, p.y, opts); await page.waitForTimeout(200) }
  const drag = async (a, b) => {
    const p = await toScreen(a), q = await toScreen(b)
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250)
  }
  const shiftClick = async (w) => { await page.keyboard.down('Shift'); await click(w); await page.keyboard.up('Shift') }
  const shiftDrag = async (a, b) => { await page.keyboard.down('Shift'); await drag(a, b); await page.keyboard.up('Shift') }
  /** The selection bar's kind (data-selection-bar) and its screen rect, or null. */
  const bar = () => page.evaluate(() => { const b = document.querySelector('[data-selection-bar]'); if (!b) return null; const r = b.getBoundingClientRect(); return { kind: b.getAttribute('data-selection-bar'), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, text: b.textContent } })
  /** Every label pill drawn on the canvas (named label-pill), as page rects; `text`: the pill's words. */
  const pills = () => page.evaluate(() => {
    const st = (window.Konva?.stages || [])[0]; if (!st) return []
    const c = st.container().getBoundingClientRect()
    // a pill by its shape, as drawn on any commit: a Rect with a Text over the same box, side by side in one group
    const out = []
    for (const t of st.find('Text')) {
      if (!t.isVisible()) continue
      const sib = t.getParent()?.getChildren?.() || [], i = sib.indexOf(t), n = sib[i - 1]
      if (!n || n.getClassName() !== 'Rect' || Math.abs(n.x() - t.x()) > 1e-6 || Math.abs(n.y() - t.y()) > 1e-6) continue
      const r = n.getClientRect({ skipShadow: true, skipStroke: true })
      out.push({ x0: c.left + r.x, y0: c.top + r.y, x1: c.left + r.x + r.width, y1: c.top + r.y + r.height, text: t.text() })
    }
    return out
  })
  /** Every clearance tag's text drawn now ("9.5' clear"). */
  const clearTags = () => page.evaluate(() => { const st = (window.Konva?.stages || [])[0]; return st ? st.find('Text').filter(t => t.isVisible() && / clear$/.test(t.text())).map(t => t.text()) : [] })
  const selected = () => S('const s = S.getState(); return s.selectedIds.map(id => s.objects.find(o => o.id === id)?.type)')
  const bayOf = (id) => S('const o = S.getState().objects.find(x => x.id === arg); return o ? { idx: o.activeBayIdx ?? null, side: o.activeBaySide ?? null } : null', id)
  const groupRows = () => S('return RG.useRowGroup.getState().keys.length')
  /** An empty spot of the building's floor (no object, no wall under it) nearest world point `near`. */
  const floorPoint = (near) => S(`const st = S.getState(), fp = st.objects.find(o => /^fp_/.test(o.type)), z = st.zoom, gs = st.gridSize || 40
    let best = null
    for (let fy = 0.04; fy < 0.97; fy += 0.01) for (let fx = 0.04; fx < 0.97; fx += 0.01) {
      const x = fp.x + fp.width * fx, y = fp.y + fp.height * fy
      if (H.hitTest(st.objects, st.layers, x, y, z, gs) !== fp.id || H.fpWallHitTest(st.objects, st.layers, x, y, z, gs)) continue
      if (CP && CP.columnAt(st.objects, st.layers, x, y, z, gs)) continue   // a column: a click there picks it, locked or not
      const d = arg ? Math.hypot(x - arg.x, y - arg.y) : 0
      if (!best || d < best.d) best = { x, y, d }
      if (!arg) return best
    }
    return best`, near || null)
  /** Every selection outline on the canvas: { id, dashed, width } (shapes.jsx SelectionOutline). */
  const outlines = () => page.evaluate(() => {
    const st = (window.Konva?.stages || [])[0]
    if (!st) return []
    return st.find(n => /^sel:/.test(n.name() || '')).map(g => { const r = g.findOne?.('Rect') || g; return { id: g.name().slice(4), dashed: !!(r.dash() && r.dash().length), width: r.strokeWidth() } })
  })
  return { page, S, click, drag, shiftClick, shiftDrag, bar, pills, clearTags, toScreen, selected, bayOf, groupRows, floorPoint, outlines, errors, meta: JSON.parse(json).handCheck || null }
}
