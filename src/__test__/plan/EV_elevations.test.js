// Area EV — Elevations (ELEVATIONS_PLAN.md; utils/elevations.js, elevPaint.js, elevEditor.js, elevationDraw.js,
// elevationDrawing.js). v1: types assigned layout default → rack → side → bay, overrides only where they differ;
// paint mode Row / Side / Bay (hover = what a click changes, the flue = both sides, a drag stays on its row and side);
// positions per bay from the bay-side's type; existing racks' levels become types on load with nothing moved and
// usable unchanged; splits, one-side delete, takeover, joins and Row group replays carry the type; Check layout
// errors; legend, PDF, the BOM data. v2: beam face (levels to the top of the beam), frame depth from the rack, a type
// change no hand edit, the types in the store (undo, save / load, old files), the editor's edits, the drawing, the
// PDF's elevation sheets. Both orientations.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
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
import { elevationLayout, lengthsByType, ftInDash, parseFtIn, archScale } from '../../utils/elevationDrawing'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { targetAt, strokeTargets, commitPaint } from '../../utils/elevPaint'
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

  it('EV-paint-targets: Row = every rack of the row; Side = the half under the cursor (the flue: both sides), a drag along the row takes that side of every rack it passes; Bay = that bay on that half, a drag the run of bays between, staying on the side it started', () => {
    const { o } = hand(vert), p1 = rack(o, 'p1'), p2 = rack(o, 'p2')
    const at = (r, i, side) => targetAt(o, r.id, pointIn(r, i, side), GS)
    const show = (m) => [...m].map(([id, t]) => [id, t.sides, t.bays]).sort()
    const t0 = at(p1, 1, 0), side0 = t0.ws
    expect(show(strokeTargets(o, 'row', t0, t0, GS))).toEqual([['p1', null, null], ['p2', null, null]])
    expect(show(strokeTargets(o, 'side', t0, t0, GS))).toEqual([['p1', [0], null]])
    expect(show(strokeTargets(o, 'bay', t0, t0, GS))).toEqual([['p1', [0], [1]]])
    const flue = at(p1, 1, null)
    expect([flue.ws, show(strokeTargets(o, 'bay', flue, flue, GS))]).toEqual([null, [['p1', [0, 1], [1]]]])
    const to = at(p2, 0, 0)
    expect(to.ws).toBe(side0)
    expect(show(strokeTargets(o, 'bay', t0, to, GS))).toEqual([['p1', [0], [1, 2]], ['p2', [0], [0]]])
    expect(show(strokeTargets(o, 'side', t0, to, GS))).toEqual([['p1', [0], null], ['p2', [0], null]])
    const ts = targetAt(o, 's', pointIn(rack(o, 's'), 0, null), GS)
    expect(show(strokeTargets(o, 'row', t0, t0, GS, [t0.rowKey, ts.rowKey]))).toEqual([['p1', null, null], ['p2', null, null], ['s', null, null]])
  })

  it('EV-commit: a click or drag is ONE history entry; one undo takes it back; reset removes the overrides on what is clicked (Bay → the side\'s type, Side → the rack\'s, Row → all)', async () => {
    const L = withTypes(hand(vert)); load(L.o, L.t); await settle()
    const h = hist(), p1 = rack(objs(), 'p1')
    const t0 = targetAt(objs(), 'p1', pointIn(p1, 0, 1), GS), def = T().defaultId
    expect(commitPaint(store, strokeTargets(objs(), 'row', t0, t0, GS), { typeId: 'C' })).toBe(true); await settle()
    expect(commitPaint(store, strokeTargets(objs(), 'side', t0, t0, GS), { typeId: 'B' })).toBe(true); await settle()
    expect(commitPaint(store, strokeTargets(objs(), 'bay', t0, t0, GS), { typeId: def })).toBe(true); await settle()
    expect(hist()).toBe(h + 3)
    const sideIdx = rack(objs(), 'p1').elevSides.findIndex(v => v === 'B')
    expect([rack(objs(), 'p1').elevType, ids(rack(objs(), 'p1'), T())[sideIdx], ids(rack(objs(), 'p1'), T())[1 - sideIdx]]).toEqual(['C', [def, 'B', 'B'], ['C', 'C', 'C']])
    commitPaint(store, strokeTargets(objs(), 'bay', t0, t0, GS), { reset: true }); await settle()
    expect(ids(rack(objs(), 'p1'), T())[sideIdx]).toEqual(['B', 'B', 'B'])
    commitPaint(store, strokeTargets(objs(), 'side', t0, t0, GS), { reset: true }); await settle()
    expect([rack(objs(), 'p1').elevType, rack(objs(), 'p1').elevSides, ids(rack(objs(), 'p1'), T())[sideIdx]]).toEqual(['C', undefined, ['C', 'C', 'C']])
    commitPaint(store, strokeTargets(objs(), 'row', t0, t0, GS), { reset: true }); await settle()
    expect(['p1', 'p2'].map(id => E.ELEV_FIELDS.map(k => rack(objs(), id)[k]))).toEqual([[undefined, undefined, undefined], [undefined, undefined, undefined]])
    expect(hist()).toBe(h + 6)
    store.getState().undo()
    expect(rack(objs(), 'p1').elevType).toBe('C')
    store.getState().undo()
    expect(ids(rack(objs(), 'p1'), T())[sideIdx]).toEqual(['B', 'B', 'B'])
    store.getState().undo(); store.getState().undo(); store.getState().undo()
    expect([rack(objs(), 'p1').elevType, rack(objs(), 'p1').elevSides]).toEqual(['C', undefined])
    store.getState().undo()
    expect(rack(objs(), 'p1').elevType).toBe(undefined)
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
    const s0 = rowRacks(12, 'rack_row')[0], ts = targetAt(objs(), s0.id, pointIn(s0, 0, null), GS)
    commitPaint(store, strokeTargets(objs(), 'side', ts, ts, GS), { typeId: 'B' }); await settle()
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

  it('EV-group: rows 12 and 14 in a Row group (Auto apply) — a whole row painted B → row 14 whole B; then one bay on one side painted C → row 14 the bay at the same uprights on the same side across the floor; one history entry each, the types in it', async () => {
    load(savedFill(vert)); await settle()
    commitTable(t => E.addType(E.addType(t, { id: 'B', name: 'B' }), { id: 'C', name: 'C' })); await settle()
    useRowGroup.getState().setAlwaysApply(true)
    addRowOf(pairOf(12).id); addRowOf(pairOf(14).id)
    const h = hist(), p12 = pairOf(12)
    const t = targetAt(objs(), p12.id, pointIn(p12, 2, 0), GS)
    commitPaint(store, strokeTargets(objs(), 'row', t, t, GS), { typeId: 'B' }); await settle()
    expect(hist()).toBe(h + 1)
    expect(useRowGroup.getState().message).toMatch(/^Applied to 1 row/)
    expect(rowRacks(14).every(r => E.typeMap(r, T()).flat().every(x => x === 'B'))).toBe(true)
    expect(JSON.parse(store.getState().history[hist()]).elevations).toEqual(T())
    const t2 = targetAt(objs(), pairOf(12).id, pointIn(pairOf(12), 2, 0), GS)
    commitPaint(store, strokeTargets(objs(), 'bay', t2, t2, GS), { typeId: 'C' }); await settle()
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
      'Elevation B: top of upright 30\' is above the building\'s clear height 25\'',
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
    expect([on.includes(`fill="${B}" fill-opacity="0.38"`), on.includes('ELEVATIONS')]).toEqual([true, true])
    expect([off.includes('fill-opacity="0.38"'), off.includes('ELEVATIONS')]).toEqual([false, false])
    // a 9' bay on the single too: three elevations — the default at 8' and 9', B at 8'
    const o2 = L.o.map(x => (x.id === 's' ? { ...x, beams: [96, 108, 96, 96] } : x))
    const pages = buildElevationSheets(o2, { title: 'T', elevations: tb })
    expect(pages.length).toBe(1)
    const svg = pages[0].svg
    expect(['4 levels · 8\' bay', '4 levels · 9\' bay', 'B · 8\' bay', 'RACK ELEVATIONS', 'SCALE: ', '=1\'', 'fill="#a3201b"'].map(x => svg.includes(x))).toEqual([true, true, true, true, true, true, true])
    expect(svg.includes('C · ')).toBe(false)
    expect(/\d lb|#/.test(svg.replace(/fill="#[0-9a-fA-F]+"|stroke="#[0-9a-fA-F]+"/g, ''))).toBe(false)   // no weights on the drawing
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
    expect([ftInDash(74), ftInDash(312), ftInDash(4)]).toEqual(['6\'-2"', '26\'', '4"'])
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

  it('EV-drawing: the sample sheet — beams to the top at 6\'-2", 12\'-4", 18\'-6" (on leaders off the beam ends) with a 4" face, 5\'-10" clear openings, the 5\'-6" load + clearance chain and the 3\' top load, 21\'-6" top of load, the 24\'-2" clear height (the truss\'s bottom chord) and 26\' top of the truss, the sprinkler head at 24\'-7" on its own dimension, labelled; an 8\' bay; back-to-back 4\' frames with a 1\' flue and a 19\' upright; drawn in the sample\'s style; no weights', () => {
    const t = { ...t0(), uprightHeightIn: 228, levels: [0, 74, 148, 222].map((z, k) => ({ beamIn: z, palletHeightIn: k === 3 ? 36 : 60, loadLb: 2500 })) }
    const d = elevationLayout(t, 96, { w: 1100, h: 700 }, { depthIn: 48, pair: true, flueIn: 12, building: { clearHeightIn: 290, sprinklerIn: 295 } })
    const texts = d.items.filter(i => i.t === 'text').map(i => i.s)
    for (const want of ['8\'', '6\'-2"', '12\'-4"', '18\'-6"', '5\'-10"', '5\'-6"', '3\'', '4"', '21\'-6"', '24\'-2"', '26\'', '24\'-7"', '19\'', '4\'', '1\'', 'Sprinkler head']) expect([want, texts.includes(want)]).toEqual([want, true])
    expect([texts.filter(x => x === '5\'-6"').length, texts.filter(x => x === '5\'-10"').length, texts.filter(x => x === '4\'').length]).toEqual([3, 3, 2])
    for (const gone of ['FRONT VIEW', 'ROOF TRUSS', 'U/S OF BOTTOM CHORD']) expect([gone, texts.some(x => x.startsWith(gone))]).toEqual([gone, false])
    // the beam elevations read horizontally (on leaders), the vertical dimensions rotated
    expect(d.items.filter(i => i.t === 'text' && i.role?.id === 'elev').every(i => !i.rot)).toBe(true)
    expect(d.items.filter(i => i.t === 'text' && i.role?.id === 'open').every(i => i.rot === -90)).toBe(true)
    // the style: filled arrowheads, dark-red dimensions, red upright outlines, orange beams, blue loads on a pallet base, a floor strip
    expect(d.items.filter(i => i.t === 'polygon').length).toBeGreaterThan(30)
    expect(d.items.filter(i => i.t === 'text' && i.role?.kind === 'dim').every(i => i.fill === '#a3201b' && i.halo > 0)).toBe(true)
    expect(d.items.filter(i => i.role?.kind === 'upright').every(i => i.stroke === '#c8372d' && i.fill === '#fff')).toBe(true)
    expect(d.items.filter(i => i.role?.kind === 'beam').map(i => i.fill)).toEqual(['#f39c12', '#f39c12', '#f39c12'])
    expect(d.items.filter(i => i.tag === 'load').length).toBe(8)                                     // 2 pallets × 4 levels
    expect(d.items.filter(i => i.tag === 'load').every(i => i.stroke === '#2e86de')).toBe(true)
    expect(d.items.some(i => i.t === 'rect' && i.fill === '#e7dcc3')).toBe(true)
    // the truss: the bottom chord at the clear height, the sprinkler head above it, under the top chord
    const chords = d.items.filter(i => i.tag === 'chord'), head = d.items.find(i => i.tag === 'head')
    expect(chords.map(c => c.chordAt)).toEqual([290, 312])
    expect([head.cy < d.Y(290), head.cy > d.Y(312)]).toEqual([true, true])
    expect(texts.some(x => /lb|#/.test(x))).toBe(false)
    expect(d.w).toBeLessThanOrEqual(1100 + 1)
    // a 12' bay holds 3 pallets a level
    expect(elevationLayout(t, 144, { w: 1100, h: 700 }).items.filter(i => i.tag === 'load').length).toBe(12)
    // the scale, architectural as on the sample: the largest that fits
    expect(archScale(0.53).label).toBe('1/4"=1\'')
    expect(archScale(0.6).label).toBe('1/4"=1\'')
    expect(archScale(1.06).label).toBe('1/2"=1\'')
  })
})

describe('EV — the wiring', () => {
  it('EV-wire: Canvas2 routes the paint tool; Esc leaves paint mode; the keeper is installed; the editor is docked under the canvas in a column with it (never floating), its height and open state remembered per browser', async () => {
    const c2 = readFileSync(new URL('../../canvas2/Canvas2.jsx', import.meta.url), 'utf8')
    expect(c2).toMatch(/painting \? paintMouseDown : onStageMouseDown/)
    expect(c2).toMatch(/commitPaint\(useCanvasStore, ps\.stroke\.targets, \{ typeId: ps\.typeId, reset: ps\.reset \}\)/)
    const kb = readFileSync(new URL('../../hooks/useKeyboardShortcuts.js', import.meta.url), 'utf8')
    expect(kb).toMatch(/activeTool === PAINT_TOOL\) \{ useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\); return \}/)
    const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
    expect(app).toMatch(/installElevationsKeeper\(useCanvasStore\)/)
    expect(app).toMatch(/<div className="flex flex-col flex-1 min-w-0 min-h-0">\s*<Canvas2 \/>\s*<ElevationPane \/>\s*<\/div>/)
    const pane = readFileSync(new URL('../../components/Elevations/ElevationPane.jsx', import.meta.url), 'utf8')
    expect(/position: 'fixed'|createPortal/.test(pane)).toBe(false)
    // the beams and the upright tops are grabbed through strips drawn last, so a label on a beam never takes its drag
    expect(pane.includes("data-grab=")).toBe(true)
    expect(pane.includes("onPointerDown={(e) => startDrag(e, i.role)}")).toBe(true)
    ED.setPane({ open: true, height: 333 })
    expect(JSON.parse(localStorage.getItem('trace.elevpane.v1'))).toEqual({ open: true, height: 333 })
    ED.setPane({ open: false })
  })

  it('EV-scope: entering paint mode from Select starts on Row; switching type while painting keeps the scope chosen', async () => {
    const { usePaint, startPainting, PAINT_TOOL } = await import('../../utils/elevPaint')
    store.getState().setActiveTool('select')
    usePaint.setState({ scope: 'bay' })
    startPainting(store, 'A')
    expect([store.getState().activeTool, usePaint.getState().scope]).toEqual([PAINT_TOOL, 'row'])
    usePaint.setState({ scope: 'side' })
    startPainting(store, 'B')
    expect([usePaint.getState().typeId, usePaint.getState().scope]).toEqual(['B', 'side'])
    store.getState().setActiveTool('select')
  })
})
