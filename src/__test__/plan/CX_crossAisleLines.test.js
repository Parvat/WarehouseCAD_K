// Area CX — cross-aisle width labels from the per-line cross-aisles Check layout measures (sectionCrossAisles),
// wall rows ignored: ONE label per cross-aisle (the lines sharing a gap share it), reading the narrowest line,
// red by failingCrossAisles. Generate's layouts come out exactly as before; a building with no section stamps
// keeps the old merged-envelope labels. The fixture's four fills (none had a cross-aisle label), four Generate
// layouts, both orientations.
import { describe, it, expect } from 'vitest'
import { GS } from './fixtures'
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

describe('CX-fills', () => {
  const ELEVEN = [[`11' 2"`, -131.106, -119.904, -5.375], [`11' 2"`, -12.404, -1.202, 7.0], [`11' 2"`, 122.798, 134.0, -12.375]]
  it.each([
    ['as saved, vertical', false, 'vertical', true, [[`16' 8"`, -7.631, 9.0, -2.928]]],
    ['as saved, horizontal', false, 'horizontal', false, ELEVEN],
    ['turned, vertical', true, 'vertical', false, ELEVEN],
    ['turned, horizontal', true, 'horizontal', false, [[`16' 8"`, -7.631, 9.0, -4.472]]],
  ])('CX-fills (%s): the fill gets one label per cross-aisle from the per-line gaps (it had none — its wall rows merged every section), reading the narrowest line, centred across the lines; no arrow or pill on a rack', (_, turned, orientation, stored, want) => {
    const out = fillOf(turned, orientation, stored)
    const ls = crossAisleLabels(out, GS, { profile: REACH })
    expectLabels(ls, want)
    expect(ls.every(l => l.level === 3)).toBe(true)
    expect(checkLayout(out, { gridSize: GS }).errors.filter(e => e.kind === 'cross-aisle')).toEqual([])
    const racks = out.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_')).map(rackFootprint)
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const l of ls) {
      const arrow = l.isHoriz ? { x: l.positions[0] - 1, y: l.gapLo + 1, w: 2, h: l.gapHi - l.gapLo - 2 } : { x: l.gapLo + 1, y: l.positions[0] - 1, w: l.gapHi - l.gapLo - 2, h: 2 }
      const pill = aisleLabelOps(l, labelScale('medium', GS)).find(o => o.op === 'rect')
      expect(racks.some(r => hit(arrow, r) || hit(pill, r))).toBe(false)
    }
  })
})

describe('CX-generate', () => {
  const NINE = [[`9' 3"`, -142, -132.75, 0], [`9' 3"`, -0.5, 8.75, 0], [`9' 3"`, 124.5, 133.75, 0]]
  const ELEVEN = [[`11' 2"`, -77.25, -66.125, 0], [`11' 2"`, 66.125, 77.25, 0]]
  it.each([
    ['250x500 vertical', { lengthFt: 250, widthFt: 500, orientation: 'vertical' }, NINE],
    ['500x250 horizontal', { lengthFt: 500, widthFt: 250, orientation: 'horizontal' }, NINE],
    ['300x420 vertical', { lengthFt: 300, widthFt: 420, orientation: 'vertical' }, ELEVEN],
    ['420x300 horizontal', { lengthFt: 420, widthFt: 300, orientation: 'horizontal' }, ELEVEN],
  ])('CX-generate (%s): a Generate layout comes out exactly as before — the same labels, gaps, positions and readings', async (_, spec, want) => {
    expectLabels(crossAisleLabels(await generated(spec), GS, { profile: REACH }), want, 6)
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
  ])('CX-one: a row grown into the cross-aisle, its line at %s ft — still ONE label, reading that narrowest line (level %s, %s), red exactly when Check layout lists the cross-aisle', (ft, level, text, listed) => {
    const { out, mover, wide } = narrowed(ft)
    const ls = crossAisleLabels(out, GS, { profile: REACH })
    expect(ls.length).toBe(1)
    const [l] = ls
    expect([l.level, l.text]).toEqual([level, text])
    expect(l.gapHi - l.gapLo).toBeCloseTo(ft * GS, 6)
    expect(l.positions[0]).toBeCloseTo(wide.positions[0], 6)                 // still centred across all its lines
    const items = checkLayout(out, { gridSize: GS, profile: REACH }).errors.filter(e => e.kind === 'cross-aisle' && e.ids.includes(mover.id))
    expect(items.length > 0).toBe(listed)
    if (listed) expect(items[0].text).toContain(`: ${text}, needs 8' to drive`)
  })
  it('CX-split: a rack standing across between two lines of the cross-aisle — two labels, one each side of it, both reading the gap', () => {
    const base = savedFill(vert)
    const [L] = crossAisleLabels(base, GS)
    const beside = base.filter(o => BEAM.has(o.type) && Math.abs(runOf(o)[1] - L.gapLo) < 1e-6).sort((a, b) => crossOf(a)[0] - crossOf(b)[0])
    // two lines next to each other with a row aisle between them wide enough for a copy of the first
    const i = beside.findIndex((a, j) => j + 1 < beside.length && crossOf(beside[j + 1])[0] - crossOf(a)[1] > (crossOf(a)[1] - crossOf(a)[0]) + 0.5 * GS)
    expect(i, 'a row aisle that fits a rack').toBeGreaterThanOrEqual(0)
    const a = beside[i], b = beside[i + 1], depth = crossOf(a)[1] - crossOf(a)[0], r = runOf(a)
    const at = crossOf(a)[1] + (crossOf(b)[0] - crossOf(a)[1] - depth) / 2
    const blocker = RG.movedAlong(RG.movedAcross({ ...a, id: 'blocker' }, at - crossOf(a)[0]), (L.gapLo + L.gapHi) / 2 - (r[0] + r[1]) / 2)
    const ls = sorted(crossAisleLabels([...base, blocker], GS, { profile: REACH }))
    expect(ls.length).toBe(2)
    expect(ls.map(l => l.text)).toEqual([L.text, L.text])
    const mid = (crossOf(blocker)[0] + crossOf(blocker)[1]) / 2
    expect(ls.map(l => l.positions[0] < mid).sort()).toEqual([false, true])
  })
  it('CX-hand: a building with no section stamps (racks placed by hand) keeps the old labels — a Generate layout with its stamps stripped still shows its three cross-aisles', async () => {
    const gen = await generated({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, orientation: vert ? 'vertical' : 'horizontal' })
    const hand = gen.map(o => { const { genSection, ...rest } = o; return rest })
    expect(hand.some(o => o.genSection != null)).toBe(false)
    expectLabels(crossAisleLabels(hand, GS, { profile: REACH }), [[`9' 3"`, -142, -132.75, 0], [`9' 3"`, -0.5, 8.75, 0], [`9' 3"`, 124.5, 133.75, 0]], 6)
  })
})
