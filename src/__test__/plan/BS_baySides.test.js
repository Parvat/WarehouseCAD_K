// Area BS — bays of a back-to-back row picked and deleted ONE SIDE at a time (utils/baySides.js).
// A click on a pair's bay picks it on the half clicked (the flue: both); Shift+click and a bay marquee carry the side
// the same way. Delete removes those bays from that side only: the pair splits at that upright and the other half
// carries on as a single sharing it — the reverse of the takeover (utils/pairCarryOn.js). The bay on both sides, or
// the whole rack, goes as before. One undo step. The Row group replays a one-side delete on the same side, across
// the floor, of the other group rows. Per-bay beam edits act on the whole bay (the pair has one beam list).
// The user's case: section 2, row 12 of the hand-check layout — a pair 9' → 108.25' whose single carries on to
// 124.75'; the pair extended over the single (takeover), then that side's two bays deleted again.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { getRackCapacity } from '../../utils/capacity'
import { checkLayout } from '../../utils/layoutCheck'
import { bayLedger } from '../../utils/bayLedger'
import { planBayBeamChange } from '../../utils/bayBeam'
import * as RG from '../../utils/rowGroup'
import { installPairKeeper } from '../../utils/pairCarryOn'
import { bayHalfAt, hasOneSide, selectedBays, planBaySideDelete, deleteBaySelection } from '../../utils/baySides'
import { toggleBaySelection, bayEntriesInMarquee } from '../../canvas2/selection'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup, addRowOf, applyPending } from '../../utils/rowGroupTool'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

let store, Panel, stops = [], seq = 0
const newId = () => 'b' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  stops = [installPairKeeper(store), installRowGroupWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { clearGroup(); useRowGroup.getState().setAlwaysApply(false) })

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
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const ft = (px) => Math.round((px / GS) * 1000) / 1000
const rowRacks = (ri, type) => objs().filter(o => o.genSection === 2 && o.rowIndex === ri && (!type || o.type === type))
const pairOf = (ri) => rowRacks(ri, 'rack_double_row')[0]
const singlesOf = (ri) => rowRacks(ri, 'rack_row')
const run = (o) => { const g = RG.geom(o); return [ft(g.r0), ft(g.r1)] }
const across = (o) => { const g = RG.geom(o); return [ft(g.s0), ft(g.s1)] }
const bays = (ri) => rowRacks(ri).reduce((t, o) => t + o.beams.length, 0)
const positions = (ri) => rowRacks(ri).reduce((t, o) => t + getRackCapacity(o).total, 0)
const overlapsIn = (ri) => { const ids = new Set(rowRacks(ri).map(o => o.id)); return checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.every(id => ids.has(id))) }
/** The frames a row adds in the bay ledger (frameCount summed), and its counted bays. */
const ledgerOf = (ri) => { const L = bayLedger(objs(), GS); return rowRacks(ri).reduce((t, o) => { const e = L.racks.get(o.id); return { frames: t.frames + e.frameCount.reduce((a, n) => a + n, 0), bays: t.bays + e.counted.filter(Boolean).length } }, { frames: 0, bays: 0 }) }
const add2 = (o) => store.getState().commitObjectUpdate(o.id, Panel.addBayUpdate({ ...o, ...Panel.addBayUpdate(o, 96, GS) }, 96, GS))
/** The pair's own bay indices inside run stretch [a, b] (ft). */
const baysIn = (p, a, b) => { const g = RG.geom(p), up = ((p.uprightWidth || 3) / 12) * GS, U = RG.uprightsOf(g.r0, g.beams, up, GS), n = g.beams.length, flip = [180, 270].includes(((p.rotation || 0) % 360 + 360) % 360); const out = []; for (let i = 0; i < n; i++) if (ft(U[i]) >= a - 0.01 && ft(U[i + 1] + up) <= b + 0.01) out.push(flip ? n - 1 - i : i); return out }
/** A world point in pair `p`'s own bay `i`, on local band `side` (0 top, 1 bottom, null the flue). */
function pointIn(p, i, side) {
  const up = ((p.uprightWidth || 3) / 12) * GS
  let lx = p.x + up; for (let k = 0; k < i; k++) lx += up + (p.beams[k] / 12) * GS
  lx += (p.beams[i] / 24) * GS
  const flue = ((p.flueSpaceIn ?? 9) / 12) * GS, rowH = (p.height - flue) / 2
  const ly = side === 0 ? p.y + rowH / 2 : side === 1 ? p.y + p.height - rowH / 2 : p.y + p.height / 2
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2, t = ((p.rotation || 0) * Math.PI) / 180, dx = lx - cx, dy = ly - cy
  return { x: cx + dx * Math.cos(t) - dy * Math.sin(t), y: cy + dx * Math.sin(t) + dy * Math.cos(t) }
}
const sideOfSingle = (p, s) => { const f = rackFootprint(s); return bayHalfAt(p, f.x + f.w / 2, f.y + f.h / 2, GS) }

/** Row 12 with the pair extended over its single (takeover): pair 9' → 124.75', 14 bays; the single gone. */
async function takenOver(vert) {
  load(savedFill(vert))
  const was = { pair: strip(pairOf(12)), single: strip(singlesOf(12)[0]), bays: bays(12), positions: positions(12), ledger: ledgerOf(12) }
  add2(pairOf(12)); await settle()
  return was
}

describe.each([['vertical', true], ['horizontal', false]])('BS — %s', (_, vert) => {
  it('BS-pick: a point on a pair\'s bay is on band 0, band 1 or the flue (null); a single row has no side', () => {
    load(savedFill(vert))
    const p = pairOf(12), s = singlesOf(12)[0]
    const at = (side) => { const q = pointIn(p, 3, side); return bayHalfAt(p, q.x, q.y, GS) }
    expect([at(0), at(1), at(null)]).toEqual([0, 1, null])
    const f = rackFootprint(s)
    expect(bayHalfAt(s, f.x + f.w / 2, f.y + f.h / 2, GS)).toBe(null)
  })

  it('BS-shift: Shift+click carries the side — bay 3 on side 0 then on side 1 are two entries, again on side 0 drops that one; a single clicked bay (activeBayIdx + activeBaySide) folds in with its side', () => {
    load(savedFill(vert))
    const p = pairOf(12)
    let st = { ...store.getState(), selectedIds: [p.id], objects: objs().map(o => (o.id === p.id ? { ...o, activeBayIdx: 2, activeBaySide: 1 } : o)) }
    let next = toggleBaySelection(st, p.id, 3, 0)
    expect(next.entries).toEqual([{ objId: p.id, bayIdx: 2, side: 1 }, { objId: p.id, bayIdx: 3, side: 0 }])
    st = { ...st, activeBaySelection: next.entries, objects: objs() }
    next = toggleBaySelection(st, p.id, 3, 1)
    expect(next.entries.length).toBe(3)
    next = toggleBaySelection({ ...st, activeBaySelection: next.entries }, p.id, 3, 0)
    expect(next.entries).toEqual([{ objId: p.id, bayIdx: 2, side: 1 }, { objId: p.id, bayIdx: 3, side: 1 }])
    // the flue: no side
    expect(toggleBaySelection({ ...st, activeBaySelection: [] }, p.id, 4, null).entries).toEqual([{ objId: p.id, bayIdx: 4 }])
  })

  it('BS-marquee: a bay marquee inside one band picks those bays on that side; across the flue, both (no side)', () => {
    load(savedFill(vert))
    const p = pairOf(12)
    const box = (side) => { const a = pointIn(p, 2, side), b = pointIn(p, 4, side), pad = 2; return { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad, width: Math.abs(a.x - b.x) + 2 * pad, height: Math.abs(a.y - b.y) + 2 * pad } }
    const pick = (side) => bayEntriesInMarquee([p], box(side), GS).filter(e => e.objId === p.id)
    const sides = (es) => [...new Set(es.map(e => e.side ?? null))]
    expect(sides(pick(0))).toEqual([0]); expect(sides(pick(1))).toEqual([1])
    const a = pointIn(p, 2, 0), b = pointIn(p, 4, 1)
    const both = bayEntriesInMarquee([p], { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }, GS)
    expect(sides(both)).toEqual([null])
    expect(pick(0).map(e => e.bayIdx).sort()).toEqual(both.map(e => e.bayIdx).sort())
  })

  it('BS-delete: the user\'s case — row 12\'s pair extended over its single (14 bays), its two far bays picked on the side the single was NOT on and deleted → the pair 9\' → 108.25\' with 12 bays and a single 108\' → 124.75\' with 2 sharing its end upright, on its old side — as before the takeover: 14 bays, the same positions, the same frames in the bay ledger, no overlap; ONE history entry, one undo brings the 14-bay pair back', async () => {
    const was = await takenOver(vert)
    expect([pairOf(12).beams.length, singlesOf(12).length]).toEqual([14, 0])
    const p = pairOf(12), side = 1 - sideOfSingle(p, was.single), far = baysIn(p, 108, 124.75)
    expect(far.length).toBe(2)
    store.setState({ selectedIds: [p.id], activeBaySelection: far.map(i => ({ objId: p.id, bayIdx: i, side })) })
    const h = hist()
    expect(deleteBaySelection(store, newId)).toBe(true); await settle()
    expect(hist()).toBe(h + 1)
    const s = singlesOf(12)
    expect([run(pairOf(12)), pairOf(12).beams.length, pairOf(12).id]).toEqual([[9, 108.25], 12, p.id])
    expect([s.length, run(s[0]), s[0].beams.length, across(s[0])]).toEqual([1, [108, 124.75], 2, across(was.single)])
    expect([bays(12), positions(12), ledgerOf(12)]).toEqual([was.bays, was.positions, was.ledger])
    expect(overlapsIn(12)).toEqual([])
    expect([store.getState().selectedIds, store.getState().activeBaySelection]).toEqual([[], []])
    store.getState().undo()
    expect([pairOf(12).beams.length, singlesOf(12).length]).toEqual([14, 0])
  })

  it('BS-click-delete: one bay clicked on side 1 (activeBayIdx + activeBaySide) and Delete → that side only; the other side of that bay carries on as a single', async () => {
    await takenOver(vert)
    const p = pairOf(12), last = baysIn(p, 116, 124.75)[0]
    store.setState({ selectedIds: [p.id], activeBaySelection: [], objects: objs().map(o => (o.id === p.id ? { ...o, activeBayIdx: last, activeBaySide: 1 } : o)) })
    expect(selectedBays(store.getState())).toEqual([{ objId: p.id, bayIdx: last, side: 1 }])
    expect(deleteBaySelection(store, newId)).toBe(true); await settle()
    const s = singlesOf(12)
    expect([pairOf(12).beams.length, s.length, s[0]?.beams.length, run(s[0])]).toEqual([13, 1, 1, [116.25, 124.75]])
    expect(sideOfSingle(p, s[0])).toBe(0)                         // the half kept is the other side
  })

  it('BS-both: the same bays picked on BOTH sides, or with no side, or a single row\'s bays — not a one-side pick: the store\'s own delete takes them whole, as before', async () => {
    await takenOver(vert)
    const p = pairOf(12), far = baysIn(p, 108, 124.75)
    const both = far.flatMap(i => [{ objId: p.id, bayIdx: i, side: 0 }, { objId: p.id, bayIdx: i, side: 1 }])
    expect(hasOneSide(objs(), both)).toBe(false)
    expect(hasOneSide(objs(), far.map(i => ({ objId: p.id, bayIdx: i })))).toBe(false)
    expect(hasOneSide(objs(), [...far.map(i => ({ objId: p.id, bayIdx: i, side: 0 })), ...far.map(i => ({ objId: p.id, bayIdx: i }))])).toBe(false)
    store.setState({ selectedIds: [p.id], activeBaySelection: both })
    expect(deleteBaySelection(store, newId)).toBe(false)
    store.getState().deleteSelectedBays(); await settle()
    expect([run(pairOf(12)), pairOf(12).beams.length, singlesOf(12).length]).toEqual([[9, 108.25], 12, 0])
  })

  it('BS-middle: two middle bays deleted on side 0 → three pieces: the pair up to them, a single on side 1 through them sharing both uprights, the pair after; bays and positions down by exactly two half-bays', async () => {
    load(savedFill(vert))
    const p = pairOf(12), b0 = bays(12), pos0 = positions(12), L0 = ledgerOf(12)
    const half = getRackCapacity({ type: 'rack_row', beams: [p.beams[4]], levels: p.levels, palletWIn: p.palletWIn }).total
    store.setState({ selectedIds: [p.id], activeBaySelection: [4, 5].map(i => ({ objId: p.id, bayIdx: i, side: 0 })) })
    expect(deleteBaySelection(store, newId)).toBe(true); await settle()
    const pairs = rowRacks(12, 'rack_double_row'), singles = singlesOf(12)
    expect([pairs.length, singles.length]).toEqual([2, 2])
    const mid = singles.find(o => o.beams.length === 2)
    expect(sideOfSingle(p, mid)).toBe(1)
    expect([bays(12), positions(12), ledgerOf(12).bays]).toEqual([b0, pos0 - 2 * half, L0.bays])     // the pair's bays there now a single's: the same count, half the positions
    expect(overlapsIn(12)).toEqual([])
  })

  it('BS-beam: a per-bay beam change with a one-side pick changes the WHOLE bay (both sides — the pair has one beam list); picking a side writes no history and is no Row group edit', async () => {
    load(savedFill(vert))
    const p = pairOf(12), h = hist()
    store.getState().updateObject(p.id, { activeBayIdx: 3, activeBaySide: 0 })
    expect(hist()).toBe(h)
    const up = planBayBeamChange(objs(), [{ objId: p.id, bayIdx: 3, side: 0 }], 108, GS).get(p.id)
    expect([up.beams[3], up.beams.length]).toEqual([108, p.beams.length])
    const before = objs(), after = objs().map(o => (o.id === p.id ? { ...o, activeBaySide: 1 } : o))
    expect(RG.classifyEdit(before, after, [RG.rowOfRack(RG.rowsOf(before, GS), p.id)], GS).kind).toBe('none')
  })

  it('BS-group: rows 12 and 14 in a Row group, Auto apply, both extended over their singles; row 12\'s two far bays deleted on one side → row 14 loses the same two bays on the SAME side across the floor (its pair\'s half facing that way), the pair splitting there; one history entry for the delete and its apply', async () => {
    load(savedFill(vert))
    useRowGroup.getState().setAlwaysApply(true)
    addRowOf(pairOf(12).id); addRowOf(pairOf(14).id)
    add2(pairOf(12)); await settle()
    expect([pairOf(12).beams.length, pairOf(14).beams.length, singlesOf(12).length, singlesOf(14).length]).toEqual([14, 14, 0, 0])
    const p = pairOf(12), q = pairOf(14), far = baysIn(p, 108, 124.75), side = 1
    const worldLo = (o, sd) => { const a = pointIn(o, 0, sd), c = rackFootprint(o); return vert ? a.x < c.x + c.w / 2 : a.y < c.y + c.h / 2 }
    const pos14 = positions(14), h = hist()
    store.setState({ selectedIds: [p.id], activeBaySelection: far.map(i => ({ objId: p.id, bayIdx: i, side })) })
    expect(deleteBaySelection(store, newId)).toBe(true); await settle()
    expect(hist()).toBe(h + 1)
    expect(useRowGroup.getState().message).toMatch(/^Applied to 1 row/)
    const s12 = singlesOf(12)[0], s14 = singlesOf(14)[0]
    expect([pairOf(14).beams.length, singlesOf(14).length, s14.beams.length, run(s14)]).toEqual([12, 1, 2, run(s12)])
    // the single left is on the same side across the floor in both rows: the deleted band faced the same way
    const lo12 = RG.geom(s12).s0 - RG.geom(pairOf(12)).s0 < 0.5, lo14 = RG.geom(s14).s0 - RG.geom(pairOf(14)).s0 < 0.5
    expect(lo12).toBe(lo14)
    expect(worldLo(p, side)).toBe(!lo12)
    expect(positions(14)).toBe(pos14 - getRackCapacity({ type: 'rack_row', beams: [96, 96], levels: q.levels, palletWIn: q.palletWIn }).total)
    expect(overlapsIn(14)).toEqual([])
  })

  it('BS-group-ask: the same in Ask — "Apply to the other 1 row?"; a group row with no bay at those uprights is skipped ("uprights don\'t line up")', async () => {
    load(savedFill(vert))
    addRowOf(pairOf(12).id); addRowOf(pairOf(14).id)
    const p = pairOf(12), far = baysIn(p, 9, 33.5)
    store.setState({ selectedIds: [p.id], activeBaySelection: far.map(i => ({ objId: p.id, bayIdx: i, side: 0 })) })
    deleteBaySelection(store, newId); await settle()
    const pend = useRowGroup.getState().pending
    expect(pend?.edit.kind).toBe('side-delete')
    expect(pend.summary.text).toMatch(/^Apply to the other 1 row\?/)
    expect(applyPending()).toBe(true)
    // shifted by a foot: nothing lines up
    const shifted = RG.planReplay(objs(), { ...pend.edit, removed: pend.edit.removed.map(r => ({ ...r, a: r.a + GS, b: r.b + GS })) }, useRowGroup.getState().keys, { gridSize: GS, newId, warnings: false })
    expect(shifted.targets.map(t => [t.status, t.reason])).toEqual([['skip', "uprights don't line up"]])
  })
})

describe('BS — a rack drawn over a zone', () => {
  it('BS-zone-pick (BUG 87): a click where row 12\'s grown pair stands in the custom area picks the pair (drawn over the zone), not the zone; on the zone\'s own floor, the zone', async () => {
    const { hitTest } = await import('../../canvas2/hitTest')
    await takenOver(true)
    const p = pairOf(12), zone = objs().find(o => o.type === 'zone_custom')
    const q = pointIn(p, baysIn(p, 116, 124.75)[0], 1 - sideOfSingle(p, savedFill(true).find(o => o.genSection === 2 && o.rowIndex === 12 && o.type === 'rack_row')))
    const inZone = q.x >= zone.x && q.x <= zone.x + zone.width && q.y >= zone.y && q.y <= zone.y + zone.height
    expect(inZone).toBe(true)
    expect(hitTest(objs(), store.getState().layers, q.x, q.y, 1, GS)).toBe(p.id)
    expect(hitTest(objs(), store.getState().layers, zone.x + zone.width / 2, zone.y + zone.height / 2, 1, GS)).toBe(zone.id)
  })
})
