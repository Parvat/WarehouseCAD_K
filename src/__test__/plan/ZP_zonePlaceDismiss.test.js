// Area ZP — placing a zone, and dismissing the Row group's apply.
//   1. The bar's ✕ ("Don't apply") leaves an edit on its own row, the group kept; Esc, once nothing
//      else is active, clears the pending apply and the group: the change stays where it was made,
//      nothing is applied.
//   2. A zone from the left panel follows the mouse (utils/placement.js),
//      stays within the walls and snaps onto a wall face; Esc cancels (nothing
//      placed, no history); the click drops it, and the racking area under it
//      refits at once — one undo step with the zone.
// Real store with the app's keepers; both orientations; rectangle, L and T.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GS } from './fixtures'
import { readFileSync } from 'node:fs'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const FT = await import('../../utils/fillTool')
  const FR = await import('../../generate/fillRacking')
  const RA = await import('../../generate/rackingArea')
  const AT = await import('../../utils/rackingAreaTool')
  const LC = await import('../../utils/layoutCheck')
  const RG = await import('../../utils/rowGroupTool')
  const PL = await import('../../utils/placement')
  const Bar = await import('../../canvas2/RowGroupBar.jsx')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { rackFootprint } = await import('../../generate/columnCheck')
  const L = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  installRowEditKeeper(useCanvasStore)
  RG.installRowGroupWatcher(useCanvasStore, nanoid)
  AT.installAreaKeeper(useCanvasStore)
  return { useCanvasStore, FT, FR, RA, AT, LC, RG, PL, Bar, generateAndPlace, rackFootprint }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-3
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
const tick = () => new Promise(r => setTimeout(r, 0))
const SHAPES = [['rectangle', 'fp_rect', 240, 120, 0.55, 0.6], ['L', 'fp_l', 300, 200, 0.55, 0.8], ['T', 'fp_t', 360, 240, 0.55, 0.6]]

describe.each(['horizontal', 'vertical'])('ZP — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation, maxRunFt: 120 })
    m.AT.useAreaPrompt.setState({ question: null })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  const areaNow = () => s().objects.find(o => o.type === 'racking_area')
  const fpNow = () => s().objects.find(o => o.type.startsWith('fp_'))
  const foot = (o) => m.rackFootprint(o)
  const doc = () => JSON.parse(JSON.stringify({ objects: s().objects }))
  const drag = (a, b) => { m.FT.startFill(a); m.FT.moveFill(b, s().objects, GS); return m.FT.commitFill(m.useCanvasStore) }
  const innerBox = (fp) => { const p = m.FR.innerOutline(fp, GS), xs = p.map(q => q.x), ys = p.map(q => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } }
  // a static render reads each store's initial state: hand it the live one
  const note = () => { for (const st of [m.RG.useRowGroup, m.PL.usePlacement, m.useCanvasStore]) Object.assign(st.getInitialState(), st.getState()); return renderToStaticMarkup(createElement(m.Bar.RowGroupBar)) }
  /** What Esc does once nothing is selected (hooks/useKeyboardShortcuts.js): end picking, else clear the group. */
  const esc = () => { const g = m.RG.useRowGroup.getState(); if (g.picking) { g.setPicking(false); return true } if (g.keys.length || g.pending) { m.RG.clearGroup(); return true } return false }

  /* ── 1. Dismiss ── */

  /** A layout with generated sections: Generate on the rectangle, Fill racking over the whole L / T. */
  const sectioned = (type, w, h) => {
    if (type === 'fp_rect') m.generateAndPlace({ ...(vert ? { lengthFt: 200, widthFt: 480 } : { lengthFt: 480, widthFt: 200 }), gridXFt: 0, gridYFt: 0, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0, maxRunFt: 120 })
    else {
      s().placeFpObject({ type, widthFt: w, heightFt: h })
      const fp = fpNow()
      drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width + 7.1, y: fp.y + fp.height + 3.3 })
    }
    // a row number found in at least two sections
    const by = new Map()
    for (const r of racks()) if (r.rowIndex != null && r.genSection != null) { const k = r.rowIndex; if (!by.has(k)) by.set(k, new Set()); by.get(k).add(r.genSection) }
    const K = [...by].find(([, secs]) => secs.size >= 2)[0]
    return K
  }

  it.each(SHAPES)('ZP-dismiss (%s): a row moved across in a Row group shows the bar; its ✕ (and Esc, once nothing is selected) closes it — the moved row stays moved, the other rows are untouched, nothing is applied', async (_, type, w, h) => {
    const K = sectioned(type, w, h)
    await m.RG.flushRowGroupWatcher()
    m.RG.clearGroup()
    const row = racks().filter(r => r.rowIndex === K)
    const r = row[0], mineIds = row.filter(o => o.genSection === r.genSection).map(o => o.id)   // the whole row: every piece of it in its section
    const others = JSON.parse(JSON.stringify(row.filter(o => o.genSection !== r.genSection)))
    expect(m.RG.addRowOf(r.id, { otherSections: true })).toBeGreaterThanOrEqual(2)
    const move = async () => { s().moveObjects(mineIds, vert ? GS : 0, vert ? 0 : GS); await m.RG.flushRowGroupWatcher() }
    await move()
    const moved = JSON.parse(JSON.stringify(s().objects.find(o => o.id === r.id)))
    expect(m.RG.useRowGroup.getState().pending).toBeTruthy()
    expect(note()).toContain('aria-label="Don&#x27;t apply"')
    // the bar's ✕: nothing applied, the group stays
    m.RG.dismissPending()
    expect(m.RG.useRowGroup.getState().pending).toBe(null)
    expect(m.RG.useRowGroup.getState().keys.length).toBeGreaterThanOrEqual(2)
    expect(note()).not.toContain('Don&#x27;t apply')
    // Esc with nothing selected: the pending apply and the group are cleared
    await move()
    expect(m.RG.useRowGroup.getState().pending).toBeTruthy()
    expect(esc()).toBe(true)
    expect(m.RG.useRowGroup.getState()).toMatchObject({ pending: null, keys: [] })
    expect(note()).not.toContain('Apply to the other')
    { const now = s().objects.find(o => o.id === r.id); expect(now.x).toBeCloseTo(vert ? moved.x + GS : moved.x, 6); expect(now.y).toBeCloseTo(vert ? moved.y : moved.y + GS, 6) }
    for (const o of others) { const now = s().objects.find(q => q.id === o.id); expect([now.x, now.y]).toEqual([o.x, o.y]) }
    // and nothing left for the next Esc
    expect(esc()).toBe(false)
    expect(readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')).toMatch(/if \(g\.keys\.length \|\| g\.pending\) \{ clearGroup\(\); return \}/)
  })

  /* ── 2. Placing a zone ── */

  const zoneItem = () => ({ id: 'z' + Math.random().toString(36).slice(2, 8), type: 'zone_staging', label: 'Staging', x: 0, y: 0, width: 40 * GS, height: 30 * GS, fill: '#d9770622', stroke: '#d97706', strokeWidth: 1.5, opacity: 1, rotation: 0, layerId: 'zones' })
  const ghost = () => { const a = m.PL.usePlacement.getState().active; const z = a.items[0]; return { x: z.x + a.dx, y: z.y + a.dy, w: z.width, h: z.height } }

  it.each(SHAPES)('ZP-place (%s): a zone from the left panel follows the mouse; it stays within the walls and snaps onto a wall face; Esc cancels (nothing placed, no history); the click drops it over the area, which refits at once — no bay under it, one undo step with the zone, one undo restores both', async (_, type, w, h, fw, fh) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = fpNow(), ib = innerBox(fp)
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width * fw + 7.1, y: fp.y + fp.height * fh + 3.3 })
    expect(racks().length).toBeGreaterThan(3)
    const a = areaNow(), before = doc(), n0 = s().history.length
    // follows the mouse: centred on the pointer, mid-area
    const mid = { x: a.x + a.width / 2 + 3.3, y: a.y + a.height / 2 + 7.7 }
    expect(m.PL.startPlacement(m.useCanvasStore, [zoneItem()], { at: mid })).toBe(true)
    m.PL.movePlacement(m.useCanvasStore, mid, 1)
    let g = ghost()
    expect(g.x + g.w / 2).toBeCloseTo(mid.x, 6); expect(g.y + g.h / 2).toBeCloseTo(mid.y, 6)
    // 8 px off the inner top-left corner: snapped onto both wall faces
    m.PL.movePlacement(m.useCanvasStore, { x: ib.x + 20 * GS + 8, y: ib.y + 15 * GS + 8 }, 1)
    g = ghost()
    expect([g.x, g.y]).toEqual([ib.x, ib.y])
    // pushed past the wall: kept within it
    m.PL.movePlacement(m.useCanvasStore, { x: ib.x - 10 * GS, y: ib.y + 15 * GS + 200 }, 1)
    expect(ghost().x).toBeCloseTo(ib.x, 6)
    // Esc: nothing placed, no history
    expect(m.PL.cancelPlacement()).toBe(true)
    expect(doc()).toEqual(before)
    expect(s().history.length).toBe(n0)
    // the click over the area's racks: dropped, the area refitted, one entry
    m.PL.startPlacement(m.useCanvasStore, [zoneItem()], { at: mid })
    m.PL.movePlacement(m.useCanvasStore, mid, 1)
    const zb = ghost()
    expect(racks().some(r => overlap(foot(r), zb))).toBe(true)
    expect(m.PL.commitPlacement(m.useCanvasStore)).toBe(true)
    await tick()
    expect(m.AT.useAreaPrompt.getState().question).toBeNull()
    const z = s().objects.find(o => o.type === 'zone_staging')
    expect(z).toBeTruthy()
    expect(z.parentId).toBe(fp.id)
    for (const r of racks()) for (const b of m.RA.bayBoxes(r, GS)) expect(overlap(b, zb)).toBe(false)
    expect(s().history.length).toBe(n0 + 1)
    expect(m.LC.checkLayout(s().objects, { gridSize: GS }).errors).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
  })
})
