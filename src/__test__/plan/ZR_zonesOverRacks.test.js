// Area ZR — zones placed on a layout after its racks (utils/rackingAreaTool.js installAreaKeeper / landZones,
// generate/rackingArea.js cutForZones, generate/faceReach.js, canvas2/ZoneEdit.jsx, utils/floorClamp.js
// zoneSized). On the hand-check layout (realLayout.fixture.js) — rows horizontal as saved, vertical on the
// layout turned 90° — three ways the racks got there: a Fill racking area (it refits round the zone, and
// gets racks back when the zone shrinks), the same racks with the area gone (placed by hand), and Generate's
// 500 × 250 on the fixture's 50' × 54' grid. One rule cuts them all:
//   - a zone dropped on racks stays where it is dropped and cuts them at once — nothing asked, one undo
//     step, the bar: "Office placed · N bays removed";
//   - a bay half a zone covers goes, the other half stays a single row;
//   - a pick face the zone leaves without an aisle goes (Fill racking's rule, faceReach.js);
//   - resized: no question, the bays its release will remove previewed red, one undo step;
//   - racks it removed don't come back when it shrinks (undo does) — but for a Fill area's;
//   - an exact width / length typed: the edge against a wall stays, else the left / top edge.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const FT = await import('../../utils/fillTool')
  const FR = await import('../../generate/fillRacking')
  const RA = await import('../../generate/rackingArea')
  const AT = await import('../../utils/rackingAreaTool')
  const FC = await import('../../utils/floorClamp')
  const TG = await import('../../generate/traceGenerate')
  const RG = await import('../../utils/rowGroupTool')
  const L = await import('../../utils/layers')
  const { rackFootprint } = await import('../../generate/columnCheck')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  installRowEditKeeper(useCanvasStore)
  RG.installRowGroupWatcher(useCanvasStore, nanoid)
  AT.installAreaKeeper(useCanvasStore)
  return { useCanvasStore, FT, FR, RA, AT, FC, TG, rackFootprint }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const E = 1e-3
const meets = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > E && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > E
const tick = () => new Promise(r => setTimeout(r, 0))
const turn = (o) => { const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }; if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x })); if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW }); return t }
const KINDS = ['Fill area', 'hand-placed', 'Generate']

describe.each([['horizontal rows', false], ['vertical rows', true]])('ZR — %s', (_, vert) => {
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation: vert ? 'vertical' : 'horizontal' })
    m.AT.useAreaPrompt.setState({ question: null, note: null })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  const doc = () => JSON.parse(JSON.stringify({ objects: s().objects }))
  /** The layout of `kind` loaded as the one history entry. */
  async function load(kind) {
    let objs
    if (kind === 'Generate') {
      m.TG.generateAndPlace({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, gridXFt: vert ? 54 : 50, gridYFt: vert ? 50 : 54, mhe: 'reach', rackType: 'rack_double_row', orientation: vert ? 'vertical' : 'horizontal', wallClearIn: 3 })
      objs = s().objects
    } else {
      const base = REAL_LAYOUT.filter(o => !RACK.has(o.type)).map(o => ({ ...o })).map(o => (vert ? turn(o) : o))
      const area = base.find(o => o.type === 'racking_area'), box = { x: area.x, y: area.y, w: area.width, h: area.height }
      objs = m.RA.planAreaCreate(base.filter(o => o !== area), box, { ...area.settings, orientation: vert ? 'vertical' : 'horizontal' }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
      if (kind === 'hand-placed') objs = objs.filter(o => o.type !== 'racking_area').map(o => (o.areaId ? (({ areaId, ...r }) => r)(o) : o))
    }
    objs = JSON.parse(JSON.stringify(objs))
    m.useCanvasStore.setState({ objects: objs, groups: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects: objs, groups: [] })], historyIndex: 0 })
    await tick()
    return objs
  }
  // run / stack (along the rows / across them), world px
  const R = (f) => (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w]), S = (f) => (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
  const boxRS = (r0, r1, s0, s1) => (vert ? { x: s0, y: r0, w: s1 - s0, h: r1 - r0 } : { x: r0, y: s0, w: r1 - r0, h: s1 - s0 })
  /** A back-to-back pair near the middle of the floor, its run 60' or more. */
  const midPair = () => {
    const fp = s().objects.find(o => o.type.startsWith('fp_')), c = { x: fp.x + fp.width / 2, y: fp.y + fp.height / 2 }
    const pairs = racks().filter(o => o.type === 'rack_double_row').map(o => ({ o, f: m.rackFootprint(o) })).filter(p => R(p.f)[1] - R(p.f)[0] >= 60 * GS)
    return pairs.sort((a, b) => Math.hypot(a.f.x + a.f.w / 2 - c.x, a.f.y + a.f.h / 2 - c.y) - Math.hypot(b.f.x + b.f.w / 2 - c.x, b.f.y + b.f.h / 2 - c.y))[0]
  }
  const zoneAt = (b, label = 'Office') => ({ type: 'zone_office', label, x: b.x, y: b.y, width: b.w, height: b.h, parentId: s().objects.find(o => o.type.startsWith('fp_')).id, layerId: 'zones' })
  const halvesUnder = (z) => racks().flatMap(o => m.RA.rowBayBoxes(o, GS)).filter(b => meets(b, z))
  const depth = 42 / 12 * GS

  it.each(KINDS)('ZR-drop (%s): an office dropped on racks stays where it is dropped; the racks under it are cut at once — nothing asked, no bay half left under it, "Office placed · N bays removed" (N the bays per row it took); ONE undo restores the zone and every rack', async (kind) => {
    await load(kind)
    const { f } = midPair(), [r0, r1] = R(f), [s0, s1] = S(f), rm = (r0 + r1) / 2
    const zb = boxRS(rm - 20 * GS, rm + 20 * GS, s0 - GS, s1 + GS)
    const before = doc(), h0 = s().historyIndex
    s().addObject(zoneAt(zb)); await tick(); await tick()
    expect(m.AT.useAreaPrompt.getState().question).toBeNull()
    const z = s().objects.find(o => o.type === 'zone_office' && o.label === 'Office' && Math.abs(o.x - zb.x) < E)
    expect([z.x, z.y, z.width, z.height]).toEqual([zb.x, zb.y, zb.w, zb.h])
    expect(halvesUnder(zb)).toEqual([])
    expect(s().historyIndex).toBe(h0 + 1)
    const n = m.RA.removedRowBays(before.objects, s().objects, GS).length
    expect(n).toBeGreaterThan(0)
    expect(m.AT.useAreaPrompt.getState().note).toBe(`Office placed · ${n} bays removed`)
    s().undo()
    expect(doc()).toEqual(before)
  })

  it.each(KINDS)('ZR-face (%s): a zone against one long face of a pair (6\' deep, in its aisle) — along it, the pair becomes the single on its far half, facing its remaining aisle', async (kind) => {
    await load(kind)
    const { o, f } = midPair(), [r0, r1] = R(f), [s0, s1] = S(f), rm = (r0 + r1) / 2, row = o.rowIndex
    const zb = boxRS(rm - 15 * GS, rm + 15 * GS, s1, s1 + 6 * GS)
    s().addObject(zoneAt(zb)); await tick(); await tick()
    // the racks of that row across [s0, s1] with a bay wholly within the zone's stretch
    const here = racks().filter(q => { const g = m.rackFootprint(q); return S(g)[0] >= s0 - E && S(g)[1] <= s1 + E && R(g)[0] < rm + E && R(g)[1] > rm - E })
    expect(here.length).toBe(1)
    expect(here[0].type).toBe('rack_row')
    expect(S(m.rackFootprint(here[0]))).toEqual([s0, s0 + depth].map(v => expect.closeTo(v, 3)))
    void row
  })

  it.each(KINDS)('ZR-half (%s): a zone over exactly one half of a pair — that half goes along it, the other half stays a single row (it still has its aisle)', async (kind) => {
    await load(kind)
    const { f } = midPair(), [r0, r1] = R(f), [s0, s1] = S(f), rm = (r0 + r1) / 2
    const zb = boxRS(rm - 15 * GS, rm + 15 * GS, s1 - depth, s1)
    s().addObject(zoneAt(zb)); await tick(); await tick()
    expect(halvesUnder(zb)).toEqual([])
    const here = racks().filter(q => { const g = m.rackFootprint(q); return S(g)[0] >= s0 - E && S(g)[1] <= s1 + E && R(g)[0] < rm + E && R(g)[1] > rm - E })
    expect(here.map(q => q.type)).toEqual(['rack_row'])
    expect(S(m.rackFootprint(here[0]))).toEqual([s0, s0 + depth].map(v => expect.closeTo(v, 3)))
  })

  it.each(KINDS)('ZR-shrink (%s): the office shrunk after the drop — no question, one undo step; a Fill area gets its racks back where the zone left, racks placed otherwise stay removed (undo brings them back)', async (kind) => {
    await load(kind)
    const { f } = midPair(), [r0, r1] = R(f), [s0, s1] = S(f), rm = (r0 + r1) / 2
    const zb = boxRS(rm - 20 * GS, rm + 20 * GS, s0 - GS, s1 + GS)
    s().addObject(zoneAt(zb)); await tick(); await tick()
    const z = s().objects.find(o => o.type === 'zone_office' && Math.abs(o.x - zb.x) < E)
    const dropped = doc(), bays0 = m.RA.rowBays(s().objects), h0 = s().historyIndex
    const small = boxRS(rm - 5 * GS, rm + 5 * GS, s0 - GS, s1 + GS)
    s().commitObjectUpdate(z.id, { x: small.x, y: small.y, width: small.w, height: small.h }); await tick(); await tick()
    expect(m.AT.useAreaPrompt.getState().question).toBeNull()
    expect(s().historyIndex).toBe(h0 + 1)
    if (kind === 'Fill area') expect(m.RA.rowBays(s().objects)).toBeGreaterThan(bays0)
    else expect(m.RA.rowBays(s().objects)).toBe(bays0)
    expect(m.AT.useAreaPrompt.getState().note).toMatch(/^Office resized/)
    s().undo()
    expect(doc()).toEqual(dropped)
  })

  it.each(KINDS)('ZR-preview (%s): an edge dragged (the live box, no history) — the red preview is exactly the bays the release removes', async (kind) => {
    await load(kind)
    const { f } = midPair(), [r0, r1] = R(f), [s0, s1] = S(f), rm = (r0 + r1) / 2
    // a small office in the aisle beside the pair, then its edge dragged across the pair and past it
    const zb = boxRS(rm - 10 * GS, rm + 10 * GS, s1 + GS, s1 + 5 * GS)
    s().addObject(zoneAt(zb)); await tick(); await tick()
    const z = s().objects.find(o => o.type === 'zone_office' && Math.abs(o.x - zb.x) < E), was = { ...z }
    const before = doc().objects
    const big = boxRS(rm - 10 * GS, rm + 10 * GS, s0 - 2 * GS, s1 + 5 * GS)
    s().updateObject(z.id, { x: big.x, y: big.y, width: big.w, height: big.h })
    const preview = m.AT.zonePreview(s().objects, z.id, was, { gridSize: GS })
    expect(preview.length).toBeGreaterThan(0)
    expect(m.RA.rowBays(s().objects)).toBe(m.RA.rowBays(before))           // nothing removed yet
    s().commitObjectUpdate(z.id, {}); await tick(); await tick()
    const key = (b) => [b.x, b.y, b.w, b.h].map(v => Math.round(v)).join(',')
    expect(preview.map(key).sort()).toEqual(m.RA.removedRowBays(before, s().objects, GS).map(key).sort())
    expect(m.AT.useAreaPrompt.getState().note).toBe(`Office resized · ${preview.length} bays removed`)
  })
})

describe.each([['horizontal rows', false], ['vertical rows', true]])('ZR — typed size, %s', (_, vert) => {
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState(); m.AT.useAreaPrompt.setState({ question: null, note: null }) })
  const fixture = () => {
    const objs = REAL_LAYOUT.filter(o => !RACK.has(o.type) && o.type !== 'racking_area').map(o => ({ ...o })).map(o => (vert ? turn(o) : o))
    m.useCanvasStore.setState({ objects: objs, groups: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects: objs, groups: [] })], historyIndex: 0 })
    const fp = objs.find(o => o.type.startsWith('fp_')), p = m.FR.innerOutline(fp, GS), xs = p.map(q => q.x), ys = p.map(q => q.y)
    return { fp, X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys) }
  }
  const sized = (z, v) => m.FC.zoneSized(s().objects, z, v, { gridSize: GS })
  const office = (x, y, w, h) => ({ id: 'z', type: 'zone_office', label: 'Office', x, y, width: w, height: h, parentId: s().objects.find(o => o.type.startsWith('fp_')).id })

  it('ZR-size-wall: an office against the right wall — a typed width keeps its right edge (the left moves); against the bottom wall, a typed length keeps its bottom edge; against the top, the top', () => {
    const { X1, Y0, Y1 } = fixture()
    const right = office(X1 - 40 * GS, Y0 + 80 * GS, 40 * GS, 30 * GS)
    expect(sized(right, { width: 50 * GS })).toEqual({ x: X1 - 50 * GS, y: right.y, width: 50 * GS, height: 30 * GS })
    const bottom = office(X1 - 140 * GS, Y1 - 30 * GS, 40 * GS, 30 * GS)
    expect(sized(bottom, { height: 20 * GS })).toEqual({ x: bottom.x, y: Y1 - 20 * GS, width: 40 * GS, height: 20 * GS })
    const top = office(X1 - 140 * GS, Y0, 40 * GS, 30 * GS)
    expect(sized(top, { height: 45 * GS })).toEqual({ x: top.x, y: Y0, width: 40 * GS, height: 45 * GS })
  })
  it('ZR-size-middle: an office in the middle of the floor (no wall), or against walls on both sides of an axis — a typed width keeps the left edge, a length the top edge; clamped to the walls', () => {
    const { X0, X1, Y0 } = fixture()
    const mid = office(X0 + 100 * GS, Y0 + 100 * GS, 40 * GS, 30 * GS)
    expect(sized(mid, { width: 25 * GS })).toEqual({ x: mid.x, y: mid.y, width: 25 * GS, height: 30 * GS })
    expect(sized(mid, { height: 50 * GS })).toEqual({ x: mid.x, y: mid.y, width: 40 * GS, height: 50 * GS })
    const both = office(X0, Y0 + 100 * GS, X1 - X0, 30 * GS)
    expect(sized(both, { width: 100 * GS })).toEqual({ x: X0, y: both.y, width: 100 * GS, height: 30 * GS })
    // clamped: wider than the floor to the right of it stops at the wall
    const near = office(X1 - 60 * GS, Y0 + 100 * GS, 40 * GS, 30 * GS)
    expect(sized(near, { width: 100 * GS }).x + sized(near, { width: 100 * GS }).width).toBeCloseTo(X1, 6)
  })
  it('ZR-size-panel: typed in the zone panel ("50\' 6\\"") — one undo step, the edge against the wall kept', async () => {
    const { X1, Y0 } = fixture()
    s().addObject(office(X1 - 40 * GS, Y0 + 80 * GS, 40 * GS, 30 * GS)); await tick(); await tick()
    const z = s().objects.find(o => o.id === 'z'), h0 = s().historyIndex
    const P = await import('../../components/RightPanel/panels/RackingAreaPanel.jsx')
    expect(P.parseFeet('50\' 6"')).toBeCloseTo(50.5, 9)
    expect([P.parseFeet('40'), P.parseFeet("40'"), P.parseFeet("40'6"), P.parseFeet('x')]).toEqual([40, 40, 40.5, null])
    s().commitObjectUpdate(z.id, sized(z, { width: 50.5 * GS })); await tick(); await tick()
    const now = s().objects.find(o => o.id === z.id)
    expect(now.x + now.width).toBeCloseTo(X1, 6)
    expect(now.width).toBeCloseTo(50.5 * GS, 6)
    expect(s().historyIndex).toBe(h0 + 1)
  })
})
