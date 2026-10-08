// Area RJ — a split piece brought back to the shared upright of the rack it came from always rejoins, on
// Generate's and Fill racking's racks as on hand-placed ones: clicked back into place while it follows (it
// snaps onto that upright) or dragged back — one undo step, the rack's id and fields, no splitOf; a group
// split's pieces alike. Esc, or a click elsewhere, still leaves it its own rack. Both orientations.
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


// ── RJ: a split piece brought back to its rack's shared upright rejoins — Generate's and Fill racking's racks ──
import { generateAndPlace } from '../../generate/traceGenerate'

/** The two kinds: 'fill' — the fixture's racking area (Fill racking rows: area, section and row stamps);
 *  'generated' — Generate, 500 x 250, double rows (section and row stamps, no area). Returns the rack to cut. */
function setupKind(kind, vert) {
  if (kind === 'fill') { load(savedFill(vert)); return rowRacks(2, 7)[0] }
  store.setState({ objects: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  generateAndPlace({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation: vert ? 'vertical' : 'horizontal', rackType: 'rack_double_row', dockDoors: 0 })
  load(objs())
  const racks = objs().filter(o => o.type === 'rack_double_row' && o.genSection != null && o.beams.length >= 8)
  return racks[Math.floor(racks.length / 2)]
}
const familyOf = (root) => objs().filter(o => o.id === root || o.splitOf === root)
const sameRack = (a, b) => ['id', 'type', 'beams', 'x', 'y', 'width', 'height', 'rotation', 'levels', 'genSection', 'rowIndex', 'areaId'].every(k => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null))
const alongPt = (at, ft, vert) => (vert ? { x: at.x, y: at.y + ft * GS } : { x: at.x + ft * GS, y: at.y })

describe.each([['vertical', true], ['horizontal', false]])('RJ — %s', (_, vert) => {
  describe.each([['Fill racking', 'fill'], ['Generate', 'generated']])('%s racks', (__, kind) => {
    it('RJ-click: Split, then a click right back at the cut → the piece joins its rack again: one rack, the original exactly (its id, bays, place), no splitOf; ONE history entry; one undo back to the original', async () => {
      const r = setupKind(kind, vert), before = strip(objs().find(o => o.id === r.id)), h = hist()
      const at = near(r, 3, -0.6)
      splitAt(store, at, r.id, { newId, rebuildAisles })
      movePlacement(store, at, 1)
      expect(commitPlacement(store)).toBe(true); await settle()
      const fam = familyOf(r.id)
      expect(fam.length).toBe(1)
      expect(sameRack(fam[0], before)).toBe(true)
      expect(fam[0].splitOf).toBeUndefined()
      expect(objs().some(o => o.splitOf === r.id || o.pieceOf === r.id)).toBe(false)
      expect(hist()).toBe(h + 1)
      store.getState().undo()
      expect(sameRack(objs().find(o => o.id === r.id), before)).toBe(true)
    })

    it('RJ-snap: Split, then a click a little short of the cut (0.2 ft along, 0.1 ft across) → the piece snaps onto its rack\'s shared upright while it follows, and the click joins it', async () => {
      const r = setupKind(kind, vert), before = strip(objs().find(o => o.id === r.id))
      const at = near(r, 3, -0.6)
      splitAt(store, at, r.id, { newId, rebuildAisles })
      const off = alongPt(at, -0.2, vert)
      movePlacement(store, vert ? { x: off.x + 0.1 * GS, y: off.y } : { x: off.x, y: off.y + 0.1 * GS }, 1)
      expect(usePlacement.getState().active.snapped.run).toBe('its rack')
      expect(commitPlacement(store)).toBe(true); await settle()
      expect(familyOf(r.id).length).toBe(1)
      expect(sameRack(familyOf(r.id)[0], before)).toBe(true)
    })

    it('RJ-drag: Split, the piece placed 4 ft away, then dragged straight back onto the shared upright — with its row in a Row group — rejoins: one rack, no splitOf, ONE history entry for the drag', async () => {
      const r = setupKind(kind, vert), before = strip(objs().find(o => o.id === r.id))
      const at = near(r, 3, -0.6)
      splitAt(store, at, r.id, { newId, rebuildAisles })
      movePlacement(store, alongPt(at, -4, vert), 1)
      expect(commitPlacement(store)).toBe(true); await settle()
      expect(familyOf(r.id).length).toBe(2)
      const rows = RG.rowsOf(objs(), GS)
      useRowGroup.setState({ keys: [RG.rowOfRack(rows, r.id)] })
      const piece = objs().find(o => o.splitOf === r.id), h = hist()
      // the drag of a Row group row skips snap targets that could only pull it back — never the rack it came from
      const skip = RG.groupDragExclusions(objs(), [piece.id], useRowGroup.getState().keys, GS)
      expect(skip, 'a Row group drag').toBeTruthy()
      expect(skip.has(r.id), 'its rack still a snap target').toBe(false)
      const d = 4 * GS, dx = vert ? 0 : d, dy = vert ? d : 0
      const plan = planInlineDrop(objs(), [piece.id], piece.id, dx, dy, GS)
      expect(plan && plan.join).toBeTruthy()
      applyJoin(store, plan.join, { rebuildAisles, newId }); await settle()                 // the drop: the join carries the merged rack
      expect(familyOf(r.id).length).toBe(1)
      expect(familyOf(r.id)[0].beams).toEqual(before.beams)
      expect(familyOf(r.id)[0].splitOf).toBeUndefined()
      expect(hist()).toBe(h + 1)
    })

    it('RJ-group: three rows in the Row group split together, then a click right back at the cut → every piece joins its own rack: the three rows as they were, ONE history entry', async () => {
      const r = setupKind(kind, vert)
      const rows = RG.rowsOf(objs(), GS), mine = RG.rowOfRack(rows, r.id)
      // the cut row and its neighbours on either side (rows that line up at that upright)
      const sameSec = [...rows.values()].filter(x => x.key.split('|')[2] === mine.split('|')[2])
      const idx = (k) => Number(k.split('|')[3])
      const keys = sameSec.filter(x => Math.abs(idx(x.key) - idx(mine)) <= 1).map(x => x.key)
      useRowGroup.setState({ keys })
      const roots = keys.map(k => rows.get(k).ids.find(id => objs().find(o => o.id === id)?.type === 'rack_double_row')).filter(Boolean)
      const before = roots.map(id => strip(objs().find(o => o.id === id))), h = hist()
      const at = near(r, 3, -0.6)
      splitAt(store, at, r.id, { newId, rebuildAisles })
      expect(usePlacement.getState().active.items.length).toBeGreaterThanOrEqual(2)
      movePlacement(store, at, 1)
      expect(commitPlacement(store)).toBe(true); await settle()
      for (const b of before) {
        const fam = familyOf(b.id)
        expect(fam.length).toBe(1)
        expect(sameRack(fam[0], b)).toBe(true)
      }
      expect(objs().some(o => o.splitOf)).toBe(false)
      expect(hist()).toBe(h + 1)
    })

    it('RJ-stay: Split + Esc still leaves the piece its own rack on the shared upright; a click 4 ft away leaves it there, split', async () => {
      let r = setupKind(kind, vert)
      splitAt(store, near(r, 3, -0.6), r.id, { newId, rebuildAisles }); cancelPlacement(); await settle()
      expect(familyOf(r.id).length).toBe(2)
      r = setupKind(kind, vert)
      const at = near(r, 3, -0.6)
      splitAt(store, at, r.id, { newId, rebuildAisles }); movePlacement(store, alongPt(at, -4, vert), 1); commitPlacement(store); await settle()
      expect(familyOf(r.id).length).toBe(2)
    })
  })
})
