// Area AA — every aisle needs a way in; a far edge on a wall ends with a flush single.
//   1. An aisle must open, at one end or more, onto a cross-aisle or travel path
//      at least the forklift's travel width that leads to the main floor
//      (generate/aisleAccess.js). Fill racking / racking areas / Generate leave a
//      travel path where rows run wall to wall, and place no rack only a dead-end
//      pocket reaches (an aisle an office closes against a wall). Check layout
//      reports such racks: "No way in: aisle closed at both ends", the pocket
//      highlighted.
//   2. A racking area whose far edge lies on a wall's inner face ends with a single
//      row flush against the wall, in the leftover, when it fits an aisle off the
//      last row; an open far edge keeps the regular pattern's leftover. Shrink →
//      extend back is still identical.
// Real store with the app's keepers; both orientations; rectangle, L and T.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const FT = await import('../../utils/fillTool')
  const FR = await import('../../generate/fillRacking')
  const AT = await import('../../utils/rackingAreaTool')
  const LC = await import('../../utils/layoutCheck')
  const AA = await import('../../generate/aisleAccess')
  const CP = await import('../../utils/copyPrompt')
  const { rackFootprint, MHE_PROFILES } = await import('../../generate/columnCheck')
  const L = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  installRowEditKeeper(useCanvasStore)
  CP.installCopyWatcher(useCanvasStore, nanoid)
  AT.installAreaKeeper(useCanvasStore)
  return { useCanvasStore, FT, FR, AT, LC, AA, rackFootprint, MHE_PROFILES }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-3
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
const within = (a, b) => a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS
const tick = () => new Promise(r => setTimeout(r, 0))
const SHAPES = [['rectangle', 'fp_rect', 240, 120], ['L', 'fp_l', 300, 200], ['T', 'fp_t', 360, 240]]

describe.each(['horizontal', 'vertical'])('AA — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
    m.AT.useAreaPrompt.setState({ question: null })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  const areaNow = () => s().objects.find(o => o.type === 'racking_area')
  const fpNow = () => s().objects.find(o => o.type.startsWith('fp_'))
  const foot = (o) => m.rackFootprint(o)
  const check = () => m.LC.checkLayout(s().objects, { gridSize: GS })
  const drag = (a, b) => { m.FT.startFill(a); m.FT.moveFill(b, s().objects, GS); return m.FT.commitFill(m.useCanvasStore) }
  const innerBox = (fp) => { const p = m.FR.innerOutline(fp, GS), xs = p.map(q => q.x), ys = p.map(q => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } }
  const rackKeys = () => racks().map(o => [o.type, Math.round(o.x * 1e4), Math.round(o.y * 1e4), Math.round(o.width * 1e4), Math.round(o.height * 1e4), o.rotation || 0, o.beams.join('/'), o.rowIndex, o.genSection].join(':')).sort()
  // world px from (run, stack) feet off the building's corner
  const rs = (fp, r, sv) => (vert ? { x: fp.x + sv * GS, y: fp.y + r * GS } : { x: fp.x + r * GS, y: fp.y + sv * GS })
  const rsBox = (fp, r0, r1, s0, s1) => { const a = rs(fp, r0, s0), b = rs(fp, r1, s1); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) } }

  /* ── 1. A way in ── */

  /** The NEAR run wall (where the fill starts along the rows: the left wall for horizontal rows, the
   *  top for vertical) and a stretch of floor across it, per shape (feet off the corner). A travel path
   *  the fill carves runs at the far end, so it never opens this pocket from the wall side. */
  const runWall = (type) => {
    const band = { fp_rect: [40, 70], fp_l: vert ? [20, 50] : [155, 185], fp_t: [20, 50] }[type]
    return { W: 0, band }
  }

  it.each(SHAPES)('AA-pocket (%s): an office 30\' off a wall closes the aisles between them — the fill places no rack only that pocket reaches, and Check layout is clean; a rack put back there by hand is flagged "No way in: aisle closed at both ends", the pocket highlighted', async (_, type, w, h) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = fpNow(), { W, band } = runWall(type), wt = innerBox(fp).x - fp.x
    const office = rsBox(fp, W + 30, W + 60, band[0], band[1])
    s().addObject({ type: 'zone_office', label: 'Office', x: office.x, y: office.y, width: office.w, height: office.h, parentId: fp.id, layerId: 'zones' })
    await tick()
    const pocket = rsBox(fp, W + wt / GS, W + 30, band[0], band[1])
    // what the pattern would place without a way in: racks in the pocket
    const ib = innerBox(fp)
    const made = m.FR.areaPattern(s().objects, ib, { orientation }, { gridSize: GS, from: { x: ib.x, y: ib.y } })
    const bare = m.FR.patternFill(s().objects, ib, made.pattern, { gridSize: GS, wayIn: false }).racks
    // the racks only the pocket reaches (between the office and the wall)
    const cut = new Set(m.AA.cutOffRacks([...s().objects, ...bare], fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5, ids: bare.map(r => r.id) }).cutOff.map(c => c.id))
    const inPocket = bare.filter(r => cut.has(r.id) && within(foot(r), pocket))
    expect(inPocket.length).toBeGreaterThan(0)
    // the fill: none of them, and nothing in the pocket a forklift can't get to
    drag({ x: ib.x, y: ib.y }, { x: ib.x + ib.w, y: ib.y + ib.h })
    expect(racks().length).toBeGreaterThan(4)
    const at = (r) => [r.type, Math.round(foot(r).x), Math.round(foot(r).y), Math.round(foot(r).w), Math.round(foot(r).h)].join()
    const placedNow = new Set(racks().map(at))
    for (const r of inPocket) expect(placedNow.has(at(r))).toBe(false)
    expect(m.AA.cutOffRacks(s().objects, fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5 }).cutOff).toEqual([])
    expect(check().errors).toEqual([])
    // one put back by hand: no way in
    const r = inPocket[0], { areaId, ...hand } = r; void areaId
    s().addObject({ ...hand, id: 'hand1' }); await tick()
    const err = check().errors.filter(e => e.kind === 'no-way-in')
    expect(err).toHaveLength(1)
    expect(err[0].text).toBe('No way in: aisle closed at both ends')
    expect(err[0].ids).toContain('hand1')
    expect(overlap(err[0].highlight[0], pocket)).toBe(true)
    expect(err[0].highlight[0].color).toBe(m.LC.HL.red)
  })

  it.each(SHAPES)('AA-travel (%s): a fill of the whole building leaves every aisle a way in — Check layout finds no aisle closed at both ends, and every rack a pick face onto the main floor', (_, type, w, h) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = fpNow(), ib = innerBox(fp)
    drag({ x: ib.x - 13.7, y: ib.y - 21.3 }, { x: ib.x + ib.w + 7.1, y: ib.y + ib.h + 3.3 })
    expect(racks().length).toBeGreaterThan(8)
    expect(m.AA.cutOffRacks(s().objects, fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5 }).cutOff).toEqual([])
    expect(check().errors).toEqual([])
  })

  it('AA-width: a way in is at least the chosen forklift\x27s travel width — an aisle opening onto a strip 8\x27 deep is reached by a reach truck (8\x27); onto one 6\x27 deep it is not; a VNA (6\x27) gets through 6\x27; Check layout reads the forklift', () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = fpNow(), ib = innerBox(fp)
    const R0 = (vert ? ib.y - fp.y : ib.x - fp.x) / GS, R1 = R0 + (vert ? ib.h : ib.w) / GS
    const S0 = (vert ? ib.x - fp.x : ib.y - fp.y) / GS, S1 = S0 + (vert ? ib.w : ib.h) / GS
    const d = (2 * 42 + 9) / 12, bays = Math.floor(((R1 - R0) - 40) * 12 / 99), len = (3 * (bays + 1) + 96 * bays) / 12
    /* ra flush on the near wall across (its outer face on the wall), rb an aisle off it, both from the
       near wall along; past their far end a strip `G` feet deep, then a zone to the far wall across
       the whole floor. The aisle between them opens only onto that strip. */
    const build = (G) => {
      m.useCanvasStore.setState({ objects: s().objects.filter(o => !RACK.has(o.type) && !o.type.startsWith('zone_') && o.type !== 'aisle') })
      const rowAt = (sv, id) => {
        const base = { id, type: 'rack_double_row', beams: Array(bays).fill(96), uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, levels: 4, parentId: fp.id, layerId: 'racking' }
        const p = rs(fp, R0, sv)
        return vert
          ? { ...base, rotation: 90, x: p.x + d * GS / 2 - len * GS / 2, y: p.y + len * GS / 2 - d * GS / 2, width: len * GS, height: d * GS }
          : { ...base, rotation: 0, x: p.x, y: p.y, width: len * GS, height: d * GS }
      }
      s().addObject(rowAt(S0, 'ra')); s().addObject(rowAt(S0 + d + 10.5, 'rb'))
      const z = rsBox(fp, R0 + len + G, R1, S0, S1)
      s().addObject({ type: 'zone_staging', label: 'Staging', x: z.x, y: z.y, width: z.w, height: z.h, parentId: fp.id, layerId: 'zones' })
    }
    const cut = (travelFt) => m.AA.cutOffRacks(s().objects, fp, { gridSize: GS, travelFt, aisleFt: 10.5 }).cutOff.map(c => c.id).sort()
    build(8); expect(cut(8)).toEqual([])
    build(6); expect(cut(8)).toEqual(['ra']); expect(cut(6)).toEqual([])
    expect(m.LC.checkLayout(s().objects, { gridSize: GS, profile: m.MHE_PROFILES.reach }).errors.some(e => e.kind === 'no-way-in')).toBe(true)
    expect(m.LC.checkLayout(s().objects, { gridSize: GS, profile: m.MHE_PROFILES.vna }).errors.some(e => e.kind === 'no-way-in')).toBe(false)
  })

  /* ── 2. A far edge on a wall ── */

  /** An area across the whole run whose near edge is open and whose far edge (across the rows) is
   *  `farOff` feet short of the far wall; its depth leaves 15' after the last whole pair — the next
   *  pair's near half fits, 1' off the edge. Dragged from the near edge. */
  const farArea = (type, w, h, farOff, past = 0) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = fpNow(), ib = innerBox(fp)
    const edge = (vert ? ib.x + ib.w : ib.y + ib.h) - farOff * GS
    const depth = (3.5 + 10.5 + 7.75 + 18.25 * 3 + 15) * GS          // the start single, pairs, 15' left
    const near = edge - depth, F = edge + past * GS                     // `past`: the drag ends that far beyond the edge
    if (vert) drag({ x: near, y: ib.y - 20 }, { x: F, y: ib.y + ib.h + 20 })
    else drag({ x: ib.x - 20, y: near }, { x: ib.x + ib.w + 20, y: F })
    return { fp, F }
  }
  const sOf = (r) => { const f = foot(r); return vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
  const rOf = (r) => { const f = foot(r); return vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }

  it.each(SHAPES)('AA-far-wall (%s): a racking area whose far edge lies on the wall\'s inner face ends with a single row flush against the wall — at least an aisle off the last row; shrink → extend back identical; clean', (_, type, w, h) => {
    const { F } = farArea(type, w, h, 0)
    const flush = racks().filter(r => Math.abs(sOf(r)[1] - F) < EPS)
    expect(flush.length).toBeGreaterThan(0)
    for (const r of flush) {
      expect(r.type).toBe('rack_row')
      expect(sOf(r)[1] - sOf(r)[0]).toBeCloseTo(3.5 * GS, 6)
      // the row before it, across: at least a forklift aisle off
      const before = racks().filter(q => q !== r && Math.min(rOf(q)[1], rOf(r)[1]) - Math.max(rOf(q)[0], rOf(r)[0]) > EPS && sOf(q)[1] <= sOf(r)[0] + EPS)
      const gap = sOf(r)[0] - Math.max(...before.map(q => sOf(q)[1]))
      expect(gap).toBeGreaterThanOrEqual(10.5 * GS - EPS)
    }
    expect(check().errors).toEqual([])
    const keys = rackKeys(), a = areaNow(), b0 = { x: a.x, y: a.y, w: a.width, h: a.height }
    const resize = (box) => { const o = { x: areaNow().x, y: areaNow().y, w: areaNow().width, h: areaNow().height }; s().updateObject(areaNow().id, { x: box.x, y: box.y, width: box.w, height: box.h }); m.AT.finishAreaResize(m.useCanvasStore, areaNow().id, o) }
    resize(vert ? { ...b0, w: b0.w - 6 * GS } : { ...b0, h: b0.h - 6 * GS })      // the far edge pulled in off the wall
    expect(racks().filter(r => Math.abs(sOf(r)[1] - F) < EPS)).toHaveLength(0)
    resize(b0)
    expect(rackKeys()).toEqual(keys)
  })

  it.each(SHAPES)('AA-far-past (%s): the box dragged 3\x27 past the far wall (as a mouse does) — the far edge counts as on the wall\x27s inner face, and ends with the single flush against it', (_, type, w, h) => {
    const { F } = farArea(type, w, h, 0, 3)
    const face = F - 3 * GS                                               // the wall's inner face
    const flush = racks().filter(r => Math.abs(sOf(r)[1] - face) < EPS)
    expect(flush.length).toBeGreaterThan(0)
    for (const r of flush) expect(r.type).toBe('rack_row')
    expect(check().errors).toEqual([])
  })

  it.each(SHAPES)('AA-far-open (%s): the same area with its far edge 2\x27 short of the wall (open floor) keeps the regular pattern\x27s leftover — the cut pair\x27s near half where the pattern has it (1\x27 off the edge), nothing flush on the edge', (_, type, w, h) => {
    const { F } = farArea(type, w, h, 2)
    expect(racks().length).toBeGreaterThan(2)
    expect(racks().filter(r => Math.abs(sOf(r)[1] - F) < EPS)).toHaveLength(0)
    const last = racks().filter(r => Math.abs(sOf(r)[1] - (F - GS)) < EPS)
    expect(last.length).toBeGreaterThan(0)
    for (const r of last) expect(r.type).toBe('rack_row')
    expect(check().errors).toEqual([])
  })

})
