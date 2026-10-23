// Area EV — Elevations (ELEVATIONS_PLAN.md; utils/elevations.js, elevPaint.js, elevEditor.js, elevationDraw.js,
// elevationDrawing.js). v1: types assigned layout default → rack → side → bay, overrides only where they differ;
// paint mode Row / Side / Bay (hover = what a click changes, the flue = both sides, a drag stays on its row and side);
// positions per bay from the bay-side's type; existing racks' levels become types on load with nothing moved and
// usable unchanged; splits, one-side delete, takeover, joins and Row group replays carry the type; Check layout
// errors; legend, PDF, the BOM data. v2: beam face (levels to the top of the beam), frame depth from the rack, a type
// change no hand edit, the types in the store (undo, save / load, old files), the editor's edits, the drawing, the
// PDF's elevation sheets. Both orientations.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaCreate, planAreaResize, areaEdits } from '../../generate/rackingArea'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { DEFAULT_RULES } from '../../rules/defaults'
import { usableCapacity } from '../../generate/usableCapacity'
import { MHE_PROFILES, rackFootprint } from '../../generate/columnCheck'
import { narrowAisleBlocks } from '../../generate/narrowAisles'
import { bayLedger } from '../../utils/bayLedger'
import { getRackCapacity } from '../../utils/capacity'
import { checkLayout } from '../../utils/layoutCheck'
import { splitRackForBayDelete } from '../../utils/baySplit'
import { planBaySideDelete } from '../../utils/baySides'
import { installPairKeeper } from '../../utils/pairCarryOn'
import { joinRacks } from '../../canvas2/inlineSnap'
import * as RG from '../../utils/rowGroup'
import * as E from '../../utils/elevations'
import * as ED from '../../utils/elevEditor'
import * as RP from '../../utils/rightPanel'
import { elevationLayout, lengthsByType, ftInDash, parseFtIn, archScale, misfitLevels, labelBox, toSVG } from '../../utils/elevationDrawing'
const itemSVGOf = (d) => toSVG(d)
import { rackDepthUpdate } from '../../utils/rackDepth'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import * as SEL from '../../utils/elevSelection'
import * as FIT from '../../utils/elevFit'
import * as TAB from '../../utils/elevTab'
import * as P from '../../utils/project'
import * as DRAW from '../../utils/elevationDraw'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup, addRowOf } from '../../utils/rowGroupTool'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
const REACH = MHE_PROFILES.reach
const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
const turn = (o) => { const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }; if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x })); if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW }); return t }

let store, stops = [], seq = 0
const newId = () => 'e' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  stops = [installPairKeeper(store), installRowGroupWatcher(store, newId), E.installElevationsKeeper(store)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { clearGroup(); useRowGroup.getState().setAlwaysApply(false) })

function savedFill(vert) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })), area = objs.find(o => o.type === 'racking_area')
  const out = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
  if (vert) return out
  return out.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
}
/** A layout set into the store without types: the keeper gives it its types. */
const load = (objects, elevations = null) => store.setState({ objects: strip(objects), elevations, groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects, groups: [], elevations })], historyIndex: 0 })
const objs = () => store.getState().objects
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const T = () => store.getState().elevations
const rowRacks = (ri, type, o = objs()) => o.filter(x => x.genSection === 2 && x.rowIndex === ri && (!type || x.type === type))
const pairOf = (ri, o) => rowRacks(ri, 'rack_double_row', o)[0]
/** One undo step in the store: the table changed by fn. */
const commitTable = (fn) => ED.commitTable(store, fn)

/** A world point in rack `p`'s own bay `i`, on local band `side` (0 top, 1 bottom, null the flue / a single's middle). */
function pointIn(p, i, side) {
  const up = ((p.uprightWidth || 3) / 12) * GS
  let lx = p.x + up; for (let k = 0; k < i; k++) lx += up + (p.beams[k] / 12) * GS
  lx += (p.beams[i] / 24) * GS
  const flue = p.type === 'rack_double_row' ? ((p.flueSpaceIn ?? 9) / 12) * GS : 0, rowH = (p.height - flue) / 2
  const ly = side === 0 ? p.y + rowH / 2 : side === 1 ? p.y + p.height - rowH / 2 : p.y + p.height / 2
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2, t = ((p.rotation || 0) * Math.PI) / 180, dx = lx - cx, dy = ly - cy
  return { x: cx + dx * Math.cos(t) - dy * Math.sin(t), y: cy + dx * Math.sin(t) + dy * Math.cos(t) }
}

/* A small hand layout: a building, two pairs end to end in one row (sharing a frame), a single row in another
   row; 96" beams, 2 pallets a beam, 4 levels. → { o (objects), t (types) } */
const UP = 3, D = 42, FL = 9
const wPx = (n) => ((UP * (n + 1) + 96 * n) / 12) * GS, hPair = ((2 * D + FL) / 12) * GS, hSingle = (D / 12) * GS
function hand(vert) {
  const fp = { id: 'fp', type: 'fp_rect', x: -4000, y: -4000, width: 8000, height: 8000, wallThicknessFt: 0.25, fpVerts: [{ x: -4000, y: -4000 }, { x: 4000, y: -4000 }, { x: 4000, y: 4000 }, { x: -4000, y: 4000 }] }
  const rack = (id, type, n, runStart, acrossC) => {
    const w = wPx(n), h = type === 'rack_double_row' ? hPair : hSingle
    const cx = vert ? acrossC : runStart + w / 2, cy = vert ? runStart + w / 2 : acrossC
    return { id, type, parentId: 'fp', x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: vert ? 90 : 0, beams: Array(n).fill(96), uprightWidth: UP, depthIn: D, flueSpaceIn: type === 'rack_double_row' ? FL : 0, palletWIn: 40, levels: 4 }
  }
  const m = E.migrate([fp, rack('p1', 'rack_double_row', 3, 0, 0), rack('p2', 'rack_double_row', 3, wPx(3) - (UP / 12) * GS, 0), rack('s', 'rack_row', 4, 0, 30 * GS)])
  return { o: m.objects, t: m.table }
}
const edit = ({ o, t }, fn) => { const r = E.editTable(o, t, fn); return { o: r.objects, t: r.table } }
/** a second and a third type: B 6 levels, C 4 levels */
const withTypes = (L) => {
  let x = edit(L, t => E.addType(t, { id: 'B', name: 'B' }))
  x = edit(x, t => E.updateType(t, 'B', { levels: E.levelsOf(6), uprightHeightIn: 360 }))
  return edit(x, t => E.addType(t, { id: 'C', name: 'C' }))
}
const rack = (o, id) => o.find(x => x.id === id)
const ids = (r, t) => E.typeMap(r, t)
const paintIn = ({ o, t }, id, opts) => ({ o: o.map(x => (x.id === id ? E.paintRack(x, t, opts) : x)), t })

describe.each([['horizontal', false], ['vertical', true]])('EV — %s', (_, vert) => {
  it('EV-migrate: the 12 fills and the four Generate layouts — the racks\' levels become types (the most common the default), nothing moves, usable (gross and every loss) unchanged', () => {
    const SHAPE_CUTS = { rectangle: [], L: ['bl'], T: ['bl', 'br'] }
    const shaped = (f, cuts) => { if (!cuts.length) return f; const X = (ft) => f.x + ft * GS, Y = (ft) => f.y + ft * GS, Wd = f.width / GS, Hd = f.height / GS; const v = [[0, 0], [Wd, 0]]; if (cuts.includes('br')) v.push([Wd, 170], [Wd - 150, 170], [Wd - 150, Hd]); else v.push([Wd, Hd]); if (cuts.includes('bl')) v.push([150, Hd], [150, 170], [0, 170]); else v.push([0, Hd]); return { ...f, fpVerts: v.map(([x, y]) => ({ x: X(x), y: Y(y) })) } }
    const layouts = []
    for (const shape of Object.keys(SHAPE_CUTS)) for (const [turned, orientation, stored] of [[vert ? false : true, 'vertical', !vert], [vert ? true : false, 'horizontal', false]]) {
      const o = REAL_LAYOUT.map(x => (x.type.startsWith('fp_') ? shaped(x, SHAPE_CUTS[shape]) : { ...x })).map(x => (turned ? turn(x) : x))
      const area = o.find(x => x.type === 'racking_area'), box = { x: area.x, y: area.y, w: area.width, h: area.height }
      layouts.push(stored ? planAreaResize(o, area.id, box, { gridSize: GS }) : planAreaCreate(o.filter(x => x !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects)
    }
    for (const [L, Wd] of vert ? [[250, 500], [300, 420]] : [[500, 250], [420, 300]]) {
      const f = { id: 'g', type: 'fp_rect', x: 0, y: 0, width: L * GS, height: Wd * GS, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: L * GS, y: 0 }, { x: L * GS, y: Wd * GS }, { x: 0, y: Wd * GS }] }
      const ps = sizingSheetLayout({ lengthFt: L, widthFt: Wd, gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', orientation: vert ? 'vertical' : 'horizontal', wallClearIn: 3, wallThicknessIn: 3 }, DEFAULT_RULES)
      layouts.push([f, ...ps.map(placementToObject).map(r => ({ ...r, parentId: 'g' }))])
    }
    expect(layouts.length).toBe(8)
    for (const lay of layouts) {
      const m = E.migrate(lay)
      expect(m.table.types.find(t => t.id === m.table.defaultId).levels.length).toBe(4)
      const geo = (o) => o.filter(E.isBeamRack).map(r => [r.id, r.x, r.y, r.width, r.height, r.rotation, r.levels].join(','))
      expect(geo(m.objects)).toEqual(geo(lay))
      expect(usableCapacity(m.objects, { profile: REACH, gridSize: GS, elevations: m.table })).toEqual(usableCapacity(lay, { profile: REACH, gridSize: GS }))
    }
  })

  it('EV-mixed: racks of 4 and of 5 levels — two types, the 4 the default, the 5s carry theirs as elevType; positions unchanged', () => {
    const lay = savedFill(vert).map(o => (E.isBeamRack(o) && o.rowIndex === 3 ? { ...o, levels: 5 } : o))
    const m = E.migrate(lay)
    expect(m.table.types.map(t => [t.id, t.levels.length])).toEqual([['elev-4', 4], ['elev-5', 5]])
    expect(m.table.defaultId).toBe('elev-4')
    expect(m.objects.filter(o => o.elevType === 'elev-5').length).toBe(lay.filter(o => E.isBeamRack(o) && o.levels === 5).length)
    expect(bayLedger(m.objects, GS, m.table).positions).toBe(bayLedger(lay, GS).positions)
  })

  it('EV-assign: the six cases — all bays one type; half / half; single rows; back-to-back rows; different types on the two sides; single bays within a side — each bay-side resolves to the most specific type, overrides stored only where they differ', () => {
    const L = withTypes(hand(vert)), { o, t: tb } = L, def = tb.defaultId
    const allB = edit(L, t => E.setDefault(t, 'B'))
    expect(allB.o.filter(E.isBeamRack).every(r => ids(r, allB.t).flat().every(t => t === 'B'))).toBe(true)
    expect(allB.o.filter(E.isBeamRack).some(r => E.ELEV_FIELDS.some(k => r[k] != null))).toBe(false)
    const p1 = E.paintRack(rack(o, 'p1'), tb, { typeId: 'B' })
    expect([p1.elevType, p1.elevSides, p1.elevBays, ids(p1, tb).flat().every(t => t === 'B'), p1.levels]).toEqual(['B', undefined, undefined, true, 6])
    const s = E.paintRack(rack(o, 's'), tb, { typeId: 'C' })
    expect([s.elevType, ids(s, tb)]).toEqual(['C', [['C', 'C', 'C', 'C']]])
    expect(ids(E.paintRack(rack(o, 'p2'), tb, { typeId: 'C' }), tb)).toEqual([['C', 'C', 'C'], ['C', 'C', 'C']])
    const two = E.paintRack(rack(o, 'p2'), tb, { sides: [1], typeId: 'B' })
    expect([two.elevType, two.elevSides, ids(two, tb)]).toEqual([undefined, [null, 'B'], [[def, def, def], ['B', 'B', 'B']]])
    const bay = E.paintRack(two, tb, { sides: [0], bays: [1], typeId: 'C' })
    expect([bay.elevSides, bay.elevBays, ids(bay, tb)]).toEqual([[null, 'B'], [[null, 'C', null], [null, null, null]], [[def, 'C', def], ['B', 'B', 'B']]])
    const back = E.paintRack(E.paintRack(bay, tb, { sides: [0], bays: [1], typeId: def }), tb, { sides: [1], typeId: def })
    expect(E.ELEV_FIELDS.map(k => back[k])).toEqual([undefined, undefined, undefined])
  })

  it('EV-positions: pallet positions per bay come from the bay-side\'s type — side 1 of one bay 6 levels: the ledger, the rack capacity, usable gross and a narrow-aisle loss on that face all count 6 there (the types passed in; without them, the racks\' own levels)', () => {
    const L = withTypes(hand(vert)), { o, t: tb } = L
    const before = bayLedger(o, GS, tb).positions
    const p = E.paintRack(rack(o, 'p1'), tb, { sides: [1], bays: [0], typeId: 'B' })
    const o2 = o.map(x => (x.id === 'p1' ? p : x))
    expect(bayLedger(o2, GS, tb).positions).toBe(before + 2 * (6 - 4))
    expect(bayLedger(o2, GS).positions).toBe(before)
    expect(getRackCapacity(p, undefined, E.levelsResolver(tb)).total).toBe(2 * 3 * 4 * 2 + 2 * 2)
    expect(getRackCapacity(p).total).toBe(2 * 3 * 4 * 2)
    expect(usableCapacity(o2, { profile: REACH, gridSize: GS, elevations: tb }).gross).toBe(usableCapacity(o, { profile: REACH, gridSize: GS, elevations: tb }).gross + 4)
    const f = rackFootprint(p)
    const zoneAt = (lo) => { const s0 = vert ? f.x : f.y, s1 = vert ? f.x + f.w : f.y + f.h, r0 = vert ? f.y : f.x; const a = lo ? s0 - 3 * GS - 4 * GS : s1 + 3 * GS; return vert ? { id: 'z', type: 'zone_custom', x: a, y: r0, width: 4 * GS, height: wPx(3) } : { id: 'z', type: 'zone_custom', x: r0, y: a, width: wPx(3), height: 4 * GS } }
    const lo = RG.worldSideOf(p, 1, [p]) === 'lo'
    const blocks = narrowAisleBlocks([...o2.filter(x => x.id !== 'p2'), zoneAt(lo)], { profile: REACH, gridSize: GS, elevations: tb })
    const b0 = blocks.find(b => b.rackId === 'p1' && b.bayIndex === 0)
    expect([b0.faces, b0.positionsLost]).toEqual([[1], b0.positionIndices.length * 6])
  })

  it('EV-selection: the selection as bay-sides — a rack selected whole: every bay on every side; one clicked bay: that side (both when picked between them); bays picked across racks: theirs; a single row has side 0 only; the types among them with their bays; the drawing\'s beam the picked bay\'s', () => {
    const { o, t } = hand(vert), at = (patch) => [...SEL.selectionCells({ objects: o, selectedIds: [], activeBaySelection: [], ...patch })].map(([id, c]) => [id, c.map(x => x.join('/')).sort()]).sort()
    expect(at({ selectedIds: ['p1'] })).toEqual([['p1', ['0/0', '0/1', '0/2', '1/0', '1/1', '1/2']]])
    const clicked = (side) => o.map(x => (x.id === 'p1' ? { ...x, activeBayIdx: 1, activeBaySide: side } : x))
    expect([...SEL.selectionCells({ objects: clicked(1), selectedIds: ['p1'], activeBaySelection: [] })].map(([id, c]) => [id, c])).toEqual([['p1', [[1, 1]]]])
    expect([...SEL.selectionCells({ objects: clicked(null), selectedIds: ['p1'], activeBaySelection: [] })].map(([id, c]) => [id, c])).toEqual([['p1', [[0, 1], [1, 1]]]])
    expect(at({ selectedIds: ['p1', 'p2'], activeBaySelection: [{ objId: 'p1', bayIdx: 1, side: 0 }, { objId: 'p2', bayIdx: 0 }] })).toEqual([['p1', ['0/1']], ['p2', ['0/0', '1/0']]])
    expect(at({ selectedIds: ['s'], activeBaySelection: [{ objId: 's', bayIdx: 2, side: 1 }] })).toEqual([['s', ['0/2']]])
    expect(at({ selectedIds: ['fp'] })).toEqual([])
    // the types among them, most bays first; the drawing at the picked bay's beam
    const L = paintIn(withTypes({ o, t }), 'p1', { sides: [1], typeId: 'B' }), cells = SEL.selectionCells({ objects: L.o, selectedIds: ['p1', 's'], activeBaySelection: [] })
    expect(SEL.cellTypes(L.o, L.t, cells)).toEqual([{ id: L.t.defaultId, bays: 7 }, { id: 'B', bays: 3 }])
    expect([...SEL.cellsOfType(L.o, L.t, cells, 'B')]).toEqual([['p1', [[1, 0], [1, 1], [1, 2]]]])
    const long = o.map(x => (x.id === 'p1' ? { ...x, beams: [96, 120, 96] } : x))
    expect(SEL.drawEntry(long, new Map([['p1', [[0, 1]]]])).beamIn).toBe(120)
    expect(SEL.drawEntry(long, new Map([['p1', [[0, 0], [0, 1], [0, 2]]]])).beamIn).toBe(96)
    expect(SEL.drawEntry(o, new Map([['p1', [[0, 0]]]]))).toMatchObject({ depthIn: 42, pair: true, flueIn: 9, palletWIn: 40, parentId: 'fp' })
  })

  it('EV-commit: choosing a type sets it on every selected bay-side — ONE history entry each; one undo takes it back; the default chosen takes the override off', async () => {
    const L = withTypes(hand(vert)); load(L.o, L.t); await settle()
    const h = hist(), def = T().defaultId
    const cells = (patch) => SEL.selectionCells({ objects: objs(), selectedIds: [], activeBaySelection: [], ...patch })
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'] }), 'C')).toBe(true); await settle()
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'], activeBaySelection: [0, 1, 2].map(b => ({ objId: 'p1', bayIdx: b, side: 1 })) }), 'B')).toBe(true); await settle()
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'], activeBaySelection: [{ objId: 'p1', bayIdx: 0, side: 1 }] }), def)).toBe(true); await settle()
    expect(hist()).toBe(h + 3)
    expect([rack(objs(), 'p1').elevType, ids(rack(objs(), 'p1'), T())]).toEqual(['C', [['C', 'C', 'C'], [def, 'B', 'B']]])
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'] }), 'C')).toBe(true); await settle()
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'] }), 'C')).toBe(false)                    // nothing to change: no entry
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'] }), 'nope')).toBe(false)
    expect(SEL.commitAssign(store, cells({ selectedIds: ['p1'] }), def)).toBe(true); await settle()
    expect(['p1', 'p2'].map(id => E.ELEV_FIELDS.map(k => rack(objs(), id)[k]))).toEqual([[undefined, undefined, undefined], [undefined, undefined, undefined]])
    expect(hist()).toBe(h + 5)
    store.getState().undo()
    expect(rack(objs(), 'p1').elevType).toBe('C')
    store.getState().undo()
    expect(ids(rack(objs(), 'p1'), T())[1]).toEqual([def, 'B', 'B'])
  })

  it('EV-custom-prune: a "· custom" type left by an older layout is removed once no bay uses it — in the same undo step as the change that emptied it; others stay, a custom default too', async () => {
    // an older layout: a custom type on one bay-side, and a named one on none
    const L = hand(vert), t2 = { ...L.t, types: [...L.t.types, { ...L.t.types[0], id: 'cu', name: '4 levels · custom' }, { ...L.t.types[0], id: 'sv', name: '5 levels · 25\'' }] }
    load(L.o.map(x => (x.id === 'p1' ? E.paintRack(x, t2, { sides: [0], bays: [1], typeId: 'cu' }) : x)), t2); await settle()
    const def = T().defaultId, one = new Map([['p1', [[0, 1]]]])
    expect(T().types.map(t => t.id)).toContain('cu')
    const h = hist()
    SEL.commitAssign(store, one, def); await settle()
    expect([T().types.some(t => t.id === 'cu'), T().types.some(t => t.id === 'sv'), hist()]).toEqual([false, true, h + 1])
    expect(JSON.parse(store.getState().history[hist()]).elevations.types.some(t => t.id === 'cu')).toBe(false)   // folded into the entry
    store.getState().undo()
    expect(E.typeIdAt(rack(objs(), 'p1'), 1, 0, T())).toBe('cu')
    commitTable(t => E.setDefault(t, 'cu')); await settle()
    SEL.commitAssign(store, one, 'sv'); await settle()
    expect(T().types.some(t => t.id === 'cu')).toBe(true)
    expect(E.isCustomName('4 levels · custom 3') && !E.isCustomName("5 levels · 21'") && !E.isCustomName('Mezzanine custom')).toBe(true)
  })

  it('EV-fit: proposals from the building — clear 30\', sprinklers 29\'-6", pallet 48": pitch 58" (pallet + clearance + face, to the hole pitch), best 5 levels (floor + 4\'-10", 9\'-8", 14\'-6", 19\'-4"), upright 21\'; 6 levels flagged 2" over the sprinkler limit; one fewer offered; no clear height, no proposals', () => {
    const b = { clearHeightIn: 360, sprinklerIn: 354 }
    expect(FIT.levelPitch({})).toBe(58)
    const P = FIT.proposals(b, {}, (d) => d.levels.length * 100)
    expect(P.map(p => [p.n, p.best, p.over])).toEqual([[5, true, 0], [4, false, 0], [6, false, 2]])
    const best = P[0]
    expect(best.design.levels.map(l => ftInDash(l.beamIn))).toEqual(['0"', '4\'-10"', '9\'-8"', '14\'-6"', '19\'-4"'])
    expect([best.design.uprightHeightIn, best.headroom, best.kind, best.positions, FIT.autoName(best.design)]).toEqual([252, 336 - 280, 'sprinkler', 500, "5 levels · 21'"])
    expect([P[2].kind, P[2].topLoad, P[2].limit]).toEqual(['sprinkler', 338, 336])
    // the hole pitch rounds the pitch up; the upright step; never above the clear height; no sprinklers: the clear height binds
    expect([FIT.levelPitch({ palletHeightIn: 47 }), FIT.levelPitch({ palletHeightIn: 47, holePitchIn: 1 })]).toEqual([58, 57])
    expect([FIT.uprightFor(232, b, { uprightStepIn: 6 }), FIT.uprightFor(350, { clearHeightIn: 355 }, {})]).toEqual([246, 355])
    expect([FIT.maxLevels({ clearHeightIn: 360 }, {}), FIT.fitOf(6, { clearHeightIn: 360 }, {}).kind]).toEqual([6, 'clear'])
    expect([FIT.proposals(null, {}), FIT.proposals({ sprinklerIn: 300 }, {}), FIT.maxLevels({ clearHeightIn: 40 }, {})]).toEqual([null, null, 0])
    expect([FIT.isAutoName("5 levels · 21'"), FIT.isAutoName("5 levels · 21'-6\" 2"), FIT.isAutoName('Mezzanine')]).toEqual([true, true, false])
    // the layout's positions: every bay carrying the design (overrides ignored)
    const { o } = hand(vert)
    expect(FIT.layoutPositions(o, FIT.designFor(5, b, {}))).toBe(FIT.layoutPositions(o, FIT.designFor(4, b, {})) / 4 * 5)
  })

  it('EV-tab: each elevation names a ceiling and a pallet — + Add makes the best fit for the pair, named "5 levels · 40×48 · Main"; selected rows take a chip (whole row sides, ONE undo step); positions per beam from the pallet face; Check layout against its own ceiling; rename, back to the pairing, duplicate, change the pairing (refitted, assignments kept), delete, remove unused', async () => {
    const L = hand(vert)
    const pr = { ...P.newProject(), ceilings: [{ id: 'main', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }, { id: 'mez', name: 'Mezz', clearHeightIn: 240, sprinklerIn: null }], defaultCeilingId: 'main' }
    pr.pallets = [{ ...pr.pallets[0], id: 'p40', name: '48×40' }, { id: 'p48', name: '48×48', faceIn: 48, depthIn: 48, heightIn: 60, weightLb: 2500, beamFaceIn: 4 }]; pr.defaultPalletId = 'p40'
    load(L.o, P.withProject(L.t, pr)); await settle()
    const h0 = hist()
    const a = TAB.addBestFit(store, {})
    const ta = E.typeById(T(), a)
    expect([ta.name, ta.ceilingId, ta.palletId, ta.levels.map(l => l.beamIn), ta.uprightHeightIn, hist()]).toEqual(['5 levels · 48×40 · Main', 'main', 'p40', [0, 58, 116, 174, 232], 252, h0 + 1])
    // the 48×48 pallet (60" high) under the Mezz ceiling (20'): fewer levels, its own name
    const b = TAB.addBestFit(store, { ceilingId: 'mez', palletId: 'p48' })
    const tb = E.typeById(T(), b)
    expect([tb.name, tb.levels.length, tb.levels[0].palletHeightIn, tb.levels[0].loadLb]).toEqual(['3 levels · 48×48 · Mezz', 3, 60, 2500])
    // selected rows take a chip: one side of p1 picked → that whole row side; one undo step
    store.setState({ selectedIds: ['p1'], activeBaySelection: [{ objId: 'p1', bayIdx: 1, side: 0 }] })
    const h1 = hist()
    expect(TAB.assignSelected(store, b)).toBe(true); await settle()
    expect([hist(), ids(rack(objs(), 'p1'), T())[0].every(x => x === b), ids(rack(objs(), 'p1'), T())[1].every(x => x === T().defaultId)]).toEqual([h1 + 1, true, true])
    expect(TAB.assignSelected(store, b)).toBe(false)                                       // nothing to change
    // positions per beam from the pallet face: a 96" beam holds 2 × 40" but 1 × 48"
    const pos = (t) => bayLedger(objs(), GS, t).racks.get('p1').positions
    const T48 = { ...T(), types: T().types.map(t => (t.id === b ? { ...t, palletId: 'p40' } : t)) }
    expect(pos(T())).toBeLessThan(pos(T48))
    // Check layout: each elevation against its own ceiling — B (the Mezz one) breaks 20' when its levels are too tall
    TAB.changeElevation(store, b, { ...E.typeById(T(), b), uprightHeightIn: 260 }); await settle()
    const errs = checkLayout(objs(), { gridSize: GS, elevations: T() }).errors.filter(e => /clear height/.test(e.text))
    expect(errs.some(e => e.text.includes('3 levels · 48×48 · Mezz') && e.text.includes("20'-0\""))).toBe(true)
    // rename; empty: back to the pairing; a level added: the pairing name follows
    TAB.renameElevation(store, a, 'Main racks')
    expect([E.typeById(T(), a).name, E.typeById(T(), a).named]).toEqual(['Main racks', true])
    TAB.renameElevation(store, a, '')
    expect(E.typeById(T(), a).name).toBe('5 levels · 48×40 · Main')
    TAB.changeElevation(store, a, E.withLevelCount(E.typeById(T(), a), 4))
    expect(E.typeById(T(), a).name).toBe('4 levels · 48×40 · Main')
    // duplicate: a copy to adjust, unique name, active
    const d = TAB.duplicateElevation(store, a)
    expect([E.typeById(T(), d).name, TAB.useElevTab.getState().activeId]).toEqual(['4 levels · 48×40 · Main · copy', d])
    // change the pairing: refitted for the new pair, still on its rows
    TAB.setPairing(store, b, { ceilingId: 'main' })
    expect([E.typeById(T(), b).name, E.typeById(T(), b).levels.length, ids(rack(objs(), 'p1'), T())[0].every(x => x === b)]).toEqual(['4 levels · 48×48 · Main', 4, true])                // 60" pallets: pitch 70", (n−1)·70 + 60 ≤ 336
    // remove unused: the duplicate goes (the default and B stay); delete B: its rows fall back
    expect(TAB.removeUnused(store)).toBe(true)
    expect(T().types.some(t => t.id === d)).toBe(false)
    expect(TAB.deleteElevation(store, b)).toBe(true)
    expect(ids(rack(objs(), 'p1'), T())[0].every(x => x === T().defaultId)).toBe(true)
  })

  it('EV-zoom: the drawing zoomed around a point and panned — the fitted scale times the zoom, the labels the same screen size, the content moved by the pan; Fit is zoom 1, no pan', () => {
    const t = { ...E.makeType({ id: 'A', levelsCount: 4 }), uprightHeightIn: 228 }, box = { w: 500, h: 600 }, o = { depthIn: 48, view: 'front', building: { clearHeightIn: 290 } }
    const one = elevationLayout(t, 96, box, o), two = elevationLayout(t, 96, box, { ...o, zoom: 2 }), moved = elevationLayout(t, 96, box, { ...o, zoom: 2, pan: { x: 40, y: -30 } })
    expect(two.scale / one.scale).toBeCloseTo(2, 5)
    const lab = (d) => d.items.find(i => i.t === 'text' && /^FRAME/.test(i.s))
    expect(lab(two).size).toBe(lab(one).size)
    const up = (d) => d.items.find(i => i.tag === 'upright')
    expect([Math.round(up(moved).x - up(two).x), Math.round(up(moved).y - up(two).y)]).toEqual([40, -30])
    expect(elevationLayout(t, 96, box, { ...o, zoom: 1, pan: { x: 0, y: 0 } }).scale).toBe(one.scale)
  })

  it('EV-tint: with 2+ elevations every one (the default too) is tinted, clearly — saturated colours at 0.6, the old pale palette drawn as the new; with one, no tint; the plan, the legend, the PDF and the workspace list agree; the legend clear of "← Hub"', () => {
    const { o, t } = hand(vert)
    expect([DRAW.tintOn(t), DRAW.tintOn({ ...t, types: [...t.types, { ...t.types[0], id: 'x' }] }), DRAW.tintOn(null), DRAW.ELEV_FILL_OPACITY]).toEqual([false, true, false, 0.6])
    // the old pale colours drawn as the new ones at the same place; any other colour as it is
    expect([DRAW.tint('#7FA7D9'), DRAW.tint('#e8a33d'), DRAW.tint('#123456'), E.PALETTE[0]]).toEqual(['#E07B22', '#2F80ED', '#123456', '#E07B22'])
    expect(DRAW.bandRects(rack(o, 'p1'), t, GS).every(r => r.color === DRAW.tint(t.types[0].color))).toBe(true)
    // saturated: no palette colour is pale (the rack's own fill is)
    const light = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) }
    expect(E.PALETTE.every(c => light(c) < 170)).toBe(true)
    const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8')
    expect(src('canvas2/Scene.jsx')).toMatch(/const elev = showColors && tintOn\(elevTable\) \? elevTable : null/)
    expect(src('canvas2/shapes.jsx')).toMatch(/fill=\{r\.color\} opacity=\{ELEV_FILL_OPACITY\}/)
    expect(src('export/pdfExport.js')).toMatch(/const elevTable = elevColors && tintOn\(elevations\) \? elevations : null/)
    const lg = src('canvas2/ElevationsCanvas.jsx')
    expect(lg).toMatch(/const tinted = showColors && tintOn\(elevations\)/)
    expect(lg).toMatch(/\{tinted \? <Swatch color=\{tint\(type\.color\)\} \/>/)
    expect(lg).toMatch(/background: color, opacity: ELEV_FILL_OPACITY/)
    // Studio: the colours are switched by the bottom-right island's Elevations toggle; the legend chip left the canvas
    expect(src('studio/StudioFrame.jsx')).toMatch(/aria-label="Elevation colours" aria-pressed=\{showColors\} onClick=\{\(\) => setShowColors\(!showColors\)\}/)
    expect(/<ElevLegend/.test(src('canvas2/Canvas2.jsx'))).toBe(false)
    // the card's list (C2): each row's 10px swatch in the elevation's own colour
    expect(src('components/Elevations/ElevationsTab.jsx')).toMatch(/<span aria-hidden style=\{\{ width: 10, height: 10, flexShrink: 0, borderRadius: 2, background: tint\(t\.color\) \}\} \/>/)
  })

  it('EV-view: the drawing\'s Front | Side — one view fitted alone (front: beams and uprights, no frames; side: frames, no beams); both for the PDF', () => {
    const t = { ...E.makeType({ id: 'A', levelsCount: 4 }), uprightHeightIn: 228 }, box = { w: 520, h: 900 }, o = { depthIn: 48, pair: true, flueIn: 12, building: { clearHeightIn: 290, sprinklerIn: 295 } }
    const f = elevationLayout(t, 96, box, { ...o, view: 'front' }).items, s = elevationLayout(t, 96, box, { ...o, view: 'side' }).items, both = elevationLayout(t, 96, box, o).items
    const has = (items, tag) => items.some(i => i.tag === tag)
    expect([has(f, 'beam'), has(f, 'upright'), has(f, 'frame'), has(s, 'frame'), has(s, 'beam'), has(both, 'beam') && has(both, 'frame')]).toEqual([true, true, false, true, false, true])
    // fitted alone: larger than in the two-view figure
    const h = (items, tag) => Math.max(...items.filter(i => i.tag === tag).map(i => i.h))
    expect(h(f, 'upright')).toBeGreaterThan(h(both, 'upright'))
    expect(h(s, 'frame')).toBeGreaterThan(h(both, 'frame'))
    expect(f.some(i => i.t === 'text' && /^CLEAR HEIGHT/.test(i.s)) && s.some(i => i.t === 'text' && /^CLEAR HEIGHT/.test(i.s))).toBe(true)
  })

  it('EV-names: names stay unique — a duplicate (an old file) renamed on load; a rename to a name in use gets "name 2"', () => {
    const { o, t } = hand(vert)
    const dup = { ...t, types: [...t.types, { ...t.types[0], id: 'x', color: '#000' }, { ...t.types[0], id: 'y' }] }
    expect(E.dedupeNames(dup).types.map(x => x.name)).toEqual(['4 levels', '4 levels 2', '4 levels 3'])
    expect(E.dedupeNames(t)).toBe(t)
    const r = E.reconcileElevations({ objects: o, table: dup })
    expect(r.table.types.map(x => x.name)).toEqual(['4 levels', '4 levels 2', '4 levels 3'])
    expect(E.uniqueTypeName(dup, '4 levels', 'zzz')).toBe('4 levels 2')
    expect(E.uniqueTypeName(t, '4 levels', t.types[0].id)).toBe('4 levels')
    // the levels edit's new type has a free name too
    const named = { ...t, types: [...t.types, { ...t.types[0], id: 'z', name: '6 levels' }] }
    const ed6 = E.reconcileElevations({ prevObjects: o, objects: o.map(x => (x.id === 's' ? { ...x, levels: 6 } : x)), table: named })
    expect(new Set(ed6.table.types.map(x => x.name)).size).toBe(ed6.table.types.length)
  })

  it('EV-delete-type: a type deleted — its bays go back to the default (no override left naming it); the default deleted → the next is the default; the last type can\'t be deleted', () => {
    const L = withTypes(hand(vert)), tb = L.t
    const painted = paintIn(paintIn(L, 'p1', { sides: [1], bays: [2], typeId: 'B' }), 's', { typeId: 'B' })
    const gone = edit(painted, t => E.removeType(t, 'B'))
    expect(gone.t.types.map(t => t.id)).not.toContain('B')
    expect(gone.o.filter(E.isBeamRack).every(r => E.typeMap(r, gone.t).flat().every(t => t === gone.t.defaultId))).toBe(true)
    expect([rack(gone.o, 's').levels, rack(gone.o, 's').elevType]).toEqual([4, undefined])
    const one = { ...tb, types: [tb.types[0]] }
    expect(E.removeType(one, tb.types[0].id)).toBe(one)
  })

  it('EV-levels-edit: a rack\'s levels changed (the panel, the Row group levels replay) → it carries the type with that many levels (made if needed); a new rack takes the default\'s levels', () => {
    const { o, t } = hand(vert)
    const edited = o.map(x => (x.id === 's' ? { ...x, levels: 6 } : x))
    const r = E.reconcileElevations({ prevObjects: o, objects: edited, table: t }), t6 = r.table.types.find(x => x.levels.length === 6)
    expect([!!t6, rack(r.objects, 's').elevType === t6.id, rack(r.objects, 's').levels]).toEqual([true, true, 6])
    const placed = [...o, { ...rack(o, 's'), id: 'new', levels: 5 }]
    expect(rack(E.reconcileElevations({ prevObjects: o, objects: placed, table: t }).objects, 'new').levels).toBe(4)
  })

  it('EV-carry: a bay delete split, a one-side delete (the half left takes its side\'s type) and a join keep each bay\'s type', () => {
    const L = withTypes(hand(vert)), { o, t: tb } = L
    const p = E.paintRack(E.paintRack(rack(o, 'p1'), tb, { sides: [1], typeId: 'B' }), tb, { sides: [0], bays: [2], typeId: 'C' })
    const pieces = splitRackForBayDelete(p, new Set([1]), newId, GS)
    expect(pieces.map(x => E.typeMap(x, tb))).toEqual([[[tb.defaultId], ['B']], [['C'], ['B']]])
    const o2 = o.map(x => (x.id === 'p1' ? p : x))
    const { objects: o3 } = planBaySideDelete(o2, [1, 2].map(b => ({ objId: 'p1', bayIdx: b, side: 0 })), { gridSize: GS, newId })
    const half = o3.find(x => x.pieceOf === 'p1')
    expect([half.type, E.typeMap(half, tb)]).toEqual(['rack_row', [['B', 'B']]])
    const j = joinRacks(p, rack(o, 'p2'), GS)
    expect(E.typeMap(j, tb)).toEqual([[tb.defaultId, tb.defaultId, 'C', tb.defaultId, tb.defaultId, tb.defaultId], ['B', 'B', 'B', tb.defaultId, tb.defaultId, tb.defaultId]])
  })

  it('EV-takeover: a pair grown over its carried-on single takes the single\'s type on that side for the bays it takes ("+ bay" by hand, the pair keeper)', async () => {
    load(savedFill(vert)); await settle()
    commitTable(t => E.addType(t, { id: 'B', name: 'B' })); await settle()
    const s0 = rowRacks(12, 'rack_row')[0]
    SEL.commitAssign(store, SEL.selectionCells({ objects: objs(), selectedIds: [s0.id], activeBaySelection: [] }), 'B'); await settle()
    expect(E.typeMap(rowRacks(12, 'rack_row')[0], T())).toEqual([['B', 'B']])
    const Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
    const p = pairOf(12)
    store.getState().commitObjectUpdate(p.id, Panel.addBayUpdate(p, 96, GS)); await settle()
    const p2 = pairOf(12), m = E.typeMap(p2, T())
    expect([p2.beams.length, rowRacks(12, 'rack_row')[0].beams.length]).toEqual([13, 1])
    const side = m.findIndex(a => a.includes('B'))
    expect(side).toBeGreaterThanOrEqual(0)
    expect([m[side].filter(t => t === 'B').length, m[1 - side].every(t => t === T().defaultId)]).toEqual([1, true])
    // the pair keeper's fold keeps the types in the history entry (A4)
    expect(JSON.parse(store.getState().history[hist()]).elevations).toEqual(T())
  })

  it('EV-group: rows 12 and 14 in a Row group (Auto apply) — a whole row set to B → row 14 whole B; then one bay on one side set to C → row 14 the bay at the same uprights on the same side across the floor; one history entry each, the types in it', async () => {
    load(savedFill(vert)); await settle()
    commitTable(t => E.addType(E.addType(t, { id: 'B', name: 'B' }), { id: 'C', name: 'C' })); await settle()
    useRowGroup.getState().setAlwaysApply(true)
    addRowOf(pairOf(12).id); addRowOf(pairOf(14).id)
    const h = hist(), p12 = pairOf(12)
    SEL.commitAssign(store, SEL.selectionCells({ objects: objs(), selectedIds: rowRacks(12).map(r => r.id), activeBaySelection: [] }), 'B'); await settle()
    expect(hist()).toBe(h + 1)
    expect(useRowGroup.getState().message).toMatch(/^Applied to 1 row/)
    expect(rowRacks(14).every(r => E.typeMap(r, T()).flat().every(x => x === 'B'))).toBe(true)
    expect(JSON.parse(store.getState().history[hist()]).elevations).toEqual(T())
    SEL.commitAssign(store, SEL.selectionCells({ objects: objs(), selectedIds: [pairOf(12).id], activeBaySelection: [{ objId: pairOf(12).id, bayIdx: 2, side: 0 }] }), 'C'); await settle()
    const t2 = { ws: RG.worldSideOf(pairOf(12), 0, [pairOf(12)]) }
    expect(hist()).toBe(h + 2)
    const g12 = RG.geom(pairOf(12)), U12 = RG.uprightsOf(g12.r0, g12.beams, (3 / 12) * GS, GS)
    const run12 = [180, 270].includes(((pairOf(12).rotation || 0) % 360 + 360) % 360) ? g12.beams.length - 1 - 2 : 2
    const p14 = pairOf(14), g14 = RG.geom(p14), U14 = RG.uprightsOf(g14.r0, g14.beams, (3 / 12) * GS, GS), run14 = U14.findIndex(u => Math.abs(u - U12[run12]) < 1)
    const own14 = [180, 270].includes(((p14.rotation || 0) % 360 + 360) % 360) ? g14.beams.length - 1 - run14 : run14
    const local14 = RG.worldSideOf(p14, 0, [p14]) === t2.ws ? 0 : 1
    expect(run14).toBeGreaterThanOrEqual(0)
    expect([E.typeIdAt(p14, own14, local14, T()), E.typeIdAt(p14, own14, 1 - local14, T())]).toEqual(['C', 'B'])
  })

  it('EV-check: Check layout errors — a pallet + clearance that doesn\'t fit (top of the lower beam to the underside of the next), the top of the upright above the building\'s clear height; types side by side, no warning', () => {
    let L = paintIn(withTypes(hand(vert)), 'p1', { sides: [1], typeId: 'B' })
    expect(checkLayout(L.o, { gridSize: GS, elevations: L.t }).errors.filter(e => /^elev/.test(e.kind))).toEqual([])
    L = edit(L, t => E.updateType(t, 'B', { levels: [{ beamIn: 0, palletHeightIn: 48, loadLb: 2000 }, { beamIn: 50, palletHeightIn: 48, loadLb: 2000 }, ...E.levelsOf(6).slice(2)] }))
    const o = L.o.map(x => (x.id === 'fp' ? { ...x, clearHeightFt: 25 } : x))
    const errs = checkLayout(o, { gridSize: GS, elevations: L.t }).errors.filter(e => /^elev/.test(e.kind))
    expect(errs.map(e => e.text)).toEqual([
      'Elevation B: top of upright 30\'-0" is above the building\'s clear height 25\'-0"',
      'Elevation B: top of load 29\'-0" is above the building\'s clear height 25\'-0"',
      'Elevation B: level 1 pallet 48" + 6" clearance doesn\'t fit between the floor and the underside of the next at 46"',
    ])
    expect(errs[0].ids).toEqual(['p1'])
    expect(checkLayout(o, { gridSize: GS }).errors.filter(e => /^elev/.test(e.kind))).toEqual([])   // no types: nothing
  })

  it(`EV-face: beam levels are to the TOP of the beam — 58" between tops with a 4" face fits 48 + 6, a 5" face doesn't; a type saved without one reads 4"`, () => {
    const L = paintIn(withTypes(hand(vert)), 'p1', { typeId: 'B' })
    const lv = (gap) => [{ beamIn: 0, palletHeightIn: 48, loadLb: 2000 }, { beamIn: gap, palletHeightIn: 48, loadLb: 2000 }, { beamIn: gap * 2, palletHeightIn: 48, loadLb: 2000 }]
    const fit = (patch) => { const x = edit(L, t => E.updateType(t, 'B', { uprightHeightIn: 300, ...patch })); return E.elevationIssues(x.o, x.t).filter(e => e.kind === 'elev-fit').map(e => e.level) }
    expect(fit({ levels: lv(58) })).toEqual([])
    expect(fit({ levels: lv(58), beamFaceIn: 5 })).toEqual([1, 2])
    const old = edit(L, t => ({ ...t, types: t.types.map(x => { const c = { ...x }; delete c.beamFaceIn; return c }) }))
    expect(E.beamFace(E.typeById(old.t, 'B'))).toBe(4)
    expect(E.makeType({ id: 'x' }).beamFaceIn).toBe(4)
  })

  it(`EV-depth: frame depth is the rack's own — not a field of the type; the BOM and the panel read the racks' depths`, () => {
    const L = withTypes(hand(vert)), o = L.o.map(x => (x.id === 's' ? { ...x, depthIn: 36 } : x)), tb = L.t
    expect(tb.types.some(t => 'frameDepthIn' in t)).toBe(false)
    expect(E.typeDepths(o, tb, tb.defaultId)).toEqual([36, 42])
    expect(E.elevationBays(o, tb).find(b => b.rackId === 's').frameDepthIn).toBe(36)
  })

  it(`EV-refit: a type change on a Fill area rack — even one that changes its levels — is no hand edit: the next area resize still refits it (the rack kept, id and type with it)`, () => {
    const m = E.migrate(savedFill(vert))
    let L = edit({ o: m.objects, t: m.table }, t => E.addType(t, { id: 'B', name: 'B' }))
    L = edit(L, t => E.updateType(t, 'B', { levels: E.levelsOf(6), uprightHeightIn: 360 }))
    const area = L.o.find(x => x.type === 'racking_area'), r = L.o.find(x => E.isBeamRack(x) && x.areaId === area.id && x.type === 'rack_double_row')
    const painted = paintIn(L, r.id, { typeId: 'B' }).o
    expect(painted.find(x => x.id === r.id).levels).toBe(6)
    expect(areaEdits(painted, area).count).toBe(areaEdits(L.o, area).count)
    if (vert) expect(areaEdits(painted, area).count).toBe(0)
    const grow = vert ? { x: area.x, y: area.y, w: area.width, h: area.height + 40 } : { x: area.x, y: area.y, w: area.width + 40, h: area.height }
    const kept = planAreaResize(painted, area.id, grow, { gridSize: GS }).find(x => x.id === r.id)
    expect([!!kept, kept && kept.elevType, kept && kept.levels]).toEqual([true, 'B', 6])
  })

  it('EV-legend-bom: the legend counts each side of a back-to-back as a bay; the BOM data gives every bay per side its type, levels and upright height, a shared upright the taller', () => {
    const L = paintIn(withTypes(hand(vert)), 'p1', { sides: [1], bays: [0], typeId: 'B' }), tb = L.t
    expect(E.legendCounts(L.o, tb).map(r => [r.type.id, r.bays])).toEqual([[tb.defaultId, 3 * 2 * 2 + 4 - 1], ['B', 1]])
    const bays = E.elevationBays(L.o, tb).filter(b => b.rackId === 'p1')
    expect(bays.find(b => b.bay === 0 && b.side === 1)).toMatchObject({ typeId: 'B', uprightHeightIn: 360, levels: [0, 60, 120, 180, 240, 300] })
    expect(E.uprightHeights(L.o, tb).find(u => u.rackId === 'p1' && u.side === 1).heights).toEqual([360, 360, 240, 240])
  })

  it('EV-pdf: sheet 1 fills each bay with its type\'s colour and prints the legend when the colours are shown, neither when hidden; then elevation sheets — one per type × beam length in use ("B · 8\' bay", swatch, bay count, front and side view, the scale), several to a sheet, "RACK ELEVATIONS"', async () => {
    const { buildLayoutSVG, buildElevationSheets } = await import('../../export/pdfExport')
    const L = paintIn(withTypes(hand(vert)), 'p1', { sides: [1], typeId: 'B' }), tb = L.t
    const on = buildLayoutSVG(L.o, [], GS, { elevColors: true, elevations: tb }).svg, off = buildLayoutSVG(L.o, [], GS, { elevColors: false, elevations: tb }).svg
    const B = tb.types.find(t => t.id === 'B').color
    expect([on.includes(`fill="${B}" fill-opacity="0.6"`), on.includes('ELEVATIONS')]).toEqual([true, true])
    expect([off.includes('fill-opacity="0.6"'), off.includes('ELEVATIONS')]).toEqual([false, false])
    // one elevation only: no tint, no colour legend (every bay the same)
    const one = { ...tb, types: [tb.types.find(t => t.id === tb.defaultId)] }
    expect(buildLayoutSVG(L.o, [], GS, { elevColors: true, elevations: one }).svg.includes('fill-opacity="0.6"')).toBe(false)
    // a 9' bay on the single too: three elevations — the default at 8' and 9', B at 8'
    const o2 = L.o.map(x => (x.id === 's' ? { ...x, beams: [96, 108, 96, 96] } : x))
    const pages = buildElevationSheets(o2, { title: 'T', elevations: tb })
    expect(pages.length).toBe(1)
    const svg = pages[0].svg
    // each sheet names its elevation by its live name (nameOf: a renamed one its own, else the auto name as built now)
    const bName = (await import('../../utils/project')).nameOf(tb, tb.types.find(t => t.id === 'B'))
    expect(['4 levels · 8\'-0" bay', '4 levels · 9\'-0" bay', `${bName} · 8'-0" bay`, 'RACK ELEVATIONS', 'SCALE: ', '=1\'', 'fill="#1B4FD8"'].map(x => svg.includes(x))).toEqual([true, true, true, true, true, true, true])
    expect(svg.includes('C · ')).toBe(false)
    // it prints whichever of Simple / Detailed is selected
    expect([svg.includes('PITCH'), /data-role|6'-0"<\/text>/.test(svg)]).toEqual([true, false])
    const det = buildElevationSheets(o2, { title: 'T', elevations: tb, detail: 'detailed' })[0].svg
    expect([det.includes(">5'-0&quot;<"), svg.includes(">5'-0&quot;<")]).toEqual([true, false])   // the beam at 5'-0" dimensioned only in Detailed
    expect(/\d ?lb|\d#|MAX\./i.test(svg.replace(/#[0-9a-fA-F]{3,8}/g, ''))).toBe(false)   // no weights on the drawing
  })

  it('EV-keeper: a layout loaded is given its types in the store (not among its objects); an action\'s fix is folded into that action\'s entry; an old types object among the objects is moved to the store', async () => {
    load(savedFill(vert)); await settle()
    expect([!!T(), objs().some(E.isElevTable)]).toEqual([true, false])
    const h = hist()
    store.getState().commitObjectUpdate(pairOf(12).id, { levels: 6 }); await settle()
    expect(hist()).toBe(h + 1)
    expect(E.typeById(T(), pairOf(12).elevType).levels.length).toBe(6)
    const legacy = { id: 'elevation-types', type: 'elevation_types', version: 1, defaultId: 'X', types: [E.makeType({ id: 'X', levelsCount: 4 })] }
    load([...savedFill(vert), legacy]); await settle()
    expect([T().defaultId, objs().some(E.isElevTable)]).toEqual(['X', false])
  })
})

describe('EV — the types in the store, save / load (A4)', () => {
  it('EV-store: the history snapshot carries the types; commitElevations is one undo step; undo / redo restore the types; a new scene clears them', async () => {
    const L = withTypes(hand(false)); load(L.o, L.t); await settle()
    const h = hist(), was = T()
    commitTable(t => E.updateType(t, 'B', { name: 'Bee' }))
    expect([hist(), E.typeById(T(), 'B').name, JSON.parse(store.getState().history[hist()]).elevations.types.find(t => t.id === 'B').name]).toEqual([h + 1, 'Bee', 'Bee'])
    store.getState().undo()
    expect(T()).toEqual(was)
    store.getState().redo()
    expect(E.typeById(T(), 'B').name).toBe('Bee')
    const src = readFileSync(new URL('../../store/useCanvasStore.js', import.meta.url), 'utf8')
    expect(src).toMatch(/elevations: s\.elevations \?\? null \}\)/)
    expect(src).toMatch(/s\.elevations   = null/)
  })

  it('EV-saveload: the file carries the types as their own field (format 2); an old file with an "elevation_types" object among its objects loads with the types in the store and the object gone; the five history writers outside the store keep the types', () => {
    const L = withTypes(hand(false))
    const json = JSON.parse(serializeScene({ objects: L.o, elevations: L.t, groups: [], layers: [] }))
    expect([json.version, json.elevations.defaultId, json.objects.some(E.isElevTable)]).toEqual([2, L.t.defaultId, false])
    const s = {}; deserializeScene(json, s)
    expect([s.elevations.types.length, s.objects.length]).toEqual([L.t.types.length, L.o.length])
    const old = { appName: 'WarehouseCAD', version: 1, objects: [...L.o, { id: 'elevation-types', type: 'elevation_types', version: 1, defaultId: L.t.defaultId, types: L.t.types }] }
    const s2 = {}; deserializeScene(old, s2)
    expect([s2.elevations.defaultId, s2.elevations.types.map(t => t.id), s2.objects.some(E.isElevTable)]).toEqual([L.t.defaultId, L.t.types.map(t => t.id), false])
    const none = {}; deserializeScene({ appName: 'WarehouseCAD', objects: L.o }, none)
    expect(none.elevations).toBe(null)
    for (const f of ['utils/pairCarryOn.js', 'utils/aisleKeeper.js', 'utils/rowGroupTool.js', 'generate/traceGenerate.js', 'utils/elevations.js']) {
      const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8')
      expect([f, /JSON\.stringify\(\{ objects/.test(src.replace(/export const snapshotOf[^\n]*/, ''))]).toEqual([f, false])
      expect([f, /snapshotOf\(/.test(src)]).toEqual([f, true])
    }
  })
})

describe('EV — the editor (v2 §B–C, E)', () => {
  const t0 = () => ({ ...E.makeType({ id: 'A', levelsCount: 4 }), levels: [0, 74, 148, 222].map(z => ({ beamIn: z, palletHeightIn: 60, loadLb: 2500 })), clearanceIn: 6, uprightHeightIn: 228 })

  it('EV-edit-beam: a beam dragged snaps to the hole pitch (2"), stays a face clear of its neighbours and under the top of the upright; near the floor the first level goes to the floor; typed exactly, no snap', () => {
    const t = t0()
    expect(ED.moveBeam(t, 1, 80.7).levels[1].beamIn).toBe(80)
    expect(ED.moveBeam({ ...t, holePitchIn: 3 }, 1, 80.7).levels[1].beamIn).toBe(81)
    expect(ED.moveBeam(t, 1, 300).levels[1].beamIn).toBe(144)                 // under level 3's beam less its face
    expect(ED.moveBeam(t, 1, -10).levels[1].beamIn).toBe(4)                   // a face above the floor level
    expect(ED.moveBeam(t, 3, 500).levels[3].beamIn).toBe(228)
    expect(ED.moveBeam(t, 1, 80.7, { exact: true }).levels[1].beamIn).toBe(80.7)
  })

  it('EV-edit-levels: a click on an empty upright adds a level there (snapped; the level below\'s pallet); not on top of a beam; Delete / dragged off the ends removes it; never the last', () => {
    const t = t0()
    const a = ED.addLevelAt(t, 111)
    expect(a.levels.map(l => l.beamIn)).toEqual([0, 74, 112, 148, 222])
    expect(a.levels[2].palletHeightIn).toBe(60)
    expect(ED.addLevelAt(t, 75)).toBe(null)
    expect(ED.addLevelAt(t, 300)).toBe(null)
    expect(ED.removeLevel(t, 2).levels.map(l => l.beamIn)).toEqual([0, 74, 222])
    const one = { ...t, levels: [t.levels[0]] }
    expect(ED.removeLevel(one, 0)).toBe(one)
  })

  it('EV-edit-dims: the top of the upright dragged (snapped, never under the top beam); a dimension typed: a beam elevation, the clear opening (moves the beam above), load + clearance (the pallet height follows), the upright', () => {
    const t = t0()
    expect(ED.setUpright(t, 240.9).uprightHeightIn).toBe(240)
    expect(ED.setUpright(t, 100).uprightHeightIn).toBe(226)
    expect(ED.setDimension(t, 'elev', 2, 150).levels[2].beamIn).toBe(150)
    expect(ED.setDimension(t, 'open', 2, 66).levels[2].beamIn).toBe(74 + 66 + 4)
    expect(ED.setDimension(t, 'chain', 1, 60).levels[1].palletHeightIn).toBe(54)
    expect(ED.setDimension(t, 'chain', 3, 36).levels[3].palletHeightIn).toBe(36)   // the top level: its load
    expect(ED.setDimension(t, 'upright', null, 230).uprightHeightIn).toBe(230)
    expect([parseFtIn('6\'-2"'), parseFtIn('6\' 2"'), parseFtIn('74'), parseFtIn('6-2'), parseFtIn('5.5\''), parseFtIn('x')].map(v => (Number.isNaN(v) ? 'NaN' : v))).toEqual([74, 74, 74, 74, 66, 'NaN'])
    expect([ftInDash(74), ftInDash(312), ftInDash(4), ftInDash(60), ftInDash(176)]).toEqual(['6\'-2"', '26\'-0"', '4"', '5\'-0"', '14\'-8"'])
  })

  it('EV-edit-fields: pallet height (every level), clearance, beam face, hole pitch; a typed or dragged edit is ONE undo step through the store', async () => {
    const t = t0()
    expect(ED.setField(t, 'palletHeightIn', 50).levels.every(l => l.palletHeightIn === 50)).toBe(true)
    expect([ED.setField(t, 'clearanceIn', 8).clearanceIn, ED.setField(t, 'beamFaceIn', 5).beamFaceIn, ED.setField(t, 'holePitchIn', 3).holePitchIn]).toEqual([8, 5, 3])
    const L = withTypes(hand(false)); load(L.o, L.t); await settle()
    const h = hist()
    expect(ED.commitType(store, 'B', x => ED.moveBeam(x, 1, 70))).toBe(true)
    expect([hist(), E.typeById(T(), 'B').levels[1].beamIn]).toEqual([h + 1, 70])
    store.getState().undo()
    expect(E.typeById(T(), 'B').levels[1].beamIn).toBe(60)
  })

  it('EV-lengths: beam length is per bay — the editor lists the lengths each type\'s bays use (most used first, with their bay counts and whether any is back-to-back)', () => {
    const L = withTypes(hand(false)), o = L.o.map(x => (x.id === 's' ? { ...x, beams: [96, 108, 108, 96] } : x))
    const m = lengthsByType(o, L.t, E.typeIdAt).get(L.t.defaultId)
    expect(m.map(e => [e.beamIn, e.bays, e.pair])).toEqual([[96, 14, true], [108, 2, false]])
  })

  const sampleT = () => ({ ...t0(), uprightHeightIn: 228, levels: [0, 74, 148, 222].map((z, k) => ({ beamIn: z, palletHeightIn: k === 3 ? 36 : 60, loadLb: 2500 })) })
  const sampleO = { depthIn: 48, pair: true, flueIn: 12, building: { clearHeightIn: 290, sprinklerIn: 295 } }
  /** Every pair of labels apart, and no label on a load, a beam or an upright (a misfit label may sit on its own loads). */
  const clean = (d) => {
    const labs = d.items.filter(i => i.t === 'text'), solids = d.items.filter(i => i.t === 'rect' && ['load', 'beam', 'upright', 'frame'].includes(i.tag))
    const hit = (p, q) => p.x0 < q.x1 - 0.5 && q.x0 < p.x1 - 0.5 && p.y0 < q.y1 - 0.5 && q.y0 < p.y1 - 0.5
    const bad = []
    labs.forEach((l, i) => {
      const b = labelBox(l)
      // (side to side, two labels keep a gap — closer, they read as one run)
      const g = l.size * 0.45, bg = { ...b, x0: b.x0 - g, x1: b.x1 + g }
      labs.slice(i + 1).forEach(m => { if (hit(bg, labelBox(m))) bad.push(l.s + ' × ' + m.s) })
      solids.forEach(r => { if (!(l.tag === 'misfit' && r.level === l.level) && hit(b, { x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h })) bad.push(l.s + ' on ' + r.tag) })
    })
    return bad
  }

  const C = { ink: '#15181C', pine: '#123A2E', load: '#E8DCC2', loadEdge: '#B08F52', deck: '#C9A870', blue: '#1B4FD8', red: '#A8341C', grey: '#7A828C', hatch: '#B6BAB3', band: '#F2C230', misfit: '#F5E7E3' }

  it('EV-drawing: Simple, in the reference sheet\'s visual language — JetBrains Mono; dark green frames and beams; kraft loads on a deck board; the ink ground line with grey hatching; the dashed clear-height line over the yellow clearance band; level tags L1–L4 grey; the frame height, the pitch and the beam with its pallets per level blue; the pallets\' side clearance and the clearance band red; no beam elevations, no weights', () => {
    const t = sampleT(), d = elevationLayout(t, 96, { w: 1100, h: 460 }, sampleO)
    const texts = d.items.filter(i => i.t === 'text'), by = (str) => texts.find(i => i.s === str)
    for (const want of ['L1', 'L2', 'L3', 'L4', 'FRAME 19\'-0"', 'PITCH 6\'-2"', 'BEAM 8\'-0" · 2P', 'CLEAR HEIGHT 24\'-2"', 'SPRINKLERS 24\'-7"', 'CLEARANCE 1\'-6"', '5.3" CLR', '4\'-0"', '1\'-0"']) expect([want, !!by(want)]).toEqual([want, true])
    expect(['L1', 'L2', 'L3', 'L4'].map(x => by(x).fill)).toEqual([C.grey, C.grey, C.grey, C.grey])
    expect([by('FRAME 19\'-0"').fill, by('PITCH 6\'-2"').fill, by('BEAM 8\'-0" · 2P').fill]).toEqual([C.blue, C.blue, C.blue])
    expect([by('5.3" CLR').fill, by('CLEARANCE 1\'-6"').fill, by('CLEAR HEIGHT 24\'-2"').fill]).toEqual([C.red, C.red, C.grey])
    expect(texts.every(i => i.font === "'JetBrains Mono', monospace")).toBe(true)
    expect(d.items.filter(i => i.role?.kind === 'upright').every(i => i.fill === C.pine)).toBe(true)
    expect(d.items.filter(i => i.role?.kind === 'beam').map(i => i.fill)).toEqual([C.pine, C.pine, C.pine])
    const loads = d.items.filter(i => i.tag === 'load')
    expect([loads.filter(i => i.fill === C.load && i.stroke === C.loadEdge).length, loads.filter(i => i.fill === C.deck).length]).toEqual([8, 8])
    expect(d.items.some(i => i.t === 'line' && i.stroke === C.ink && i.sw === 3)).toBe(true)                   // the ground line
    expect(d.items.filter(i => i.t === 'line' && i.stroke === C.hatch).length).toBeGreaterThan(10)           // its hatching
    expect(d.items.some(i => i.tag === 'band' && i.fill === C.band && i.opacity === 0.2)).toBe(true)
    expect(d.items.find(i => i.tag === 'clear').dash).toBeTruthy()
    expect(texts.some(i => i.role?.id === 'elev' || i.role?.id === 'pallet')).toBe(false)                    // Simple: none
    expect(texts.some(i => /lb|LB|#/.test(i.s))).toBe(false)
    // the side view: dark green frames, flue spacers, the depth and flue in blue, the frame height
    expect(d.items.filter(i => i.tag === 'frame').every(i => i.fill === C.pine)).toBe(true)
    expect(d.items.filter(i => i.tag === 'spacer').length).toBe(2)
    expect(texts.filter(i => i.s === 'FRAME 19\'-0"').length).toBe(2)
    expect(elevationLayout(t, 144, { w: 1100, h: 460 }).items.filter(i => i.tag === 'load' && i.fill === C.load).length).toBe(12)
    expect([archScale(0.53).label, archScale(1.06).label]).toEqual(['1/4"=1\'', '1/2"=1\''])
  })

  it('EV-detailed: Detailed adds each beam\'s elevation to its top (blue, on a leader off the beam end) and per level the pallet height and the actual gap (red under the clearance) and the beam face — the chain adds up; the Simple drawing keeps none of them', () => {
    const t = sampleT(), d = elevationLayout(t, 96, { w: 1100, h: 460 }, { ...sampleO, detail: 'detailed' })
    const role = (id) => d.items.filter(i => i.t === 'text' && i.role?.id === id)
    expect(role('elev').map(i => i.s)).toEqual(['6\'-2"', '12\'-4"', '18\'-6"'])
    expect(role('elev').every(i => i.fill === C.blue && i.weight === 600)).toBe(true)
    expect(role('pallet').map(i => i.s)).toEqual(['5\'-0"', '5\'-0"', '5\'-0"', '3\'-0"'])
    expect(role('gap').map(i => [i.s, i.fill])).toEqual([['10"', C.blue], ['10"', C.blue], ['10"', C.blue]])
    for (const k of [0, 1, 2]) expect(role('pallet').find(i => i.role.k === k).role.value + role('gap').find(i => i.role.k === k).role.value + role('face')[k].role.value).toBe(74)
    // still the Simple drawing's own labels
    expect(['L1', 'FRAME 19\'-0"', 'BEAM 8\'-0" · 2P', 'CLEAR HEIGHT 24\'-2"'].every(x => d.items.some(i => i.t === 'text' && i.s === x))).toBe(true)
    const tight = { ...t, levels: t.levels.map((l, k) => (k === 1 ? { ...l, palletHeightIn: 66 } : l)) }
    expect(elevationLayout(tight, 96, { w: 1100, h: 460 }, { depthIn: 48, detail: 'detailed' }).items.filter(i => i.t === 'text' && i.role?.id === 'gap').map(i => [i.s, i.fill])).toEqual([['10"', C.blue], ['4"', C.red], ['10"', C.blue]])
  })

  it('EV-labels: no label on a load, a beam, a frame or another label — Simple and Detailed, side by side and stacked, large and small panes, crowded levels; sizes follow the pane with a readable minimum', () => {
    const t = sampleT()
    const dense = { ...t, uprightHeightIn: 300, levels: [0, 40, 80, 120, 160, 200, 240].map(z => ({ beamIn: z, palletHeightIn: 30, loadLb: 1000 })) }
    const app = { ...t, uprightHeightIn: 240, levels: [0, 60, 120, 180].map(z => ({ beamIn: z, palletHeightIn: 48, loadLb: 2000 })) }   // the app's 4-level type, at the Elevations tab's size
    for (const detail of ['simple', 'detailed']) for (const [tt, box, o] of [[t, { w: 1100, h: 420 }, { fontPx: 12 }], [t, { w: 360, h: 640 }, { fontPx: 10, stacked: true }], [t, { w: 520, h: 200 }, { fontPx: 9 }], [t, { w: 820, h: 300 }, { fontPx: 11 }], [dense, { w: 480, h: 190 }, { fontPx: 9 }], [dense, { w: 700, h: 240 }, { fontPx: 10 }], [t, { w: 454, h: 431 }, { fontPx: 9 }], [app, { w: 454, h: 431 }, { fontPx: 9, depthIn: 42, flueIn: 9, building: { clearHeightIn: 290, sprinklerIn: 295 } }]]) {
      const x = elevationLayout(tt, 96, box, { ...sampleO, ...o, detail })
      expect([detail, JSON.stringify(box), clean(x)]).toEqual([detail, JSON.stringify(box), []])
      expect(Math.min(...x.items.filter(i => i.t === 'text').map(i => i.size))).toBeGreaterThanOrEqual(8)
      // the side view's depth and flue dimensions sit under its ground, clear of the building's labels over the frames
      const fy1 = Math.max(...x.items.filter(i => i.tag === 'frame').map(i => i.y + i.h))
      const depthLabels = x.items.filter(i => i.t === 'text' && !i.rot && i.fill === '#1B4FD8' && (i.s === ftInDash(o.depthIn ?? 48) || i.s === ftInDash(o.flueIn ?? 12)))
      expect([detail, depthLabels.length, depthLabels.every(i => i.y > fy1)]).toEqual([detail, 3, true])
      // the chain's labels stay inside the drawing (dropped rather than clipped at its edge)
      const out = x.items.filter(i => i.t === 'text' && (i.pri ?? 2) >= 3).filter(i => { const b = labelBox(i); return b.x0 < 0 || b.x1 > box.w || b.y0 < 0 || b.y1 > box.h }).map(i => i.s)
      expect([detail, JSON.stringify(box), out]).toEqual([detail, JSON.stringify(box), []])
      // labels paint over the linework (a dashed building line never strikes through one)
      expect(x.items.findIndex(i => i.t === 'text')).toBeGreaterThan(x.items.map(i => i.t !== 'text').lastIndexOf(true))
    }
    const { paneFontPx } = ED
    expect([paneFontPx({ w: 300, h: 120 }), paneFontPx({ w: 2000, h: 900 }), paneFontPx({ w: 858, h: 286 })]).toEqual([9, 14, 11])
  })

  it('EV-centre-stack: the drawing is centred in the pane and scaled to fit; stacked (the right dock) puts the side view under the front view, side by side (the bottom dock) beside it; the Simple / Detailed choice is remembered per browser', () => {
    const t = sampleT(), box = { w: 1200, h: 420 }
    const ext = (d) => { const xs = [], ys = []; for (const i of d.items) { if (i.t === 'rect') { xs.push(i.x, i.x + i.w); ys.push(i.y, i.y + i.h) } if (i.t === 'line') { xs.push(i.x1, i.x2); ys.push(i.y1, i.y2) } } return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } }
    const e = ext(elevationLayout(t, 96, box, sampleO))
    expect(Math.abs((e.x0 + e.x1) / 2 - box.w / 2)).toBeLessThan(box.w * 0.08)
    expect([e.x0 >= 0, e.x1 <= box.w, e.y0 >= 0, e.y1 <= box.h]).toEqual([true, true, true, true])
    const st = elevationLayout(t, 96, { w: 420, h: 900 }, { ...sampleO, stacked: true }).items
    expect(Math.min(...st.filter(i => i.tag === 'frame').map(i => i.y))).toBeGreaterThan(Math.max(...st.filter(i => i.role?.kind === 'upright').map(i => i.y + i.h)))
    const sb = elevationLayout(t, 96, box, sampleO).items
    expect(Math.min(...sb.filter(i => i.tag === 'frame').map(i => i.x))).toBeGreaterThan(Math.max(...sb.filter(i => i.role?.kind === 'upright').map(i => i.x)))
    ED.setPane({ detail: 'detailed' })
    expect(JSON.parse(localStorage.getItem('trace.elevpane.v1')).detail).toBe('detailed')
    ED.setPane({ detail: 'simple' })
  })

  it('EV-misfit: a level whose pallet + clearance doesn\'t fit under the next beam — its loads red, "DOESN\'T FIT", never over the beam above; the same levels as the Check layout error; the top level (no beam above) never', () => {
    const t = { ...sampleT(), levels: [0, 74, 148, 222].map((z, k) => ({ beamIn: z, palletHeightIn: k === 1 ? 80 : k === 3 ? 36 : 60, loadLb: 2500 })) }
    expect([...misfitLevels(t).keys()]).toEqual([1])
    const d = elevationLayout(t, 96, { w: 1100, h: 420 }, sampleO)
    const bad = d.items.filter(i => i.tag === 'load' && i.level === 1)
    expect(bad.every(i => (i.fill === C.misfit || i.fill === C.red) && i.stroke === C.red)).toBe(true)
    const beamAbove = d.items.find(i => i.role?.kind === 'beam' && i.role.k === 2)
    expect(bad.every(i => i.y >= beamAbove.y + beamAbove.h - 0.01)).toBe(true)
    expect(d.items.filter(i => i.tag === 'misfit').map(i => i.s)).toEqual(['DOESN\'T FIT'])
    expect(d.items.filter(i => i.tag === 'load' && i.level !== 1).every(i => i.fill === C.load || i.fill === C.deck)).toBe(true)
    const L = paintIn(withTypes(hand(false)), 'p1', { typeId: 'B' }), x = edit(L, tb => E.updateType(tb, 'B', { ...t, id: 'B', name: 'B' }))
    expect(E.elevationIssues(x.o, x.t).filter(e => e.kind === 'elev-fit').map(e => e.level)).toEqual([2])
    expect(clean(d)).toEqual([])
  })

  it('EV-background: the drawing sits on the panel\'s own background in Properties (labels haloed in it, frames and ground in the theme\'s colours), on white paper in the PDF in the reference\'s', () => {
    const pane = readFileSync(new URL('../../components/Elevations/ElevationDrawing.jsx', import.meta.url), 'utf8')
    // on the card's sheet (white, its 14px grid drawn by the tab) the drawing is transparent; its labels keep a white halo
    expect(pane).toMatch(/aria-label="Elevation drawing" data-readonly=\{[^}]*\} data-zoom=\{[^}]*\} style=\{\{[^}]*background: paper \? 'transparent' : 'var\(--surface\)', cursor: 'grab' \}\}/)
    expect(pane).toMatch(/bg: paper \? PAPER : 'var\(--surface\)', frame: 'var\(--elev-frame\)', ink: 'var\(--elev-ink\)'/)
    expect(pane.includes("background: '#fff'")).toBe(false)
    const panel = readFileSync(new URL('../../components/Elevations/ElevationsTab.jsx', import.meta.url), 'utf8')
    expect(panel.includes("background: '#fff'")).toBe(false)
    // the theme tokens: the one token block (index.css) — no dark theme in the planner (THEME.md)
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').split('\r\n').join('\n')
    const a0 = css.indexOf(':root, [data-theme] {'), block = css.slice(a0, css.indexOf('\n}', a0))
    const tok = () => { const m = block.match(/--elev-frame:(#[0-9A-Fa-f]{6}); --elev-ink:(#[0-9A-Fa-f]{6});/); return m ? [m[1], m[2]] : null }
    expect(tok()).toEqual(['#123A2E', '#15181C'])
    expect(/\[data-theme="(obsidian|blueprint|studio)"\]/.test(css)).toBe(false)
    // frame / ink: the frames, beams, uprights, bracing and spacers, the ground and base plates; the default the reference's
    const th = elevationLayout(sampleT(), 96, { w: 900, h: 400 }, { ...sampleO, frame: 'var(--elev-frame)', ink: 'var(--elev-ink)' }).items
    expect(th.filter(i => ['beam', 'upright', 'frame', 'spacer'].includes(i.tag)).every(i => i.fill === 'var(--elev-frame)')).toBe(true)
    expect(th.some(i => i.t === 'line' && i.stroke === 'var(--elev-ink)')).toBe(true)
    expect(JSON.stringify(th).includes('#123A2E') || JSON.stringify(th).includes('#15181C')).toBe(false)
    // blue / red: the dimensions and the clearances take the theme's too (dark themes: light enough to read); the PDF the reference's
    const tk = elevationLayout(sampleT(), 96, { w: 1100, h: 460 }, { ...sampleO, detail: 'detailed', blue: 'var(--elev-dim)', red: 'var(--elev-clr)' }).items
    const fills = tk.flatMap(i => [i.fill, i.stroke]).filter(Boolean)
    expect([fills.includes('var(--elev-dim)'), fills.includes('var(--elev-clr)'), fills.includes('#1B4FD8'), fills.includes('#A8341C')]).toEqual([true, true, false, false])
    expect(tk.find(i => i.t === 'text' && /^FRAME/.test(i.s)).fill).toBe('var(--elev-dim)')
    expect(tk.find(i => i.t === 'text' && / CLR$/.test(i.s)).fill).toBe('var(--elev-clr)')
    const tok2 = () => { const m = block.match(/--elev-dim:(#[0-9A-Fa-f]{6}); --elev-clr:(#[0-9A-Fa-f]{6});/); return m ? [m[1], m[2]] : null }
    expect(tok2()).toEqual(['#1B4FD8', '#A8341C'])
    expect(readFileSync(new URL('../../components/Elevations/ElevationDrawing.jsx', import.meta.url), 'utf8')).toMatch(/blue: 'var\(--elev-dim\)', red: 'var\(--elev-clr\)'/)
    const d = elevationLayout(sampleT(), 96, { w: 900, h: 400 }, { ...sampleO, bg: 'var(--surface)' })
    expect(d.items.filter(i => i.t === 'text').every(i => i.haloColor === 'var(--surface)')).toBe(true)
    expect(itemSVGOf(d).includes('stroke:var(--surface)')).toBe(true)
    const pdf = readFileSync(new URL('../../export/pdfExport.js', import.meta.url), 'utf8')
    expect(pdf).toMatch(/detail, bg: '#fff' \}/)
  })

  it('EV-tab-wiring: no Elevation mode — Elevations a tab next to Properties, the panel wider on it (edge dragged, remembered), the toolbar stays; the tab: Front | Side and Simple | Detailed, the drawing taking most of the space, the chips (menu, + Add, Apply to selected rows, Remove unused), the Project setup link; the drawing zooms, pans, fits, goes full screen', () => {
    const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8')
    for (const f of ['utils/elevMode.js', 'components/Elevations/ModeSwitch.jsx', 'components/Elevations/ElevationWorkspace.jsx']) expect([f, existsSync(new URL('../../' + f, import.meta.url))]).toEqual([f, false])
    const app = src('App.jsx'), top = src('components/Toolbar/TopBar.jsx')
    // Studio: the library in studio mode (rail, flyout, tool pill), the frame's islands; Generate opens in the right card
    expect([/elevMode|ElevationWorkspace/.test(app), app.includes('        <FloatingToolbar studio />'), app.includes('        <StudioFrame onHub='), /ModeSwitch/.test(top)]).toEqual([false, true, true, false])
    expect(src('studio/StudioFrame.jsx')).toMatch(/<GeneratePanel embedded onClose=\{\(\) => useViewPrefs\.getState\(\)\.setCard\('tabs'\)\} \/>/)
    expect(/useElevMode/.test(src('canvas2/Canvas2.jsx') + src('canvas2/Scene.jsx') + src('canvas2/useCanvasInteraction.js') + src('hooks/useKeyboardShortcuts.js') + src('canvas2/ElevationsCanvas.jsx'))).toBe(false)
    // Studio: the right card (300 wide, StudioFrame.jsx) holds the two tabs; their content is RightPanelTabs
    const rp = src('components/RightPanel/index.jsx'), card = src('studio/StudioFrame.jsx')
    expect(card).toMatch(/>Properties<\/button>[\s\S]*>Elevations<\/button>/)
    expect(card).toMatch(/right: 16, top: 76, width: cardW, maxHeight: 'calc\(100vh - 152px\)'/)
    expect(rp).toMatch(/<ElevationsTab \/>/)
    expect([RP.panelWidth({ tab: 'elevations', elevW: 520 }), RP.panelWidth({ tab: 'properties', elevW: 520 })]).toEqual([520, 272])
    RP.setRightPanel({ tab: 'elevations', elevW: 555 })
    expect(JSON.parse(localStorage.getItem('trace.rightpanel.v1'))).toEqual({ tab: 'elevations', elevW: 555 })
    RP.setRightPanel({ tab: 'properties', elevW: 480 })
    const tab = src('components/Elevations/ElevationsTab.jsx')
    // 1. the sheet (C2, C3): white, a 14px #EFEEE9 grid, radius 8 — the drawing and no buttons on it; the grab handle under
    // it; then the list or the editor in place
    const tBox = tab.indexOf('data-drawing-box'), tSwap = tab.indexOf('? <Editor ')
    const hIdx = tab.indexOf('role="separator" aria-orientation="horizontal" aria-label="Resize drawing"')
    expect([tBox > 0, hIdx > tBox, tSwap > hIdx]).toEqual([true, true, true])                          // sheet | handle | list or editor
    expect(/role="toolbar"|aria-label="Fit"|BEAM \{/.test(tab)).toBe(false)                               // no toolbar above it
    expect(tab).toMatch(/margin: '0 12px', height: sheetH, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF', backgroundImage: 'linear-gradient\(#EFEEE9 1px, transparent 1px\), linear-gradient\(90deg, #EFEEE9 1px, transparent 1px\)', backgroundSize: '14px 14px'/)
    expect(tab).toMatch(/detail="studio" fullDetail=\{detail\} view=\{view\} height=\{sheetH\} controls=\{false\} paper fullSignal=\{fullSignal\}\s+readOnly=\{!e\}/)   // read-only in the list; beams drag only in the editor
    // its height: the mockup's (420 under the list, 290 over the editor) shortened to leave the list or the form room; once dragged, the user's share
    expect(tab).toMatch(/const SHEET_LIST = 420, SHEET_EDIT = 290/)
    expect(tab).toMatch(/const sheetH = Math\.max\(SHEET_MIN, onSheet \? Math\.min\(SHEET_EDITING, room - ROW_MIN\) : split != null \? Math\.round\(room \* split\) : full \? Math\.max\(Math\.min\(200, SHEET_EDIT\), Math\.min\(SHEET_EDIT, room - formNeed\)\) : Math\.min\(SHEET_LIST, room - LIST_MIN\)\)/)
    expect(tab).toMatch(/<span aria-hidden style=\{\{ width: 32, height: 3, borderRadius: 2, background: C\.separator \}\} \/>/)   // the grab handle
    expect(tab).toMatch(/onPointerDown=\{startSplit\} onDoubleClick=\{resetElevSplit\}/)
    expect(tab).toMatch(/cursor: 'row-resize'/)
    expect(tab).toMatch(/setElevSplit\(last, \{ save: false \}\)/)                                         // live while dragging, written on release
    // the split store: 65% to start, clamped 30–80%, the user's own (localStorage), not the layout's
    expect([TAB.SPLIT_DEFAULT, TAB.SPLIT_MIN, TAB.SPLIT_MAX, TAB.clampSplit(0.1), TAB.clampSplit(0.95), TAB.clampSplit(0.5), TAB.clampSplit(NaN)]).toEqual([0.65, 0.3, 0.8, 0.3, 0.8, 0.5, 0.65])
    TAB.setElevSplit(0.72)
    expect([TAB.useElevSplit.getState().split, JSON.parse(localStorage.getItem('trace.elevsplit.v1'))]).toEqual([0.72, 0.72])
    TAB.setElevSplit(0.9, { save: false })
    expect([TAB.useElevSplit.getState().split, JSON.parse(localStorage.getItem('trace.elevsplit.v1'))]).toEqual([0.8, 0.72])
    TAB.setElevSplit(TAB.SPLIT_DEFAULT)
    expect(TAB.useElevSplit.getState().split).toBe(0.65)
    TAB.resetElevSplit()                                                                                // double-click: the mockup's heights again
    expect([TAB.useElevSplit.getState().split, localStorage.getItem('trace.elevsplit.v1')]).toEqual([null, null])
    expect(/elevSplit|SPLIT/.test(src('store/useCanvasStore.js') + src('utils/project.js'))).toBe(false)   // never in the layout
    // 2A. the list (C2): "In this layout" with Depth and Full screen; 48h rows (swatch, name, sub line, DEFAULT, More); Apply (primary) and New (ghost)
    const listUi = tab.slice(tab.indexOf('function List('), tab.indexOf('function Editor('))
    expect(['>In this layout</span>', '<SheetButtons view={view} onFull={onFull} />', 'role="list" aria-label="Elevation list"', 'height: 48, flexShrink: 0', "background: on ? C.active : 'transparent'", '{counts.get(t.id) || 0}</span> bays', '>DEFAULT</span>', 'startSheet(store, t.id)', '<Icon name="Edit" />', '<IconBtn name="More" ', 'Apply to ${rowsSelected} selected row', 'Select rows to apply', '<Plus />New</Btn>'].map(k => listUi.indexOf(k)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]))).toBe(true)
    expect(listUi).toMatch(/onClick=\{\(\) => useElevTab\.setState\(\{ activeId: t\.id \}\)\}/)                  // a click picks it; Apply assigns
    expect(listUi.includes("{ceil?.name ? `${ceil.name} · ` : ''}{face !== faceDefault ? `${face}″ beam · ` : ''}")).toBe(true)   // the sub line: ceiling · beam if not the default · bays
    expect(listUi).toMatch(/<Btn kind="primary" disabled=\{!canApply\}/)                                   // Apply: disabled (45%) with no row selected
    // 2B. the editor (C3): Back · title · Depth · Full screen; Name; Ceiling typed; the Pallet box (four typed values); the Rack box (Frame depth, Beam size, Beam length; the frame warning); Cancel and Save
    const editUi = tab.slice(tab.indexOf('function Editor('))
    expect(['aria-label="Back"', 'Edit elevation <span', "'New elevation'", '<SheetButtons view={view} onFull={onFull} />', 'aria-label="Elevation name"', '<InlineField label="Ceiling">', 'role="group" aria-label="Pallet"', "gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'", 'role="group" aria-label="Rack"', "gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'", 'aria-label="Pallet depth"', '>Cancel</Btn>', '>Save elevation</Btn>'].map(k => editUi.indexOf(k)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]))).toBe(true)
    expect((editUi.match(/>Save/g) || []).length).toBe(1)                                              // ONE save, even with both "+ New" open
    expect(/>Save<\/button>|setNewForm/.test(editUi)).toBe(false)                                     // the inner forms have no buttons
    expect(/BEAM_FACES|<select/.test(editUi)).toBe(false)                                               // Beam size typed; no dropdowns
    expect(tab).toMatch(/onCommit=\{e \? \(next\) => editDraft\(store, \{ \.\.\.next, id: e\.draft\.id \}, \{ fromDrawing: true \}\) : \(\) => \{\}\}/)   // into the draft
    expect(/aria-label="[^"]*Beam length[^"]*" (type|value)|<select[^>]*Beam length/i.test(tab)).toBe(false)        // no beam-length control
    expect(tab).toMatch(/Clear height not set — elevations assume \{ASSUMED_FT\}'\. Set it in <button type="button" style=\{link\} onClick=\{\(\) => openSetup\('settings'\)\}>Project settings<\/button>/)
    // the row's More: Edit, colour, duplicate, set default, remove unused, delete
    // the row's More: colour, duplicate, set as default, remove unused, delete (Edit is the row's pencil — quick edit)
    for (const k of ["item('Duplicate',", "item('Set as default',", "item('Remove unused elevations', () => removeUnused(store))", "item('Delete',", "item('Full edit', () => startFull(store, t.id))", 'startSheet(store, t.id)']) expect([k, tab.includes(k)]).toEqual([k, true])
    // the drawing: Fit and ⤢ are the tab's (signals); graph paper
    const drw = src('components/Elevations/ElevationDrawing.jsx')
    expect(drw).toMatch(/useEffect\(\(\) => \{ if \(fitSignal\) fit\(\) \}, \[fitSignal\]\)/)
    expect(drw).toMatch(/useEffect\(\(\) => \{ if \(props\.fullSignal\) setFull\(true\) \}, \[props\.fullSignal\]\)/)
    expect(drw).toMatch(/\{controls && <div style=\{\{ position: 'absolute', top: 6, right: 6/)
    expect(drw).toMatch(/const PAPER = '#FFFFFF'/)                                                     // a plain white sheet — no grid
    expect(/linear-gradient/.test(drw)).toBe(false)
    // reminders are blue: the clear-height note; the same-as note offers the existing one
    expect(tab).toMatch(/<Note level="note" role="note" aria-label="Clear height not set">/)
    expect(tab).toMatch(/const same = sameElevation\(dT, d, e\.id\)/)
    expect(tab).toMatch(/Same as <strong>\{nameOf\(T, same\)\}<\/strong> — <button type="button" onClick=\{useSame\}[^>]*>use that one instead\?<\/button>/)
    expect(tab).toMatch(/const useSame = \(\) => \{ cancelEdit\(\); useElevTab\.setState\(\{ activeId: same\.id, made: null \}\) \}/)
    expect(/Proposals|Use for layout|> Apply</.test(tab)).toBe(false)                     // no proposals, no Apply / Discard
    // the pallets drawn on a beam: the elevation's own pallet face — in the tab and on the PDF
    expect(tab).toMatch(/entry=\{shownEntry\}/)
    expect(src('export/pdfExport.js')).toMatch(/palletWIn: \(type\.palletId && T\?\.project\?\.pallets\?\.find\(x => x\.id === type\.palletId\)\?\.faceIn\) \|\| e\.palletWIn/)
    const dr = src('components/Elevations/ElevationDrawing.jsx')
    expect(dr).toMatch(/el\.addEventListener\('wheel', onWheel, \{ passive: false \}\)/)
    expect(dr).toMatch(/setZv\(\{ zoom: z2, pan: \{ x: q\.x - \(q\.x - pan\.x\) \* \(z2 \/ zoom\), y: q\.y - \(q\.y - pan\.y\) \* \(z2 \/ zoom\) \} \}\)/)
    expect(dr).toMatch(/onDoubleClick=\{\(e\) => \{ if \(empty\(e\)\) fit\(\) \}\}/)
    expect(dr).toMatch(/aria-label="Full screen"/)
    expect(dr).toMatch(/role="dialog" aria-label="Elevation full screen"/)
    expect(dr).toMatch(/if \(e\.key === 'Escape'\) \{ e\.stopPropagation\(\); setFull\(false\) \}/)
    // the legend clear of "← Hub"; Properties keeps its one line
    expect(src('canvas2/ElevationsCanvas.jsx')).toMatch(/position: 'absolute', left: 104, bottom: 12/)
    expect(src('studio/cards.jsx')).toMatch(/<ElevationChip \/>/)   // Studio C1: the selection's elevation as the card's chip
  })

  it('EV-crisp: the drawing sits on the device-pixel grid (a fractional panel offset snapped out), straight lines and rects with crisp edges, labels with geometric precision and a touch bolder (500)', () => {
    const dr = readFileSync(new URL('../../components/Elevations/ElevationDrawing.jsx', import.meta.url), 'utf8')
    expect(dr).toMatch(/Math\.round\(r\.left \* dpr\) - r\.left \* dpr\) \/ dpr/)
    expect(dr).toMatch(/style=\{\{ display: 'block', position: 'relative', left: snap\.x, top: snap\.y \}\}/)
    expect(dr).toMatch(/<rect key=\{n\} data-role=\{role\} data-tag=\{i\.tag\} shapeRendering=\{i\.rx \? undefined : 'crispEdges'\}/)   // crisp, but a rounded box (the sheet's −) smooth
    expect(dr).toMatch(/shapeRendering=\{i\.x1 === i\.x2 \|\| i\.y1 === i\.y2 \? 'crispEdges' : undefined\}/)
    expect(dr).toMatch(/textRendering="geometricPrecision"/)
    expect(/transform: `?scale|style=\{\{[^}]*\bzoom:/.test(dr)).toBe(false)                   // no CSS scaling (zoom redraws the layout)
    const d = elevationLayout(sampleT(), 96, { w: 900, h: 400 }, { ...sampleO, detail: 'detailed' })
    expect(d.items.filter(i => i.t === 'text').every(i => i.weight >= 500)).toBe(true)
  })

  it('EV-depth-edit: the selected rack\'s depth re-sizes it about its centre (a pair keeps its flue), one undo step; the aisles follow; the Row group replays it', async () => {
    const pair = { id: 'p', type: 'rack_double_row', x: 0, y: 0, width: 400, height: ((2 * 42 + 9) / 12) * GS, depthIn: 42, flueSpaceIn: 9, rotation: 0, beams: [96] }
    const u = rackDepthUpdate(pair, 48, GS)
    expect([u.depthIn, u.height, u.y + u.height / 2]).toEqual([48, ((2 * 48 + 9) / 12) * GS, pair.y + pair.height / 2])
    expect(rackDepthUpdate(pair, 42, GS)).toBe(null)
    const single = { ...pair, type: 'rack_row', flueSpaceIn: 0, height: (42 / 12) * GS }
    expect(rackDepthUpdate(single, 36, GS).height).toBe((36 / 12) * GS)
    load(savedFill(true)); await settle()
    useRowGroup.getState().setAlwaysApply(true)
    addRowOf(pairOf(12).id); addRowOf(pairOf(14).id)
    const h = hist(), p = pairOf(12)
    store.getState().commitObjectUpdate(p.id, rackDepthUpdate(p, 46, GS)); await settle()
    expect(hist()).toBe(h + 1)
    expect([pairOf(12).depthIn, pairOf(14).depthIn, useRowGroup.getState().message]).toEqual([46, 46, expect.stringMatching(/^Applied to 1 row/)])
    const aisle = objs().find(o => o.type === 'aisle' && [o.row1Id, o.row2Id].includes(pairOf(12).id))
    expect(!!aisle).toBe(true)
    store.getState().undo()
    expect([pairOf(12).depthIn, pairOf(14).depthIn]).toEqual([42, 42])
    useRowGroup.getState().setAlwaysApply(false)
  })

  it('EV-remove-wire: a beam\'s level is removed by dragging it off the end of the bay or by picking it and pressing Delete (also with the focus back on the page, never while typing in a field); a press outside the editor un-picks it', () => {
    const pane = readFileSync(new URL('../../components/Elevations/ElevationDrawing.jsx', import.meta.url), 'utf8')
    expect(pane).toMatch(/p\.x < d\.Xf\(0\) - fontPx \* 1\.5 \|\| p\.x > d\.Xf\(d\.frontW\) \+ fontPx \* 1\.5/)
    expect(pane).toMatch(/window\.addEventListener\('keydown', onWin, true\)/)
    // focusing the drawing never scrolls the panel: a beam grabbed low in a long panel stays under the pointer
    expect([/\.focus\(\)/.test(pane), (pane.match(/focus\(\{ preventScroll: true \}\)/g) || []).length]).toEqual([false, 2])
    expect((pane.match(/if \(textOwnsKey\(e\)\) return/g) || []).length).toBe(2)          // the window listener and the drawing's own: typing in a field keeps Delete
    expect(pane).toMatch(/closest\('\[data-pane="open"\]'\)\)\) setPane\(\{ sel: null \}\)/)
  })
})

describe('EV — the wiring', () => {
  it('EV-wire: no paint tool on the canvas (types are set from a selection); the legend stays; the keeper is installed; the editor is in Properties (never floating); Simple / Detailed remembered per browser', async () => {
    const c2 = readFileSync(new URL('../../canvas2/Canvas2.jsx', import.meta.url), 'utf8')
    expect(c2).toMatch(/splitting \? splitMouseDown : onStageMouseDown/)
    expect(/<ElevLegend \/>/.test(c2)).toBe(false)   // Studio: the colours toggle is the bottom-right island's Elevations
    const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
    expect(app).toMatch(/installElevationsKeeper\(useCanvasStore\)/)
    expect(app).toMatch(/<div className="flex flex-1 min-h-0 overflow-hidden" style=\{\{ position: 'relative' \}\}>\s*<Canvas2 \/>/)
    const pane = readFileSync(new URL('../../components/Elevations/ElevationDrawing.jsx', import.meta.url), 'utf8')
    // never floating — only its full-screen view, on purpose
    expect([(pane.match(/position: 'fixed'/g) || []).length, /createPortal\(\s*<div role="dialog" aria-label="Elevation full screen" style=\{\{ position: 'fixed'/.test(pane)]).toEqual([1, true])
    // the beams and the upright tops are grabbed through strips drawn last, so a label on a beam never takes its drag
    expect(pane.includes("data-grab=")).toBe(true)
    expect(pane.includes("onPointerDown={(e) => startDrag(e, i.role)}")).toBe(true)
    ED.setPane({ detail: 'detailed' })
    expect(JSON.parse(localStorage.getItem('trace.elevpane.v1'))).toEqual({ detail: 'detailed' })
    ED.setPane({ detail: 'simple' })
  })

})

describe('EV — the top load against the building', () => {
  it('EV-topload: the top of the top load (the top beam + its pallet; the upright top with no load up there) must stay under the clear height, and at least the sprinkler clearance (a setting, 18") under the sprinkler heads — an error each in Check layout, the top loads red in the drawing', () => {
    const t = { ...E.makeType({ id: 'A', levelsCount: 4 }), uprightHeightIn: 228, levels: [0, 74, 148, 222].map((z, k) => ({ beamIn: z, palletHeightIn: k === 3 ? 36 : 60, loadLb: 2500 })) }
    expect(E.topOfLoad(t)).toBe(258)
    expect(E.topOfLoad({ ...t, levels: t.levels.map((l, k) => (k === 3 ? { ...l, palletHeightIn: 0 } : l)) })).toBe(228)
    expect([E.topLoadIssue(t, { clearHeightIn: 250 }), E.topLoadIssue(t, { clearHeightIn: 290, sprinklerIn: 270 }), E.topLoadIssue(t, { clearHeightIn: 290, sprinklerIn: 276 }), E.topLoadIssue(t, { sprinklerIn: 270 }, 12), E.topLoadIssue(t, null)]).toEqual(['clear', 'sprinkler', null, null, null])
    // Check layout, on the hand layout: the default type at 4 levels (top load 180 + 48 = 228" = 19')
    const L = hand(false), withFp = (patch) => L.o.map(x => (x.id === 'fp' ? { ...x, ...patch } : x))
    const errs = (o, tb = L.t) => checkLayout(o, { gridSize: GS, elevations: tb }).errors.filter(e => e.kind === 'elev-load-clear' || e.kind === 'elev-sprinkler').map(e => e.text)
    expect(errs(withFp({ clearHeightFt: 18 }))).toEqual(['Elevation 4 levels: top of load 19\'-0" is above the building\'s clear height 18\'-0"'])
    expect(errs(withFp({ clearHeightFt: 24, sprinklerFt: 20 }))).toEqual(['Top load within 18" of sprinklers — elevation 4 levels: top of load 19\'-0", sprinkler heads at 20\'-0"'])
    expect(errs(withFp({ clearHeightFt: 24, sprinklerFt: 21 }))).toEqual([])
    // the setting: 6" → 20' sprinklers pass; it is the layout's own (saved with the types)
    const six = edit(L, tb => ({ ...tb, sprinklerClearanceIn: 6 }))
    expect([E.sprinklerClearance(six.t), E.sprinklerClearance(L.t), errs(withFp({ sprinklerFt: 20 }), six.t)]).toEqual([6, 18, []])
    // the drawing: the top level's loads red with the reason, the others not
    const d = elevationLayout(t, 96, { w: 1100, h: 420 }, { depthIn: 48, pair: true, flueIn: 12, building: { clearHeightIn: 290, sprinklerIn: 270 } })
    expect(d.items.filter(i => i.tag === 'load' && i.level === 3).every(i => i.fill === '#F5E7E3' || i.fill === '#A8341C')).toBe(true)
    expect(d.items.filter(i => i.tag === 'load' && i.level !== 3).every(i => i.fill === '#E8DCC2' || i.fill === '#C9A870')).toBe(true)
    expect(d.items.filter(i => i.tag === 'misfit').map(i => i.s)).toEqual(['WITHIN 18" OF SPRINKLERS'])
    const c = elevationLayout(t, 96, { w: 1100, h: 420 }, { depthIn: 48, building: { clearHeightIn: 250 } })
    expect(c.items.filter(i => i.tag === 'misfit').map(i => i.s)).toEqual(['ABOVE CLEAR HEIGHT'])
    expect(elevationLayout(t, 96, { w: 1100, h: 420 }, { building: { clearHeightIn: 290, sprinklerIn: 295 } }).items.some(i => i.tag === 'misfit')).toBe(false)
  })
})


describe('EV — the chain, the building lines', () => {
  const t0 = () => ({ ...E.makeType({ id: 'A', levelsCount: 4 }), uprightHeightIn: 228, clearanceIn: 6, beamFaceIn: 4, levels: [0, 74, 148, 222].map((z, k) => ({ beamIn: z, palletHeightIn: k === 3 ? 36 : 60, loadLb: 2500 })) })
  const vals = (d, id) => d.items.filter(i => i.t === 'text' && i.role?.id === id).map(i => ({ k: i.role.k, v: i.role.value, s: i.s, fill: i.fill }))

  it('EV-chain: per level what is really there — the pallet, the ACTUAL gap to the underside of the beam above, that beam\'s face — and it adds up: pallet + gap + face = the beam spacing; a gap under the clearance red; the top level its pallet then the gaps to the clear height and the sprinkler heads', () => {
    const t = t0(), b = { clearHeightIn: 290, sprinklerIn: 295 }
    const d = elevationLayout(t, 96, { w: 1100, h: 460 }, { depthIn: 48, pair: true, flueIn: 12, building: b, fontPx: 12, detail: 'detailed' })
    const pal = vals(d, 'pallet'), gap = vals(d, 'gap'), face = vals(d, 'face')
    expect(pal.map(x => x.s)).toEqual(['5\'-0"', '5\'-0"', '5\'-0"', '3\'-0"'])
    expect(gap.map(x => x.s)).toEqual(['10"', '10"', '10"'])
    expect(face.map(x => x.s)).toEqual(['4"', '4"', '4"'])
    // it adds up, level by level
    const L = [...t.levels].sort((a, b2) => a.beamIn - b2.beamIn)
    for (let i = 0; i + 1 < L.length; i++) expect(pal.find(x => x.k === i).v + gap.find(x => x.k === i).v + face[i].v).toBe(L[i + 1].beamIn - L[i].beamIn)
    expect(gap.every(x => x.fill === '#1B4FD8')).toBe(true)                       // 10" ≥ the 6" clearance
    // the top level: its pallet, then up to the clear height (2'-8") and on to the sprinkler heads (5")
    const top = d.items.filter(i => i.t === 'text' && String(i.role?.id).startsWith('gap-')).map(i => [i.role.id, i.s])
    expect(top).toEqual([['gap-clear', '2\'-8"'], ['gap-sprinkler', '5"']])
    // a 66" pallet on level 2: a 4" gap, under the 6" clearance — red
    const t2 = { ...t, levels: t.levels.map((l, k) => (k === 1 ? { ...l, palletHeightIn: 66 } : l)) }
    const d2 = elevationLayout(t2, 96, { w: 1100, h: 460 }, { depthIn: 48, fontPx: 12, detail: 'detailed' })
    const g2 = vals(d2, 'gap')
    expect(g2.map(x => [x.s, x.fill])).toEqual([['10"', '#1B4FD8'], ['4"', '#A8341C'], ['10"', '#1B4FD8']])
    // a typed gap moves the beam above (pallet + gap + face); a typed pallet height sets that level's
    expect(ED.setDimension(t, 'gap', 1, 12).levels[2].beamIn).toBe(74 + 60 + 12 + 4)
    expect(ED.setDimension(t, 'pallet', 2, 50).levels[2].palletHeightIn).toBe(50)
  })

  it('EV-sprinkler-line: Detailed draws the sprinkler line red, labelled with its height, and the clear-height line as before; Simple keeps the reference (the dashed line, a grey label, none when it is the clear height)', () => {
    const t = t0(), b = { clearHeightIn: 290, sprinklerIn: 295 }, box = { w: 1100, h: 460 }, o = { depthIn: 48, pair: true, flueIn: 12, building: b, fontPx: 12 }
    const det = elevationLayout(t, 96, box, { ...o, detail: 'detailed' }).items, sim = elevationLayout(t, 96, box, { ...o, detail: 'simple' }).items
    const spr = (items) => items.filter(i => i.tag === 'sprinkler'), lab = (items) => items.find(i => i.t === 'text' && i.s === 'SPRINKLERS 24\'-7"')
    expect(spr(det).length).toBe(2)                                                   // front and side
    expect(spr(det).every(i => i.stroke === '#A8341C' && !i.dash)).toBe(true)
    expect(lab(det).fill).toBe('#A8341C')
    expect(det.filter(i => i.tag === 'clear').length).toBe(2)
    expect([spr(sim).length, lab(sim).fill, sim.filter(i => i.tag === 'clear').length]).toEqual([0, '#7A828C', 2])
    // the sprinklers at the clear height: Simple one line labelled as the clear height; Detailed still names them, red
    const same = { ...o, building: { clearHeightIn: 290, sprinklerIn: 290 } }
    expect(elevationLayout(t, 96, box, { ...same, detail: 'simple' }).items.some(i => i.t === 'text' && /^SPRINKLERS/.test(i.s))).toBe(false)
    expect(elevationLayout(t, 96, box, { ...same, detail: 'detailed' }).items.filter(i => i.t === 'text' && /^SPRINKLERS/.test(i.s)).map(i => i.fill)).toEqual(['#A8341C', '#A8341C'])
    // no sprinkler height: no line
    expect(elevationLayout(t, 96, box, { ...o, building: { clearHeightIn: 290 }, detail: 'detailed' }).items.some(i => i.tag === 'sprinkler')).toBe(false)
  })

  it('EV-clearance-label: CLEARANCE sits inside the band, under the clear-height line where that line crosses it — never on the line, in either mode, at any size; no room there: none', () => {
    const t = t0()
    const cases = [[{ clearHeightIn: 290, sprinklerIn: 295 }], [{ clearHeightIn: 280, sprinklerIn: 310 }], [{ clearHeightIn: 250, sprinklerIn: 300 }], [{ clearHeightIn: 300, sprinklerIn: 300 }]]
    const boxes = [[{ w: 1100, h: 460 }, 12, false], [{ w: 454, h: 431 }, 9, false], [{ w: 360, h: 640 }, 9, true], [{ w: 820, h: 300 }, 11, false]]
    let seen = 0
    for (const [b] of cases) for (const [box, fontPx, stacked] of boxes) for (const detail of ['simple', 'detailed']) {
      const items = elevationLayout(t, 96, box, { depthIn: 48, pair: true, flueIn: 12, building: b, fontPx, stacked, detail }).items
      const bands = items.filter(i => i.tag === 'band'), clears = items.filter(i => i.tag === 'clear')
      for (const l of items.filter(i => i.t === 'text' && /^CLEARANCE/.test(i.s))) {
        seen++
        const bx = labelBox(l), band = bands.find(r => bx.x0 < r.x + r.w + l.size * 6 && bx.x1 > r.x - l.size * 6 && bx.y0 >= r.y - 0.5 && bx.y1 <= r.y + r.h + 0.5)
        expect([JSON.stringify(b), detail, !!band]).toEqual([JSON.stringify(b), detail, true])
        const line = clears.find(c => c.y1 > band.y && c.y1 < band.y + band.h)
        if (line) expect([JSON.stringify(b), detail, bx.y0 > line.y1]).toEqual([JSON.stringify(b), detail, true])
      }
    }
    expect(seen).toBeGreaterThan(20)
    // a band with no room under the line (the clear height 2" over its bottom): no label
    const tight = elevationLayout(t, 96, { w: 1100, h: 460 }, { depthIn: 48, building: { clearHeightIn: 279, sprinklerIn: 295 }, fontPx: 12 }).items
    expect(tight.some(i => i.t === 'text' && /^CLEARANCE/.test(i.s))).toBe(false)
  })
})
