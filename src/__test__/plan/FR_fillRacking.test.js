// Area FR — "Fill racking": drag a box over part of a building, and on release
// it fills with racking by Generate's own logic (generate/fillRacking.js,
// utils/fillTool.js): rowBands / rowSegments, tight forklift aisles, columns,
// cross-aisles by max run, wall clearance. Clipped to the real outline (L, T),
// single rows against ANY wall, a forklift aisle along an open box edge,
// existing racks are obstacles, rows stamped like Generate, one undo step.
// Real store, the tool's own start / move / commit, the app's keepers
// installed; both orientations; a rectangle, an L and a T.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const FT = await import('../../utils/fillTool')
  const FR = await import('../../generate/fillRacking')
  const LC = await import('../../utils/layoutCheck')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { rackFootprint, MHE_PROFILES } = await import('../../generate/columnCheck')
  const { buildingSections } = await import('../../utils/syncSections')
  const CP = await import('../../utils/copyPrompt')
  const L = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  installRowEditKeeper(useCanvasStore)
  CP.installCopyWatcher(useCanvasStore, nanoid)
  return { useCanvasStore, FT, FR, LC, generateAndPlace, rackFootprint, MHE_PROFILES, buildingSections, CP }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const r3 = (v) => Math.round(v * 1000) / 1000
const EPS = 0.01

function pointIn(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
/** Clear distance between two rects (0 when they touch or overlap). */
const gapBetween = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)))

describe.each(['horizontal', 'vertical'])('FR — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  const fpOf = () => s().objects.find(o => o.type.startsWith('fp_'))
  const outline = () => m.FR.buildingOutline(fpOf())
  const bbox = (pts) => { const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } }
  /** The tool as the canvas drives it: press, drag (the plan follows), release. */
  const fill = (box) => {
    m.FT.startFill({ x: box.x, y: box.y })
    const plan = m.FT.moveFill({ x: box.x + box.w, y: box.y + box.h }, s().objects, GS)
    const n = m.FT.commitFill(m.useCanvasStore)
    return { plan, n }
  }
  const building = (type, widthFt, heightFt) => { s().placeFpObject({ type, widthFt, heightFt }); return fpOf() }
  const sig = (o) => [o.type, r3(o.x), r3(o.y), r3(o.width), r3(o.height), o.rotation || 0, (o.beams || []).join('/'), o.levels, o.rowIndex, o.genSection].join(':')
  const aisleSig = (o) => [r3(o.x), r3(o.y), r3(o.width), r3(o.height), o.rotation || 0].join(':')
  const check = () => m.LC.checkLayout(s().objects, { gridSize: GS })

  /** No rack outside the outline: every corner inside, and no outline vertex inside a rack. */
  const expectInside = () => {
    const pts = outline()
    for (const r of racks()) {
      const f = m.rackFootprint(r)
      for (const [x, y] of [[f.x + EPS, f.y + EPS], [f.x + f.w - EPS, f.y + EPS], [f.x + EPS, f.y + f.h - EPS], [f.x + f.w - EPS, f.y + f.h - EPS]]) expect(pointIn(x, y, pts)).toBe(true)
      for (const p of pts) expect(p.x > f.x + EPS && p.x < f.x + f.w - EPS && p.y > f.y + EPS && p.y < f.y + f.h - EPS).toBe(false)
    }
  }
  /** Every rack whose long side faces a wall within 3 ft is a SINGLE row. Returns
   *  how many wall-facing rows each wall edge got (by edge index). */
  const wallRows = () => {
    const pts = outline(), hits = {}
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]
      const parallel = vert ? a.x === b.x : a.y === b.y            // the rows run along x (horizontal) or y (vertical)
      if (!parallel) return
      const c = vert ? a.x : a.y, lo = Math.min(vert ? a.y : a.x, vert ? b.y : b.x), hi = Math.max(vert ? a.y : a.x, vert ? b.y : b.x)
      for (const r of racks()) {
        const f = m.rackFootprint(r)
        const [r0, r1] = vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w]
        const [s0, s1] = vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h]
        if (Math.min(r1, hi) - Math.max(r0, lo) < GS) continue
        if (Math.min(Math.abs(s0 - c), Math.abs(s1 - c)) > 3 * GS) continue
        expect(r.type, `row against wall edge ${i}`).toBe('rack_row')
        hits[i] = (hits[i] || 0) + 1
      }
    })
    return hits
  }
  const noOverlaps = () => {
    const f = racks().map(r => m.rackFootprint(r))
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) expect(overlapArea(f[i], f[j])).toBeLessThan(1)
  }

  it.each([
    ['240 × 120, 30 × 30 grid', { lengthFt: 240, widthFt: 120, gridXFt: 30, gridYFt: 30 }],
    ['1080 × 410, 25 × 30 grid', { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30 }],
  ])('FR-generate: filling the whole of a rectangle (%s) gives exactly Generate\'s racks, stamps and aisles', (_, dims) => {
    m.generateAndPlace({ ...dims, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const gen = racks().map(sig).sort(), genAisles = s().objects.filter(o => o.type === 'aisle').map(aisleSig).sort()
    expect(gen.length).toBeGreaterThan(4)
    m.useCanvasStore.setState({ objects: s().objects.filter(o => !RACK.has(o.type) && o.type !== 'aisle') })
    const { plan } = fill(bbox(outline()))
    expect(plan.rects).toHaveLength(1)
    expect(racks().map(sig).sort()).toEqual(gen)
    expect(s().objects.filter(o => o.type === 'aisle').map(aisleSig).sort()).toEqual(genAisles)
    // every placed object has its own id (the canvas keys its shapes by id)
    const ids = s().objects.map(o => o.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([['fp_l', 300, 200], ['fp_t', 360, 240]])('FR-shape: filling the whole of a %s gives single rows along every wall the rows face (the inside-corner walls included), nothing outside the outline, no overlaps, and Check layout finds nothing', (type, w, h) => {
    building(type, w, h)
    const { n, plan } = fill(bbox(outline()))
    expect(n).toBeGreaterThan(10)
    expect(plan.rects.length).toBeGreaterThan(1)
    expectInside()
    noOverlaps()
    const hits = wallRows()
    // the inside walls the rows face: parallel edges that are not on the bounding box
    const pts = outline(), bb = bbox(pts)
    const inner = pts.map((a, i) => [a, pts[(i + 1) % pts.length], i])
      .filter(([a, b]) => (vert ? a.x === b.x : a.y === b.y) && ![vert ? bb.x : bb.y, vert ? bb.x + bb.w : bb.y + bb.h].includes(vert ? a.x : a.y))
    expect(inner.length).toBeGreaterThan(0)
    for (const [, , i] of inner) expect(hits[i] || 0, `single rows along inside wall ${i}`).toBeGreaterThan(0)
    expect(check()).toEqual({ errors: [], warnings: [] })
  })

  it('FR-arms: filling each arm of an L on its own (two drags) — single rows along the inside-corner walls, nothing outside, the two fills never meet rack-to-rack, Check layout clean', () => {
    const fp = building('fp_l', 300, 200)
    const bb = bbox(outline()), sw = fp.width * 0.3, sh = fp.height * 0.3
    fill({ x: bb.x, y: bb.y, w: sw, h: bb.h - sh })                       // the stem, down to the bar
    const first = racks(), maxRow = Math.max(...first.map(o => o.rowIndex)), maxSec = Math.max(...first.map(o => o.genSection))
    fill({ x: bb.x, y: bb.y + bb.h - sh, w: bb.w, h: sh })                // the bar
    // the second fill's stamps come after the first's
    for (const o of racks().filter(r => !first.some(f => f.id === r.id))) { expect(o.rowIndex).toBeGreaterThan(maxRow); expect(o.genSection).toBeGreaterThan(maxSec) }
    expect(racks().length).toBeGreaterThan(8)
    expectInside()
    noOverlaps()
    const hits = wallRows()
    const pts = outline()
    const innerIdx = pts.findIndex((a, i) => { const b = pts[(i + 1) % pts.length]; return vert ? (a.x === b.x && a.x === bb.x + sw) : (a.y === b.y && a.y === bb.y + bb.h - sh) })
    expect(innerIdx).toBeGreaterThanOrEqual(0)
    expect(hits[innerIdx] || 0).toBeGreaterThan(0)
    expect(check().errors).toEqual([])
  })

  it('FR-open: a box edge on open floor leaves a forklift aisle along it — a half-building fill stops an aisle short of the box; a second fill of the other half stays an aisle off it too, so the two never meet rack-to-rack', () => {
    building('fp_rect', 300, 200)
    const bb = bbox(outline()), aisle = m.FR.DEFAULT_FILL_SETTINGS.aisleFt * GS
    const half = { x: bb.x, y: bb.y, w: bb.w / 2, h: bb.h }
    fill(half)
    const first = racks().map(r => m.rackFootprint(r))
    expect(first.length).toBeGreaterThan(4)
    const edge = half.x + half.w
    expect(Math.max(...first.map(f => f.x + f.w))).toBeLessThanOrEqual(edge - aisle + EPS)
    fill({ x: edge, y: bb.y, w: bb.w / 2, h: bb.h })
    const firstIds = new Set(racks().slice(0, first.length).map(r => r.id))
    const second = racks().filter(r => !firstIds.has(r.id)).map(r => m.rackFootprint(r))
    expect(second.length).toBeGreaterThan(4)
    expect(Math.min(...second.map(f => f.x))).toBeGreaterThanOrEqual(edge + aisle - EPS)
    for (const a of first) for (const b of second) expect(gapBetween(a, b)).toBeGreaterThanOrEqual(aisle - EPS)
    expect(check().errors).toEqual([])
  })

  it('FR-existing: filling over existing racks leaves them exactly as they were, and no new rack overlaps them (they are obstacles, an aisle off)', () => {
    const fp = building('fp_rect', 300, 200)
    const bb = bbox(outline()), aisle = m.FR.DEFAULT_FILL_SETTINGS.aisleFt * GS
    const W = ((4 * 3 + 3 * 96) / 12) * GS, H = ((42 * 2 + 9) / 12) * GS
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2
    s().addObject({ type: 'rack_double_row', x: cx - W / 2, y: cy - H / 2, width: W, height: H, rotation: 0, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, levels: 4, parentId: fp.id })
    s().addObject({ type: 'rack_row', x: bb.x + 20 * GS, y: bb.y + 30 * GS, width: W, height: 42 / 12 * GS, rotation: 90, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, palletWIn: 40, levels: 4, parentId: fp.id })
    const before = JSON.parse(JSON.stringify(racks()))
    const { n } = fill(bb)
    expect(n).toBeGreaterThan(4)
    for (const r of before) expect(s().objects.find(o => o.id === r.id)).toEqual(r)
    const old = before.map(r => m.rackFootprint(r))
    const added = racks().filter(r => !before.some(b => b.id === r.id)).map(r => m.rackFootprint(r))
    for (const a of added) for (const o of old) { expect(overlapArea(a, o)).toBe(0); expect(gapBetween(a, o)).toBeGreaterThanOrEqual(aisle - EPS) }
    noOverlaps()
  })

  it('FR-stamps: filled rows carry rowIndex and genSection (after the building\'s own), and Copy to other sections copies a row moved across the aisles to the same row in every other section', async () => {
    m.FT.useRackingSettings.setState({ maxRunFt: 120 })
    if (vert) building('fp_rect', 200, 480); else building('fp_rect', 480, 200)
    const { n } = fill(bbox(outline())); await m.CP.flushCopyWatcher()
    expect(n).toBeGreaterThan(8)
    for (const r of racks()) { expect(Number.isInteger(r.rowIndex)).toBe(true); expect(Number.isInteger(r.genSection)).toBe(true) }
    expect(m.CP.useCopyPrompt.getState().pending ?? null).toBeFalsy()      // a fill is a generated layout: nothing pending
    const secs = m.buildingSections(s().objects, racks()[0].id).sections.map(x => x.key)
    expect(secs.length).toBeGreaterThanOrEqual(3)
    const K = 2, S = secs[1]
    const rowIn = (sec) => s().objects.filter(o => RACK.has(o.type) && o.genSection === sec && o.rowIndex === K)
    const acrossOf = (o) => (vert ? o.x : o.y)
    const was = Object.fromEntries(secs.map(k => [k, rowIn(k).map(acrossOf)]))
    for (const k of secs) expect(was[k]).toHaveLength(1)
    const r = rowIn(S)[0]
    s().commitObjectUpdate(r.id, vert ? { x: r.x + GS } : { y: r.y + GS }); await m.CP.flushCopyWatcher()
    expect(m.CP.copyablePlan(s().objects, fpOf().id, GS)).toBeTruthy()
    m.CP.copyPending(); await m.CP.flushCopyWatcher()
    for (const k of secs) expect(rowIn(k).map(acrossOf)).toEqual([was[k][0] + GS])
  })

  it.each([['fp_rect', 300, 200], ['fp_l', 300, 200], ['fp_t', 360, 240]])('FR-check: Check layout reports no errors on a clean fill of a %s', (type, w, h) => {
    building(type, w, h)
    fill(bbox(outline()))
    expect(racks().length).toBeGreaterThan(4)
    expect(check().errors).toEqual([])
  })

  it('FR-undo: one fill is ONE undo step — one Ctrl+Z removes every rack and aisle it placed, one Ctrl+Y brings them back; Esc mid-drag places nothing', () => {
    building('fp_t', 360, 240)
    const doc = () => JSON.parse(JSON.stringify(s().objects))
    const before = doc(), n0 = s().history.length
    // Esc mid-drag: the box goes, nothing placed, no history
    m.FT.startFill({ x: -1000, y: -1000 }); m.FT.moveFill({ x: 1000, y: 1000 }, s().objects, GS)
    expect(m.FT.useFillTool.getState().plan.racks.length).toBeGreaterThan(0)
    expect(m.FT.cancelFill()).toBe(true)
    expect(m.FT.commitFill(m.useCanvasStore)).toBe(0)
    expect(doc()).toEqual(before)
    expect(s().history.length).toBe(n0)
    fill(bbox(outline()))
    const after = doc()
    expect(racks().length).toBeGreaterThan(10)
    expect(s().history.length).toBe(n0 + 1)
    s().undo()
    expect(doc()).toEqual(before)
    s().redo()
    expect(doc()).toEqual(after)
  })

  it('FR-estimate: the live plan while dragging has the rows and pallet positions the release then places', () => {
    building('fp_rect', 300, 200)
    const bb = bbox(outline())
    m.FT.startFill({ x: bb.x, y: bb.y })
    const p = m.FT.moveFill({ x: bb.x + bb.w * 0.6, y: bb.y + bb.h }, s().objects, GS)
    expect(p.rows).toBeGreaterThan(2)
    expect(p.positions).toBeGreaterThan(100)
    const ids = p.racks.map(r => r.id)
    m.FT.commitFill(m.useCanvasStore)
    expect(racks().map(r => r.id).sort()).toEqual(ids.sort())
  })
})
