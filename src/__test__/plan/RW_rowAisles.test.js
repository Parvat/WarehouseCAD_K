// Area RW — every aisle between facing rows is checked (BUG 74): Check layout pairs beam racks exactly as the
// aisle labels do (neighbourPairs: facing stretches, per line), so a label and its check never disagree,
// whatever the sections or the wall rows; a pair with another rack type stays on rowGaps. Under the drive
// width an error, under the pick width a warning. The layout as saved, both ways; the four fills clean.
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


// ── RW: every aisle between facing rows is checked (BUG 74) ──────────────────────────────────────────────────
import { rowAisleGaps } from '../../utils/layoutCheck'
import { rowGaps } from '../../generate/columnCheck'
import { planAreaCreate } from '../../generate/rackingArea'

const FILLS = [['as saved, vertical', false, 'vertical', true], ['as saved, horizontal', false, 'horizontal', false], ['turned, vertical', true, 'vertical', false], ['turned, horizontal', true, 'horizontal', false]]
function fillOf(turned, orientation, stored) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })).map(o => (turned ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area')
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  return stored ? planAreaResize(objs, area.id, box, { gridSize: GS }) : planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
const square = (objects) => objects.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_') && ((o.rotation || 0) % 90) === 0)
const pairKey = (a, b) => [a, b].sort().join('|')
/** `b` moved across so the aisle between `a` and `b` is `ft` wide. */
function narrowed(objects, aId, bId, ft) {
  const a = objects.find(o => o.id === aId), b = objects.find(o => o.id === bId)
  const ga = RG.geom(a), gb = RG.geom(b)
  const d = gb.s0 >= ga.s1 - 1e-6 ? (ga.s1 + ft * GS) - gb.s0 : (ga.s0 - ft * GS) - gb.s1
  return objects.map(o => (o.id === bId ? RG.movedAcross(o, d) : o))
}
const aisleItems = (objects, ids) => { const c = checkLayout(objects, { gridSize: GS }); return [...c.errors, ...c.warnings].filter(i => (i.kind === 'aisle-drive' || i.kind === 'aisle-pick') && ids.every(id => i.ids.includes(id))) }

describe.each([['vertical', true], ['horizontal', false]])('RW — %s', (_, vert) => {
  it('RW-narrow: the layout as saved, rows 7 and 8 of section 2 — an aisle the old pairing never saw — at 7.99 ft an ERROR "7\' 11", needs 8\' to drive", at 10.49 ft a warning "10\' 5", needs 10\' 6" to pick", at 10.5 ft nothing', () => {
    const base = savedFill(vert)
    const a = base.find(o => o.type === 'rack_double_row' && o.genSection === 2 && o.rowIndex === 7)
    const b = base.find(o => o.type === 'rack_double_row' && o.genSection === 2 && o.rowIndex === 8)
    expect(rowGaps(square(base)).some(g => pairKey(g.top.id, g.bot.id) === pairKey(a.id, b.id)), 'the old pairing: not seen').toBe(false)
    const at = (ft) => aisleItems(narrowed(base, a.id, b.id, ft), [a.id, b.id])
    expect(at(7.99).map(i => [i.severity, i.kind, i.text])).toEqual([['error', 'aisle-drive', `Aisle between rows 7 and 8, section 2: 7' 11", needs 8' to drive`]])
    expect(at(10.49).map(i => [i.severity, i.kind, i.text])).toEqual([['warning', 'aisle-pick', `Aisle between rows 7 and 8, section 2: 10' 5", needs 10' 6" to pick`]])
    expect(at(10.5)).toEqual([])
  })

  it('RW-wall: a wall row and its neighbour (section 1) narrowed to 7.99 ft → the error names both', () => {
    const base = savedFill(vert), w = base.filter(o => o.type === 'rack_row' && o.genSection === 1).sort((p, q) => q.beams.length - p.beams.length)[0]
    const g = rowAisleGaps(square(base)).find(x => x.top.id === w.id || x.bot.id === w.id)
    expect(g, 'the wall row faces a row').toBeTruthy()
    const other = g.top.id === w.id ? g.bot : g.top
    const items = aisleItems(narrowed(base, w.id, other.id, 7.99), [w.id, other.id])
    expect(items.map(i => [i.severity, i.kind])).toEqual([['error', 'aisle-drive']])
  })

  it('RW-sections: two facing rows of different sections (the layout filled with rows along the other axis) narrowed to 7.99 ft → the error', () => {
    const base = fillOf(!vert, vert ? 'horizontal' : 'vertical', false)
    const g = rowAisleGaps(square(base)).find(x => x.top.genSection != null && x.bot.genSection != null && x.top.genSection !== x.bot.genSection)
    expect(g, 'a pair across a section boundary').toBeTruthy()
    const items = aisleItems(narrowed(base, g.top.id, g.bot.id, 7.99), [g.top.id, g.bot.id])
    expect(items.map(i => [i.severity, i.kind])).toEqual([['error', 'aisle-drive']])
  })

  it('RW-other: two facing racks of another type (cantilever) in an empty building, 7.99 ft apart → still checked (the old pairing, for any pair that is not two beam racks)', () => {
    const { objects, rack } = oneRack(vert), g = RG.geom(rack)
    const a = { ...rack, id: 'C1', type: 'rack_cantilever' }
    const b = { ...RG.movedAcross(rack, (g.s1 - g.s0) + 7.99 * GS), id: 'C2', type: 'rack_cantilever' }
    const items = aisleItems([objects[0], a, b], ['C1', 'C2'])
    expect(items.map(i => [i.severity, i.kind])).toEqual([['error', 'aisle-drive']])
  })
})

describe('RW-labels', () => {
  it.each(FILLS)('RW-labels (%s): the aisles checked are exactly the aisles labelled — the same pairs of racks, every one — and the fixture has none under width', (_, turned, orientation, stored) => {
    const out = fillOf(turned, orientation, stored)
    const checked = new Set(rowAisleGaps(square(out)).map(g => pairKey(g.top.id, g.bot.id)))
    // what the labels draw: the aisles as the app keeps them (the aisle keeper rebuilds them after every action)
    const labelled = new Set(rebuildAisles(out).objects.filter(o => o.type === 'aisle').map(a => pairKey(a.row1Id, a.row2Id)))
    expect(labelled.size).toBeGreaterThan(40)
    expect([...checked].sort()).toEqual([...labelled].sort())
    const c = checkLayout(out, { gridSize: GS })
    expect([...c.errors, ...c.warnings].filter(i => i.kind === 'aisle-drive' || i.kind === 'aisle-pick')).toEqual([])
  })
})
