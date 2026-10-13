// Area EV — Elevations v1 (ELEVATIONS_PLAN.md; utils/elevations.js, utils/elevPaint.js, utils/elevationDraw.js).
// Types on the layout (one 'elevation_types' object), assigned layout default → rack → side → bay, overrides only
// where they differ; paint mode Row / Side / Bay (hover = what a click changes, the flue = both sides, a drag
// stays on its row and side); positions per bay from the bay-side's type; existing racks' levels become types on
// load with nothing moved and usable unchanged; splits, one-side delete, takeover, joins and Row group replays
// carry the type; Check layout errors; legend, PDF, the BOM data. Both orientations.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
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
import { takeOverCarriedBays, installPairKeeper } from '../../utils/pairCarryOn'
import { joinRacks } from '../../canvas2/inlineSnap'
import * as RG from '../../utils/rowGroup'
import * as E from '../../utils/elevations'
import { targetAt, strokeTargets, applyPaint, commitPaint } from '../../utils/elevPaint'
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
const load = (objects) => store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
const objs = () => store.getState().objects
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const T = () => E.tableOf(objs())
const rowRacks = (ri, type, o = objs()) => o.filter(x => x.genSection === 2 && x.rowIndex === ri && (!type || x.type === type))
const pairOf = (ri, o) => rowRacks(ri, 'rack_double_row', o)[0]

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
   row; 96" beams, 2 pallets a beam, 4 levels. */
const UP = 3, D = 42, FL = 9
const wPx = (n) => ((UP * (n + 1) + 96 * n) / 12) * GS, hPair = ((2 * D + FL) / 12) * GS, hSingle = (D / 12) * GS
function hand(vert) {
  const fp = { id: 'fp', type: 'fp_rect', x: -4000, y: -4000, width: 8000, height: 8000, wallThicknessFt: 0.25, fpVerts: [{ x: -4000, y: -4000 }, { x: 4000, y: -4000 }, { x: 4000, y: 4000 }, { x: -4000, y: 4000 }] }
  const rack = (id, type, n, runStart, acrossC) => {
    const w = wPx(n), h = type === 'rack_double_row' ? hPair : hSingle
    const cx = vert ? acrossC : runStart + w / 2, cy = vert ? runStart + w / 2 : acrossC
    return { id, type, parentId: 'fp', x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: vert ? 90 : 0, beams: Array(n).fill(96), uprightWidth: UP, depthIn: D, flueSpaceIn: type === 'rack_double_row' ? FL : 0, palletWIn: 40, levels: 4 }
  }
  return E.migrate([fp, rack('p1', 'rack_double_row', 3, 0, 0), rack('p2', 'rack_double_row', 3, wPx(3) - (UP / 12) * GS, 0), rack('s', 'rack_row', 4, 0, 30 * GS)])
}
const withTypes = (objects) => {
  // a second and a third type: B 6 levels, C 4 levels
  let o = E.editTable(objects, t => E.addType(t, { id: 'B', name: 'B' }))
  o = E.editTable(o, t => E.updateType(t, 'B', { levels: E.levelsOf(6), uprightHeightIn: 360 }))
  o = E.editTable(o, t => E.addType(t, { id: 'C', name: 'C' }))
  return o
}
const rack = (o, id) => o.find(x => x.id === id)
const ids = (r, t) => E.typeMap(r, t)

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
      const m = E.migrate(lay), tb = E.tableOf(m)
      expect(tb.types.map(t => t.levels.length)).toEqual([...new Set(lay.filter(E.isBeamRack).map(r => r.levels || 1))].sort((a, b) => a - b).slice(0, tb.types.length).length ? tb.types.map(t => t.levels.length) : [])
      expect(tb.types.find(t => t.id === tb.defaultId).levels.length).toBe(4)
      const geo = (o) => o.filter(E.isBeamRack).map(r => [r.id, r.x, r.y, r.width, r.height, r.rotation, r.levels].join(','))
      expect(geo(m)).toEqual(geo(lay))
      expect(usableCapacity(m, { profile: REACH, gridSize: GS })).toEqual(usableCapacity(lay, { profile: REACH, gridSize: GS }))
    }
  })

  it('EV-mixed: racks of 4 and of 5 levels — two types, the 4 the default, the 5s carry theirs as elevType; positions unchanged', () => {
    const lay = savedFill(vert).map((o, i) => (E.isBeamRack(o) && o.rowIndex === 3 ? { ...o, levels: 5 } : o))
    const m = E.migrate(lay), tb = E.tableOf(m)
    expect(tb.types.map(t => [t.id, t.levels.length])).toEqual([['elev-4', 4], ['elev-5', 5]])
    expect(tb.defaultId).toBe('elev-4')
    expect(m.filter(o => o.elevType === 'elev-5').length).toBe(lay.filter(o => E.isBeamRack(o) && o.levels === 5).length)
    expect(bayLedger(m, GS).positions).toBe(bayLedger(lay, GS).positions)
  })

  it('EV-assign: the six cases — all bays one type; half / half; single rows; back-to-back rows; different types on the two sides; single bays within a side — each bay-side resolves to the most specific type, overrides stored only where they differ', () => {
    const o = withTypes(hand(vert)), tb = E.tableOf(o), def = tb.defaultId
    // all bays one type: the default changed
    const allB = E.editTable(o, t => E.setDefault(t, 'B'))
    expect(allB.filter(E.isBeamRack).every(r => ids(r, E.tableOf(allB)).flat().every(t => t === 'B'))).toBe(true)
    expect(allB.filter(E.isBeamRack).some(r => E.ELEV_FIELDS.some(k => r[k] != null))).toBe(false)
    // half / half: one pair B (Row), the rest the default
    const p1 = E.paintRack(rack(o, 'p1'), tb, { typeId: 'B' })
    expect([p1.elevType, p1.elevSides, p1.elevBays, ids(p1, tb).flat().every(t => t === 'B'), p1.levels]).toEqual(['B', undefined, undefined, true, 6])
    // single rows: the single painted C
    const s = E.paintRack(rack(o, 's'), tb, { typeId: 'C' })
    expect([s.elevType, ids(s, tb)]).toEqual(['C', [['C', 'C', 'C', 'C']]])
    // back-to-back rows: p2 painted C both sides
    expect(ids(E.paintRack(rack(o, 'p2'), tb, { typeId: 'C' }), tb)).toEqual([['C', 'C', 'C'], ['C', 'C', 'C']])
    // different types on the two sides
    const two = E.paintRack(rack(o, 'p2'), tb, { sides: [1], typeId: 'B' })
    expect([two.elevType, two.elevSides, ids(two, tb)]).toEqual([undefined, [null, 'B'], [[def, def, def], ['B', 'B', 'B']]])
    // single bays within a side
    const bay = E.paintRack(two, tb, { sides: [0], bays: [1], typeId: 'C' })
    expect([bay.elevSides, bay.elevBays, ids(bay, tb)]).toEqual([[null, 'B'], [[null, 'C', null], [null, null, null]], [[def, 'C', def], ['B', 'B', 'B']]])
    // painting the default back writes nothing
    const back = E.paintRack(E.paintRack(bay, tb, { sides: [0], bays: [1], typeId: def }), tb, { sides: [1], typeId: def })
    expect(E.ELEV_FIELDS.map(k => back[k])).toEqual([undefined, undefined, undefined])
  })

  it('EV-positions: pallet positions per bay come from the bay-side\'s type — side 1 of one bay 6 levels: the ledger, the rack capacity, usable gross and a narrow-aisle loss on that face all count 6 there', () => {
    const o = withTypes(hand(vert)), tb = E.tableOf(o)
    const before = bayLedger(o, GS).positions
    const p = E.paintRack(rack(o, 'p1'), tb, { sides: [1], bays: [0], typeId: 'B' })
    const o2 = o.map(x => (x.id === 'p1' ? p : x))
    expect(bayLedger(o2, GS).positions).toBe(before + 2 * (6 - 4))
    expect(getRackCapacity(p, undefined, E.levelsResolver(o2)).total).toBe(2 * 3 * 4 * 2 + 2 * 2)
    expect(getRackCapacity(p).total).toBe(2 * 3 * 4 * 2)                       // without the reader: the rack's own levels, as before
    expect(usableCapacity(o2, { profile: REACH, gridSize: GS }).gross).toBe(usableCapacity(o, { profile: REACH, gridSize: GS }).gross + 4)
    // a zone 3' in front of side 1 of p1 (its face toward +across... whichever face index 1 is): its bay 0 loses 6 a position there
    const f = rackFootprint(p), face1Lo = E.levelsAt(p, 0, 1, tb) === 6
    const zoneAt = (lo) => { const s0 = vert ? f.x : f.y, s1 = vert ? f.x + f.w : f.y + f.h, r0 = vert ? f.y : f.x; const a = lo ? s0 - 3 * GS - 4 * GS : s1 + 3 * GS; return vert ? { id: 'z', type: 'zone_custom', x: a, y: r0, width: 4 * GS, height: wPx(3) } : { id: 'z', type: 'zone_custom', x: r0, y: a, width: wPx(3), height: 4 * GS } }
    const faceOf = (lo) => (RG.worldSideOf(p, 1, [p]) === (lo ? 'lo' : 'hi'))
    const lo = faceOf(true)
    const blocks = narrowAisleBlocks([...o2.filter(x => x.id !== 'p2'), zoneAt(lo)], { profile: REACH, gridSize: GS })
    const b0 = blocks.find(b => b.rackId === 'p1' && b.bayIndex === 0)
    expect([face1Lo, b0.faces, b0.positionsLost]).toEqual([true, [1], b0.positionIndices.length * 6])
  })

  it('EV-paint-targets: Row = every rack of the row; Side = the half under the cursor (the flue: both sides), a drag along the row takes that side of every rack it passes; Bay = that bay on that half, a drag the run of bays between, staying on the side it started', () => {
    const o = hand(vert), p1 = rack(o, 'p1'), p2 = rack(o, 'p2')
    const at = (r, i, side) => { const q = pointIn(r, i, side); return targetAt(o, r.id, q, GS) }
    const show = (m) => [...m].map(([id, t]) => [id, t.sides, t.bays]).sort()
    const t0 = at(p1, 1, 0), side0 = t0.ws
    expect(show(strokeTargets(o, 'row', t0, t0, GS))).toEqual([['p1', null, null], ['p2', null, null]])
    expect(show(strokeTargets(o, 'side', t0, t0, GS))).toEqual([['p1', [0], null]])
    expect(show(strokeTargets(o, 'bay', t0, t0, GS))).toEqual([['p1', [0], [1]]])
    const flue = at(p1, 1, null)
    expect([flue.ws, show(strokeTargets(o, 'bay', flue, flue, GS))]).toEqual([null, [['p1', [0, 1], [1]]]])
    // a Bay drag from p1's bay 1 to p2's bay 0 on side 0 (p2's side facing the same way): 3 bays, one side
    const to = at(p2, 0, 0)
    expect(to.ws).toBe(side0)
    expect(show(strokeTargets(o, 'bay', t0, to, GS))).toEqual([['p1', [0], [1, 2]], ['p2', [0], [0]]])
    // a Side drag the same way: both racks' that side whole
    expect(show(strokeTargets(o, 'side', t0, to, GS))).toEqual([['p1', [0], null], ['p2', [0], null]])
    // Row drag across two rows: both rows' racks
    const ts = targetAt(o, 's', pointIn(rack(o, 's'), 0, null), GS)
    expect(show(strokeTargets(o, 'row', t0, t0, GS, [t0.rowKey, ts.rowKey]))).toEqual([['p1', null, null], ['p2', null, null], ['s', null, null]])
  })

  it('EV-commit: a click or drag is ONE history entry; one undo takes it back; reset removes the overrides on what is clicked (Bay → the side\'s type, Side → the rack\'s, Row → all)', async () => {
    load(withTypes(hand(vert))); await settle()
    const h = hist(), p1 = rack(objs(), 'p1')
    const t0 = targetAt(objs(), 'p1', pointIn(p1, 0, 1), GS), def = T().defaultId
    // the row C (Row), then one side B (Side), then one bay back to the default (Bay)
    expect(commitPaint(store, strokeTargets(objs(), 'row', t0, t0, GS), { typeId: 'C' })).toBe(true); await settle()
    expect(commitPaint(store, strokeTargets(objs(), 'side', t0, t0, GS), { typeId: 'B' })).toBe(true); await settle()
    expect(commitPaint(store, strokeTargets(objs(), 'bay', t0, t0, GS), { typeId: def })).toBe(true); await settle()
    expect(hist()).toBe(h + 3)
    const sideIdx = rack(objs(), 'p1').elevSides.findIndex(v => v === 'B')
    expect([rack(objs(), 'p1').elevType, ids(rack(objs(), 'p1'), T())[sideIdx], ids(rack(objs(), 'p1'), T())[1 - sideIdx]]).toEqual(['C', [def, 'B', 'B'], ['C', 'C', 'C']])
    // reset the bay → the side's type (B); reset the side → the rack's (C, not the default); reset the row → nothing set
    commitPaint(store, strokeTargets(objs(), 'bay', t0, t0, GS), { reset: true }); await settle()
    expect(ids(rack(objs(), 'p1'), T())[sideIdx]).toEqual(['B', 'B', 'B'])
    commitPaint(store, strokeTargets(objs(), 'side', t0, t0, GS), { reset: true }); await settle()
    expect([rack(objs(), 'p1').elevType, rack(objs(), 'p1').elevSides, ids(rack(objs(), 'p1'), T())[sideIdx]]).toEqual(['C', undefined, ['C', 'C', 'C']])
    commitPaint(store, strokeTargets(objs(), 'row', t0, t0, GS), { reset: true }); await settle()
    expect(['p1', 'p2'].map(id => E.ELEV_FIELDS.map(k => rack(objs(), id)[k]))).toEqual([[undefined, undefined, undefined], [undefined, undefined, undefined]])
    expect(hist()).toBe(h + 6)
    // one undo per step
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
    const o = withTypes(hand(vert)), tb = E.tableOf(o)
    const painted = o.map(x => (x.id === 'p1' ? E.paintRack(x, tb, { sides: [1], bays: [2], typeId: 'B' }) : x.id === 's' ? E.paintRack(x, tb, { typeId: 'B' }) : x))
    const gone = E.editTable(painted, t => E.removeType(t, 'B'))
    expect(E.tableOf(gone).types.map(t => t.id)).not.toContain('B')
    expect(gone.filter(E.isBeamRack).every(r => E.typeMap(r, E.tableOf(gone)).flat().every(t => t === E.tableOf(gone).defaultId))).toBe(true)
    expect([rack(gone, 's').levels, rack(gone, 's').elevType]).toEqual([4, undefined])
    const one = { ...tb, types: [tb.types[0]] }
    expect(E.removeType(one, tb.types[0].id)).toBe(one)
  })

  it('EV-levels-edit: a rack\'s levels changed (the panel, the Row group levels replay) → it carries the type with that many levels (made if needed); a new rack takes the default\'s levels', () => {
    const o = hand(vert)
    const edited = o.map(x => (x.id === 's' ? { ...x, levels: 6 } : x))
    const r = E.reconcileElevations(o, edited), t6 = E.tableOf(r).types.find(t => t.levels.length === 6)
    expect([!!t6, rack(r, 's').elevType === t6.id, rack(r, 's').levels]).toEqual([true, true, 6])
    // a new rack placed with 5 levels while the default has 4: it follows the default
    const placed = [...o, { ...rack(o, 's'), id: 'new', levels: 5 }]
    expect(rack(E.reconcileElevations(o, placed), 'new').levels).toBe(4)
  })

  it('EV-carry: a bay delete split, a one-side delete (the half left takes its side\'s type), a join and a Row group bay replay keep each bay\'s type', () => {
    const o = withTypes(hand(vert)), tb = E.tableOf(o)
    const p = E.paintRack(E.paintRack(rack(o, 'p1'), tb, { sides: [1], typeId: 'B' }), tb, { sides: [0], bays: [2], typeId: 'C' })
    // split: middle bay removed
    const pieces = splitRackForBayDelete(p, new Set([1]), newId, GS)
    expect(pieces.map(x => E.typeMap(x, tb))).toEqual([[[tb.defaultId], ['B']], [['C'], ['B']]])
    // one-side delete: side 0 of bays 1, 2 → the pair keeps bay 0, a single carries on on side 1 with B
    const o2 = o.map(x => (x.id === 'p1' ? p : x))
    const { objects: o3 } = planBaySideDelete(o2, [1, 2].map(b => ({ objId: 'p1', bayIdx: b, side: 0 })), { gridSize: GS, newId })
    const half = o3.find(x => x.pieceOf === 'p1')
    expect([half.type, E.typeMap(half, tb)]).toEqual(['rack_row', [['B', 'B']]])
    // join: p2 (default) moved onto p1's end — the joined rack keeps p1's sides and p2's bays as they were
    const j = joinRacks(p, rack(o, 'p2'), GS)
    expect(E.typeMap(j, tb)).toEqual([[tb.defaultId, tb.defaultId, 'C', tb.defaultId, tb.defaultId, tb.defaultId], ['B', 'B', 'B', tb.defaultId, tb.defaultId, tb.defaultId]])
  })

  it('EV-takeover: a pair grown over its carried-on single takes the single\'s type on that side for the bays it takes ("+ bay" by hand, the pair keeper)', async () => {
    load(savedFill(vert)); await settle()
    store.setState({ objects: E.editTable(objs(), t => E.addType(t, { id: 'B', name: 'B' })) }); store.getState().commitObjectUpdate(E.ELEV_ID, {}); await settle()
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
    expect(E.typeMap(rowRacks(12, 'rack_row')[0], T())).toEqual([['B']])
  })

  it('EV-group: rows 12 and 14 in a Row group (Auto apply) — a whole row painted B → row 14 whole B; then one bay on one side painted C → row 14 the bay at the same uprights on the same side across the floor; one history entry each', async () => {
    load(savedFill(vert)); await settle()
    store.setState({ objects: E.editTable(objs(), t => E.addType(E.addType(t, { id: 'B', name: 'B' }), { id: 'C', name: 'C' })) }); store.getState().commitObjectUpdate(E.ELEV_ID, {}); await settle()
    useRowGroup.getState().setAlwaysApply(true)
    addRowOf(pairOf(12).id); addRowOf(pairOf(14).id)
    const h = hist(), p12 = pairOf(12)
    const t = targetAt(objs(), p12.id, pointIn(p12, 2, 0), GS)
    commitPaint(store, strokeTargets(objs(), 'row', t, t, GS), { typeId: 'B' }); await settle()
    expect(hist()).toBe(h + 1)
    expect(useRowGroup.getState().message).toMatch(/^Applied to 1 row/)
    expect(rowRacks(14).every(r => E.typeMap(r, T()).flat().every(x => x === 'B'))).toBe(true)
    const t2 = targetAt(objs(), pairOf(12).id, pointIn(pairOf(12), 2, 0), GS)
    commitPaint(store, strokeTargets(objs(), 'bay', t2, t2, GS), { typeId: 'C' }); await settle()
    expect(hist()).toBe(h + 2)
    const g12 = RG.geom(pairOf(12)), U12 = RG.uprightsOf(g12.r0, g12.beams, (3 / 12) * GS, GS)
    const own12 = 2, run12 = [180, 270].includes(((pairOf(12).rotation || 0) % 360 + 360) % 360) ? g12.beams.length - 1 - own12 : own12
    const p14 = pairOf(14), g14 = RG.geom(p14), U14 = RG.uprightsOf(g14.r0, g14.beams, (3 / 12) * GS, GS), run14 = U14.findIndex(u => Math.abs(u - U12[run12]) < 1)
    const own14 = [180, 270].includes(((p14.rotation || 0) % 360 + 360) % 360) ? g14.beams.length - 1 - run14 : run14
    const local14 = RG.worldSideOf(p14, 0, [p14]) === t2.ws ? 0 : 1
    expect(run14).toBeGreaterThanOrEqual(0)
    expect(E.typeIdAt(p14, own14, local14, T())).toBe('C')
    expect(E.typeIdAt(p14, own14, 1 - local14, T())).toBe('B')
  })

  it('EV-check: Check layout errors — a pallet + clearance that doesn\'t fit between two beams, the top of the upright above the building\'s clear height; types side by side, no warning', () => {
    let o = withTypes(hand(vert))
    o = o.map(x => (x.id === 'p1' ? E.paintRack(x, E.tableOf(o), { sides: [1], typeId: 'B' }) : x))
    expect(checkLayout(o, { gridSize: GS }).errors.filter(e => /^elev/.test(e.kind))).toEqual([])
    o = E.editTable(o, t => E.updateType(t, 'B', { levels: [{ beamIn: 0, palletHeightIn: 48, loadLb: 2000 }, { beamIn: 50, palletHeightIn: 48, loadLb: 2000 }, ...E.levelsOf(6).slice(2)] }))
    o = o.map(x => (x.id === 'fp' ? { ...x, clearHeightFt: 25 } : x))
    const errs = checkLayout(o, { gridSize: GS }).errors.filter(e => /^elev/.test(e.kind))
    expect(errs.map(e => e.text)).toEqual([
      'Elevation B: top of upright 30\' is above the building\'s clear height 25\'',
      'Elevation B: level 1 pallet 48" + 6" clearance doesn\'t fit between the floor and the underside of the next at 46"',
    ])
    expect(errs[0].ids).toEqual(['p1'])
  })

  it(`EV-face: beam levels are to the TOP of the beam — a pallet + clearance must fit from the top of the lower beam to the UNDERSIDE of the next (its top less the type's beam face, 4" when not set): 58" between tops with a 4" face fits 48 + 6, a 5" face doesn't`, () => {
    let o = withTypes(hand(vert))
    o = o.map(x => (x.id === 'p1' ? E.paintRack(x, E.tableOf(o), { typeId: 'B' }) : x))
    const lv = (gap) => [{ beamIn: 0, palletHeightIn: 48, loadLb: 2000 }, { beamIn: gap, palletHeightIn: 48, loadLb: 2000 }, { beamIn: gap * 2, palletHeightIn: 48, loadLb: 2000 }]
    const fit = (patch) => E.elevationIssues(E.editTable(o, t => E.updateType(t, 'B', { uprightHeightIn: 300, ...patch }))).filter(e => e.kind === 'elev-fit').map(e => e.level)
    expect(fit({ levels: lv(58) })).toEqual([])                                   // 58 - 4 = 54 = 48 + 6
    expect(fit({ levels: lv(58), beamFaceIn: 5 })).toEqual([1, 2])
    const old = E.editTable(o, t => ({ ...t, types: t.types.map(x => { const c = { ...x }; delete c.beamFaceIn; return c }) }))
    expect(E.beamFace(E.typeById(E.tableOf(old), 'B'))).toBe(4)
    expect(E.makeType({ id: 'x' }).beamFaceIn).toBe(4)
  })

  it(`EV-depth: frame depth is the rack's own — not a field of the type; the BOM and the panel read the racks' depths`, () => {
    const o = withTypes(hand(vert)).map(x => (x.id === 's' ? { ...x, depthIn: 36 } : x)), tb = E.tableOf(o)
    expect(tb.types.some(t => 'frameDepthIn' in t)).toBe(false)
    expect(E.typeDepths(o, tb.defaultId)).toEqual([36, 42])
    expect(E.elevationBays(o).find(b => b.rackId === 's').frameDepthIn).toBe(36)
    expect(E.elevationBays(o).find(b => b.rackId === 'p1').frameDepthIn).toBe(42)
  })

  it(`EV-refit: a type change on a Fill area rack — even one that changes its levels — is no hand edit: the area counts no edits, and the next area resize still refits it (the rack kept, id and type with it)`, () => {
    let o = E.migrate(savedFill(vert))
    o = E.editTable(o, t => E.addType(t, { id: 'B', name: 'B' }))
    o = E.editTable(o, t => E.updateType(t, 'B', { levels: E.levelsOf(6), uprightHeightIn: 360 }))
    const area = o.find(x => x.type === 'racking_area'), r = o.find(x => E.isBeamRack(x) && x.areaId === area.id && x.type === 'rack_double_row')
    const painted = o.map(x => (x.id === r.id ? E.paintRack(x, E.tableOf(o), { typeId: 'B' }) : x))
    expect(painted.find(x => x.id === r.id).levels).toBe(6)
    // (the horizontal copy is the saved layout turned: its area records never matched — compare before and after)
    expect(areaEdits(painted, area).count).toBe(areaEdits(o, area).count)
    if (vert) expect(areaEdits(painted, area).count).toBe(0)
    const grow = vert ? { x: area.x, y: area.y, w: area.width, h: area.height + 40 } : { x: area.x, y: area.y, w: area.width + 40, h: area.height }
    const after = planAreaResize(painted, area.id, grow, { gridSize: GS })
    const kept = after.find(x => x.id === r.id)
    expect([!!kept, kept && kept.elevType, kept && kept.levels]).toEqual([true, 'B', 6])
    if (vert) expect(areaEdits(after, after.find(x => x.id === area.id)).count).toBe(0)
  })

  it('EV-legend-bom: the legend counts each side of a back-to-back as a bay; the BOM data gives every bay per side its type, levels and upright height, a shared upright the taller', () => {
    const o = withTypes(hand(vert)), tb = E.tableOf(o)
    const o2 = o.map(x => (x.id === 'p1' ? E.paintRack(x, tb, { sides: [1], bays: [0], typeId: 'B' }) : x))
    expect(E.legendCounts(o2).map(r => [r.type.id, r.bays])).toEqual([[tb.defaultId, 3 * 2 * 2 + 4 - 1], ['B', 1]])
    const bays = E.elevationBays(o2).filter(b => b.rackId === 'p1')
    expect(bays.length).toBe(6)
    expect(bays.find(b => b.bay === 0 && b.side === 1)).toMatchObject({ typeId: 'B', uprightHeightIn: 360, levels: [0, 60, 120, 180, 240, 300] })
    const ups = E.uprightHeights(o2).find(u => u.rackId === 'p1' && u.side === 1)
    expect(ups.heights).toEqual([360, 360, 240, 240])
  })

  it('EV-pdf: the PDF fills each bay with its type\'s colour and prints the legend when the colours are shown, neither when hidden; a second sheet draws every type in use', async () => {
    const { buildLayoutSVG, buildElevationSheetSVG } = await import('../../export/pdfExport')
    const o = withTypes(hand(vert)), tb = E.tableOf(o)
    const o2 = o.map(x => (x.id === 'p1' ? E.paintRack(x, tb, { sides: [1], typeId: 'B' }) : x))
    const on = buildLayoutSVG(o2, [], GS, { elevColors: true }).svg, off = buildLayoutSVG(o2, [], GS, { elevColors: false }).svg
    const B = tb.types.find(t => t.id === 'B').color
    expect([on.includes(`fill="${B}" fill-opacity="0.38"`), on.includes('ELEVATIONS'), on.includes('6 bays')]).toEqual([true, true, false])
    expect([off.includes('fill-opacity="0.38"'), off.includes('ELEVATIONS')]).toEqual([false, false])
    const sheet = buildElevationSheetSVG(o2, { title: 'T' }).svg
    expect([sheet.includes('>B<'), sheet.includes('4 levels'), sheet.includes('C ·')]).toEqual([true, true, false])
  })

  it('EV-keeper: a layout loaded is given its types (one undo step unchanged: the load\'s own entry); an action\'s fix is folded into that action\'s entry; a table deleted with Select all comes back', async () => {
    load(savedFill(vert)); await settle()
    expect(!!T()).toBe(true)
    const h = hist()
    store.getState().commitObjectUpdate(pairOf(12).id, { levels: 6 }); await settle()
    expect(hist()).toBe(h + 1)
    expect(E.typeById(T(), pairOf(12).elevType).levels.length).toBe(6)
    store.setState({ objects: objs().filter(o => !E.isElevTable(o)) }); store.getState().commitObjectUpdate(pairOf(12).id, {}); await settle()
    expect(!!T()).toBe(true)
    expect(E.typeById(T(), pairOf(12).elevType).levels.length).toBe(6)
  })
})

describe('EV — the paint wiring', () => {
  it('EV-wire: Canvas2 routes the paint tool\'s press / move / leave, the preview and the bar; Esc leaves paint mode; the scene and the hit test skip the types object', async () => {
    const { readFileSync } = await import('node:fs')
    const c2 = readFileSync(new URL('../../canvas2/Canvas2.jsx', import.meta.url), 'utf8')
    expect(c2).toMatch(/painting \? paintMouseDown : onStageMouseDown/)
    expect(c2).toMatch(/painting \? paintMouseMove/)
    expect(c2).toMatch(/\{painting && <ElevPaintPreview \/>\}/)
    expect(c2).toMatch(/\{painting && <ElevPaintBar \/>\}/)
    expect(c2).toMatch(/commitPaint\(useCanvasStore, ps\.stroke\.targets, \{ typeId: ps\.typeId, reset: ps\.reset \}\)/)
    const kb = readFileSync(new URL('../../hooks/useKeyboardShortcuts.js', import.meta.url), 'utf8')
    expect(kb).toMatch(/activeTool === PAINT_TOOL\) \{ useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\); return \}/)
    expect(readFileSync(new URL('../../canvas2/Scene.jsx', import.meta.url), 'utf8')).toMatch(/o\.type === 'elevation_types'\) continue/)
    const { hitTest } = await import('../../canvas2/hitTest')
    expect(hitTest([{ id: 't', type: 'elevation_types', types: [] }], [], 0, 0, 1, GS)).toBe(null)
    const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
    expect(app).toMatch(/installElevationsKeeper\(useCanvasStore\)/)
  })
})

describe('EV — paint mode starts on Row', () => {
  it('EV-scope: entering paint mode from Select starts on Row (the scope left from last time does not carry over); switching type while painting keeps the scope chosen', async () => {
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
