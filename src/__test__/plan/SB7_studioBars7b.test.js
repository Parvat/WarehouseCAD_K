// SB7 — the 7a fixes round (STUDIO.md §7a), the pure parts under the REG-7b click tests: the bay set keeps a pair's
// two facing bays as two items; a mixed selection's bar; a zone's way in (staging: the travel width; an office, washroom
// or custom area: the Rules' walkway, 44″) — Check layout's one new error.
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
