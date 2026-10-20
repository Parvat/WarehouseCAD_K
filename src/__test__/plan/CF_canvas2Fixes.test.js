// CF — canvas2-fixes: (1) columns above aisle labels, a label sliding off a column; (2) a zone's edge snaps as
// a zone move does; (3) a column in an aisle shows its clear distance on BOTH sides, to a rack, a zone or the wall.
// Both orientations throughout.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint, MHE_PROFILES, aisleColumnBlocks } from '../../generate/columnCheck'
import { layoutColumns } from '../../generate/usableCapacity'
import { aisleLabelLayout, aisleLabelStation, aisleLabelHit, columnRectsOf, AISLE_LABEL_FONT_PX, AISLE_LABEL_PADX_PX } from '../../canvas2/hitTest'
import { aisleLabelOps, aisleLabelBoxes, clearanceOps } from '../../render/labelOps'
import { aisleLabelScale, labelScale } from '../../render/labelSize'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { zoneResizeBox, snapOffKey } from '../../canvas2/zoneResizeSnap'
import { columnFaceBlocks } from '../../generate/faceAisles'
import { withFaceBlocks, clearanceSource } from '../../canvas2/clearanceSource'
import { clearanceMarks } from '../../canvas2/aisleMarks'
import { buildLayoutSVG } from '../../export/pdfExport'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const F = (ft) => ft * GS
const read = (p) => readFileSync('src/' + p, 'utf8').split('\r\n').join('\n')
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
/* the saved real layout (23 columns standing in aisles), vertical as saved or turned to horizontal rows */
function savedFill(vert) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })), area = objs.find(o => o.type === 'racking_area')
  const out = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
  if (vert) return out
  return out.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
}
/* a rack whose WORLD footprint is { x, y, w, h } (ft): run along x when horizontal, along y when vertical (turned 90°) */
function rack(id, fx, fy, fw, fh, vert, type = 'rack_double_row') {
  const beams = Array.from({ length: Math.max(1, Math.round((vert ? fh : fw) / 8.5)) }, () => 96)
  if (!vert) return { id, type, x: F(fx), y: F(fy), width: F(fw), height: F(fh), rotation: 0, beams, levels: 4, parentId: 'fp', flueSpaceIn: 6, palletWIn: 40 }
  const cx = F(fx + fw / 2), cy = F(fy + fh / 2), width = F(fh), height = F(fw)
  return { id, type, x: cx - width / 2, y: cy - height / 2, width, height, rotation: 90, beams, levels: 4, parentId: 'fp', flueSpaceIn: 6, palletWIn: 40 }
}
/* a scene laid out horizontally in ft, transposed for vertical: building, racks, zones, one column */
function scene(vert, { racks = [], zones = [], col = null, wallFt = 0.5, W = 100, H = 60 }) {
  const P = (x, y) => (vert ? { x: F(y), y: F(x) } : { x: F(x), y: F(y) })
  const bw = vert ? F(H) : F(W), bh = vert ? F(W) : F(H)
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: bw, height: bh, wallThicknessFt: wallFt, fpVerts: [{ x: 0, y: 0 }, { x: bw, y: 0 }, { x: bw, y: bh }, { x: 0, y: bh }] }
  const out = [fp]
  for (const [id, x, y, w, h, type] of racks) out.push(vert ? rack(id, y, x, h, w, true, type) : rack(id, x, y, w, h, false, type))
  for (const [id, x, y, w, h] of zones) { const p = P(x, y); out.push({ id, type: 'zone_office', ...p, width: vert ? F(h) : F(w), height: vert ? F(w) : F(h) }) }
  if (col) { const p = P(col[0], col[1]); out.push({ id: 'cg', type: 'column_grid', ...p, spacingX: [F(500)], spacingY: [F(500)], columnW: F(1), columnH: F(1), showGrid: true }) }
  return out
}
/* an aisle label's pill and arrow as drawn (aisleLabelOps), against column squares */
function labelHitsColumns(L, lz, cols) {
  const ops = aisleLabelOps(L, lz)
  const pill = ops.find(o => o.op === 'rect'), line = ops.find(o => o.op === 'line')
  const [x1, y1, x2, y2] = line.points
  const lineBox = { x: Math.min(x1, x2) - 0.5, y: Math.min(y1, y2) - 0.5, w: Math.abs(x2 - x1) + 1, h: Math.abs(y2 - y1) + 1 }
  return cols.some(c => hit(pill, c) || hit(lineBox, c))
}

/* ── 1. columns above aisle labels; a label slides off a column ───────────────────────────────────────── */
describe.each([['horizontal', false], ['vertical', true]])('CF-1 — %s', (_, vert) => {
  // two facing pairs with a 12 ft aisle between, 60 ft long; a column dead in the middle of the aisle
  const two = (colAt) => scene(vert, { racks: [['a', 20, 10, 60, 9], ['b', 20, 31, 60, 9]], col: colAt })
  const aisle = { id: 'ai', type: 'aisle', row1Id: 'a', row2Id: 'b' }
  const lz = aisleLabelScale(aisle, 'medium', GS)
  it('CF-slide: a column under the label at mid-aisle — the pill and its arrow slide along the aisle to the nearest spot clear of it, inside the aisle; with no column the label is mid-aisle', () => {
    const plain = aisleLabelLayout(aisle, two(null), GS, { lz })
    expect(plain.positions[0]).toBeCloseTo(F(50), 6)                                 // run from 20 ft, 60 ft long: mid at 50 ft
    const objs = two([50, 25.5]), cols = columnRectsOf(objs, GS)
    expect(labelHitsColumns(plain, lz, cols)).toBe(true)                             // at mid it would sit on the column
    const L = aisleLabelLayout({ ...aisle }, objs, GS, { lz })
    expect(L.positions[0]).not.toBeCloseTo(F(50), 3)
    expect(labelHitsColumns(L, lz, cols)).toBe(false)
    // the NEAREST clear spot: a pixel past its margin back toward the column, it would touch it again
    const back = L.positions[0] - Math.sign(L.positions[0] - F(50)) * (2 / lz + 1)   // past its 2/lz margin
    expect(labelHitsColumns({ ...L, positions: [back] }, lz, cols)).toBe(true)
    expect(Math.abs(L.positions[0] - F(50))).toBeLessThan(F(5))
    expect(L.positions[0]).toBeGreaterThan(F(20)); expect(L.positions[0]).toBeLessThan(F(80))
    // the pick finds it where it is drawn, not where it was
    const [hx, hy] = L.isHoriz ? [L.positions[0], L.labelMid] : [L.labelMid, L.positions[0]]
    expect(aisleLabelHit(aisle, objs, hx, hy, 1, GS)).toBe(true)
  })
  it('CF-slide-break: a column off the label\'s line (beside the arrow, not under the pill) still blocks the ARROW; a column outside the aisle moves nothing; an aisle full of columns keeps the label mid-aisle (never hidden — the columns draw above it)', () => {
    // in the aisle, off the pill's band but on the arrow's: near one row's face
    const nearFace = two([50, 19.6]), L1 = aisleLabelLayout(aisle, nearFace, GS, { lz })
    expect(labelHitsColumns(L1, lz, columnRectsOf(nearFace, GS))).toBe(false)
    expect(L1.positions[0]).not.toBeCloseTo(F(50), 3)
    // outside the aisle (inside a rack's run, across from the gap): no slide
    const outside = two([50, 5])
    expect(aisleLabelLayout(aisle, outside, GS, { lz }).positions[0]).toBeCloseTo(F(50), 6)
    // every foot of the aisle has a column: nowhere clear → mid
    const cols = Array.from({ length: 61 }, (_, i) => { const c = { x: F(20 + i) - F(0.5), y: F(25), w: F(1), h: F(1) }; return vert ? { x: c.y, y: c.x, w: c.h, h: c.w } : c })
    expect(aisleLabelLayout(aisle, two(null), GS, { lz, columns: cols }).positions[0]).toBeCloseTo(F(50), 6)
    // the station rule itself: a run shorter than the pill → mid
    const t = '12\' 0"', fs = AISLE_LABEL_FONT_PX / lz, pw = t.length * fs * 0.62 + (AISLE_LABEL_PADX_PX / lz) * 2
    expect(aisleLabelStation({ isHoriz: true, gapLo: 0, gapHi: F(12), labelMid: F(6), runLo: 0, runLen: pw / 2, text: t }, [{ x: 0, y: F(5), w: pw, h: F(1) }], lz)).toBeCloseTo(pw / 4, 6)
  })
  it('CF-real: on the saved layout, every aisle label (at every preset size) keeps its pill and arrow off every column; the cross-aisle labels too', () => {
    const base = savedFill(vert), cols = layoutColumns(base, GS)
    let n = 0
    for (const size of ['small', 'medium', 'large', 'xlarge']) {
      for (const a of base.filter(o => o.type === 'aisle')) {
        const z = aisleLabelScale(a, size, GS), L = aisleLabelLayout(a, base, GS, { lz: z })
        if (!L) continue
        expect(labelHitsColumns(L, z, cols), `${size} ${a.id}`).toBe(false)
        n++
      }
      for (const L of crossAisleLabels(base, GS, { lz: labelScale(size, GS) })) expect(labelHitsColumns(L, labelScale(size, GS), cols)).toBe(false)
    }
    expect(n).toBeGreaterThan(100)
  })
})

describe('CF-1 — drawing order', () => {
  it('CF-order: the canvas draws the scene body, then the labels and marks, then the columns, then the selection chrome; the PDF prints the columns after the labels layer', () => {
    const c = read('canvas2/Canvas2.jsx')
    const at = ['<Scene listening part="body" />', '<Overlays part="marks"', '<Scene listening part="columns" />', '<Overlays part="chrome"'].map(k => c.indexOf(k))
    expect(at.every((v, i) => v > 0 && (i === 0 || v > at[i - 1]))).toBe(true)
    const scene = read('canvas2/Scene.jsx')
    expect(scene).toMatch(/if \(part === 'columns'\) return <>\{colEls\}<\/>/)
    expect(scene).toMatch(/\{part === 'all' && colEls\}/)
    const ov = read('canvas2/Overlays.jsx')
    expect(ov).toMatch(/const marksPart = part !== 'chrome', chromePart = part !== 'marks'/)
    for (const v of [false, true]) {
      const objs = savedFill(v), svg = buildLayoutSVG(objs, [], GS).svg, color = objs.find(o => o.type === 'column_grid').stroke || '#3B6FB5'
      expect(svg.indexOf(`fill="${color}" opacity="0.85"`)).toBeGreaterThan(svg.indexOf('<g class="labels">'))
    }
  })
})

/* ── 2. zone resize snapping ──────────────────────────────────────────────────────────────────────────── */
describe.each([['horizontal', false], ['vertical', true]])('CF-2 — %s', (_, vert) => {
  // a zone 30×20 ft at (10, 30); a rack face at x = 52.3 ft (its left side); another zone's edge at y = 55.3 ft; wall
  // inner face 99.5 ft — all off the 1 ft grid, so a snap onto them is theirs, not the grid's
  const objs = scene(vert, { racks: [['r', 52.3, 10, 30, 9]], zones: [['z', 10, 30, 30, 20], ['z2', 60, 55.3, 20, 4]] })
  const zone = objs.find(o => o.id === 'z')
  const opts = (more = {}) => ({ objects: objs, gridSize: GS, zoom: 1, snapToGrid: true, snapUnit: 'ft', ...more })
  // "right edge" in the horizontal layout = the edge that moves along x; vertical: the same edge, turned (bottom)
  const E = vert ? 'bc' : 'mr', alongD = (d) => (vert ? [0, d] : [d, 0])
  const edgeOf = (b) => (vert ? b.y + b.height : b.x + b.width)
  it('CF-snap-rack: the edge dragged near a rack face snaps exactly onto it, a guide line drawn on that face', () => {
    const { box, guides } = zoneResizeBox(zone, E, ...alongD(F(52.3) - F(40) - 4), opts())   // 4 px short of the face
    expect(edgeOf(box)).toBeCloseTo(F(52.3), 6)
    expect(guides.some(g => g.axis === (vert ? 'y' : 'x') && Math.abs(g.val - F(52.3)) < 1e-6)).toBe(true)
  })
  it('CF-snap-zone-wall: near another zone\'s edge it snaps to it; near the wall\'s inner face to the wall (a wall guide)', () => {
    // the top edge of zone z2 (y = 55 ft) — drag z's far edge on the other axis (horizontal: bottom; vertical: right)
    const E2 = vert ? 'mr' : 'bc', d2 = (d) => (vert ? [d, 0] : [0, d])
    const { box } = zoneResizeBox(zone, E2, ...d2(F(55.3) - F(50) + 4), opts())
    expect(vert ? box.x + box.width : box.y + box.height).toBeCloseTo(F(55.3), 6)
    const toWall = zoneResizeBox(zone, E, ...alongD(F(99.5) - F(40) - 4), opts({ objects: objs.filter(o => o.id !== 'r') }))
    expect(edgeOf(toWall.box)).toBeCloseTo(F(99.5), 6)
    expect(toWall.guides.some(g => g.isWall && Math.abs(g.val - F(99.5)) < 1e-6)).toBe(true)
  })
  it('CF-snap-grid-off: far from everything the edge lands on the grid step; with snap off, on the pointer; Alt or Shift: on the pointer, no guides — the same keys as a move', () => {
    const raw = F(7.3)
    expect(edgeOf(zoneResizeBox(zone, E, ...alongD(raw), opts()).box)).toBeCloseTo(F(47), 6)
    expect(edgeOf(zoneResizeBox(zone, E, ...alongD(raw), opts({ snapToGrid: false })).box)).toBeCloseTo(F(40) + raw, 6)
    const free = zoneResizeBox(zone, E, ...alongD(F(52.3) - F(40) - 4), opts({ noSnap: true }))
    expect(edgeOf(free.box)).toBeCloseTo(F(52.3) - 4, 6)
    expect(free.guides).toEqual([])
    expect([snapOffKey({ altKey: true }), snapOffKey({ shiftKey: true }), snapOffKey({}), snapOffKey(null)]).toEqual([true, true, false, false])
  })
  it('CF-snap-break: its own old edge is never a target; a corner snaps on both axes at once; an edge dragged past the opposite one stops at the minimum size', () => {
    // 3 px out from where it started: with itself as a target it would snap back to its old edge
    const nudge = zoneResizeBox(zone, E, ...alongD(F(0.5) + 3), opts({ snapToGrid: false }))
    expect(edgeOf(nudge.box)).toBeCloseTo(F(40.5) + 3, 6)
    const corner = zoneResizeBox(zone, 'br', ...(vert ? [F(55.3) - F(50) + 4, F(52.3) - F(40) - 4] : [F(52.3) - F(40) - 4, F(55.3) - F(50) + 4]), opts())
    expect([corner.box.x + corner.box.width, corner.box.y + corner.box.height].map(v => +(v / GS).toFixed(4)).sort()).toEqual([52.3, 55.3])
    const past = zoneResizeBox(zone, E, ...alongD(-F(100)), opts())
    expect(vert ? past.box.height : past.box.width).toBe(8)
  })
  it('CF-wire: the resize uses it for zones (guide lines live, cleared on release, Alt/Shift = no snap, the wall magnet off with it); a move takes the same no-snap keys; the live W × L still shows', () => {
    const ci = read('canvas2/useCanvasInteraction.js')
    expect(ci).toMatch(/const zoneEdge = typeof origObj\.type === 'string' && origObj\.type\.startsWith\('zone_'\) && !rot/)
    expect(ci).toMatch(/const z = zoneResizeBox\(origObj, handle, pos\.x - startWorld\.x, pos\.y - startWorld\.y, \{/)
    expect(ci).toMatch(/setSmartGuides\(z\.guides\)/)
    expect(ci).toMatch(/if \(rd\) setSmartGuides\(\[\]\)/)
    expect(ci).toMatch(/snap: zoneEdge && noSnap \? 0 : 8 \/ view\.current\.zoom/)
    expect(ci.match(/const noSnap = snapOffKey\(evt\)/g).length).toBe(3)                  // resize, flue drag, plain drag
    expect(read('canvas2/ZoneEdit.jsx')).toMatch(/<ZoneSizeLabel box=\{\{ x: zone\.x, y: zone\.y, w: zone\.width, h: zone\.height \}\}/)
  })
})

/* ── 3. a column in an aisle: clear distance on both sides — rack, zone or wall ───────────────────────── */
describe.each([['horizontal', false], ['vertical', true]])('CF-3 — %s', (_, vert) => {
  const P = MHE_PROFILES.reach
  const blocks = (objs) => { const cols = layoutColumns(objs, GS); return withFaceBlocks(aisleColumnBlocks({ racks: objs.filter(o => o.type.startsWith('rack_')), columns: cols, profile: P, gridSize: GS }).aisleBlocks, cols, objs, { gridSize: GS, profile: P }) }
  it('CF-wall: a column between a rack face and the wall — measured to the face on one side and to the wall\'s inner face on the other', () => {
    // rack face at 49 ft, wall inner face at 59.5 ft, column 53.5–54.5
    const objs = scene(vert, { racks: [['r', 20, 40, 60, 9]], col: [50, 54] })
    const b = blocks(objs)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ kind: 'face', toward: 'wall', nearClearFt: 4.5, farClearFt: 5, axis: vert ? 'x' : 'y' })
    // 10.5 ft aisle with the column in it: neither side reaches travel, so both read "under travel" — both drawn
    const t = clearanceOps(b[0], layoutColumns(objs, GS)[0], labelScale('medium', GS), GS, true).filter(o => o.op === 'text').map(o => o.text).sort()
    expect(t).toEqual(["4.5' — under travel", "5' — under travel"])
  })
  it('CF-zone: a column between a rack face and a zone — measured to the zone\'s edge', () => {
    const objs = scene(vert, { racks: [['r', 20, 10, 60, 9]], zones: [['z', 20, 31, 60, 10]], col: [50, 25] })
    const b = blocks(objs)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ toward: 'zone', zoneId: 'z', nearClearFt: 5.5, farClearFt: 5.5 })
  })
  it('CF-rack: a column between two racks is the rack-to-rack aisle\'s — once, both sides, never also a face block', () => {
    const objs = scene(vert, { racks: [['a', 20, 10, 60, 9], ['b', 20, 31, 60, 9]], col: [50, 23] })
    const b = blocks(objs)
    expect(b).toHaveLength(1)
    expect(b[0].kind).toBeUndefined()
    expect([b[0].nearClearFt, b[0].farClearFt]).toEqual([3.5, 7.5])
  })
  it('CF-break: past the reach in front of a face (open floor), inside a zone, beside a rack\'s end or touching the face: no face block where there is no aisle; touching the face it still shows "0\' clear" on that side', () => {
    expect(blocks(scene(vert, { racks: [['r', 20, 5, 60, 9]], col: [50, 40], H: 80 }))).toEqual([])          // 26 ft out: open floor
    expect(blocks(scene(vert, { racks: [['r', 20, 10, 60, 9]], zones: [['z', 20, 24, 60, 10]], col: [50, 28] }))).toEqual([])   // in the zone
    expect(blocks(scene(vert, { racks: [['r', 20, 10, 30, 9]], col: [60, 14] }))).toEqual([])                 // past the rack's end
    const touch = scene(vert, { racks: [['r', 20, 40, 60, 9]], col: [50, 49.5] })
    const b = blocks(touch)
    expect(b).toHaveLength(1)
    expect(b[0].nearClearFt).toBe(0)
    const marks = clearanceMarks(b[0], layoutColumns(touch, GS)[0], 1, GS)
    expect(marks.map(m => [m.side, m.stub])).toEqual([['near', true], ['far', false]])
    const t = clearanceOps(b[0], layoutColumns(touch, GS)[0], labelScale('medium', GS), GS, true).filter(o => o.op === 'text').map(o => o.text).sort()
    expect(t.map(x => x.split(' ')[0])).toEqual(["0'", "9.5'"])
  })
  it('CF-labels: on the saved layout every column in an aisle shows BOTH its labels at every size — never one dropped, never on top of each other or of an aisle label', () => {
    const base = savedFill(vert), cols = layoutColumns(base, GS), bs = blocks(base)
    expect(bs.length).toBeGreaterThanOrEqual(23)
    for (const size of ['small', 'medium', 'large', 'xlarge']) {
      const lz = labelScale(size, GS), avoid = aisleLabelBoxes(base, GS, size)
      for (const b of bs) {
        const t = clearanceOps(b, cols[b.columnIndex], lz, GS, true, avoid).filter(o => o.op === 'text')
        expect(t).toHaveLength(2)
        expect(hit(t[0], t[1])).toBe(false)
        for (const x of t) expect(avoid.some(r => hit(x, r)), `${size}: ${x.text}`).toBe(false)
      }
    }
  })
  it('CF-source: the canvas source carries the face blocks with the rack-to-rack ones, still and while a zone is dragged (re-measured live)', () => {
    const objs = scene(vert, { racks: [['r', 20, 10, 60, 9]], zones: [['z', 20, 31, 60, 10]], col: [50, 25] })
    const cols = layoutColumns(objs, GS)
    const still = clearanceSource({ aisleBlocks: [], columns: cols, objects: objs, preview: null, gridSize: GS, profile: P })
    expect(still.blocks.map(b => b.farClearFt)).toEqual([5.5])
    const d = vert ? { dx: F(2), dy: 0 } : { dx: 0, dy: F(2) }
    const moving = clearanceSource({ aisleBlocks: [], columns: cols, objects: objs, preview: { ids: new Set(['z']), ...d }, gridSize: GS, profile: P })
    expect(moving.blocks.map(b => b.farClearFt)).toEqual([7.5])
  })
})

describe('CF-3 — shown with the aisle labels', () => {
  it('CF-gate: the clearance labels draw whenever the aisle labels do (or the Checks layer); their red shade only with the Checks layer — canvas and PDF', () => {
    const ov = read('canvas2/Overlays.jsx')
    expect(ov).toMatch(/\{\(marksOn \|\| aislesOn\) && <ColumnClearanceLabels [^>]*warnings=\{marksOn\}/)
    expect(ov).toMatch(/const on = aislesOn\n/)
    const base = savedFill(true), labelsOf = (svg) => svg.slice(svg.indexOf('<g class="labels">'))
    const aislesOnly = labelsOf(buildLayoutSVG(base, [], GS, { labels: { showAisles: true, showMarks: false } }).svg)
    expect((aislesOnly.match(/' clear</g) || []).length).toBeGreaterThanOrEqual(46)     // 23 columns × both sides
    const none = labelsOf(buildLayoutSVG(base, [], GS, { labels: { showAisles: false, showMarks: false } }).svg)
    expect(none).not.toMatch(/' clear</)
  })
})
