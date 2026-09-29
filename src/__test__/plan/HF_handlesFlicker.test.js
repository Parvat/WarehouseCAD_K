// Area HF — (1) selection handles and rotate grips are a FIXED size on screen
// at every zoom: 10 px white resize squares (1 px accent) and a 16 px rotate
// grip on a 16 px stem, click areas 14 / 18 px; the same for a rack at any
// rotation, a selection group and a building — and none at all on an object
// under 40 px on screen (the outline alone). (2) The red "no clear
// aisle" warnings don't flicker while the whole building is dragged: a drag
// that carries every rack and column holds the check's result and moves it.
// 1080 x 410, 25 x 30, reach; horizontal and vertical.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sizingSheetLayout, columnGridObject } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { aisleColumnBlocks, MHE_PROFILES } from '../../generate/columnCheck'
import { layoutColumns } from '../../generate/usableCapacity'
import { DEFAULT_RULES } from '../../rules/defaults'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { getObjectBounds } from '../../utils/canvas'
import { computeHandleLayout, handleHitTest, HANDLE_PX, GRIP_PX, GRIP_STEM_PX, HANDLE_HIT_PX, GRIP_HIT_PX, HANDLES_MIN_OBJECT_PX } from '../../canvas2/handleGeometry'
import { computeGroupOutline } from '../../canvas2/groupRotate'
import { clearanceSource } from '../../canvas2/clearanceSource'
import { aisleWarningRect } from '../../canvas2/aisleMarks'
import { GS } from './fixtures'

let seq = 0
const newId = () => 'h' + (++seq)
const ZOOMS = [0.05, 0.2, 1]
const r3 = (v) => Math.round(v * 1000) / 1000

function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const L = 1080 * GS, W = 410 * GS
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L, height: W, fpVerts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }] }
  return rebuildAisles([fp, { ...columnGridObject(brief, 0, 0), id: 'cg', parentId: 'fp' }, ...racks], newId).objects
}
/** A few column aisles pinched (red): each side's row pulled to 3' from the column (a side already that close stays). */
function pinched(objs, n = 6) {
  const racks = objs.filter(o => o.type && o.type.startsWith('rack_')), cols = layoutColumns(objs, GS)
  const bl = aisleColumnBlocks({ racks, columns: cols, profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks.filter(q => !q.pinched && q.farClearFt > 3)
  const used = new Set(), pick = []
  for (const b of bl) { if (pick.length >= n || b.betweenRows.some(id => used.has(id))) continue; b.betweenRows.forEach(id => used.add(id)); pick.push(b) }
  let out = objs
  for (const b of pick) {
    const [lo, hi] = b.betweenRows, dLo = b.nearClearFt > 3 ? (b.nearClearFt - 3) * GS : 0, dHi = -(b.farClearFt - 3) * GS
    out = out.map(o => (o.id === lo ? { ...o, x: o.x + (b.axis === 'x' ? dLo : 0), y: o.y + (b.axis === 'y' ? dLo : 0) } : o.id === hi ? { ...o, x: o.x + (b.axis === 'x' ? dHi : 0), y: o.y + (b.axis === 'y' ? dHi : 0) } : o))
  }
  return out
}
const heldCheck = (objs) => {
  const columns = layoutColumns(objs, GS)
  return { columns, aisleBlocks: aisleColumnBlocks({ racks: objs.filter(o => o.type && o.type.startsWith('rack_')), columns, profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks }
}
/** The red warnings as drawn: each pinched block's shade, at the drawing offset, minus the drag. */
const redSet = (src, dx, dy) => src.blocks.filter(b => b.pinched).map(b => {
  const r = aisleWarningRect(b, src.cols[b.columnIndex])
  return [r.x + src.x - dx, r.y + src.y - dy, r.w, r.h].map(r3).join(',')
}).sort().join('|')
const frames = Array.from({ length: 120 }, (_, f) => [(f * 37.137) % 3000 - 1500 + 0.123 * f, (f * 17.71) % 2000 - 1000 - 0.311 * f])

describe.each(['horizontal', 'vertical'])('HF — %s', (orientation) => {
  const objs = layout(orientation)
  const rack = objs.find(o => o.type === 'rack_double_row')

  it('HF-handles: a fixed size on screen at every zoom — 10 px squares and a 16 px grip on a 16 px stem, from 20 % to 800 % (while the rack is big enough on screen to carry them) — at 0°, 90°, 180° and 270°', () => {
    expect([HANDLE_PX, GRIP_PX, GRIP_STEM_PX, HANDLE_HIT_PX, GRIP_HIT_PX]).toEqual([10, 16, 16, 14, 18])
    for (const rotation of [0, 90, 180, 270]) for (const z of [0.2, 0.4, 1, 3, 8]) {
      const L = computeHandleLayout({ ...rack, rotation }, z, GS)
      expect(r3(L.hs * 2 * z)).toBe(10)
      expect(r3(L.rotateHandle.r * 2 * z)).toBe(16)
      expect(r3((L.rotateHandle.lineY - (L.rotateHandle.ry + L.rotateHandle.r)) * z)).toBe(16)
    }
  })

  it('HF-hit: the click areas are 14 px (squares) and 18 px (grip) on screen, a little bigger than drawn, at every zoom and rotation', () => {
    for (const rotation of [0, 90, 180, 270]) for (const z of [0.2, 1, 3, 8]) {
      const o = { ...rack, rotation }
      const L = computeHandleLayout(o, z, GS), b = getObjectBounds(o)
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2, t = (rotation * Math.PI) / 180
      const world = (p) => ({ x: cx + (p.x - cx) * Math.cos(t) - (p.y - cy) * Math.sin(t), y: cy + (p.x - cx) * Math.sin(t) + (p.y - cy) * Math.cos(t) })
      const at = (p, sx, sy) => { const w = world({ x: p.x + sx / z, y: p.y + sy / z }); return handleHitTest(o, w.x, w.y, z, GS) }
      const ml = L.positions.ml
      expect(at(ml, 0, 7 - 0.5)).toBe('ml')
      expect(at(ml, 0, 7 + 0.5)).toBe(null)
      const g = { x: L.rotateHandle.rx, y: L.rotateHandle.ry }
      expect(at(g, 9 - 0.5, 0)).toBe('rotate')
      expect(at(g, 9 + 0.5, 0)).toBe(null)
    }
  })

  it('HF-grips: a selection group\'s and a building\'s rotate grips are the same fixed size (16 px drawn on a 16 px stem, 18 px click area) at every zoom', () => {
    // the building's grip (fpRotate.js imports the Konva painters, so it is read here, not run)
    const fpr = readFileSync('src/canvas2/fpRotate.js', 'utf8')
    expect(fpr).toMatch(/const z = handleSizes\(zoom, gridSize\)/)
    expect(fpr).toMatch(/const r = z\.grip \/ 2/)
    expect(fpr).toMatch(/return Math\.hypot\(worldX - h\.rx, worldY - h\.ry\) <= h\.hitR/)
    const two = objs.filter(o => o.type === 'rack_double_row').slice(0, 2)
    for (const z of [0.2, 1, 3, 8]) {
      const g = computeGroupOutline(two, z, two, GS)
      expect([r3(g.r * 2 * z), r3(g.hitR * 2 * z), r3((g.ly - (g.hy + g.r)) * z)]).toEqual([16, 18, 16])
    }
  })

  it('HF-hide: an object under 40 px on screen (its short side) shows no handles and no grip, and none can be hit; zoomed in past that they are back at full size — racks at any turn, a selection group, a building', () => {
    expect(HANDLES_MIN_OBJECT_PX).toBe(40)
    // whenever handles show, they are small against the object: a square at most 1/4 of it, the grip at most 0.4
    expect(HANDLE_PX / HANDLES_MIN_OBJECT_PX).toBeLessThanOrEqual(0.25)
    expect(GRIP_PX / HANDLES_MIN_OBJECT_PX).toBeLessThanOrEqual(0.4)
    const b0 = getObjectBounds(rack), short = Math.min(b0.width, b0.height)
    const zSmall = (HANDLES_MIN_OBJECT_PX - 1) / short, zBig = (HANDLES_MIN_OBJECT_PX + 1) / short
    for (const rotation of [0, 90, 180, 270]) {
      const o = { ...rack, rotation }
      const small = computeHandleLayout(o, zSmall, GS)
      expect(small.enabled).toEqual([])
      expect(small.canRotate).toBe(false)
      expect(small.rotateHandle).toBe(null)
      // where the handles would be: nothing to hit
      const b = getObjectBounds(o), cx = b.x + b.width / 2, cy = b.y + b.height / 2, t = (rotation * Math.PI) / 180
      const world = (p) => ({ x: cx + (p.x - cx) * Math.cos(t) - (p.y - cy) * Math.sin(t), y: cy + (p.x - cx) * Math.sin(t) + (p.y - cy) * Math.cos(t) })
      const L = computeHandleLayout(o, zBig, GS)
      for (const p of [L.positions.ml, L.positions.mr]) { const w = world(p); expect(handleHitTest(o, w.x, w.y, zSmall, GS)).toBe(null) }
      const big = computeHandleLayout(o, zBig, GS)
      expect(big.enabled).toEqual(['ml', 'mr'])
      expect(big.canRotate).toBe(true)
      expect(r3(big.hs * 2 * zBig)).toBe(10)                                       // full size
      const w = world(big.positions.ml)
      expect(handleHitTest(o, w.x, w.y, zBig, GS)).toBe('ml')
    }
    // a selection group: the outline stays, the grip goes
    const two = objs.filter(o => o.type === 'rack_double_row').slice(0, 2)
    const g1 = computeGroupOutline(two, 1, two, GS)
    const gs = Math.min(g1.maxX - g1.minX, g1.maxY - g1.minY)
    const gSmall = computeGroupOutline(two, (HANDLES_MIN_OBJECT_PX - 1) / gs, two, GS)
    expect(gSmall.showGrip).toBe(false)
    expect(computeGroupOutline(two, (HANDLES_MIN_OBJECT_PX + 1) / gs, two, GS).showGrip).toBe(true)
    expect(readFileSync('src/canvas2/GroupRotateOverlay.jsx', 'utf8')).toMatch(/\{g\.showGrip && <RotateGrip /)
    expect(readFileSync('src/canvas2/groupRotate.js', 'utf8')).toMatch(/if \(!g \|\| !g\.showGrip\) return false/)
    // a building: no grip (fpRotate.js imports the Konva painters, so it is read here, not run)
    expect(readFileSync('src/canvas2/fpRotate.js', 'utf8')).toMatch(/if \(!bigEnoughForHandles\(b\.width, b\.height, zoom\)\) return null/)
  })

  it('HF-flicker: dragging the whole building, the set of red warnings is identical on every frame (the held result moves with it)', () => {
    const p = pinched(objs)
    const held = heldCheck(p)
    const ids = new Set(p.map(o => o.id))
    const src0 = clearanceSource({ ...held, objects: p, preview: null, gridSize: GS, profile: MHE_PROFILES.reach })
    const want = redSet(src0, 0, 0)
    expect(held.aisleBlocks.filter(b => b.pinched).length).toBeGreaterThan(0)          // there ARE red warnings to keep steady
    for (const [dx, dy] of frames) {
      const s = clearanceSource({ ...held, objects: p, preview: { ids, dx, dy }, gridSize: GS, profile: MHE_PROFILES.reach })
      expect(s.blocks).toBe(held.aisleBlocks)                                 // not recomputed
      expect([s.x, s.y]).toEqual([dx, dy])                                    // moved with the drag
      expect(redSet(s, dx, dy)).toBe(want)
    }
  })

  it('HF-multi: a multi-select holding every rack and the column grid moves the warnings the same way; a partial one re-checks, and rows it does not move keep their warnings on every frame', () => {
    const p = pinched(objs)
    const held = heldCheck(p)
    const all = new Set(p.filter(o => (o.type && o.type.startsWith('rack_')) || o.type === 'column_grid').map(o => o.id))
    const want = redSet(clearanceSource({ ...held, objects: p, preview: null, gridSize: GS, profile: MHE_PROFILES.reach }), 0, 0)
    for (const [dx, dy] of frames.slice(0, 40)) {
      const s = clearanceSource({ ...held, objects: p, preview: { ids: all, dx, dy }, gridSize: GS, profile: MHE_PROFILES.reach })
      expect(s.blocks).toBe(held.aisleBlocks)
      expect(redSet(s, dx, dy)).toBe(want)
    }
    // a partial selection: one rack, not pinched, moved a little along its row
    const moving = p.find(o => o.type === 'rack_double_row' && !held.aisleBlocks.some(b => b.pinched && b.betweenRows.includes(o.id)))
    const part = new Set([moving.id])
    const untouched = (s) => s.blocks.filter(b => b.pinched && !b.betweenRows.includes(moving.id)).map(b => { const r = aisleWarningRect(b, s.cols[b.columnIndex]); return [r.x, r.y, r.w, r.h].map(r3).join(',') }).sort().join('|')
    const base = untouched(clearanceSource({ ...held, objects: p, preview: null, gridSize: GS, profile: MHE_PROFILES.reach }))
    for (let f = 1; f <= 30; f++) {
      const s = clearanceSource({ ...held, objects: p, preview: { ids: part, dx: orientation === 'horizontal' ? f * 0.37 : 0, dy: orientation === 'vertical' ? f * 0.37 : 0 }, gridSize: GS, profile: MHE_PROFILES.reach })
      expect(s.blocks).not.toBe(held.aisleBlocks)                             // really re-checked
      expect(untouched(s)).toBe(base)
    }
  })
})

describe('HF — wiring', () => {
  it('HF-wire: the painters draw the layout\'s sizes: white squares with a 1 px accent border, and one shared rotate grip for racks, groups and buildings', () => {
    const src = (f) => readFileSync(f, 'utf8')
    const rh = src('src/canvas2/ResizeHandlesOverlay.jsx')
    expect(rh).toMatch(/x=\{hp\.x - hs\} y=\{hp\.y - hs\} width=\{hs \* 2\} height=\{hs \* 2\}\s*\n\s*fill=\{HANDLE_FILL\} stroke=\{HANDLE_ACCENT\} strokeWidth=\{1\}/)
    expect(rh).toMatch(/<RotateGrip x=\{rx\} y=\{ry\} r=\{r\} sx=\{rx\} sy=\{lineY\} \/>/)
    expect(src('src/canvas2/GroupRotateOverlay.jsx')).toMatch(/<RotateGrip x=\{hx\} y=\{hy\} r=\{r\}/)
    expect(src('src/canvas2/FpRotateHandleOverlay.jsx')).toMatch(/<RotateGrip x=\{rx\} y=\{ry\} r=\{r\}/)
    expect(src('src/canvas2/handleGeometry.js')).toMatch(/HANDLE_FILL = '#ffffff'/)
    expect(src('src/canvas2/DimensionLabels.jsx')).toMatch(/<Group name="column-clearance-labels" listening=\{false\} x=\{src\.x\} y=\{src\.y\}>/)
  })
})
