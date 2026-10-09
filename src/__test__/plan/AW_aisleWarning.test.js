// Area AW — the aisle width label shows an aisle under the forklift widths at once, graded as Check layout
// grades it (rowAisleLevel, one function): a filled amber pill under the pick width, a filled red pill under
// the drive width, the usual label otherwise; a failing width reads rounded down, as Check layout lists it.
// Coloured only while the Checks layer and the markings are on, on the canvas and in the PDF alike.
// The fixture's layout as saved, both orientations, a column-free 10' 6" aisle narrowed to 10.49 / 10.5 / 7.99 ft.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS, splitWallRows } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint, aisleColumnBlocks, MHE_PROFILES } from '../../generate/columnCheck'
import { layoutColumns } from '../../generate/usableCapacity'
import { rowAisleGaps } from '../../generate/rowAisles'
import { checkLayout, HL } from '../../utils/layoutCheck'
import { aisleLabelLayout, aisleWarnProfile } from '../../canvas2/hitTest'
import { aisleLabelOps, AISLE_PICK_COLOR, AISLE_DRIVE_COLOR } from '../../render/labelOps'
import { labelScale } from '../../render/labelSize'
import { setColumnCheckView } from '../../generate/columnCheckView'
import * as RG from '../../utils/rowGroup'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { generateAndPlace } from '../../generate/traceGenerate'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

const BEAM = new Set(['rack_row', 'rack_double_row'])
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
const REACH = MHE_PROFILES.reach
const square = (os) => os.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_') && ((o.rotation || 0) % 90) === 0)
const pairKey = (a, b) => [a, b].sort().join('|')

/** A 10' 6" aisle with no column in it or in the next aisle over, its aisle object, and the layout with the
 *  near row moved across so that aisle is `ft` wide. */
function narrowed(vert, ft) {
  const base = savedFill(vert), racks = square(base)
  const blocked = new Set(aisleColumnBlocks({ racks, columns: layoutColumns(base, GS), profile: REACH, gridSize: GS }).aisleBlocks.flatMap(b => b.betweenRows))
  const g = rowAisleGaps(racks).find(g => !blocked.has(g.top.id) && !blocked.has(g.bot.id) && Math.abs(g.gapLen / GS - 10.5) < 1e-6)
  const mover = g.bot, toward = RG.geom(g.top).s0 < RG.geom(mover).s0 ? -1 : 1
  const out = base.map(o => (o.id === mover.id ? RG.movedAcross(o, toward * (10.5 - ft) * GS) : o))
  const aisle = out.find(o => o.type === 'aisle' && pairKey(o.row1Id, o.row2Id) === pairKey(g.top.id, g.bot.id))
  return { out, aisle, ids: [g.top.id, g.bot.id] }
}
const listed = (out, ids) => checkLayout(out, { gridSize: GS, profile: REACH }).errors.concat(checkLayout(out, { gridSize: GS, profile: REACH }).warnings)
  .filter(e => (e.kind === 'aisle-pick' || e.kind === 'aisle-drive') && pairKey(...e.ids) === pairKey(...ids))
const pill = (L) => aisleLabelOps(L, labelScale('medium', GS)).find(o => o.op === 'rect')

const CASES = [
  // ft, the label's level, Check layout's item for the pair, the label's text, its pill stroke
  [10.49, 2, 'aisle-pick', `10' 5"`, AISLE_PICK_COLOR],
  [10.5, 3, null, `10' 6"`, '#f0b429'],
  [7.99, 1, 'aisle-drive', `7' 11"`, AISLE_DRIVE_COLOR],
]

describe.each([['vertical', true], ['horizontal', false]])('AW — %s', (_, vert) => {
  it.each(CASES)('AW-grade: the aisle at %s ft — the label is graded as Check layout lists that pair (level %s, %s), reads %s (a failing width rounded down, as listed) in its colour', (ft, level, kind, text, stroke) => {
    const { out, aisle, ids } = narrowed(vert, ft)
    expect(aisle, 'the pair has its aisle label').toBeTruthy()
    const L = aisleLabelLayout(aisle, out, GS, { profile: REACH })
    expect(L.gapHi - L.gapLo).toBeCloseTo(ft * GS, 6)
    const items = listed(out, ids)
    expect(items.map(e => e.kind)).toEqual(kind ? [kind] : [])
    expect(L.level).toBe(level)
    expect(L.text).toBe(text)
    if (kind) expect(items[0].text).toContain(`: ${text}, needs `)
    expect(pill(L).stroke).toBe(stroke)
    // the warning colours off (Checks layer hidden / markings off): the usual label, the width to the nearest inch
    const plain = aisleLabelLayout(aisle, out, GS)
    expect([plain.level, pill(plain).stroke]).toEqual([3, '#f0b429'])
    expect(plain.text).toBe(ft === 7.99 ? `8'` : `10' 6"`)
  })
})

describe('AW — the switches and the PDF', () => {
  it('AW-colours: the label colours are Check layout\'s — amber under the pick width, red under the drive width', () => {
    expect([AISLE_PICK_COLOR, AISLE_DRIVE_COLOR]).toEqual([HL.amber, HL.red])
  })
  it('AW-layers: graded only while the Checks layer is shown and the markings are on (the hit test reads the same), the canvas passes its profile only then, and the PDF follows the same switches', async () => {
    setColumnCheckView({ profile: REACH, showMarks: true })
    expect(aisleWarnProfile([{ id: 'checks', visible: true }])).toBe(REACH)
    expect(aisleWarnProfile([{ id: 'checks', visible: false }])).toBe(null)
    setColumnCheckView({ showMarks: false })
    expect(aisleWarnProfile([{ id: 'checks', visible: true }])).toBe(null)
    setColumnCheckView({ showMarks: true })
    const ov = readFileSync('src/canvas2/Overlays.jsx', 'utf8')
    expect(ov).toMatch(/const warnProfile = marksOn \? mhe : null/)
    expect(ov).toMatch(/<AisleLabelItem [^>]*profile=\{warnProfile\}/)
    const { labelsSVG } = await import('../../export/pdfExport')
    const { out } = narrowed(true, 7.99)
    const svg = (showMarks) => labelsSVG(out, GS, { labelSize: 'medium', showAisles: true, showMarks, showColumnLabels: true, profile: REACH, pickBothSides: false })
    const RED_PILL = 'rgba(254,226,226,0.95)'
    expect(svg(true)).toContain(RED_PILL)
    expect(svg(true)).toContain(`7' 11`)
    expect(svg(false)).not.toContain(RED_PILL)
  })
})

// ── cross-aisles: red over a cross-aisle Check layout lists (failingCrossAisles), no amber level ──────────────
/** A Generate layout (its wall rows split at the cross-aisles, so each has its label); one rack in a line
 *  beside the section 2 / 3 cross-aisle moved along its run so that line's gap is `ft`. `sections`: false strips
 *  the section stamps (a layout placed by hand: the error rule sees no cross-aisle). */
async function crossNarrowed(vert, ft, { sections = true } = {}) {
  const store = (await import('../../store/useCanvasStore')).useCanvasStore
  store.setState({ objects: [], groups: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  generateAndPlace({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation: vert ? 'vertical' : 'horizontal', rackType: 'rack_double_row', dockDoors: 0 })
  let objs = store.getState().objects
  const L0 = crossAisleLabels(objs, GS).sort((a, b) => a.gapLo - b.gapLo)[1]        // the 2 / 3 cross-aisle
  const run = (o) => { const f = rackFootprint(o); return f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const mover = objs.find(o => BEAM.has(o.type) && Math.abs(run(o)[1] - L0.gapLo) < 1e-6)
  const d = (L0.gapHi - L0.gapLo) - ft * GS
  objs = objs.map(o => (o.id === mover.id ? RG.movedAlong(o, d) : o))
  // placed by hand: no section stamps, and the wall rows in pieces like the rows beside them
  if (!sections) objs = splitWallRows(objs).map(o => { const { genSection, ...rest } = o; return rest })
  const label = crossAisleLabels(objs, GS, { profile: REACH }).find(l => Math.abs(l.gapLo - (L0.gapLo + d)) < 1e-6 && Math.abs(l.gapHi - L0.gapHi) < 1e-6)
  return { objs, label, plain: crossAisleLabels(objs, GS).find(l => l.key === label?.key), mover }
}
const crossListed = (objs, id) => checkLayout(objs, { gridSize: GS, profile: REACH }).errors.filter(e => e.kind === 'cross-aisle' && e.ids.includes(id))

describe.each([['vertical', true], ['horizontal', false]])('AW cross-aisles — %s', (_, vert) => {
  it.each([
    [8.0, 3, null, `8'`, '#f0b429'],
    [7.99, 1, 'cross-aisle', `7' 11"`, AISLE_DRIVE_COLOR],
  ])('AW-cross: a row grown into the cross-aisle, its line\'s gap %s ft — the label graded as Check layout lists that cross-aisle (level %s, %s), reads %s, in its colour; colours off: the usual label', async (ft, level, kind, text, stroke) => {
    const { objs, label, plain, mover } = await crossNarrowed(vert, ft)
    expect(label, 'the cross-aisle keeps its label').toBeTruthy()
    expect(label.gapHi - label.gapLo).toBeCloseTo(ft * GS, 6)
    const items = crossListed(objs, mover.id)
    expect(items.map(e => e.kind)).toEqual(kind ? [kind] : [])
    expect(label.level).toBe(level)
    expect(label.text).toBe(text)
    if (kind) expect(items[0].text).toContain(`: ${text}, needs 8' to drive`)
    expect(pill(label).stroke).toBe(stroke)
    expect([plain.level, plain.text, pill(plain).stroke]).toEqual([3, `8'`, '#f0b429'])
  })
  it('AW-cross-ignored: the same 7.99 ft gap on a layout with no sections (the error rule ignores it) — no cross-aisle listed, the label uncoloured', async () => {
    const { objs, label, mover } = await crossNarrowed(vert, 7.99, { sections: false })
    expect(crossListed(objs, mover.id)).toEqual([])
    expect([label.level, label.text, pill(label).stroke]).toEqual([3, `8'`, '#f0b429'])
  })
})

describe('AW cross-aisles — the PDF', () => {
  it('AW-cross-pdf: the PDF grades cross-aisle labels under the same switches — red, "7\' 11", with markings on; not with them off', async () => {
    const { labelsSVG } = await import('../../export/pdfExport')
    const { objs } = await crossNarrowed(true, 7.99)
    const svg = (showMarks) => labelsSVG(objs, GS, { labelSize: 'medium', showAisles: true, showMarks, showColumnLabels: true, profile: REACH, pickBothSides: false })
    expect(svg(true)).toContain('rgba(254,226,226,0.95)')
    expect(svg(true)).toContain(`7' 11`)
    expect(svg(false)).not.toContain('rgba(254,226,226,0.95)')
  })
})
