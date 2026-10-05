// Area CX — cross-aisles only when needed. A rack run that fits within the
// max rack run (150' by default) is ONE piece, no cross-aisle; a longer run
// keeps the rule it had: the fewest cross-aisles so no section is longer than
// the max run. One rule in rowSegments, so Generate and Fill racking both
// follow it. Both orientations; a rectangle (Generate and Fill), an L and a T
// (Fill).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rowSegments } from '../../generate/sizingLayout'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }

const RACK = new Set(['rack_row', 'rack_double_row'])
/* reach, 6" wall clearance, 96" beams on 3" uprights — Generate's defaults */
const SPEC = { crossAisleFt: 9, endClearFt: 0.5, beamIn: 96, upIn: 3 }

describe('CX — rowSegments', () => {
  it('CX-72: a 72\' run is one piece, no cross-aisle, filling it to within a bay of the far wall', () => {
    const r = rowSegments(72, { ...SPEC, maxRunFt: 150 })
    expect(r.crossAisles).toEqual([])
    expect(r.crossAisle).toBeNull()
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].xFt).toBe(0.5)
    const len = (r.bays * 99 + 3) / 12
    expect(72 - 0.5 - (0.5 + len)).toBeGreaterThanOrEqual(0)
    expect(72 - 0.5 - (0.5 + len)).toBeLessThan(99 / 12)
  })
  it('CX-limit: a run exactly at the max run is one piece; one bay more is split once', () => {
    const at = (18 * 99 + 3) / 12 + 1                     // 18 bays (148.75') + both clearances: at the 150' limit's 18 bays
    expect(rowSegments(at, { ...SPEC, maxRunFt: 150 }).crossAisles).toHaveLength(0)
    expect(rowSegments(at + 99 / 12, { ...SPEC, maxRunFt: 150 }).crossAisles).toHaveLength(1)
  })
  it('CX-240: a 240\' run (max 150\') gets exactly one cross-aisle, both sections within 150\'', () => {
    const r = rowSegments(240, { ...SPEC, maxRunFt: 150 })
    expect(r.crossAisles).toHaveLength(1)
    for (const s of r.segments) expect((s.bays * 99 + 3) / 12).toBeLessThanOrEqual(150)
  })
  // 1,080' counts: the rule before this change gave the same (run against the pre-change rowSegments)
  it('CX-1080: a 1,080\' run keeps its count — 6 at 150\', 9 at 100\' (no columns)', () => {
    expect(rowSegments(1080, { ...SPEC, maxRunFt: 150 }).crossAisles).toHaveLength(6)
    expect(rowSegments(1080, { ...SPEC, maxRunFt: 100 }).crossAisles).toHaveLength(9)
  })
})

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const FT = await import('../../utils/fillTool')
  const FR = await import('../../generate/fillRacking')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { rackFootprint } = await import('../../generate/columnCheck')
  return { useCanvasStore, FT, FR, generateAndPlace, rackFootprint }
}

describe.each(['horizontal', 'vertical'])('CX — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  /** Pieces per row: the runs a row is cut into by cross-aisles, within `pred` (world px footprint).
   *  A row is its row stamp (or its stack position); racks along it closer than a cross-aisle (a
   *  double turning single beside a wall or zone loses one bay between them) are one run. */
  /** A single row flush on a wall face across (area AA: it runs unbroken, exempt from the max run). */
  const onWall = (r) => {
    if (r.type !== 'rack_row') return false
    const fp = s().objects.find(o => o.type.startsWith('fp_')), f = m.rackFootprint(r)
    const faces = m.FR.innerOutline(fp, GS).map(p => (vert ? p.x : p.y)), a = vert ? f.x : f.y, b = vert ? f.x + f.w : f.y + f.h
    return faces.some(v => Math.abs(v - a) < 1e-3 || Math.abs(v - b) < 1e-3)
  }
  /** Pieces per row: `walls` false counts the rows but wall rows, true counts the wall rows only. */
  const piecesPerRow = (pred = () => true, walls = false) => {
    const rows = new Map()
    for (const r of racks()) {
      const f = m.rackFootprint(r)
      if (!pred(f) || onWall(r) !== walls) continue
      const k = r.rowIndex != null ? 'r' + r.rowIndex : Math.round((vert ? f.x : f.y) * 100)
      if (!rows.has(k)) rows.set(k, [])
      rows.get(k).push(vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
    }
    return [...rows.values()].map(list => {
      list.sort((p, q) => p[0] - q[0])
      let runs = 1, end = list[0][1]
      for (const [a, b] of list.slice(1)) { if (a - end >= 8.5 * GS) runs++; end = Math.max(end, b) }
      return runs
    })
  }
  const fillAll = () => {
    const fp = s().objects.find(o => o.type.startsWith('fp_')), pts = m.FR.buildingOutline(fp)
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    m.FT.startFill({ x: Math.min(...xs), y: Math.min(...ys) })
    m.FT.moveFill({ x: Math.max(...xs), y: Math.max(...ys) }, s().objects, GS)
    m.FT.commitFill(m.useCanvasStore)
    return fp
  }

  it.each([
    ['72\' run', 72, 0],
    ['240\' run', 240, 1],
    ['1,080\' run', 1080, 7],                              // 6 by length, one more the 30' columns force (as before)
  ])('CX-generate: Generate, a %s — the same cross-aisles in every row, %# as expected', (_, runFt, n) => {
    const across = 100
    m.generateAndPlace({ ...(vert ? { lengthFt: across, widthFt: runFt } : { lengthFt: runFt, widthFt: across }), gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const rows = piecesPerRow()
    expect(rows.length).toBeGreaterThan(3)
    for (const k of rows) expect(k).toBe(n + 1)
  })

  it('CX-fill-rect: Fill racking a 240 × 120 rectangle — the 240\' run (horizontal) split once, the 120\' run (vertical) one piece', () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    fillAll()
    const rows = piecesPerRow()
    expect(rows.length).toBeGreaterThan(3)
    for (const k of rows) expect(k).toBe(vert ? 1 : 2)
    // the wall rows (the start wall's single, the far wall's): one piece, through the cross-aisle
    const walls = piecesPerRow(undefined, true)
    expect(walls.length).toBeGreaterThan(0)
    for (const k of walls) expect(k).toBe(1)
  })

  it('CX-fill-T: Fill racking a T (360 × 240) — every part whose run is within 150\' is one piece: the 72\' bar (vertical), the 126\' stem (horizontal)', () => {
    const fp = (s().placeFpObject({ type: 'fp_t', widthFt: 360, heightFt: 240 }), fillAll())
    const barBottom = fp.y + fp.height * 0.3
    // vertical: the bar's rows run 72' (top of the T); horizontal: the stem's rows run 126' (below the bar)
    const part = vert ? (f) => f.y + f.h <= barBottom + 1 : (f) => f.y >= barBottom - 1
    const rows = piecesPerRow(part)
    expect(rows.length).toBeGreaterThan(3)
    for (const k of rows) expect(k).toBe(1)
  })

  it("CX-fill-L: Fill racking an L (300 × 200) — parts within 150' are one piece per row (horizontal: the 90' stem; vertical: the 140' stem above the bar and the 60' bar); a part past it is still split (horizontal: the bar, its rows running the whole 300' through the elbow)", () => {
    const fp = (s().placeFpObject({ type: 'fp_l', widthFt: 300, heightFt: 200 }), fillAll())
    const barTop = fp.y + fp.height * 0.7
    const above = (f) => f.y + f.h <= barTop + 1, inBar = (f) => f.y >= barTop - 1
    const one = vert ? [above, inBar] : [above]
    for (const part of one) {
      const rows = piecesPerRow(part)
      expect(rows.length).toBeGreaterThan(1)
      for (const k of rows) expect(k).toBe(1)
    }
    if (!vert) {
      // one area, one pattern: the bar's rows run on through the elbow, under the stem too — 300', split
      // by its cross-aisle (and cut once more where the stem's travel path comes down through them, area AA)
      const rows = piecesPerRow(inBar)
      expect(rows.length).toBeGreaterThan(1)
      for (const k of rows) expect(k).toBeGreaterThanOrEqual(2)
      // its wall row on the bar's far wall: one piece through the cross-aisle, cut only where the travel path comes down
      const walls = piecesPerRow(inBar, true)
      expect(walls.length).toBeGreaterThan(0)
      for (const k of walls) expect(k).toBeLessThanOrEqual(2)
    }
  })
})
