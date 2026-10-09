// Area CX — cross-aisle width labels from the per-line cross-aisles Check layout measures (sectionCrossAisles),
// wall rows ignored. One cross-aisle = the lines sharing a gap; its label repeats about every 75 ft along it, each
// reading the narrowest of its own lines, red on its own lines by failingCrossAisles, on clear floor (no rack, no
// zone; a stretch with none gets no label). A building with no section stamps keeps the old merged-envelope labels.
// The fixture's four fills (none had a cross-aisle label before), four Generate layouts, both orientations.
import { describe, it, expect } from 'vitest'
import { GS, splitWallRows } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize, planAreaCreate } from '../../generate/rackingArea'
import { rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { checkLayout } from '../../utils/layoutCheck'
import { aisleLabelOps } from '../../render/labelOps'
import { labelScale } from '../../render/labelSize'
import { generateAndPlace } from '../../generate/traceGenerate'
import * as RG from '../../utils/rowGroup'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

const REACH = MHE_PROFILES.reach
const BEAM = new Set(['rack_row', 'rack_double_row'])
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
function fillOf(turned, orientation, stored) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })).map(o => (turned ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area')
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  return stored ? planAreaResize(objs, area.id, box, { gridSize: GS }) : planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
/** The layout as saved, vertical; turned for horizontal rows. */
function savedFill(vert) {
  const out = fillOf(false, 'vertical', true)
  if (vert) return out
  return out.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
}
async function generated(spec) {
  const store = (await import('../../store/useCanvasStore')).useCanvasStore
  store.setState({ objects: [], groups: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  generateAndPlace({ gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', dockDoors: 0, ...spec })
  return store.getState().objects
}
const sorted = (ls) => [...ls].sort((a, b) => a.gapLo - b.gapLo || a.positions[0] - b.positions[0])
/** [text, gapLo ft, gapHi ft, position across ft] per label, in run order */
const read = (ls) => sorted(ls).map(l => [l.text, l.gapLo / GS, l.gapHi / GS, l.positions[0] / GS])
function expectLabels(ls, want, digits = 2) {
  const got = read(ls)
  expect(got.map(g => g[0])).toEqual(want.map(w => w[0]))
  got.forEach((g, i) => { for (let j = 1; j < 4; j++) expect(g[j]).toBeCloseTo(want[i][j], digits) })
}
const runOf = (o) => { const f = rackFootprint(o); return f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
const crossOf = (o) => { const f = rackFootprint(o); return f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }

const STRETCH = (gap, at) => at.map(p => [gap[0], gap[1], gap[2], p])
describe('CX-fills', () => {
  // a label about every 75 ft along each cross-aisle; the office stretch (lines whose rows stop at the office) has none
  const ELEVEN = [
    // the new fills take the 3" wall clearance (BUG 76; flush before: -75.625 / -5.375 / 64.875, -71.5 / 7 / 85.5, -12.375 / 62.542)
    ...STRETCH([`11' 2"`, -131.106, -119.904], [-75.75, -6.25, 63.25]),
    ...STRETCH([`11' 2"`, -12.404, -1.202], [-71.333, 7.0, 85.333]),
    ...STRETCH([`11' 2"`, 122.798, 134.0], [-13.25, 60.917]),
  ]
  it.each([
    ['as saved, vertical', false, 'vertical', true, STRETCH([`16' 8"`, -7.631, 9.0], [-194.534, -117.892, -41.249, 35.393, 112.036, 188.679])],
    ['as saved, horizontal', false, 'horizontal', false, ELEVEN],
    ['turned, vertical', true, 'vertical', false, ELEVEN],
    // (flush before: -197.204 / -120.111 / -43.018 / 34.075 / 111.168 / 188.26)
    ['turned, horizontal', true, 'horizontal', false, STRETCH([`16' 8"`, -7.631, 9.0], [-196.974, -119.923, -42.872, 34.179, 111.23, 188.281])],
  ])('CX-fills (%s): a label about every 75 ft along each cross-aisle from the per-line gaps (it had none — its wall rows merged every section), each reading the narrowest of its lines; no arrow or pill on a rack or zone; no label on the office stretch', (_, turned, orientation, stored, want) => {
    const out = fillOf(turned, orientation, stored)
    const ls = crossAisleLabels(out, GS, { profile: REACH })
    expectLabels(ls, want)
    expect(ls.every(l => l.level === 3)).toBe(true)
    expect(checkLayout(out, { gridSize: GS }).errors.filter(e => e.kind === 'cross-aisle')).toEqual([])
    expect(onObstacle(out, ls, 'medium')).toEqual([])
  })
})

/** The labels whose arrow or pill (at a Label size) touches a rack or a zone. */
function onObstacle(objs, ls, size) {
  const obst = objs.filter(o => typeof o.type === 'string' && (o.type.startsWith('rack_') || o.type.startsWith('zone_')))
    .map(o => (o.type.startsWith('rack_') ? rackFootprint(o) : { x: o.x, y: o.y, w: o.width, h: o.height }))
  const E = 1e-6, hit = (a, b) => a.x < b.x + b.w - E && b.x < a.x + a.w - E && a.y < b.y + b.h - E && b.y < a.y + a.h - E
  const lz = labelScale(size, GS)
  return ls.filter(l => {
    const ops = aisleLabelOps(l, lz), pill = ops.find(o => o.op === 'rect'), line = ops.find(o => o.op === 'line').points
    const arrow = { x: Math.min(line[0], line[2]) - 1, y: Math.min(line[1], line[3]) - 1, w: Math.abs(line[2] - line[0]) + 2, h: Math.abs(line[3] - line[1]) + 2 }
    return obst.some(o => hit(pill, o) || hit(arrow, o))
  }).map(l => l.text + ' at ' + (l.positions[0] / GS).toFixed(2))
}

describe('CX-generate', () => {
  // the wall rows run past the cross-aisles (BUG 70), so each cross-aisle spans the interior lines only: 3 stretches
  // of 70.583 ft centred at -75.208 / -4.625 / 65.958 (before: -83 / 0 / 83, 83 ft)
  const C9 = [-75.20833333333333, -4.625, 65.95833333333333]
  const NINE = [...STRETCH([`9' 3"`, -142, -132.75], C9), ...STRETCH([`9' 3"`, -0.5, 8.75], C9), ...STRETCH([`9' 3"`, 124.5, 133.75], C9)]
  // 4 stretches of 66.875 ft centred at -102.0625 / -35.1875 / 31.6875 / 98.5625 (before: -112.125 / -37.375 / 37.375 / 112.125)
  const C11 = [-102.0625, -35.1875, 31.6875, 98.5625]
  const ELEVEN = [...STRETCH([`11' 2"`, -77.25, -66.125], C11), ...STRETCH([`11' 2"`, 66.125, 77.25], C11)]
  it.each([
    ['250x500 vertical', { lengthFt: 250, widthFt: 500, orientation: 'vertical' }, NINE],
    ['500x250 horizontal', { lengthFt: 500, widthFt: 250, orientation: 'horizontal' }, NINE],
    ['300x420 vertical', { lengthFt: 300, widthFt: 420, orientation: 'vertical' }, ELEVEN],
    ['420x300 horizontal', { lengthFt: 420, widthFt: 300, orientation: 'horizontal' }, ELEVEN],
  ])('CX-generate (%s): a Generate layout\'s cross-aisles each get a label about every 75 ft, evenly spaced across the interior rows (3 × 70.583 ft / 4 × 66.875 ft — the wall rows run past them), the same gaps and readings as before', async (_, spec, want) => {
    expectLabels(crossAisleLabels(await generated(spec), GS, { profile: REACH }), want, 6)
  })
  it.each([['vertical', true], ['horizontal', false]])('CX-clear (%s): at Extra large every label still sits on clear floor — a label longer than its gap slides along the cross-aisle into the nearest row aisle, within its own stretch; one that fits stays at its centre', async (_, vert) => {
    const gen = await generated({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, orientation: vert ? 'vertical' : 'horizontal' })
    const lz = labelScale('xlarge', GS)
    const ls = sorted(crossAisleLabels(gen, GS, { profile: REACH, lz }))
    expect(ls.length).toBe(9)
    expect(onObstacle(gen, ls, 'xlarge')).toEqual([])
    const C = [-75.20833333333333, -4.625, 65.95833333333333]
    const moved = ls.filter(l => !C.some(c => Math.abs(l.positions[0] / GS - c) < 1e-6))
    // the stretches are 70.583 ft wide; a slid label stays inside its own
    for (const l of moved) expect(Math.min(...C.map(c => Math.abs(l.positions[0] / GS - c)))).toBeLessThanOrEqual(70.58333333333333 / 2 + 1e-6)
    expect(moved.length).toBe(vert ? 0 : 3)                  // before BUG 70: 0 / 6
    // at the default size nothing needed to move
    expect(onObstacle(gen, crossAisleLabels(gen, GS, { profile: REACH }), 'medium')).toEqual([])
  })
})

describe.each([['vertical', true], ['horizontal', false]])('CX — %s', (_, vert) => {
  /** The layout as saved: one rack beside its cross-aisle moved along its line so that line's gap is `ft`. */
  function narrowed(ft) {
    const base = savedFill(vert)
    const [L] = crossAisleLabels(base, GS)
    const beside = base.filter(o => BEAM.has(o.type) && Math.abs(runOf(o)[1] - L.gapLo) < 1e-6).sort((a, b) => crossOf(a)[0] - crossOf(b)[0])
    const mover = beside[Math.floor(beside.length / 2)]
    const out = base.map(o => (o.id === mover.id ? RG.movedAlong(o, (L.gapHi - L.gapLo) - ft * GS) : o))
    return { out, mover, wide: L }
  }
  it.each([
    [8.0, 3, `8'`, false],
    [7.9995, 3, `8'`, false],
    [7.99, 1, `7' 11"`, true],
  ])('CX-one: a row grown into the cross-aisle, its line at %s ft — only the label nearest it reads that line (level %s, %s), red exactly when Check layout lists the cross-aisle; the other five stay 16\' 8"', (ft, level, text, listed) => {
    const { out, mover, wide } = narrowed(ft)
    const ls = sorted(crossAisleLabels(out, GS, { profile: REACH }))
    expect(ls.length).toBe(6)
    const changed = ls.filter(l => l.text !== wide.text)
    expect(changed.length).toBe(1)
    const [l] = changed
    expect([l.level, l.text]).toEqual([level, text])
    expect(l.gapHi - l.gapLo).toBeCloseTo(ft * GS, 6)
    // the nearest label: its stretch holds the grown line (at 0 across) — at its centre, 35.393 ft, unless the
    // gap is shorter than its pill along the run (horizontal, the 7' 11" pill), when it slides into the nearest row aisle
    expect(l.positions[0] / GS).toBeCloseTo(!vert && listed ? 31.15 : 35.393, 2)
    expect(ls.filter(x => x !== l).every(x => x.level === 3 && x.text === `16' 8"`)).toBe(true)
    const items = checkLayout(out, { gridSize: GS, profile: REACH }).errors.filter(e => e.kind === 'cross-aisle' && e.ids.includes(mover.id))
    expect(items.length > 0).toBe(listed)
    if (listed) expect(items[0].text).toContain(`: ${text}, needs 8' to drive`)
    void mover
  })
  it('CX-split: a rack standing across between two lines of the cross-aisle — the two sides are separate cross-aisles: one label left of it, six to its right, all reading the gap', () => {
    const base = savedFill(vert)
    const [L] = crossAisleLabels(base, GS)
    const beside = base.filter(o => BEAM.has(o.type) && Math.abs(runOf(o)[1] - L.gapLo) < 1e-6).sort((a, b) => crossOf(a)[0] - crossOf(b)[0])
    // two lines next to each other with a row aisle between them wide enough for a copy of the first
    const i = beside.findIndex((a, j) => j + 1 < beside.length && crossOf(beside[j + 1])[0] - crossOf(a)[1] > (crossOf(a)[1] - crossOf(a)[0]) + 0.5 * GS)
    expect(i, 'a row aisle that fits a rack').toBeGreaterThanOrEqual(0)
    const a = beside[i], b = beside[i + 1], depth = crossOf(a)[1] - crossOf(a)[0], r = runOf(a)
    const at = crossOf(a)[1] + (crossOf(b)[0] - crossOf(a)[1] - depth) / 2
    const blocker = RG.movedAlong(RG.movedAcross({ ...a, id: 'blocker' }, at - crossOf(a)[0]), (L.gapLo + L.gapHi) / 2 - (r[0] + r[1]) / 2)
    const ls = [...crossAisleLabels([...base, blocker], GS, { profile: REACH })].sort((p, q) => p.positions[0] - q.positions[0])
    expect(ls.map(l => l.text)).toEqual(Array(7).fill(L.text))
    const mid = (crossOf(blocker)[0] + crossOf(blocker)[1]) / 2
    expect(ls.map(l => (l.positions[0] < mid ? 'left' : 'right'))).toEqual(['left', ...Array(6).fill('right')])
    expect(ls.map(l => l.positions[0] / GS).map(v => Math.round(v * 100) / 100)).toEqual([-228.98, -177.81, -104.2, -30.6, 43, 116.6, 190.2])
  })
  it('CX-zone: a zone standing on a label\'s spot pushes that label to the nearest clear floor in its stretch; where a stretch has none (the office in the horizontal fills) there is no label', () => {
    const base = savedFill(vert)
    const ls = sorted(crossAisleLabels(base, GS))
    const target = ls[3]                                        // the stretch centred at 35.393 across
    const rot = target.isHoriz, c = target.positions[0], m = target.labelMid
    const zone = { id: 'z', type: 'zone_staging', x: rot ? c - 2 * GS : m - 2 * GS, y: rot ? m - 2 * GS : c - 2 * GS, width: 4 * GS, height: 4 * GS }
    const after = sorted(crossAisleLabels([...base, zone], GS))
    expect(after.length).toBe(6)
    const moved = after.filter((l, j) => Math.abs(l.positions[0] - ls[j].positions[0]) > 1e-6)
    expect(moved.length).toBe(1)
    expect(Math.abs(moved[0].positions[0] - c)).toBeGreaterThan(2 * GS)
    expect(Math.abs(moved[0].positions[0] - c) / GS).toBeLessThan(76.6 / 2)
    expect(onObstacle([...base, zone], after, 'medium')).toEqual([])
    // the office stretch: the horizontal fill's third cross-aisle has 2 labels, not 3
    const fill = fillOf(false, 'horizontal', false)
    const office = fill.find(o => o.type === 'zone_office')
    const third = crossAisleLabels(fill, GS).filter(l => Math.abs(l.gapLo / GS - 122.798) < 1e-3)
    expect(third.length).toBe(2)
    const ox = [office.y, office.y + office.height]
    expect(third.every(l => l.positions[0] < ox[0] || l.positions[0] > ox[1])).toBe(true)
  })
  it('CX-hand: a building with no section stamps (racks placed by hand) keeps the old labels — a Generate layout with its stamps stripped still shows its three cross-aisles', async () => {
    const gen = await generated({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, orientation: vert ? 'vertical' : 'horizontal' })
    // placed by hand: no section stamps, and the wall rows in pieces like the rows beside them
    const hand = splitWallRows(gen).map(o => { const { genSection, ...rest } = o; return rest })
    expect(hand.some(o => o.genSection != null)).toBe(false)
    expectLabels(crossAisleLabels(hand, GS, { profile: REACH }), [[`9' 3"`, -142, -132.75, 0], [`9' 3"`, -0.5, 8.75, 0], [`9' 3"`, 124.5, 133.75, 0]], 6)
  })
})

describe('CX-wire', () => {
  it('CX-wire: the canvas, the clearance labels\' boxes and the PDF pass their Label size, so a label sits on clear floor at the size it is drawn', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/canvas2/DimensionLabels.jsx', 'utf8')).toMatch(/crossAisleLabels\(objects, gridSize, \{ profile, lz \}\)/)
    expect(readFileSync('src/render/labelOps.js', 'utf8')).toMatch(/crossAisleLabels\(objects, gridSize, \{ profile, lz \}\)/)
    expect(readFileSync('src/export/pdfExport.js', 'utf8')).toMatch(/crossAisleLabels\(objects, gridSize, \{ profile: warnProfile, lz \}\)/)
  })
})
