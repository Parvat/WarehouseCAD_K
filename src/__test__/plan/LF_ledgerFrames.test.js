// Area LF — frames in the bay ledger around a split (utils/bayLedger.js frames / frameCount): a frame is one
// upright line of one row (a back-to-back pair has two per upright position); a frame two racks stand on
// together (end to end on a shared upright: a split, an in-line settle) counts ONCE. Split + Esc leaves the
// total as it was; a piece placed away adds its new end frame (2 for a pair); rejoined, back as it was. One
// row, a single, three rows split through the Row group, and a settle. The layout as saved, both ways.
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


// ── LF: frames in the bay ledger around a split ─────────────────────────────────────────────────────────────
const L = () => bayLedger(objs(), GS)
const total = () => L().frames
/** The frames a set of racks adds (their frameCount summed). */
const framesOf = (racks) => racks.reduce((t, o) => t + L().racks.get(o.id).frameCount.reduce((a, n) => a + n, 0), 0)
const familyOf = (root) => objs().filter(o => o.id === root || o.splitOf === root)
const keyOf = (sec, ri) => [...RG.rowsOf(objs(), GS).keys()].find(k => k.endsWith('|' + sec + '|' + ri))
/** Drag the piece of \`root\` straight back onto its rack's shared upright: the in-line snap joins it. */
async function rejoin(root) {
  const piece = objs().find(o => o.splitOf === root), stay = objs().find(o => o.id === root)
  const p = RG.geom(piece), g = RG.geom(stay), up = ((piece.uprightWidth || 3) / 12) * GS
  // the piece sits on one side: bring its facing end onto the rack's end upright
  const dRun = p.r1 <= g.r0 + up + 1e-6 ? g.r0 + up - p.r1 : g.r1 - up - p.r0, dCross = g.s0 - p.s0
  const dx = p.vert ? dCross : dRun, dy = p.vert ? dRun : dCross
  const plan = planInlineDrop(objs(), [piece.id], piece.id, dx, dy, GS)
  expect(plan && plan.join, 'the piece rejoins').toBeTruthy()
  store.getState().moveObjects([piece.id], dx, dy)
  applyJoin(store, plan.join, { rebuildAisles, newId }); await settle()
}
const back = (at, ft) => (RG.geom(usePlacement.getState().active.items[0]).vert ? { x: at.x, y: at.y - ft * GS } : { x: at.x - ft * GS, y: at.y })
const across = (at, ft) => (RG.geom(usePlacement.getState().active.items[0]).vert ? { x: at.x + ft * GS, y: at.y } : { x: at.x, y: at.y + ft * GS })

describe.each([['vertical', true], ['horizontal', false]])('LF — %s', (_, vert) => {
  it('LF-single: the wall single (30 bays, 31 frames): split + Esc → still 31 (the shared upright is one frame); the piece placed 8 ft across → 32 (its new end frame); dragged back and rejoined → 31 — the layout total the same way', async () => {
    load(savedFill(vert))
    const r = wallSingle(), root = r.id, t0 = total()
    expect(framesOf([r])).toBe(r.beams.length + 1)
    splitAt(store, near(r, 2, -0.6), root, { newId, rebuildAisles }); cancelPlacement(); await settle()
    expect([framesOf(familyOf(root)), total()]).toEqual([r.beams.length + 1, t0])
    store.getState().undo()
    const at = near(wallSingle(), 2, -0.6)
    splitAt(store, at, root, { newId, rebuildAisles }); movePlacement(store, across(at, 8), 1)
    expect(commitPlacement(store)).toBe(true); await settle()
    expect([framesOf(familyOf(root)), total()]).toEqual([r.beams.length + 2, t0 + 1])
    await rejoin(root)
    expect(familyOf(root).length).toBe(1)
    expect([framesOf(familyOf(root)), total()]).toEqual([r.beams.length + 1, t0])
  })

  it('LF-pair: row 7, the 14-bay back-to-back pair — two frames per upright position (front and back row): 30; split + Esc → 30; the piece placed 3 ft back → 32 (one end of a pair is 2 frames); rejoined → 30', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], root = r.id, t0 = total()
    expect(framesOf([r])).toBe(30)
    splitAt(store, near(r, 5, -0.6), root, { newId, rebuildAisles }); cancelPlacement(); await settle()
    expect([framesOf(familyOf(root)), total()]).toEqual([30, t0])
    store.getState().undo()
    const at = near(rowRacks(2, 7)[0], 5, -0.6)
    splitAt(store, at, root, { newId, rebuildAisles }); movePlacement(store, back(at, 3), 1)
    expect(commitPlacement(store)).toBe(true); await settle()
    expect([framesOf(familyOf(root)), total()]).toEqual([32, t0 + 2])
    await rejoin(root)
    expect([framesOf(familyOf(root)), total()]).toEqual([30, t0])
  })

  it('LF-group: rows 6, 7, 8 split together through the Row group: + Esc → the layout total unchanged; placed 3 ft back → + 6 (2 per pair); each piece rejoined → unchanged', async () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: [keyOf(2, 6), keyOf(2, 7), keyOf(2, 8)] })
    const roots = [6, 7, 8].map(ri => rowRacks(2, ri)[0].id), t0 = total()
    const r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, -0.6), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    expect(roots.map(id => familyOf(id).length)).toEqual([2, 2, 2])
    expect(total()).toBe(t0)
    store.getState().undo()
    const at = near(rowRacks(2, 7)[0], 5, -0.6)
    splitAt(store, at, r.id, { newId, rebuildAisles }); movePlacement(store, back(at, 3), 1)
    expect(commitPlacement(store)).toBe(true); await settle()
    expect(total()).toBe(t0 + 6)
    for (const id of roots) await rejoin(id)
    expect(roots.map(id => familyOf(id).length)).toEqual([1, 1, 1])
    expect(total()).toBe(t0)
  })

  it('LF-settle: an in-line settle, not joined — the cut piece made 1 level higher (it can\'t join) still stands on the shared upright: that frame is counted once, the total unchanged; racks that only touch (moved one upright width apart) keep a frame each: + 2 for the pair', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], t0 = total()
    splitAt(store, near(r, 5, -0.6), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    const piece = objs().find(o => o.splitOf === r.id)
    store.getState().updateObject(piece.id, { levels: (r.levels || 4) + 1 }); store.getState().commitObjectUpdate(piece.id, {}); await settle()
    expect(planInlineDrop(objs(), [piece.id], piece.id, 0, 0, GS)?.join || null).toBe(null)
    expect(total()).toBe(t0)
    // one upright width apart: touching, two uprights 3" apart
    const up = ((piece.uprightWidth || 3) / 12) * GS, g = RG.geom(piece), away = g.r0 < RG.geom(objs().find(o => o.id === r.id)).r0 ? -up : up
    store.getState().moveObjects([piece.id], g.vert ? 0 : away, g.vert ? away : 0); await settle()
    expect(total()).toBe(t0 + 2)
  })
})
