// Area SG — Split through the Row group (utils/splitTool.js groupCuts / splitAt): when the cut row is in the
// Row group, every other group row is cut at the same position along the run (an interior upright within ½"),
// its piece on the same side following with the others; a row already meeting there moves its rack uncut; a
// row with a rack there but no upright within ½" is skipped. One placement, one history entry, Ask and Auto
// alike; the bar reports it. No gap label between any piece and its rack (splitOf), several rows at once.
// The layout as saved, vertical and turned; plain racks for the whole-stretch gap.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { sharesFrame } from '../../utils/bayBeam'
import { checkLayout } from '../../utils/layoutCheck'
import { bayLedger } from '../../utils/bayLedger'
import { getLayoutCapacity } from '../../utils/capacity'
import { rebuildAisles, neighbourPairs } from '../../utils/aisleRebuild'
import * as RG from '../../utils/rowGroup'
import { SPLIT_TOOL, useSplit, cutOf, hoverSplit, splitAt } from '../../utils/splitTool'
import { usePlacement, movePlacement, commitPlacement, cancelPlacement, placementDistances } from '../../utils/placement'
import { innerOutline } from '../../utils/floorGeom'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { pasteAt, setCanvasPointer } from '../../utils/pasteAt'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { installRowEditKeeper } from '../../utils/rowEditKeeper'
import { installPairKeeper } from '../../utils/pairCarryOn'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup } from '../../utils/rowGroupTool'
import { planInlineDrop, applyJoin } from '../../canvas2/inlineSnap'
import { TOOLS } from '../../constants'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

let store, stops = [], seq = 0
const newId = () => 'p' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  // as App.jsx
  stops = [installAisleKeeper(store, newId), installRowEditKeeper(store), installPairKeeper(store), installRowGroupWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { clearGroup(); usePlacement.setState({ active: null }); useSplit.setState({ hover: null }) })

const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
function savedFill(vert) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })), area = objs.find(o => o.type === 'racking_area')
  const out = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
  if (vert) return out
  return out.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
}
function load(objects) {
  const clean = strip(objects)
  store.setState({ objects: clean, groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, zoom: 1, activeTool: SPLIT_TOOL, history: [JSON.stringify({ objects: clean, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const rowRacks = (sec, ri) => objs().filter(o => BEAM.has(o.type) && o.genSection === sec && o.rowIndex === ri).sort((a, b) => RG.geom(a).r0 - RG.geom(b).r0)
const UP = (o) => ((o.uprightWidth || 3) / 12) * GS
const upsOf = (o) => { const g = RG.geom(o); return RG.uprightsOf(g.r0, g.beams, UP(o), GS) }
const allUps = (racks) => [...new Set(racks.flatMap(upsOf).map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
const totals = () => { const L = bayLedger(objs(), GS); return { bays: L.bays, positions: getLayoutCapacity(objs(), undefined, L).total, uncounted: L.uncountedBays } }
const overlapsIn = (racks) => { const ids = new Set(racks.map(o => o.id)); return checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.every(id => ids.has(id))) }
/** The world point `d` ft along the run from upright k's centre (negative: before it), mid-depth. */
const near = (o, k, d) => { const g = RG.geom(o), along = upsOf(o)[k] + UP(o) / 2 + d * GS, across = (g.s0 + g.s1) / 2; return g.vert ? { x: across, y: along } : { x: along, y: across } }
/** Aisles from row (sec, ri)'s racks, by the other row: { 'sec/row': [width ft, ...] }. */
function aislesOf(sec, ri) {
  const byId = new Map(objs().map(o => [o.id, o])), mine = new Set(rowRacks(sec, ri).map(o => o.id)), out = {}
  for (const a of objs().filter(o => o.type === 'aisle')) {
    const [m, t] = mine.has(a.row1Id) ? [a.row1Id, a.row2Id] : mine.has(a.row2Id) ? [a.row2Id, a.row1Id] : []
    if (!m) continue
    const A = RG.geom(byId.get(m)), B = RG.geom(byId.get(t)), o = byId.get(t)
    const w = Math.round(((Math.max(A.s0, B.s0) - Math.min(A.s1, B.s1)) / GS) * 1000) / 1000;
    (out[o.genSection + '/' + o.rowIndex] = out[o.genSection + '/' + o.rowIndex] || []).push(w)
  }
  for (const k in out) out[k].sort((a, b) => a - b)
  return out
}

/** The live distances the following piece draws, by direction relative to its rack — along+ / along- (the
 *  run), across+ / across- — and along0 / across0 for a 0 gap — as { kind, ft } (ft to 3 decimals). */
function distances() {
  const a = usePlacement.getState().active, out = {}
  const runAxis = RG.geom(a.items[0]).vert ? 'y' : 'x'
  for (const d of placementDistances(a, objs(), GS)) {
    const k = (d.axis === runAxis ? 'along' : 'across') + (d.b > d.a + 1e-9 ? '+' : d.b < d.a - 1e-9 ? '-' : '0')
    out[k] = { kind: d.kind, ft: Math.round(d.ft * 1000) / 1000 }
  }
  return out
}
/** The user's case: the building as saved, emptied, with ONE plain single of 6 bays (8') in the middle. */
function oneRack(vert) {
  const all = savedFill(vert), fp = all.find(o => typeof o.type === 'string' && o.type.startsWith('fp_'))
  const src = all.filter(o => o.type === 'rack_row' && o.genSection === 1).sort((a, b) => b.beams.length - a.beams.length)[0]
  const { rowIndex, genSection, genRunFt, genCrossFt, pieceOf, areaId, ...plain } = src
  const rack = RG.movedAcross(RG.withRun({ ...plain, id: 'R6' }, RG.geom(src).r0 + 60 * GS, Array(6).fill(96), GS), 100 * GS)
  return { objects: [fp, rack], fp, rack }
}
/** The cross-aisle labels drawn for `objects`: their widths in ft (3 decimals). */
const crossLabels = (os) => crossAisleLabels(os, GS).map(c => Math.round((c.gapHi - c.gapLo) / GS * 1000) / 1000)
/** The same racks as ordinary racks: no split link. */
const ordinary = (os) => os.map(o => (o.type === 'rack_row' ? (({ splitOf, pieceOf, ...r }) => ({ ...r, id: 'o' + r.id }))(o) : o))
/** The building's inner faces: [lo, hi] on each world axis. */
const innerBox = (fp) => { const q = innerOutline(fp, GS), xs = q.map(v => v.x), ys = q.map(v => v.y); return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] } }

/** A cut must leave every rack where it was: the same uprights and span, the cut frame shared, no overlap,
 *  no bay lost, the bay ledger's counts unchanged. */
const unchanged = (before, after, t0) => {
  expect(allUps(after)).toEqual(allUps(before))
  const g0 = before.map(RG.geom), g1 = after.map(RG.geom)
  expect([Math.min(...g1.map(g => g.r0)), Math.max(...g1.map(g => g.r1))]).toEqual([Math.min(...g0.map(g => g.r0)), Math.max(...g0.map(g => g.r1))])
  for (let k = 0; k + 1 < after.length; k++) expect(sharesFrame(after[k], after[k + 1], GS)).toBe(true)
  expect(after.reduce((t, o) => t + o.beams.length, 0)).toBe(before.reduce((t, o) => t + o.beams.length, 0))
  expect(overlapsIn(after)).toEqual([])
  expect(totals()).toEqual(t0)
}
/** The single along the wall in section 1 with the most bays. */
const wallSingle = () => objs().filter(o => o.type === 'rack_row' && o.genSection === 1).sort((a, b) => b.beams.length - a.beams.length)[0]


// ── SG: Split through the Row group ─────────────────────────────────────────────────────────────────────────
import { groupCuts } from '../../utils/splitTool'

const keyOf = (sec, ri) => [...RG.rowsOf(objs(), GS).keys()].find(k => k.endsWith('|' + sec + '|' + ri))
const group = (pairs) => useRowGroup.setState({ keys: pairs.map(([s, r]) => keyOf(s, r)) })
const wallKey = () => { const w = wallSingle(); return keyOf(w.genSection, w.rowIndex) }
const placing = () => usePlacement.getState().active
const bar = () => ({ message: useRowGroup.getState().message, skipped: (useRowGroup.getState().report?.skipped || []).map(s => s.reason) })
/** Rows (section 2) by bays, in run order: { row: [bays, ...] }. */
const lineBays = (rows) => Object.fromEntries(rows.map(ri => [ri, rowRacks(2, ri).map(o => o.beams.length)]))
const moveAlong = (at, ft) => movePlacement(store, RG.geom(placing().items[0]).vert ? { x: at.x, y: at.y + ft * GS } : { x: at.x + ft * GS, y: at.y }, 1)

describe.each([['vertical', true], ['horizontal', false]])('SG — %s', (_, vert) => {
  it('SG-cut: rows 6, 7 and 8 (section 2) and the wall single in the Row group; row 7 clicked just before upright 5 → rows 6 and 8 are cut there too (their own upright 5, within ½"), the wall single is skipped (4.5" off) — all at the first click, nothing committed; the three 5-bay pieces follow together, the one under the cursor first; 3 ft back along and a click → all placed by the same move, ONE history entry, nothing selected, stamps, pieceOf and splitOf on each (its own rack), genRunFt moved; one undo restores every row', async () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8), wallKey()] })
    const before = { 6: rowRacks(2, 6).map(strip), 7: rowRacks(2, 7).map(strip), 8: rowRacks(2, 8).map(strip) }
    const r = rowRacks(2, 7)[0], at = near(r, 5, -0.6), h = hist()
    splitAt(store, at, r.id, { newId, rebuildAisles })
    const items = placing().items
    expect(items.map(o => [o.rowIndex, o.beams.length])).toEqual([[7, 5], [6, 5], [8, 5]])
    expect(lineBays([6, 7, 8])).toEqual({ 6: [9], 7: [9], 8: [9] })                    // only the stays are in the layout
    expect(bar()).toEqual({ message: 'Split 3 rows · 1 skipped', skipped: [`uprights don't line up (4.5" off)`] })
    expect(hist()).toBe(h)
    moveAlong(at, -3)
    expect(placing().blocked).toBe(null)
    expect(commitPlacement(store)).toBe(true); await settle()
    expect(hist()).toBe(h + 1)
    expect(store.getState().selectedIds).toEqual([])
    for (const ri of [6, 7, 8]) {
      const [p, s] = rowRacks(2, ri)
      expect([p.beams.length, s.beams.length]).toEqual([5, 9])
      expect((RG.geom(s).r0 - RG.geom(p).r1) / GS).toBeCloseTo(2.75, 6)                     // each moved the same 3 ft
      expect([p.rowIndex, p.genSection, p.pieceOf, p.splitOf]).toEqual([ri, 2, s.id, s.id])
      if (before[ri][0].genRunFt != null) expect(p.genRunFt).toBeCloseTo(before[ri][0].genRunFt - 3, 6)
    }
    expect(useRowGroup.getState().pending).toBe(null)
    store.getState().undo()
    for (const ri of [6, 7, 8]) expect(rowRacks(2, ri).map(strip)).toEqual(before[ri])
  })

  it('SG-esc: the same cut, Esc → every piece back where it was: each row 5 + 9 on a shared upright, no overlap, the counts unchanged, ONE history entry; the bar still says what was split', async () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8), wallKey()] })
    const t0 = totals(), h = hist()
    const r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, -0.6), r.id, { newId, rebuildAisles })
    expect(cancelPlacement()).toBe(true); await settle()
    expect(lineBays([6, 7, 8])).toEqual({ 6: [5, 9], 7: [5, 9], 8: [5, 9] })
    for (const ri of [6, 7, 8]) { const [p, s] = rowRacks(2, ri); expect(sharesFrame(p, s, GS)).toBe(true) }
    expect(overlapsIn([6, 7, 8].flatMap(ri => rowRacks(2, ri)))).toEqual([])
    expect(totals()).toEqual(t0)
    expect(hist()).toBe(h + 1)
    expect(store.getState().selectedIds).toEqual([])
    expect(bar().message).toBe('Split 3 rows · 1 skipped')
  })

  it('SG-moved: row 8 already separate at upright 5 (two racks meeting on a shared upright) — the group cut of row 7 there moves row 8\'s rack on that side uncut with the pieces: "Split 1 row · 1 moved without a cut", placed by the same move; Esc puts it back', async () => {
    load(savedFill(vert))
    const r8 = rowRacks(2, 8)[0]
    splitAt(store, near(r8, 5, -0.6), r8.id, { newId, rebuildAisles }); cancelPlacement(); await settle()  // no group yet: row 8 alone
    expect(lineBays([8])).toEqual({ 8: [5, 9] })
    useRowGroup.setState({ keys: [keyOf(2, 7), keyOf(2, 8)] })
    const r = rowRacks(2, 7)[0], at = near(r, 5, -0.6), first8 = strip(rowRacks(2, 8)[0])
    splitAt(store, at, r.id, { newId, rebuildAisles })
    expect(placing().items.map(o => [o.rowIndex, o.beams.length, o.id === first8.id])).toEqual([[7, 5, false], [8, 5, true]])
    expect(bar().message).toBe('Split 1 row · 1 moved without a cut')
    moveAlong(at, -3)
    expect(commitPlacement(store)).toBe(true); await settle()
    const [p8, s8] = rowRacks(2, 8)
    expect(p8.id).toBe(first8.id)
    expect((RG.geom(s8).r0 - RG.geom(p8).r1) / GS).toBeCloseTo(2.75, 6)
    expect([p8.rowIndex, p8.genSection]).toEqual([8, 2])
    // again, Esc: it goes back where it was
    store.getState().undo()
    splitAt(store, at, rowRacks(2, 7)[0].id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    expect(strip(rowRacks(2, 8)[0])).toEqual(first8)
  })

  it('SG-auto: Ask and Auto apply behave the same — the group rows are cut at the first click and nothing is asked: no Apply / Skip after the click, the group kept', async () => {
    for (const auto of [false, true]) {
      load(savedFill(vert))
      useRowGroup.getState().setAlwaysApply(auto)
      const keys = [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8)]
      useRowGroup.setState({ keys })
      const r = rowRacks(2, 7)[0], at = near(r, 5, -0.6)
      splitAt(store, at, r.id, { newId, rebuildAisles })
      expect(placing().items.length).toBe(3)
      moveAlong(at, -3); commitPlacement(store); await settle()
      expect(useRowGroup.getState().pending).toBe(null)
      expect(useRowGroup.getState().keys).toEqual(keys)
      expect(lineBays([6, 7, 8])).toEqual({ 6: [5, 9], 7: [5, 9], 8: [5, 9] })
    }
    useRowGroup.getState().setAlwaysApply(false)
  })

  it('SG-alone: the cut row not in the Row group (or no group) → only that rack is cut, as before: one piece follows, the bar says nothing', () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 8)] })
    const r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, -0.6), r.id, { newId, rebuildAisles })
    expect(placing().items.length).toBe(1)
    expect(bar().message).toBe(null)
    expect(lineBays([6, 8])).toEqual({ 6: [14], 8: [14] })
    cancelPlacement()
    expect(groupCuts(objs(), rowRacks(2, 7)[0], { at: 0, side: 'first' }, [], GS)).toBe(null)
  })

  it('SG-preview: hovering the cut with the group shows it on every row the click will cut (rows 6 and 8, at their own upright 5, same side) and outlines the row it will skip (the wall single)', () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8), wallKey()] })
    const r = rowRacks(2, 7)[0]
    hoverSplit(objs(), near(r, 5, -0.6), r.id, GS)
    const g = useSplit.getState().hover.group
    expect(g.cuts.map(t => [objs().find(o => o.id === t.rackId).rowIndex, t.k, t.side]).sort()).toEqual([[6, 5, 'first'], [8, 5, 'first']])
    expect(g.skipped).toEqual([wallSingle().id])
    expect(g.moves).toEqual([])
  })

  it('SG-dist: the live distances are the piece under the cursor\'s — its gap to its own rack (3 ft 9 in after 4 ft back), measured with the other moving pieces out of the way', () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8)] })
    const r = rowRacks(2, 7)[0], at = near(r, 5, -0.6)
    splitAt(store, at, r.id, { newId, rebuildAisles })
    moveAlong(at, -4)
    const from = placementDistances(placing(), objs(), GS).filter(d => d.kind === 'from')
    expect(from.map(d => Math.round(d.ft * 1000) / 1000)).toEqual([3.75])
    expect(placing().measure.fromId).toBe(r.id)
    cancelPlacement()
  })

  it('SG-reload: the three placed rows saved and loaded: the pieces keep their row stamps, pieceOf and splitOf', async () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8)] })
    const r = rowRacks(2, 7)[0], at = near(r, 5, -0.6)
    splitAt(store, at, r.id, { newId, rebuildAisles }); moveAlong(at, -3); commitPlacement(store); await settle()
    const loaded = {}
    deserializeScene(serializeScene(store.getState()), loaded)
    const pieces = loaded.objects.filter(o => o.splitOf)
    expect(pieces.map(o => [o.genSection, o.rowIndex, o.pieceOf === o.splitOf]).sort()).toEqual([[2, 6, true], [2, 7, true], [2, 8, true]])
  })
})

describe('SG-labels', () => {
  // an empty building with three plain 6-bay singles side by side, 12 ft apart: a whole stretch cut together
  function threeRacks(vert) {
    const { objects, fp, rack } = oneRack(vert)
    const racks = [0, 1, 2].map(i => ({ ...RG.movedAcross(rack, i * 12 * GS), id: 'R' + i }))
    return { objects: [fp, ...racks], racks }
  }
  it.each([['vertical', true], ['horizontal', false]])('SG-labels (%s): three plain racks in one Row group (rows by hand), the middle one cut before upright 2 → all three cut; placed 4 ft back, the gap runs across the whole stretch with every piece on one side and every rack it came from on the other — NO label (the same racks as ordinary racks get 3 ft 9 in); an ordinary rack added on one side brings it back', async (_, vert) => {
    const { objects, racks } = threeRacks(vert)
    load(objects)
    useRowGroup.setState({ keys: [...RG.rowsOf(objs(), GS).keys()] })
    expect(useRowGroup.getState().keys.length).toBe(3)
    const at = near(racks[1], 2, -0.6)
    splitAt(store, at, racks[1].id, { newId, rebuildAisles })
    expect(placing().items.length).toBe(3)
    moveAlong(at, -4)
    expect(commitPlacement(store)).toBe(true); await settle()
    expect(objs().filter(o => o.splitOf).length).toBe(3)
    expect(crossLabels(objs())).toEqual([])
    expect(crossLabels(ordinary(objs()))).toEqual([3.75])
    const extra = { ...RG.movedAcross(racks[0], -12 * GS), id: 'plain' }
    expect(crossLabels([...objs(), RG.withRun(extra, RG.geom(objs().find(o => o.splitOf)).r0, [96, 96], GS)])).toEqual([3.75])
  })
})
