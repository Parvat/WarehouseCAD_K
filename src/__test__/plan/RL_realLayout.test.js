// Area RL — the hand-check layout (realLayout.fixture.js: 500 × 250, a column grid, an office and a
// washroom on the top wall, a custom area on the bottom wall, the racking area as saved — its box
// 2.89' short of the left wall and 1.37' short of the top). Area AA's three corrections on it:
//   1. A wall row runs unbroken — the start wall's too: a box edge within a rack's depth (3' 6") of a
//      wall counts as on it, and a pattern anchored short of the wall still puts its wall row on it.
//   2. A pocket's shortened rows sit tight against the building wall; the leftover goes to the lane
//      on the zone's side.
//   3. No cross-aisle gap that leads nowhere: a row whose cross-aisle runs on beside a zone (or a
//      wall) runs on to it by whole bays, while every rack keeps a way in.
// The layout four ways: as saved, filled vertical (the saved area and its stored pattern) and
// horizontal (a new area over the same box); and turned 90° (x and y swapped), filled each way — the
// turned layout filled vertical is the saved one filled horizontal, rotated: 2 and 3 show in both.
// And on three buildings: the rectangle as saved, an L (the bottom-left 150' × 80' cut away) and a T
// (both bottom corners cut away) — the office, its pocket and the cross-aisle beside it unchanged.
import { describe, it, expect, vi } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const RA = await import('../../generate/rackingArea')
  const FR = await import('../../generate/fillRacking')
  const LC = await import('../../utils/layoutCheck')
  const AA = await import('../../generate/aisleAccess')
  const { rackFootprint } = await import('../../generate/columnCheck')
  return { RA, FR, LC, AA, rackFootprint }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-3
/** The layout turned 90°: x and y swapped (a mirror on the diagonal — the top-left corner stays put). */
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
/** The building's outline: as saved, or with bottom corners cut away (feet off its corner). */
const SHAPE_CUTS = { rectangle: [], L: ['bl'], T: ['bl', 'br'] }
const shaped = (fp, cuts) => {
  if (!cuts.length) return fp
  const X = (ft) => fp.x + ft * GS, Y = (ft) => fp.y + ft * GS, W = fp.width / GS, H = fp.height / GS
  const v = [[0, 0], [W, 0]]
  if (cuts.includes('br')) v.push([W, 170], [W - 150, 170], [W - 150, H]); else v.push([W, H])
  if (cuts.includes('bl')) v.push([150, H], [150, 170], [0, 170]); else v.push([0, H])
  return { ...fp, fpVerts: v.map(([x, y]) => ({ x: X(x), y: Y(y) })) }
}
const CASES = [
  ['as saved, vertical — the saved area refit with its stored pattern', false, 'vertical', true],
  ['as saved, horizontal — a new area over the same box', false, 'horizontal', false],
  ['turned 90°, vertical — a new area', true, 'vertical', false],
  ['turned 90°, horizontal — a new area', true, 'horizontal', false],
]

describe.each(Object.keys(SHAPE_CUTS).flatMap(shape => CASES.map(c => [`${shape}: ${c[0]}`, shape, ...c.slice(1)])))('RL — %s', (_, shape, turned, orientation, stored) => {
  const vert = orientation === 'vertical'
  // the pocket and the cross-aisle beside the office: the layout's horizontal fill, or the turned one filled vertical
  const corrections23 = turned === vert
  /** Fill the layout: the objects, the area, its racks and the building. */
  const fill = async (boxCut = null) => {
    const m = await fresh()
    const objs = REAL_LAYOUT.map(o => (o.type.startsWith('fp_') ? shaped(o, SHAPE_CUTS[shape]) : { ...o })).map(o => (turned ? turn(o) : o))
    const area = objs.find(o => o.type === 'racking_area'), fp = objs.find(o => o.type.startsWith('fp_'))
    const box = { x: area.x, y: area.y, w: area.width, h: area.height }
    let out
    if (stored) out = m.RA.planAreaResize(objs, area.id, box, { gridSize: GS })
    else {
      const made = m.RA.planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } })
      out = made.objects
    }
    return { m, out, fp, box, areaId: (out.find(o => o.type === 'racking_area') || area).id }
  }
  const view = (m, fp) => {
    const rs = (f) => (vert ? { s0: (f.x - fp.x) / GS, s1: (f.x + f.w - fp.x) / GS, r0: (f.y - fp.y) / GS, r1: (f.y + f.h - fp.y) / GS }
      : { s0: (f.y - fp.y) / GS, s1: (f.y + f.h - fp.y) / GS, r0: (f.x - fp.x) / GS, r1: (f.x + f.w - fp.x) / GS })
    return { rs, rack: (o) => ({ o, ...rs(m.rackFootprint(o)) }), zone: (o) => ({ o, ...rs({ x: o.x, y: o.y, w: o.width, h: o.height }) }) }
  }
  // the wall clearance (BUG 76): a new area takes the default 3" off the wall's inner face; the saved area was made
  // before it and stays flush
  const clearFt = stored ? 0 : 3 / 12
  const keys = (list) => list.filter(o => RACK.has(o.type)).map(o => [o.type, Math.round(o.x * 1e3), Math.round(o.y * 1e3), Math.round(o.width * 1e3), o.rotation || 0, o.beams.join('/'), o.rowIndex, o.genSection].join(':')).sort()

  it('RL-1: the start wall\'s single sits on the wall — at the wall clearance (3", flush for the saved area) — although the box stops short of it, and every wall row runs unbroken — a gap in one only where a zone stands on that wall', async () => {
    const { m, out, fp } = await fill()
    const v = view(m, fp), racks = out.filter(o => RACK.has(o.type)).map(v.rack)
    const zones = out.filter(o => o.type.startsWith('zone_')).map(v.zone)
    const sMax = (vert ? fp.width : fp.height) / GS - 0.25
    const inner = m.FR.innerOutline(fp, GS)
    const onFloor = (r, sv) => { const px = fp.x + (vert ? sv : r) * GS, py = fp.y + (vert ? r : sv) * GS; let c = false; for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) { const P = inner[i], Q = inner[j]; if ((P.y > py) !== (Q.y > py) && px < (Q.x - P.x) * (py - P.y) / (Q.y - P.y) + P.x) c = !c } return c }
    for (const face of [0.25 + clearFt, sMax - clearFt]) {
      const wall = racks.filter(q => Math.abs(q.s0 - face) < EPS || Math.abs(q.s1 - face) < EPS).sort((a, b) => a.r0 - b.r0)
      expect(wall.length, `a wall row on the face at ${face}'`).toBeGreaterThan(0)
      for (const q of wall) expect(q.o.type).toBe('rack_row')
      // between two of its racks, always a zone standing on that wall
      for (let i = 1; i < wall.length; i++) {
        const g0 = wall[i - 1].r1, g1 = wall[i].r0
        const zoneThere = zones.some(z => Math.min(z.r1, g1) - Math.max(z.r0, g0) > EPS && (z.s0 <= face + 3.5 + EPS && z.s1 >= face - 3.5 - EPS))
        // (or the floor doesn't reach that face there: a corner cut away)
        const inward = face < 1 ? face + 1.75 : face - 1.75
        const offFloor = [0.25, 0.5, 0.75].some(t => !onFloor(g0 + (g1 - g0) * t, inward))
        expect(zoneThere || offFloor, `the wall row at ${face}' breaks at ${g0.toFixed(2)}–${g1.toFixed(2)}' only for a zone or the floor's end`).toBe(true)
      }
    }
    // and the rows themselves have cross-aisles the wall rows run through
    const pairs = racks.filter(q => q.o.type === 'rack_double_row')
    expect(new Set(pairs.map(q => q.r0.toFixed(2))).size).toBeGreaterThan(1)
  })

  it(`RL-2: ${corrections23 ? 'the pocket beside the office' : 'no pocket here'} — its shortened rows end at the building wall (its clearance: 3" for a new area, on it for the saved one), the leftover all in the lane on the office side (at least the travel width, under one more bay past it)`, async () => {
    const { m, out, fp } = await fill()
    const v = view(m, fp), racks = out.filter(o => RACK.has(o.type)).map(v.rack)
    const office = v.zone(out.find(o => o.type === 'zone_office'))
    // where the rows stop at the far run wall: its inner face, less the wall clearance (BUG 76 follow-up: the run ends keep it too)
    const rMax = (vert ? fp.height : fp.width) / GS - 0.25 - clearFt
    // (the wall row on the start wall is item 1's: one rack on the pattern's grid, not a shortened pocket row)
    const sMax = (vert ? fp.width : fp.height) / GS - 0.25
    const pocket = racks.filter(q => Math.min(q.s1, office.s1) - Math.max(q.s0, office.s0) > EPS && q.r0 >= office.r1 - EPS && Math.abs(q.s0 - 0.25 - clearFt) > EPS && Math.abs(q.s1 - sMax + clearFt) > EPS)
    if (!corrections23) { expect(pocket.every(q => q.r1 <= rMax + EPS)).toBe(true); return }
    expect(pocket.length).toBeGreaterThanOrEqual(3)
    for (const q of pocket) {
      expect(q.r1, 'tight on the wall').toBeCloseTo(rMax, 6)
      const lane = q.r0 - office.r1
      expect(lane, 'the lane: at least the travel width').toBeGreaterThanOrEqual(8 - EPS)
      expect(lane, 'and under one more bay past it').toBeLessThan(8 + 99 / 12)
    }
  })

  it(`RL-3: ${corrections23 ? 'the cross-aisle beside the office' : 'no cross-aisle beside a zone here'} — a row that stops at a cross-aisle with the office past it runs on to within a bay of the office; where racks stand past the cross-aisle the gap stays`, async () => {
    const { m, out, fp } = await fill()
    const v = view(m, fp), racks = out.filter(o => RACK.has(o.type)).map(v.rack)
    const zones = out.filter(o => o.type.startsWith('zone_')).map(v.zone)
    const office = v.zone(out.find(o => o.type === 'zone_office')), pitch = 99 / 12
    // every rack beside the office that ends short of it: within a bay of it, or a zone or a rack between
    const beside = racks.filter(q => Math.min(q.s1, office.s1) - Math.max(q.s0, office.s0) > EPS && q.r1 <= office.r0 + EPS && q.r1 > office.r0 - 40)
    let ranOn = 0
    for (const q of beside) {
      const between = [...zones, ...racks].some(b => b !== q && Math.min(b.s1, q.s1) - Math.max(b.s0, q.s0) > EPS && b.r0 >= q.r1 - 0.25 - EPS && b.r1 <= office.r0 + EPS && b.o !== office.o)
      if (between) continue
      expect(office.r0 - q.r1, `the rack across ${q.s0.toFixed(2)}' runs on to within a bay of the office`).toBeLessThan(pitch)
      ranOn++
    }
    if (corrections23) {
      expect(ranOn, 'rows ran on across the cross-aisle to the office').toBeGreaterThanOrEqual(2)
      // below the office, racks on both sides of the cross-aisle: the gap stays
      const below = racks.filter(q => q.s0 >= office.s1 - EPS)
      // (and that cross-aisle starts before where the rows beside the office now end: they ran on across it)
      const reach = Math.min(...beside.filter(q => office.r0 - q.r1 < pitch).map(q => q.r1))
      const gapKept = below.some(a => below.some(b => Math.abs(a.s0 - b.s0) < EPS && b.r0 - a.r1 >= 10.5 - EPS && b.r0 - a.r1 < 12 && a.r1 < reach - EPS && b.r0 > office.r0 - 10))
      expect(gapKept, 'the cross-aisle kept between racks').toBe(true)
    }
  })

  /** The lanes the way-in step cut for the area in `out` (its pattern refit from those objects): each
   *  { r: [along], s: [across] } in feet off the building's corner — exactly the strip it carved. */
  const wayInLanes = (m, out, fp) => {
    const a = out.find(o => o.type === 'racking_area'), report = []
    m.FR.patternFill(out.filter(o => !(RACK.has(o.type) && o.areaId === a.id)), { x: a.x, y: a.y, w: a.width, h: a.height }, a.pattern, { gridSize: GS, report })
    const offR = vert ? fp.y : fp.x, offS = vert ? fp.x : fp.y
    return report.map(q => ({ r: q.at.map(v => (v - offR) / GS), s: q.across.map(v => (v - offS) / GS) }))
  }
  /** Where a pair stops and a half of it carries on: every half within a bay of its pair that does NOT
   *  start (or end) on the pair's frame — an empty bay between them — unless that gap is exactly a
   *  way-in lane the fill cut. */
  const holesBesidePairs = (racks, lanes) => {
    const up = 3 / 12, pitch = 99 / 12, out = []
    const inLane = (g0, g1, q) => lanes.some(l => l.r[0] <= g0 + EPS && l.r[1] >= g1 - EPS && l.s[0] <= q.s0 + EPS && l.s[1] >= q.s1 - EPS)
    let found = 0
    for (const q of racks.filter(x => x.o.type === 'rack_row')) {
      for (const p of racks.filter(x => x.o.type === 'rack_double_row' && x.o.rowIndex === q.o.rowIndex && x.s0 <= q.s0 + EPS && x.s1 >= q.s1 - EPS)) {
        if (q.r0 > p.r1 - up - EPS && q.r0 < p.r1 + pitch) { found++; if (Math.abs(q.r0 - (p.r1 - up)) > 1e-6 && !inLane(p.r1, q.r0, q)) out.push(`single at ${q.s0.toFixed(2)}' starts ${q.r0.toFixed(2)}', the pair ends ${p.r1.toFixed(2)}'`) }
        if (q.r1 < p.r0 + up + EPS && q.r1 > p.r0 - pitch) { found++; if (Math.abs(q.r1 - (p.r0 + up)) > 1e-6 && !inLane(q.r1, p.r0, q)) out.push(`single at ${q.s0.toFixed(2)}' ends ${q.r1.toFixed(2)}', the pair starts ${p.r0.toFixed(2)}'`) }
      }
    }
    return { holes: out, found }
  }

  it(`RL-4: ${corrections23 ? 'the row under the washroom' : 'every row'} — where a pair stops but one half still has room (a zone over the other half only), that half carries on from the pair's last frame: no empty bay between them`, async () => {
    const { m, out, fp } = await fill()
    const v = view(m, fp), racks = out.filter(o => RACK.has(o.type)).map(v.rack)
    const { holes, found } = holesBesidePairs(racks, wayInLanes(m, out, fp))
    expect(holes).toEqual([])
    if (corrections23) expect(found, 'a half carrying on from its pair (under the washroom)').toBeGreaterThan(0)
  })

  if (corrections23) it('RL-4-hole: an empty bay beside a pair that is NOT a lane still fails — the half carrying on from the pair under the washroom shortened by its first bay by hand: a hole is reported', async () => {
    const { m, out, fp } = await fill()
    const v = view(m, fp), racks = out.filter(o => RACK.has(o.type)).map(v.rack), pitchPx = 99 / 12 * GS
    const lanes = wayInLanes(m, out, fp)
    expect(holesBesidePairs(racks, lanes).holes).toEqual([])
    // the single that starts on a pair's last frame: drop its first bay (it now starts a bay later)
    const pairEnds = racks.filter(x => x.o.type === 'rack_double_row')
    const q = racks.find(x => x.o.type === 'rack_row' && x.o.beams.length > 1 && pairEnds.some(p => p.o.rowIndex === x.o.rowIndex && Math.abs(x.r0 - (p.r1 - 0.25)) < 1e-6))
    expect(q, 'a half carrying on from its pair').toBeTruthy()
    const o = q.o, shorter = vert ? { ...o, y: o.y + pitchPx / 2, x: o.x + pitchPx / 2, width: o.width - pitchPx, beams: o.beams.slice(1) } : { ...o, x: o.x + pitchPx, width: o.width - pitchPx, beams: o.beams.slice(1) }
    const edited = out.map(x => (x === o ? shorter : x)).filter(x => RACK.has(x.type)).map(v.rack)
    expect(holesBesidePairs(edited, lanes).holes.length).toBeGreaterThan(0)
  })

  /** The pocket's way in below the office, at the far run wall (the hand check's row 6): the pair just
   *  below the office's corner there, the single that row has nearer the office, and the lane cut. */
  const belowOffice = (m, racks, out, fp, lanes) => {
    const v = view(m, fp), office = v.zone(out.find(o => o.type === 'zone_office'))
    // where the rows stop at the far run wall: its inner face, less the wall clearance (BUG 76 follow-up: the run ends keep it too)
    const rMax = (vert ? fp.height : fp.width) / GS - 0.25 - clearFt
    const row = racks.filter(q => q.s0 >= office.s1 - EPS && q.s0 < office.s1 + 6 && q.r1 > office.r1 - 10)
    const pair = row.find(q => q.o.type === 'rack_double_row')
    const single = pair && racks.filter(q => q.o.type === 'rack_row' && q.o.rowIndex === pair.o.rowIndex && q.s0 >= pair.s0 - EPS && q.s1 <= pair.s1 + EPS && q.r1 <= pair.r0 + EPS).sort((x, y) => y.r1 - x.r1)[0]
    const lane = lanes.find(l => pair && l.s[0] <= pair.s0 + EPS && l.s[1] >= pair.s1 - EPS && l.r[1] >= office.r1 - 1 && l.r[0] <= rMax)
    return { office, rMax, pair, single, lane }
  }

  if (corrections23) it('RL-5: the pocket\'s way in, below the office — the lane one bay in from the office\'s edge on the bay grid (a tie with the wall\'s lane, taken on the office\'s side): the pair below the office ends at the building wall (its clearance); the single beside it is whole, its end exactly the travel width (8\') from the pair', async () => {
    const { m, out, fp } = await fill()
    const v = view(m, fp), racks = out.filter(o => RACK.has(o.type)).map(v.rack)
    const { office, rMax, pair, single, lane } = belowOffice(m, racks, out, fp, wayInLanes(m, out, fp))
    expect(pair && single && lane, 'the pair, the single and the lane below the office').toBeTruthy()
    expect(pair.r1, 'the pair on the building wall').toBeCloseTo(rMax, 6)
    expect(pair.r0 - single.r1, 'exactly the travel width between them').toBeCloseTo(8, 6)
    expect(lane.r[0]).toBeCloseTo(single.r1, 6)
    expect(lane.r[1]).toBeCloseTo(pair.r0, 6)
    expect(lane.r[0] - office.r1, 'one bay in from the office\'s edge, not hard against it').toBeGreaterThan(1)
  })

  if (corrections23) it('RL-5-boundary: the travel width read to a thousandth of a foot — at 8\' the lane one bay in (exactly 8\' wide) opens the pocket and is taken; at 8.01\' that gap is 0.01\' short and is no lane: the pocket is opened by the cheapest lane that is — at the 3" wall clearance the one at the far run wall, 8.01\' wide (on the flush layout it was on the office\'s side, one bay further in) — and nothing is cut off at 8.01\'', async () => {
    const { m, out, fp } = await fill()
    const a = out.find(o => o.type === 'racking_area'), base = out.filter(o => !(RACK.has(o.type) && o.areaId === a.id))
    const box = { x: a.x, y: a.y, w: a.width, h: a.height }, v = view(m, fp)
    const run = (travelFt) => {
      const report = [], placed = m.FR.patternFill(base, box, { ...a.pattern, travelFt }, { gridSize: GS, report }).racks, racks = placed.map(v.rack)
      const offR = vert ? fp.y : fp.x, offS = vert ? fp.x : fp.y
      const lanes = report.map(q => ({ r: q.at.map(x => (x - offR) / GS), s: q.across.map(x => (x - offS) / GS), kind: q.kind }))
      return { ...belowOffice(m, racks, out, fp, lanes), lanes, cutOff: m.AA.cutOffRacks([...base, ...placed], fp, { gridSize: GS, travelFt, aisleFt: 10.5 }).cutOff }
    }
    const at8 = run(8), at801 = run(8.01)
    expect(at8.pair.r1).toBeCloseTo(at8.rMax, 6)
    expect(at8.lane.kind).toBe('zone')
    expect(at8.lane.r[1] - at8.lane.r[0], 'exactly 8 ft').toBeCloseTo(8, 6)
    // at 8.01': the 8' gap below the office is no lane; one lane, the cheapest: at the far run wall, 8.01' wide
    // (BUG 76: with the rows 3" off the wall the office-side lane one bay further in costs more bays)
    expect(at801.lanes.map(l => l.kind)).toEqual(['wall'])
    expect(at801.lanes[0].r[1] - at801.lanes[0].r[0]).toBeCloseTo(8.01, 6)
    expect(at801.lanes[0].r[1]).toBeCloseTo(at8.rMax + clearFt, 6)   // the lane runs on to the wall's face, past where the rows stop
    expect(at801.lanes[0].r[0]).toBeGreaterThan(at8.lane.r[1])
    expect(at801.cutOff, 'every rack has a way in at 8.01 ft').toEqual([])
  })

  it('RL-clean: Check layout finds no error; nothing cut off; shrink across and along, then extend back — the same racks', async () => {
    const { m, out, fp, box, areaId } = await fill()
    // (but the uprights the run's walk puts on a column of this grid — flagged, never moved; the dealer resolves
    // them, CANVAS2_BUGLOG BUG 71: Row 7 of section 4 on the flush layout; at the 3" wall clearance Rows 7, 10 and
    // 13 (BUG 76 — the rows sit 3" further in), one column each; with the run ends 3" in too, two columns each on
    // those rows (rectangle, L: 3 → 6; T, Rows 7 and 10: 2 → 4). Any other upright error still fails here)
    const KNOWN = new Set(['Row 7, section 4', 'Row 10, section 4', 'Row 13, section 4'].map(r => r + ': 2 columns stand on upright frames'))
    expect(m.LC.checkLayout(out, { gridSize: GS }).errors.filter(e => !(e.kind === 'upright' && KNOWN.has(e.text)))).toEqual([])
    expect(m.AA.cutOffRacks(out, fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5 }).cutOff).toEqual([])
    const before = keys(out)
    for (const cut of [vert ? { w: box.w - 15.3 * GS } : { h: box.h - 15.3 * GS }, vert ? { h: box.h - 20.3 * GS } : { w: box.w - 20.3 * GS }]) {
      const small = m.RA.planAreaResize(out, areaId, { ...box, ...cut }, { gridSize: GS })
      const back = m.RA.planAreaResize(small, areaId, box, { gridSize: GS })
      expect(keys(back)).toEqual(before)
    }
  })
})
