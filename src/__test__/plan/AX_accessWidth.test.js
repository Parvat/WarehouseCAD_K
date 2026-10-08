// Area AX — the exact travel width. BUG 72: a way in counts only where it is at least the travel width all
// along, to 0.001 ft (8.000 passes, 7.99 does not) — "No way in" and the fill's way-in alike. BUG 73: Check
// layout warns for a cross-aisle between sections under the travel width, per line (a rack standing in it
// splits it), naming the two racks and the width; gaps inside a section and hand-placed layouts stay silent;
// the Row group carries the warning. Both orientations; the fixture's four fills stay clean.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize, planAreaCreate } from '../../generate/rackingArea'
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


// ── AX: the exact travel width (BUG 72) and cross-aisles under it (BUG 73) ──────────────────────────────────
import { cutOffRacks, giveWayIn } from '../../generate/aisleAccess'
import { sectionCrossAisles } from '../../utils/copyChange'
import { WARN_KINDS } from '../../utils/rowGroup'
import { cutRack } from '../../utils/splitTool'
import { checkPlacement } from '../../utils/placement'

const FILLS = [['as saved, vertical', false, 'vertical', true], ['as saved, horizontal', false, 'horizontal', false], ['turned, vertical', true, 'vertical', false], ['turned, horizontal', true, 'horizontal', false]]
function fillOf(turned, orientation, stored) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })).map(o => (turned ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area')
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  return stored ? planAreaResize(objs, area.id, box, { gridSize: GS }) : planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
/** The fill with the 11.2 ft cross-aisle between sections 2 and 3: horizontal rows, or the turned layout's vertical ones. */
const crossFill = (vert) => (vert ? fillOf(true, 'vertical', false) : fillOf(false, 'horizontal', false))
const fpOf = (objects) => objects.find(o => typeof o.type === 'string' && o.type.startsWith('fp_'))
const crossWarnings = (objects) => checkLayout(objects, { gridSize: GS }).warnings.filter(w => w.kind === 'cross-aisle')
const rackOf = (objects, sec, ri) => objects.find(o => o.type === 'rack_double_row' && o.genSection === sec && o.rowIndex === ri)
/** Row 7, section 2's pair grown by one 8' bay toward section 3 (the BUG 73 case). */
function grown(objects) {
  const a = rackOf(objects, 2, 7), g = RG.geom(a)
  return objects.map(o => (o.id === a.id ? RG.withRun(a, g.r0, [...g.beams, 96], GS) : o))
}
const gapOf = (objects, aId, bId) => { const a = RG.geom(objects.find(o => o.id === aId)), b = RG.geom(objects.find(o => o.id === bId)); return (b.r0 - a.r1) / GS }

// a synthetic building: a barrier of racks across it at 30 ft with one gap; a rack on each side
function barrier(gapFt, vert) {
  const fp = { id: 'B', type: 'fp_rect', x: 0, y: 0, width: (vert ? 40 : 60) * GS, height: (vert ? 60 : 40) * GS, wallThicknessFt: 0.5 }
  // footprints in (run, across) ft, laid out for horizontal rows; turned for vertical ones
  const foot = (id, r, s, len, dep) => {
    const [fx, fy, fw, fh] = vert ? [s, r, dep, len] : [r, s, len, dep]
    if (!vert) return { id, type: 'rack_row', x: fx * GS, y: fy * GS, width: fw * GS, height: fh * GS, rotation: 0, beams: [96], uprightWidth: 3, parentId: 'B' }
    return { id, type: 'rack_row', x: (fx + fw / 2 - fh / 2) * GS, y: (fy + fh / 2 - fw / 2) * GS, width: fh * GS, height: fw * GS, rotation: 90, beams: [96], uprightWidth: 3, parentId: 'B' }
  }
  // the barrier runs across the floor (along "across"), two pieces leaving the gap
  const bar = (id, s0, s1) => (vert ? { ...foot(id, 30, s0, 2, s1 - s0) } : { ...foot(id, 30, s0, 2, s1 - s0) })
  return { fp, objects: [fp, bar('top', 0, 15), bar('bot', 15 + gapFt, 40), foot('far', 42, 18, 10, 3.5), foot('near', 8, 18, 10, 3.5)] }
}

describe.each([['horizontal', false], ['vertical', true]])('AX — %s', (_, vert) => {
  it('AX-noway (BUG 72): a pocket whose only way in is a gap — 8.000 ft is a way in (nothing cut off, no "No way in"); 7.99 ft and 7.5 ft are not (the far rack cut off, "No way in") — the old grid let 7.5 ft through', () => {
    for (const [gap, open] of [[8.0, true], [7.99, false], [7.5, false]]) {
      const { fp, objects } = barrier(gap, vert)
      const cut = cutOffRacks(objects, fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5 }).cutOff.map(c => c.id)
      const noWay = checkLayout(objects, { gridSize: GS }).errors.filter(e => e.kind === 'no-way-in')
      expect([gap, cut.includes('far')]).toEqual([gap, !open])
      expect([gap, noWay.length > 0]).toEqual([gap, !open])
    }
  })

  it('AX-lane (BUG 72): giving the racks a way in — at 8.000 ft the far rack keeps its place (it has one); at 7.99 ft no lane can reach the main floor through the fixed barrier, so the far rack goes', () => {
    for (const [gap, kept] of [[8.0, true], [7.99, false]]) {
      const { fp, objects } = barrier(gap, vert)
      let n = 0
      const after = giveWayIn(objects, fp, ['far'], { gridSize: GS, travelFt: 8, aisleFt: 10.5, dir: 1, newId: () => 'w' + (++n) })
      expect([gap, after.some(o => o.id === 'far')]).toEqual([gap, kept])
    }
  })

  it('AX-73: the BUG 73 case — row 7, section 2 grown by a bay toward section 3: the cross-aisle in that line is 2 ft 11 in — Check layout WARNS (not an error), naming both racks and the width; a way in still exists, so no "No way in"', () => {
    const out = grown(crossFill(vert))
    const a = rackOf(out, 2, 7), b = rackOf(out, 3, 7)
    expect(gapOf(out, a.id, b.id)).toBeCloseTo(2.952, 3)
    const ws = crossWarnings(out)
    expect(ws.map(w => [w.severity, w.ids.slice().sort(), w.text])).toEqual([['warning', [a.id, b.id].sort(), `Cross-aisle between row 7, section 2 and row 7, section 3: 2' 11", needs 8' to drive`]])
    expect(checkLayout(out, { gridSize: GS }).errors.filter(e => e.kind === 'cross-aisle' || e.kind === 'no-way-in')).toEqual([])
  })

  it('AX-73-boundary: the same line held at exactly 8.000 ft → no warning; at 7.99 ft → the warning', () => {
    for (const [ft, warned] of [[8.0, false], [7.99, true]]) {
      const base = crossFill(vert), a = rackOf(base, 2, 7), b = rackOf(base, 3, 7)
      const d = (RG.geom(a).r1 + ft * GS) - RG.geom(b).r0
      const out = base.map(o => (o.id === b.id ? RG.movedAlong(o, d) : o))
      expect(gapOf(out, a.id, b.id)).toBeCloseTo(ft, 6)
      expect([ft, crossWarnings(out).some(w => w.ids.includes(b.id))]).toEqual([ft, warned])
    }
  })

  it('AX-73-quiet: gaps inside a section never warn — a split piece moved 2 ft 9 in off its rack, a bay deleted from the middle of a row; nor a layout placed by hand (no section stamps) with the BUG 73 gap', () => {
    // a split inside section 2: 2' 9" between the pieces
    const base = crossFill(vert), r = rackOf(base, 2, 7)
    const [p, q] = cutRack(r, 5, GS, () => 'piece', 'first')
    const split = base.map(o => (o.id === r.id ? p : o)).concat([RG.movedAlong(q, 3 * GS)])
    expect(gapOf(split, p.id, 'piece')).toBeCloseTo(2.75, 6)
    expect(crossWarnings(split)).toEqual([])
    // a bay deleted from the middle (the real action)
    load(base)
    store.setState({ activeBaySelection: [{ objId: r.id, bayIdx: 6 }] })
    store.getState().deleteSelectedBays()
    expect(objs().filter(o => o.genSection === 2 && o.rowIndex === 7 && o.type === 'rack_double_row').length).toBe(2)
    expect(crossWarnings(objs())).toEqual([])
    // the BUG 73 layout placed by hand: no stamps, no sections, no warning
    const hand = grown(crossFill(vert)).map(o => (o.type?.startsWith('rack_') ? (({ genSection, rowIndex, genRunFt, genCrossFt, areaId, ...rest }) => rest)(o) : o))
    expect(crossWarnings(hand)).toEqual([])
  })

  it('AX-73-stand: a plain rack (no stamps) standing in the cross-aisle in the line of row 7 splits it — both gaps either side are under the travel width, each warns and names that rack', () => {
    const base = crossFill(vert), a = rackOf(base, 2, 7), b = rackOf(base, 3, 7)
    const ga = RG.geom(a), gap = RG.geom(b).r0 - ga.r1
    const one = RG.withRun({ ...a, id: 'plain', genSection: undefined, rowIndex: undefined, genRunFt: undefined, genCrossFt: undefined }, ga.r1 + (gap - (3 * 2 + 96) / 12 * GS) / 2, [96], GS)
    const out = [...base, one]
    const ws = crossWarnings(out).filter(w => w.ids.includes('plain'))
    expect(ws.length).toBe(2)
    expect(ws.map(w => w.ids.find(id => id !== 'plain')).sort()).toEqual([a.id, b.id].sort())
  })

  it('AX-73-group: rows 6, 7 and 8 of section 2 in a Row group, a bay added to row 7 toward section 3 → the apply offered to rows 6 and 8 carries the warning "a cross-aisle under the travel width" (Check layout\'s finding, no Row group change)', async () => {
    load(crossFill(vert))
    const key = (sec, ri) => [...RG.rowsOf(objs(), GS).keys()].find(k => k.endsWith('|' + sec + '|' + ri))
    useRowGroup.getState().setAlwaysApply(false)
    useRowGroup.setState({ keys: [key(2, 6), key(2, 7), key(2, 8)] })
    const a = rackOf(objs(), 2, 7), g = RG.geom(a), next = RG.withRun(a, g.r0, [...g.beams, 96], GS)
    store.getState().updateObject(a.id, { beams: next.beams, width: next.width, x: next.x, y: next.y })
    store.getState().commitObjectUpdate(a.id, {}); await settle()
    const p = useRowGroup.getState().pending
    expect(p, 'an apply offered').toBeTruthy()
    const warned = p.plan.targets.filter(t => (t.warnings || []).includes(WARN_KINDS['cross-aisle']))
    expect(warned.length).toBe(2)
    expect(WARN_KINDS['cross-aisle']).toBe('a cross-aisle under the travel width')
  })
})

describe.each([['vertical', true], ['horizontal', false]])('AX-place — %s', (_, vert) => {
  it('AX-place: the layout as saved (its wall rows run the whole length, so section envelopes overlap and the old rule found no cross-aisle): a one-bay single placed in the line of row 7 inside the 16.6 ft cross-aisle between sections 1 and 2 → placement warns "In the cross-aisle between sections 1 and 2"', () => {
    const out = savedFill(vert), fp = fpOf(out)
    const rot = rackFootprint(rackOf(out, 2, 7)).rotated
    const g = sectionCrossAisles(out, fp.id, rot).find(x => x.b.genSection === 2 && x.b.rowIndex === 7)
    expect(g && (g.hi - g.lo) / GS).toBeCloseTo(16.631, 3)
    const one = RG.withRun({ ...g.b, id: 'placed', type: 'rack_row' }, g.lo + 4 * GS, [96], GS)
    const chk = checkPlacement([one], out, GS)
    expect(chk.crossAisle).toBe(true)
    expect(chk.warnings).toContain('In the cross-aisle between sections 1 and 2')
  })
})

describe('AX-clean', () => {
  it('AX-clean: the access and check modules carry no debugging — no process.env (it does not exist in the browser: the app would crash) and no console.log', () => {
    for (const f of ['src/generate/aisleAccess.js', 'src/utils/copyChange.js', 'src/utils/layoutCheck.js']) {
      const src = readFileSync(f, 'utf8')
      expect([f, /process.env/.test(src), /console.log/.test(src)]).toEqual([f, false, false])
    }
  })
})

describe('AX-fills', () => {
  it.each(FILLS)('AX-fills (%s): the fixture — nothing cut off, no "No way in", no cross-aisle warning; the cross-aisle lines found per line (25 as saved vertical / turned horizontal, 38 the other two)', (_, turned, orientation, stored) => {
    const out = fillOf(turned, orientation, stored), fp = fpOf(out)
    expect(cutOffRacks(out, fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5 }).cutOff).toEqual([])
    const chk = checkLayout(out, { gridSize: GS })
    expect(chk.errors.filter(e => e.kind === 'no-way-in')).toEqual([])
    expect(chk.warnings.filter(w => w.kind === 'cross-aisle')).toEqual([])
    const lines = [false, true].reduce((t, rot) => t + sectionCrossAisles(out, fp.id, rot).length, 0)
    expect(lines).toBe(turned === (orientation === 'horizontal') ? 25 : 38)
  })
})
