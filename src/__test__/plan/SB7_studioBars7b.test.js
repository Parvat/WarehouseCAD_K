// SB7 — the 7a fixes round (STUDIO.md §7a), the pure parts under the REG-7b click tests: the bay set keeps a pair's
// two facing bays as two items; a mixed selection's bar; a zone's way in (staging: the travel width; an office, washroom
// or custom area: the Rules' walkway, 44″) — Check layout's one new error; Fill new space running rows on along their
// row lines, the per-bay marks staying on their bays.
import { describe, it, expect, vi } from 'vitest'

globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
const GS = 40

async function fresh() {
  vi.resetModules()
  const { useCanvasStore: store } = await import('../../store/useCanvasStore')
  store.setState({ objects: [], groups: [], selectedIds: [], activeBaySelection: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  return store
}

describe('SB7 — the bay set: a pair\'s facing bays are two items', () => {
  it('SB7-flue-set: side 0 and side 1 of one bay picked one by one are two entries; a Shift+click on one takes off only it; the flue\'s both-sides pick, clicked on one half, keeps the other', async () => {
    const store = await fresh()
    const SL = await import('../../canvas2/selectionLevel')
    const r = { id: 'p', type: 'rack_double_row', x: 0, y: 0, width: 800, height: 300, beams: [96, 96, 96], rotation: 0 }
    store.setState({ objects: [r] })
    SL.selectBays(store, [{ objId: 'p', bayIdx: 1, side: 0 }])
    SL.toggleBay(store, { objId: 'p', bayIdx: 1, side: 1 })
    expect(SL.pickedBays(store.getState())).toEqual([{ objId: 'p', bayIdx: 1, side: 0 }, { objId: 'p', bayIdx: 1, side: 1 }])
    SL.toggleBay(store, { objId: 'p', bayIdx: 1, side: 0 })
    expect(SL.pickedBays(store.getState())).toEqual([{ objId: 'p', bayIdx: 1, side: 1 }])
    // the flue's two at once (side null), then one half: the other half stays
    SL.selectBays(store, [{ objId: 'p', bayIdx: 2, side: null }])
    SL.toggleBay(store, { objId: 'p', bayIdx: 2, side: 0 })
    expect(SL.pickedBays(store.getState())).toEqual([{ objId: 'p', bayIdx: 2, side: 1 }])
    // never one bay twice: a half with its bay's "both" is one entry
    expect(SL.bayKeySet([{ objId: 'p', bayIdx: 0, side: 0 }, { objId: 'p', bayIdx: 0, side: null }], [r])).toEqual([{ objId: 'p', bayIdx: 0, side: null }])
  })
})

describe('SB7 — a mixed selection', () => {
  it('SB7-mixed-bar: racks and a zone selected together — the mixed bar (count, Lock · Duplicate · Delete); racks alone keep the rows bar', async () => {
    await fresh()
    const SB = await import('../../studio/SelectionBar')
    const a = { id: 'a', type: 'rack_double_row', x: 0, y: 0, width: 800, height: 300, beams: [96, 96] }
    const b = { id: 'b', type: 'rack_double_row', x: 0, y: 900, width: 800, height: 300, beams: [96, 96] }
    const z = { id: 'z', type: 'zone_office', x: 2000, y: 0, width: 400, height: 400 }
    expect(SB.barFor([a, b, z], ['a', 'z'], null).kind).toBe('mixed')
    expect(SB.barFor([a, b, z], ['a', 'b'], null).kind).toBe('rows')
  })
})

describe('SB7 — a zone\'s way in', () => {
  /** A 100′ × 60′ building, a zone in its top-left inner corner, rack A 5′ off its right side running 40′ down (a 5′
   *  corridor out to the main floor), rack B against its bottom side. */
  async function corner(type) {
    const store = await fresh()
    store.getState().placeFpObject({ type: 'fp_rect', widthFt: 100, heightFt: 60 })
    const fp = store.getState().objects.find(o => o.type === 'fp_rect')
    const { innerOutline } = await import('../../utils/floorGeom')
    const inner = innerOutline(fp, GS), ix = Math.min(...inner.map(p => p.x)), iy = Math.min(...inner.map(p => p.y))
    const zone = { id: 'z', type, x: ix, y: iy, width: 20 * GS, height: 20 * GS, parentId: fp.id }
    const A = { id: 'A', type: 'rack_row', x: ix + 25 * GS, y: iy, width: 4 * GS, height: 40 * GS, beams: [96], rotation: 0, parentId: fp.id }
    const B = { id: 'B', type: 'rack_row', x: ix, y: iy + 20 * GS, width: 20 * GS, height: 4 * GS, beams: [96], rotation: 0, parentId: fp.id }
    return { objects: [fp, zone, A, B], fp, ix, iy }
  }
  it('SB7-way-in: through a 5′ corridor an office (44″ walkway) has a way in, staging (8′ travel) has none; a wider walkway in Rules closes the office in too', async () => {
    const ZC = await import('../../utils/zoneCheck')
    const office = await corner('zone_office')
    expect(ZC.closedZones(office.objects, { gridSize: GS, travelFt: 8, walkwayIn: 44 })).toEqual([])
    expect(ZC.closedZones(office.objects, { gridSize: GS, travelFt: 8, walkwayIn: 72 }).map(c => c.zone.id)).toEqual(['z'])
    const staging = await corner('zone_staging')
    expect(ZC.closedZones(staging.objects, { gridSize: GS, travelFt: 8, walkwayIn: 44 }).map(c => c.zone.id)).toEqual(['z'])
  })
  it('SB7-way-in-check: Check layout — a zone with no way in is an ERROR (zone-closed); one past the walls is not judged (its "past the walls" warning stays)', async () => {
    const LC = await import('../../utils/layoutCheck')
    const staging = await corner('zone_staging')
    const res = LC.checkLayout(staging.objects, { gridSize: GS })
    expect(res.errors.filter(e => e.kind === 'zone-closed').map(e => [e.ids, e.text])).toEqual([[['z'], 'Staging: no way in']])
    const out = staging.objects.map(o => (o.id === 'z' ? { ...o, x: o.x - 40 * GS } : o))
    expect(LC.checkLayout(out, { gridSize: GS }).errors.some(e => e.kind === 'zone-closed')).toBe(false)
  })
  it('SB7-walkway-rule: Rules → Zones → Walkway, 44″ by default, editable, validated', async () => {
    const D = await import('../../rules/defaults'), V = await import('../../rules/validate'), ZC = await import('../../utils/zoneCheck')
    expect(D.DEFAULT_RULES.zones.walkwayIn).toBe(44)
    expect(D.LOCKED_PATHS.includes('zones.walkwayIn')).toBe(false)
    expect(ZC.walkwayInNow()).toBe(44)
    expect(V.validateRules({ ...D.DEFAULT_RULES, zones: { walkwayIn: 0 } }).errors.some(e => e.path === 'zones.walkwayIn')).toBe(true)
  })
  it('SB7-live-reasons: the live check names the reasons a moved zone causes — a zone in the aisle between two rows blocks it', async () => {
    const ZC = await import('../../utils/zoneCheck')
    const store = await fresh()
    store.getState().placeFpObject({ type: 'fp_rect', widthFt: 200, heightFt: 100 })
    const fp = store.getState().objects.find(o => o.type === 'fp_rect')
    const { innerOutline } = await import('../../utils/floorGeom')
    const inner = innerOutline(fp, GS), ix = Math.min(...inner.map(p => p.x)), iy = Math.min(...inner.map(p => p.y))
    // two pairs 10.5′ apart, an office standing in the aisle between them
    const pair = (id, y) => ({ id, type: 'rack_double_row', x: ix + 20 * GS, y, width: (8 * 8 + 9 * 3 / 12) * GS, height: (42 * 2 + 9) / 12 * GS, beams: Array(8).fill(96), uprightWidth: 3, flueSpaceIn: 9, rotation: 0, levels: 4, parentId: fp.id })
    const p1 = pair('p1', iy + 30 * GS), d = p1.height, p2 = pair('p2', iy + 30 * GS + d + 10.5 * GS)
    const z = { id: 'z', type: 'zone_office', x: ix + 40 * GS, y: p1.y + d + 1 * GS, width: 20 * GS, height: 8 * GS, parentId: fp.id }
    const reasons = ZC.zoneProblems([fp, p1, p2, z], { ids: ['z'], gridSize: GS }).map(p => p.text)
    expect(reasons).toContain('Blocks an aisle')
    expect(ZC.zoneProblems([fp, p1, p2], { ids: ['z'], gridSize: GS })).toEqual([])
  })
})

describe('SB7 — Fill new space runs the rows on along their row lines', () => {
  it('SB7-extend: the building grown at a row end — the rack gets whole bays toward the new wall, the gap it kept to the old wall kept; grown at its start, the per-bay marks stay on their bays and the new bays are the default', async () => {
    const store = await fresh()
    store.getState().placeFpObject({ type: 'fp_rect', widthFt: 100, heightFt: 60 })
    const fp = store.getState().objects.find(o => o.type === 'fp_rect')
    const BR = await import('../../utils/buildingResize'), { innerOutline } = await import('../../utils/floorGeom'), { rackFootprint } = await import('../../generate/rackFootprint')
    const inner = innerOutline(fp, GS), ix0 = Math.min(...inner.map(p => p.x)), ix1 = Math.max(...inner.map(p => p.x)), iy = Math.min(...inner.map(p => p.y))
    const n = 6, bayW = (96 + 3) / 12 * GS, w = (3 + n * 99) / 12 * GS
    const r = { id: 'r', type: 'rack_double_row', x: ix0 + 10 * GS, y: iy + 20 * GS, width: w, height: 93 / 12 * GS, beams: Array(n).fill(96), uprightWidth: 3, flueSpaceIn: 9, rotation: 0, levels: 4, parentId: fp.id,
      elevBays: [[null, 'T', null, null, null, null], Array(n).fill(null)], bayEmpty: [[false, false, true, false, false, false], Array(n).fill(false)] }
    const gapR = ix1 - (r.x + r.width)
    const grow = (dx0, dx1) => ({ ...fp, x: fp.x + dx0, width: fp.width - dx0 + dx1, fpVerts: fp.fpVerts.map(v => ({ x: v.x < fp.x + fp.width / 2 ? v.x + dx0 : v.x + dx1, y: v.y })) })
    // grown 30′ at the right (the rack's end)
    const right = grow(0, 30 * GS), planR = BR.planBuildingResize([fp, r], fp, right, { gridSize: GS })
    const er = BR.extendRowsInto([right, r], fp, right, planR.strips, { gridSize: GS })
    const r2 = er.objects.find(o => o.id === 'r')
    expect([r2.beams.length > n, r2.x, Math.round(ix1 + 30 * GS - (r2.x + r2.width)) >= Math.round(gapR) - 1, Math.round(ix1 + 30 * GS - (r2.x + r2.width)) < Math.round(gapR) + bayW]).toEqual([true, r.x, true, true])
    // grown 20′ at the left (its start): the marks stay on the same physical bays, the new bays are the default
    const left = grow(-20 * GS, 0), planL = BR.planBuildingResize([fp, r], fp, left, { gridSize: GS })
    const el = BR.extendRowsInto([left, r], fp, left, planL.strips, { gridSize: GS })
    const r3 = el.objects.find(o => o.id === 'r'), k = r3.beams.length - n
    expect(k).toBeGreaterThan(0)
    expect([r3.elevBays[0].indexOf('T') - k, r3.bayEmpty[0].indexOf(true) - k, r3.elevBays[0].slice(0, k).every(x => x == null), r3.bayEmpty[0].slice(0, k).every(x => !x)]).toEqual([1, 2, true, true])
    expect(Math.round(rackFootprint(r3).x + rackFootprint(r3).w)).toBe(Math.round(r.x + r.width))   // its end held
    // grown across the rows (no row line reaches the new floor): nothing extended — the fill places new rows there
    const down = { ...fp, height: fp.height + 30 * GS, fpVerts: fp.fpVerts.map(v => ({ x: v.x, y: v.y > fp.y + fp.height / 2 ? v.y + 30 * GS : v.y })) }
    const planD = BR.planBuildingResize([fp, r], fp, down, { gridSize: GS })
    expect(BR.extendRowsInto([down, r], fp, down, planD.strips, { gridSize: GS }).extended).toBe(0)
  })
})
