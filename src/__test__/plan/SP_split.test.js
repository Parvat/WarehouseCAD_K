// Area SP — the Split tool (utils/splitTool.js, the drawing toolbar next to Row group): hovering a rack shows
// the cut at its nearest interior upright; a click cuts the rack in two there (all the bays on each side
// together), the tool goes back to Select, and the piece on the cursor's side follows the mouse (placement,
// held where it was grabbed) until a click places it — Esc leaves it in place. The cut upright is shared, so
// nothing moves and the counts hold; the cut and the placement are one undo step; the stamps carry to both
// pieces (the moved one too); the Row group passes it over; a piece dragged straight back rejoins (in-line
// snap). And the aisle fix: racks in one line end to end (a cut, an in-line settle) face their neighbour
// with ONE aisle, not one per piece. The layout as saved, vertical and turned; single and back-to-back.
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
import { usePlacement, movePlacement, commitPlacement, cancelPlacement } from '../../utils/placement'
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

describe.each([['vertical', true], ['horizontal', false]])('SP — %s', (_, vert) => {
  it('SP-esc: row 7\'s pair (14 bays) clicked just past upright 5 → cut there, the tool back to Select, the far piece (9 bays) follows the mouse and is out of the layout; Esc → it stays where it was: 5 + 9, the same uprights, the cut frame shared, no overlap, the counts unchanged; both stamped, the staying piece keeps the id, the other carries pieceOf and is selected; one history entry, one undo restores the rack', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], before = rowRacks(2, 7).map(strip), t0 = totals(), h = hist()
    expect(r.beams.length).toBe(14)
    expect(splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles })).toBe(true)
    expect(store.getState().activeTool).toBe(TOOLS.SELECT)
    const a = usePlacement.getState().active
    expect(a.items.map(o => o.beams.length)).toEqual([9])
    expect(rowRacks(2, 7).map(o => [o.id, o.beams.length])).toEqual([[r.id, 5]])
    expect([a.dx, a.dy]).toEqual([0, 0])                                         // held where it was
    expect(a.escHint).toBe('Esc leaves it where it was')                         // the bar says what Esc does
    expect(hist()).toBe(h)                                                       // nothing committed yet
    expect(cancelPlacement()).toBe(true)
    await settle()
    const after = rowRacks(2, 7)
    expect(after.map(o => o.beams.length)).toEqual([5, 9])
    unchanged(before, after, t0)
    expect(after.every(o => o.rowIndex === 7 && o.genSection === 2 && o.parentId === r.parentId && o.type === r.type && o.levels === r.levels)).toBe(true)
    expect(after[0].id).toBe(r.id)
    expect(after[1].pieceOf).toBe(r.id)
    expect(store.getState().selectedIds).toEqual([after[1].id])
    expect(hist()).toBe(h + 1)
    store.getState().undo()
    expect(rowRacks(2, 7).map(strip)).toEqual(before)
  })

  it('SP-place: the wall single clicked just BEFORE upright 2 → the near piece (2 bays) is the one that follows; moved 8 ft across (into the aisle) and clicked → placed there, one history entry; its stamps kept (the same row), genRunFt follows its start; the rest stays in place; one undo restores the rack exactly', async () => {
    load(savedFill(vert))
    const w = wallSingle(), n = w.beams.length, before = strip(w), h = hist()
    const at = near(w, 2, -0.5)
    splitAt(store, at, w.id, { newId, rebuildAisles })
    const a = usePlacement.getState().active
    expect(a.items.map(o => o.beams.length)).toEqual([2])
    const moving = a.items[0]
    // 8 ft across, into the aisle, then a click
    const d = 8 * GS, to = vert ? { x: at.x + d, y: at.y } : { x: at.x, y: at.y + d }
    movePlacement(store, to, 1)
    const p = usePlacement.getState().active
    expect(p.blocked).toBe(null)
    expect(commitPlacement(store)).toBe(true)
    await settle()
    expect(hist()).toBe(h + 1)
    const placed = objs().find(o => o.id === moving.id), stay = objs().find(o => o.id === w.id)
    expect(stay.beams.length).toBe(n - 2)
    expect(allUps([stay])).toEqual(allUps([before]).slice(2))
    expect(placed.beams.length).toBe(2)
    expect([placed.rowIndex, placed.genSection, placed.pieceOf]).toEqual([w.rowIndex, w.genSection, w.id])
    expect(RG.geom(placed).s0 - RG.geom(before).s0).toBeCloseTo(vert ? p.dx : p.dy, 6)
    if (w.genRunFt != null) expect(placed.genRunFt).toBeCloseTo(w.genRunFt + (RG.geom(placed).r0 - RG.geom(before).r0) / GS, 6)
    store.getState().undo()
    expect(objs().find(o => o.id === w.id)).toEqual(before)
    expect(objs().some(o => o.id === moving.id)).toBe(false)
  })

  it('SP-nearest: the cut is at the interior upright nearest the pointer, never an end one — a pointer on the first bay cuts at upright 1, on the last at upright n-1; the side follows the pointer; a one-bay rack has no cut; the hover shows it and clears off a rack', () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], n = r.beams.length, g = RG.geom(r)
    expect(cutOf(r, near(r, 0, 0.2), GS)).toMatchObject({ k: 1, side: 'first' })
    expect(cutOf(r, near(r, n, -0.2), GS)).toMatchObject({ k: n - 1, side: 'second' })
    expect(cutOf(r, near(r, 6, 1), GS)).toMatchObject({ k: 6, side: 'second' })
    expect(cutOf(r, near(r, 6, -1), GS)).toMatchObject({ k: 6, side: 'first' })
    const c = cutOf(r, near(r, 6, 1), GS), at = upsOf(r)[6] + UP(r) / 2
    expect(c.line).toEqual(g.vert ? [g.s0, at, g.s1, at] : [at, g.s0, at, g.s1])
    expect(cutOf({ ...r, beams: [r.beams[0]] }, near(r, 0, 0.2), GS)).toBe(null)
    hoverSplit(objs(), near(r, 6, 1), r.id, GS)
    expect(useSplit.getState().hover).toMatchObject({ rackId: r.id, k: 6, side: 'second' })
    hoverSplit(objs(), near(r, 6, 1), null, GS)
    expect(useSplit.getState().hover).toBe(null)
  })

  it('SP-group: row 7 and the wall single row in a Row group — a cut left in place (Esc) and a cut placed away are both passed over: nothing offered, nothing said, the group unchanged', async () => {
    load(savedFill(vert))
    const w0 = wallSingle()
    const keys = [...RG.rowsOf(objs(), GS).keys()].filter(k => k.endsWith('|7') || k.endsWith('|' + w0.rowIndex))
    expect(keys.length).toBeGreaterThanOrEqual(3)
    useRowGroup.setState({ keys })
    let r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    expect(useRowGroup.getState()).toMatchObject({ pending: null, message: null, keys })
    const w = wallSingle(), at = near(w, 2, -0.5)
    splitAt(store, at, w.id, { newId, rebuildAisles })
    movePlacement(store, vert ? { x: at.x + 8 * GS, y: at.y } : { x: at.x, y: at.y + 8 * GS }, 1)
    expect(commitPlacement(store)).toBe(true); await settle()
    expect(useRowGroup.getState()).toMatchObject({ pending: null, message: null, keys })
  })

  it('SP-rejoin: a cut piece (Esc: in place) dragged 20 ft away and straight back joins again through the in-line snap — one rack fewer, the same bays', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    const sid = objs().find(x => x.pieceOf === r.id).id
    const n0 = rowRacks(2, 7).length, bays0 = rowRacks(2, 7).reduce((t, o) => t + o.beams.length, 0)
    const d = 20 * GS
    store.getState().moveObjects([sid], vert ? d : 0, vert ? 0 : d); await settle()
    const plan = planInlineDrop(objs(), [sid], sid, vert ? -d : 0, vert ? 0 : -d, GS)
    expect(plan && plan.join).toBeTruthy()
    applyJoin(store, plan.join, { rebuildAisles, newId }); await settle()
    expect(rowRacks(2, 7).length).toBe(n0 - 1)
    expect(rowRacks(2, 7).reduce((t, o) => t + o.beams.length, 0)).toBe(bays0)
  })

  it('SP-aisle: after a cut, row 7 faces rows 6 and 8 with the same aisles as before — one each, the same widths, no label between the pieces; the same for an in-line settle (the cut piece made 1 level higher, so it can\'t join, end to end on the shared upright)', async () => {
    load(savedFill(vert))
    const a0 = aislesOf(2, 7)
    expect(Object.keys(a0).length).toBe(2)
    const r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    expect(rowRacks(2, 7).length).toBe(2)
    expect(aislesOf(2, 7)).toEqual(a0)
    const sid = objs().find(x => x.pieceOf === r.id).id
    store.getState().updateObject(sid, { levels: (r.levels || 4) + 1 }); store.getState().commitObjectUpdate(sid, {}); await settle()
    expect(planInlineDrop(objs(), [sid], sid, 0, 0, GS)?.join || null).toBe(null)
    expect(aislesOf(2, 7)).toEqual(a0)
  })

  it('SP-keeper: a cut piece nudged 6" across faces its neighbour at a new width — its own aisle, recorded in the action history entry (the aisle keeper folds its fix in), so an undo back to it restores every aisle exactly, ids and all', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
    const sid = objs().find(x => x.pieceOf === r.id).id, o = objs().find(x => x.id === sid), d = GS / 2
    const n0 = objs().filter(x => x.type === 'aisle').length
    store.getState().commitObjectUpdate(sid, vert ? { x: o.x + d } : { y: o.y + d }); await settle()
    const aisles = () => objs().filter(x => x.type === 'aisle').map(strip).sort((p, q) => (p.id < q.id ? -1 : 1))
    const after = aisles()
    expect(after.length).toBeGreaterThan(n0)                                      // the nudged piece's own aisle(s)
    expect(JSON.parse(store.getState().history[hist()]).objects.filter(x => x.type === 'aisle').map(strip).sort((p, q) => (p.id < q.id ? -1 : 1))).toEqual(after)
    store.getState().commitObjectUpdate(sid, vert ? { x: o.x + 2 * d } : { y: o.y + 2 * d }); await settle()
    store.getState().undo(); await settle()
    expect(aisles()).toEqual(after)
  })

  it('SP-follow: while the cut piece follows the mouse no aisle is drawn for it — it is out of the layout, no aisle names it; row 7 keeps one aisle to row 6 and one to row 8, both from the piece that stays, the same widths; none between two racks of row 7', () => {
    load(savedFill(vert))
    const a0 = aislesOf(2, 7), r = rowRacks(2, 7)[0]
    splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles })
    const moving = usePlacement.getState().active.items[0]
    movePlacement(store, near(r, 5, 3), 1)
    expect(objs().some(o => o.id === moving.id)).toBe(false)
    expect(objs().filter(o => o.type === 'aisle' && (o.row1Id === moving.id || o.row2Id === moving.id))).toEqual([])
    expect(aislesOf(2, 7)).toEqual(a0)
    const row7 = new Set(rowRacks(2, 7).map(o => o.id))
    expect(objs().filter(o => o.type === 'aisle' && row7.has(o.row1Id) && row7.has(o.row2Id))).toEqual([])
    expect(objs().filter(o => o.type === 'aisle' && (row7.has(o.row1Id) || row7.has(o.row2Id))).every(o => o.row1Id === r.id || o.row2Id === r.id)).toBe(true)
  })

  it('SP-away: the cut piece placed 3 ft away along its own line (a gap of 2.75 ft between the two) — each piece gets its own normal aisle to row 6 and to row 8 (10.5 ft), and there is none between the piece and the rack it was cut from', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], at = near(r, 5, -0.6)
    splitAt(store, at, r.id, { newId, rebuildAisles })
    const moving = usePlacement.getState().active.items[0]
    expect(moving.beams.length).toBe(5)
    movePlacement(store, vert ? { x: at.x, y: at.y - 3 * GS } : { x: at.x - 3 * GS, y: at.y }, 1)
    expect(commitPlacement(store)).toBe(true); await settle()
    const line = rowRacks(2, 7)
    expect(line.map(o => o.beams.length)).toEqual([5, 9])
    const gap = (RG.geom(line[1]).r0 - RG.geom(line[0]).r1) / GS
    expect(gap).toBeCloseTo(2.75, 6)
    const row7 = new Set(line.map(o => o.id))
    expect(objs().filter(o => o.type === 'aisle' && row7.has(o.row1Id) && row7.has(o.row2Id))).toEqual([])
    expect(aislesOf(2, 7)).toEqual({ '2/6': [10.5, 10.5], '2/8': [10.5, 10.5] })
    for (const o of line) for (const other of [6, 8]) {
      const n = objs().filter(a => a.type === 'aisle' && (a.row1Id === o.id || a.row2Id === o.id) && [a.row1Id, a.row2Id].some(id => { const q = objs().find(x => x.id === id); return q.genSection === 2 && q.rowIndex === other })).length
      expect(n).toBe(1)
    }
  })

  it('SP-undo: Ctrl+Z while the cut piece follows the mouse brings the rack back and ends the placement — the next move or click places nothing, no duplicate', () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], before = rowRacks(2, 7).map(strip)
    store.getState().commitObjectUpdate(r.id, {})                               // something to undo to
    splitAt(store, near(r, 5, 0.5), r.id, { newId, rebuildAisles })
    store.getState().undo()
    movePlacement(store, near(r, 5, 0.5), 1)
    expect(usePlacement.getState().active).toBe(null)
    expect(commitPlacement(store)).toBe(false)
    expect(cancelPlacement()).toBe(false)
    expect(rowRacks(2, 7).map(strip)).toEqual(before)
  })
})

describe('SP-aisle pairing', () => {
  // three lines of racks along x (run), across y; a pair is 8 ft deep
  const rack = (id, x, bays, y, extra = {}) => ({ id, type: 'rack_double_row', x, y, width: ((3 * (bays + 1) + 96 * bays) / 12) * GS, height: 8 * GS, rotation: 0, beams: Array(bays).fill(96), uprightWidth: 3, levels: 4, ...extra })
  const len = (b) => ((3 * (b + 1) + 96 * b) / 12) * GS
  it('end to end (sharing an upright) faces a long rack with ONE pair; a real gap between them, two; a single facing at two widths (on the far half of the line), a pair at each width', () => {
    const long = rack('L', 0, 10, 0)
    const a = rack('A', 0, 4, 20 * GS), b = rack('B', len(4) - 0.25 * GS, 6, 20 * GS)                       // a cut: shares an upright
    expect(neighbourPairs([long, a, b]).pairs.size).toBe(1)
    const c = rack('C', len(4) + 9 * GS, 4, 20 * GS)                                                            // a real gap after A
    expect(neighbourPairs([long, a, c]).pairs.size).toBe(2)
    const s = rack('S', len(4) - 0.25 * GS, 6, 24 * GS, { type: 'rack_row', height: 4 * GS })                 // end to end with A, 4 ft further across
    expect(neighbourPairs([long, a, s]).pairs.size).toBe(2)
  })
})

describe('SP-wire', () => {
  it('SP-wire: the Split button (Scissors) right after Row group in the toolbar; the canvas hands the Split tool\'s moves and clicks to splitAt / hoverSplit and draws SplitPreview; Esc leaves the tool; the panel has no Separate bays left', () => {
    const tb = readFileSync('src/components/LeftPanel/FloatingToolbar.jsx', 'utf8')
    expect(tb).toMatch(/\{ id:'rowgroup',[^\n]*\n[^\n]*\n\s*\{ id:'split',\s+tool:SPLIT_TOOL,\s+label:'Split',\s+Icon:Scissors \}/)
    const cv = readFileSync('src/canvas2/Canvas2.jsx', 'utf8')
    expect(cv).toMatch(/splitAt\(useCanvasStore, t\.world, t\.hitId, \{ newId: nanoid, rebuildAisles \}\)/)
    expect(cv).toMatch(/splitting \? splitMouseDown/)
    expect(cv).toMatch(/splitting \? splitMouseMove/)
    expect(cv).toMatch(/\{splitting && <SplitPreview \/>\}/)
    const kb = readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')
    expect(kb).toMatch(/activeTool === SPLIT_TOOL\) \{ useSplit\.setState\(\{ hover: null \}\); useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\); return \}/)
    expect(readFileSync('src/canvas2/RowGroupBar.jsx', 'utf8')).toContain("> · {placing.escHint || 'Esc to cancel'}</span>")
    expect(readFileSync('src/components/RightPanel/panels/RackRowPanelCore.jsx', 'utf8')).not.toMatch(/Separate/)
  })
})
