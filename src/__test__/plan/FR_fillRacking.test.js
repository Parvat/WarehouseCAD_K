// Area FR — "Fill racking": drag a box over part of a building, and on release
// it fills with racking by Generate's own logic (generate/fillRacking.js,
// utils/fillTool.js): rowBands / rowSegments, tight forklift aisles, columns,
// cross-aisles by max run. The box IS the racking area, a window on one
// pattern walked from the drag's start edges: clipped to the walls' inner face;
// on a rectangle the edge rows flush on the box edges and single — wall or open
// floor — the rows between back-to-back, no aisle added there; on an L / T the
// rows run straight through the elbow, a pair a wall cuts shown as its half;
// existing racks are obstacles (an aisle off); rows stamped like Generate; one undo step.
// Real store, the tool's own start / move / commit, the app's keepers
// installed; both orientations; a rectangle, an L and a T.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GS } from './fixtures'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject, aisleObjectsForRacks } from '../../generate/traceGenerate'
import { DEFAULT_RULES } from '../../rules/defaults'

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

  /** No rack past a wall: every corner inside the walls' inner face, and no inner-face vertex inside a rack. */
  const expectInside = () => {
    const pts = m.FR.innerOutline(fpOf(), GS)
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
    ['240 × 120', 240, 120],
    ['1080 × 410', 1080, 410],
  ])('FR-generate: filling the whole of a rectangle (%s) gives exactly Generate\'s walk over the same clear floor — its rows, aisles, cross-aisles and stamps — with the racking flush on the inner wall faces', (_, L, W) => {
    const fp = building('fp_rect', L, W)
    const wt = fp.wallThicknessFt * GS, ix = fp.x + wt, iy = fp.y + wt
    // Generate over the inner floor, no wall clearance (the fill's rule: the box is the racking area)
    const brief = { lengthFt: (fp.width - 2 * wt) / GS, widthFt: (fp.height - 2 * wt) / GS, gridXFt: 0, gridYFt: 0, mhe: 'reach', orientation, rackType: 'rack_double_row', endClearFt: 0, levels: 4 }
    const want = sizingSheetLayout(brief, DEFAULT_RULES).map(p => placementToObject(p)).map(o => ({ ...o, x: o.x + ix, y: o.y + iy }))
    expect(want.length).toBeGreaterThan(4)
    const { plan } = fill(bbox(outline()))
    expect(plan.rects).toHaveLength(1)
    const key = (o) => [o.type, r3(o.x), r3(o.y), r3(o.width), r3(o.height), o.rotation || 0, (o.beams || []).join('/'), o.rowIndex, o.genSection].join(':')
    expect(racks().map(key).sort()).toEqual(want.map(key).sort())
    // flush on the inner faces: the first and last rows, and the run's start
    const f = racks().map(r => m.rackFootprint(r))
    const lo = (q) => (vert ? q.x : q.y), hi = (q) => (vert ? q.x + q.w : q.y + q.h)
    expect(Math.min(...f.map(lo))).toBeCloseTo(vert ? ix : iy, 6)
    expect(Math.max(...f.map(hi))).toBeCloseTo(vert ? fp.x + fp.width - wt : fp.y + fp.height - wt, 6)
    expect(Math.min(...f.map(q => (vert ? q.y : q.x)))).toBeCloseTo(vert ? iy : ix, 6)
    // the wall rows are singles
    for (const q of racks()) { const g = m.rackFootprint(q); if (Math.abs(lo(g) - (vert ? ix : iy)) < 1e-6) expect(q.type).toBe('rack_row') }
    // aisles: one per pair of facing rows, each with its own id (the canvas keys its shapes by id)
    expect(s().objects.filter(o => o.type === 'aisle').length).toBe(aisleObjectsForRacks(want).length)
    const ids = s().objects.map(o => o.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([['fp_l', 300, 200], ['fp_t', 360, 240]])('FR-shape: filling the whole of a %s lays ONE pattern over it — every row runs straight through the elbow on its one place across, the start wall\'s row single and flush on it, a single elsewhere only where its pair is cut by a wall; nothing outside the outline, no overlaps, and Check layout finds nothing', (type, w, h) => {
    building(type, w, h)
    const { n, plan } = fill(bbox(outline()))
    expect(n).toBeGreaterThan(10)
    expect(plan.rects.length).toBeGreaterThan(1)
    expectInside()
    noOverlaps()
    const stackOf = (f) => (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
    const runOf = (f) => (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
    // one row index, one place across: no row offset where the region turns a corner
    const rows = new Map()
    for (const r of racks()) {
      const [s0, s1] = stackOf(m.rackFootprint(r)), at = rows.get(r.rowIndex) || []
      at.push({ s0, s1, type: r.type }); rows.set(r.rowIndex, at)
    }
    for (const at of rows.values()) {
      const pair = at.filter(q => q.type === 'rack_double_row')
      for (const q of pair) { expect(q.s0).toBeCloseTo(pair[0].s0, 6); expect(q.s1).toBeCloseTo(pair[0].s1, 6) }
      // a single is a half of that row's pair: flush with one of its faces
      if (pair.length) for (const q of at.filter(x => x.type === 'rack_row')) expect(Math.abs(q.s0 - pair[0].s0) < 1e-6 || Math.abs(q.s1 - pair[0].s1) < 1e-6).toBe(true)
    }
    // the start wall (the drag began at the outline's top-left): its row single, flush on the inner face
    const inner = m.FR.innerOutline(fpOf(), GS), face = Math.min(...inner.map(p => (vert ? p.x : p.y)))
    const first = racks().filter(r => Math.abs(stackOf(m.rackFootprint(r))[0] - face) < 1e-3)
    expect(first.length).toBeGreaterThan(0)
    for (const r of first) expect(r.type).toBe('rack_row')
    // a single row's other half, on its run, would cross a wall: its pair is cut
    const depth = 42 / 12 * GS, pairD = (2 * 42 + 9) / 12 * GS
    for (const r of racks().filter(o => o.type === 'rack_row')) {
      const f = m.rackFootprint(r), [s0, s1] = stackOf(f), [r0, r1] = runOf(f)
      const pair = (rows.get(r.rowIndex) || []).find(q => q.type === 'rack_double_row')
      const lo = pair ? pair.s0 : (Math.abs(s0 - face) < 1e-3 ? s1 - pairD : null)
      if (lo == null) continue
      const o0 = Math.abs(s0 - lo) < 1e-3 ? lo + pairD - depth : lo
      const other = vert ? { x: o0, y: r0, w: depth, h: r1 - r0 } : { x: r0, y: o0, w: r1 - r0, h: depth }
      const corners = [[other.x + EPS, other.y + EPS], [other.x + other.w - EPS, other.y + EPS], [other.x + EPS, other.y + other.h - EPS], [other.x + other.w - EPS, other.y + other.h - EPS]]
      const fits = corners.every(([x, y]) => pointIn(x, y, inner)) && !inner.some(p => p.x > other.x + EPS && p.x < other.x + other.w - EPS && p.y > other.y + EPS && p.y < other.y + other.h - EPS)
      expect(fits, `single row ${r.rowIndex}: its other half crosses a wall`).toBe(false)
    }
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

  /* The box is the racking area. A 300 × 200 rectangle; a box from the middle
   * of the building (open floor) past a wall (clipped to its inner face), in
   * both axes, dragged both ways. The row at each edge has its outer face
   * EXACTLY on that edge and is a SINGLE row, open floor or wall; the rows
   * between are back-to-back; no aisle on the open edge. Along the run, the racking starts exactly at
   * the edge the drag started from. "Exactly": within 0.001 px (under a
   * millionth of an inch — the region's cut positions are rounded to 1e-6 ft). */
  const edgeCase = () => {
    const fp = building('fp_rect', 300, 200)
    const wt = fp.wallThicknessFt * GS
    const inner = { x0: fp.x + wt, y0: fp.y + wt, x1: fp.x + fp.width - wt, y1: fp.y + fp.height - wt }
    return { fp, inner }
  }
  const stackLo = (f) => (vert ? f.x : f.y), stackHi = (f) => (vert ? f.x + f.w : f.y + f.h)
  const runLo = (f) => (vert ? f.y : f.x), runHi = (f) => (vert ? f.y + f.h : f.x + f.w)
  /** Drag from `a` to `b` (world px) with the tool. */
  const dragFill = (a, b) => { m.FT.startFill(a); m.FT.moveFill(b, s().objects, GS); return m.FT.commitFill(m.useCanvasStore) }

  /* The far edge three ways: past the wall (clipped to its inner face), exactly
   * on the inner face, and 6" short of it (open floor next to the wall). */
  const FAR = [['past the wall', 3 * GS], ['on the wall face', 0], ['6" off the wall', -GS / 2]]
  it.each(FAR.flatMap(([far, off]) => [[far, 'from the open edge', off, false], [far, 'from the far edge', off, true]]))('FR-edge-stack: a box from mid-building to %s, dragged %s — the first and last rows are SINGLE with their outer faces exactly on the box edges (0"), every row between is back-to-back; no aisle at the open edge', (_far, _dir, off, fromFar) => {
    const { fp, inner } = edgeCase()
    // the open edge across the stack axis, a whole number of inches off the middle
    const mid = vert ? fp.x + Math.round(fp.width / 2 / GS * 12 + 7) / 12 * GS : fp.y + Math.round(fp.height / 2 / GS * 12 + 7) / 12 * GS
    const face = vert ? inner.x1 : inner.y1
    const edge = face + off                                                            // where the box's far edge is
    const farEdge = Math.min(edge, face)                                               // where the racking must end
    const runA = vert ? fp.y - 2 * GS : fp.x - 2 * GS, runB = vert ? fp.y + fp.height + 2 * GS : fp.x + fp.width + 2 * GS
    const pt = (st, rn) => (vert ? { x: st, y: rn } : { x: rn, y: st })
    const n = fromFar ? dragFill(pt(edge, runB), pt(mid, runA)) : dragFill(pt(mid, runA), pt(edge, runB))
    expect(n).toBeGreaterThan(4)
    const f = racks().map(r => ({ r, f: m.rackFootprint(r) }))
    const minS = Math.min(...f.map(q => stackLo(q.f))), maxS = Math.max(...f.map(q => stackHi(q.f)))
    expect(minS - mid).toBeCloseTo(0, 3)                                               // 0" at the open edge
    expect(maxS - farEdge).toBeCloseTo(0, 3)                                           // 0" at the far edge / wall face
    let first = 0, last = 0, between = 0
    for (const q of f) {
      if (Math.abs(stackLo(q.f) - mid) < 1e-3) { expect(q.r.type, 'first row').toBe('rack_row'); first++ }
      else if (Math.abs(stackHi(q.f) - farEdge) < 1e-3) { expect(q.r.type, 'last row').toBe('rack_row'); last++ }
      else { expect(q.r.type, 'a row between').toBe('rack_double_row'); between++ }
    }
    expect(first).toBeGreaterThan(0); expect(last).toBeGreaterThan(0); expect(between).toBeGreaterThan(0)
    // nothing outside the box or the walls
    for (const q of f) { expect(stackLo(q.f)).toBeGreaterThanOrEqual(mid - 1e-3); expect(stackHi(q.f)).toBeLessThanOrEqual(farEdge + 1e-3) }
    expectInside()
    expect(check().errors).toEqual([])
  })

  it.each([['from the open edge', false], ['from the wall', true]])('FR-edge-run: a box from mid-building past a wall along the run, dragged %s — the racking starts exactly (0") at the edge the drag started from', (_, fromWall) => {
    const { fp, inner } = edgeCase()
    const mid = vert ? fp.y + Math.round(fp.height / 2 / GS * 12 + 5) / 12 * GS : fp.x + Math.round(fp.width / 2 / GS * 12 + 5) / 12 * GS
    const past = vert ? fp.y + fp.height + 3 * GS : fp.x + fp.width + 3 * GS
    const stA = vert ? fp.x - 2 * GS : fp.y - 2 * GS, stB = vert ? fp.x + fp.width + 2 * GS : fp.y + fp.height + 2 * GS
    const pt = (rn, st) => (vert ? { x: st, y: rn } : { x: rn, y: st })
    const n = fromWall ? dragFill(pt(past, stB), pt(mid, stA)) : dragFill(pt(mid, stA), pt(past, stB))
    expect(n).toBeGreaterThan(4)
    const f = racks().map(r => m.rackFootprint(r))
    const wall = vert ? inner.y1 : inner.x1
    if (fromWall) expect(Math.max(...f.map(runHi)) - wall).toBeCloseTo(0, 3)         // starts on the wall's inner face
    else expect(Math.min(...f.map(runLo)) - mid).toBeCloseTo(0, 3)                    // starts on the open edge: no aisle
    for (const q of f) { expect(runLo(q)).toBeGreaterThanOrEqual(mid - 1e-6); expect(runHi(q)).toBeLessThanOrEqual(wall + 1e-6) }
    expectInside()
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
