// Area RG — the Row group (utils/rowGroup.js plans, utils/rowGroupTool.js runs it on the store,
// canvas2/RowGroupBar.jsx + RowGroupPreview.jsx show it). Replaces Match bays in section, the
// section-copy bar and its Copy / Don't copy question.
//   1. Picking: a box over rows, a click on a row to add / remove it, "+ Same row in other sections".
//      The group stays until Esc or ✕ and is never saved in the file.
//   2. An edit to one group row is replayed on the others, relative to each:
//        - bays: the source's uprights wherever both have racks (within ½"); a bay that would cross the
//          target's limit (wall, zone, an aisle under the 8' travel width) is DROPPED, never squeezed;
//        - a move across: the same delta;  - a delete: the others deleted;
//        - a row added next to a group row: one beside each other group row, same offset, its own length.
//   3. The bar: "Apply to the other N rows?" — "K rows lose a bay (B bays)." when bays would drop —
//      with a live preview (dropped bays red, skipped rows amber) and an "Always apply" switch.
//   4. Skipped rows name their reason: a column on an upright, an overlap, a wall, a zone, an aisle
//      under the travel width, uprights don't line up (wall rows).
//   5. One undo step per apply; Always apply folds the edit and its apply into one step.
// On the hand-check layout (realLayout.fixture.js): horizontal rows as saved, vertical rows on the
// layout turned 90° (x and y swapped — the same rows mirrored); rectangle, L and T.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaCreate } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import * as RG from '../../utils/rowGroup'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup, toggleRowOf, addRowsInBox, addRowOf, applyPending, dismissPending, groupRowsNow } from '../../utils/rowGroupTool'
import { usePlacement, startPlacement, cancelPlacement } from '../../utils/placement'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

let store, Bar, Panel, stop
let seq = 0
const newId = () => 'g' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Bar = await import('../../canvas2/RowGroupBar.jsx')

  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  stop = installRowGroupWatcher(store, newId)
})
afterAll(() => stop && stop())
beforeEach(() => { clearGroup(); useRowGroup.getState().setAlwaysApply(false); cancelPlacement() })

const BEAM = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6
const strip = (o) => JSON.parse(JSON.stringify(o))
const ft = (px) => Math.round((px / GS) * 100) / 100

/* ── the layout ── */
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
const SHAPE_CUTS = { rectangle: [], L: ['bl'], T: ['bl', 'br'] }
const shaped = (fp, cuts) => {
  if (!cuts.length) return fp
  const X = (f) => fp.x + f * GS, Y = (f) => fp.y + f * GS, W = fp.width / GS, H = fp.height / GS
  const v = [[0, 0], [W, 0]]
  if (cuts.includes('br')) v.push([W, 170], [W - 150, 170], [W - 150, H]); else v.push([W, H])
  if (cuts.includes('bl')) v.push([150, H], [150, 170], [0, 170]); else v.push([0, H])
  return { ...fp, fpVerts: v.map(([x, y]) => ({ x: X(x), y: Y(y) })) }
}
/** The hand-check layout filled: rows horizontal as saved, vertical on the layout turned 90°. */
function filled(vert, shape = 'rectangle') {
  const objs = REAL_LAYOUT.map(o => (o.type.startsWith('fp_') ? shaped(o, SHAPE_CUTS[shape]) : { ...o })).map(o => (vert ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area')
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  return planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation: vert ? 'vertical' : 'horizontal' }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], zoom: 1, panX: 0, panY: 0,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const st = () => useRowGroup.getState()
const hist = () => store.getState().historyIndex
const rows = () => RG.rowsOf(objs(), GS)
const fpId = () => objs().find(o => o.type.startsWith('fp_')).id
const key = (sec, ri) => `s|${fpId()}|${sec}|${ri}`
const racksOf = (k) => rows().get(k).ids.map(get)
const sectionKeys = (sec) => [...rows().keys()].filter(k => k.split('|')[2] === String(sec))
const settle = () => flushRowGroupWatcher()
/** The bay at index `i` of the row `k`'s rack that has it (bays counted along its own racks, first rack first). */
const pairOf = (k) => racksOf(k).find(o => o.type === 'rack_double_row') || racksOf(k)[0]
/** Every upright of a row (world px along the run). */
const ups = (o) => { const g = RG.geom(o); return RG.uprightsOf(g.r0, g.beams, ((o.uprightWidth || 3) / 12) * GS, GS) }
const describeRow = (k) => racksOf(k).map(o => { const g = RG.geom(o); return `${o.type === 'rack_double_row' ? 'pair' : 'single'} ${ft(g.r0)}–${ft(g.r1)} (${o.beams.length})` }).join(' | ')

const TOL = RG.UP_TOL_FT * GS
/** World box over a run band [a, b] ft (world), across the whole building. */
const runBox = (vert, a, b) => (vert ? { x: -1e6, y: a * GS, w: 2e6, h: (b - a) * GS } : { x: a * GS, y: -1e6, w: (b - a) * GS, h: 2e6 })
const SEC4 = [140, 245], SEC3 = [5, 100]
/** Select bay `i` of `rack` and change its beam (the multi-bay "Change beam"). */
const changeBeam = async (rack, i, beam) => { store.setState({ activeBaySelection: [{ objId: rack.id, bayIdx: i }] }); store.getState().changeSelectedBaysBeam(beam); await settle() }
const moveRow = async (k, dAcross, dAlong, vert) => { store.getState().moveObjects(rows().get(k).ids, vert ? dAcross : dAlong, vert ? dAlong : dAcross); await settle() }
const render = () => { for (const x of [useRowGroup, usePlacement, store]) Object.assign(x.getInitialState(), x.getState()); return renderToStaticMarkup(createElement(Bar.RowGroupBar)) }
const meets = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-3 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-3
const overlaps = (list) => { const rs = list.filter(o => BEAM.has(o.type)), out = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (meets(rackFootprint(rs[i]), rackFootprint(rs[j]))) out.push([rs[i].id, rs[j].id].sort().join('|')); return out.sort() }
const pin = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c } return c }
const inside = (o, fp) => { const poly = fp.fpVerts, f = rackFootprint(o); return [[f.x + 1, f.y + 1], [f.x + f.w - 1, f.y + 1], [f.x + 1, f.y + f.h - 1], [f.x + f.w - 1, f.y + f.h - 1]].every(([x, y]) => pin(poly, x, y)) }
const beamRacks = (list) => list.filter(o => BEAM.has(o.type))
const bayCount = (k) => racksOf(k).reduce((t, o) => t + o.beams.length, 0)

describe.each([['horizontal', false], ['vertical', true]])('RG — %s rows, the hand-check layout', (_, vert) => {
  /* ── 1. picking ── */
  it('RG-pick: a box adds every row it touches; a click adds a row, a second click takes it out; "+ Same row in other sections" adds the row in every section; the group stays until ✕', async () => {
    load(filled(vert))
    useRowGroup.getState().setPicking(true)
    expect(addRowsInBox(runBox(vert, ...SEC4))).toBe(14)
    expect(st().keys).toEqual(expect.arrayContaining([...sectionKeys(4), key(3, 14)]))
    expect(st().keys).toHaveLength(14)
    const r = pairOf(key(2, 7))
    expect(toggleRowOf(r.id)).toBe(true)
    expect(st().keys).toContain(key(2, 7))
    expect(toggleRowOf(r.id)).toBe(true)
    expect(st().keys).not.toContain(key(2, 7))
    // the bar while grouped: the count, Pick rows (pressed while picking), ✕
    let html = render()
    expect(html).toContain('Row group · 14 rows')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="Clear the row group"')
    clearGroup()
    expect(st()).toMatchObject({ keys: [], picking: false, pending: null })
    // with one rack selected: + This row / + Same row in other sections
    store.setState({ selectedIds: [r.id] })
    html = render()
    expect(html).toContain('aria-label="Add this row to the group"')
    expect(html).toContain('aria-label="Same row in other sections"')
    expect(addRowOf(r.id, { otherSections: true })).toBe(4)
    expect([...st().keys].sort()).toEqual([key(1, 7), key(2, 7), key(3, 7), key(4, 7)].sort())
    store.setState({ selectedIds: [] })
    // the canvas: a click toggles while picking, a box adds rows
    const ci = readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')
    expect(ci).toMatch(/if \(evt\.button === 0 && useRowGroup\.getState\(\)\.picking\) \{/)
    expect(ci).toMatch(/toggleRowOf\(pickId\)/)
    // picking takes the press before a selected rack's handles and the building's walls (a box may start on a wall)
    const down = ci.slice(ci.indexOf('const onStageMouseDown'))
    expect(down.indexOf('useRowGroup.getState().picking')).toBeGreaterThan(0)
    expect(down.indexOf('useRowGroup.getState().picking')).toBeLessThan(down.indexOf('handleHitTest(selected'))
    expect(down.indexOf('useRowGroup.getState().picking')).toBeLessThan(down.indexOf('fpWallHitTest('))
    expect(ci).toMatch(/addRowsInBox\(\{ x: r\.x, y: r\.y, w: r\.width, h: r\.height \}\)/)
  })

  /* ── 2. the bay replay — worked example a ── */
  it('RG-bays: section 4 row 7, bay 5 96" → 84" (worked example a): "Apply to the other 11 rows? 2 skipped." — the wall rows skipped (uprights don\'t line up); Apply puts every target upright on the source\'s; one undo step', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const src = pairOf(key(4, 7)), before = strip(objs())
    await changeBeam(src, 4, 84)
    const afterEdit = strip(objs())
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 11 rows? 2 skipped.')
    expect(p.summary.skipped).toEqual(expect.arrayContaining([{ key: key(4, 1), reason: 'uprights don\'t line up' }, { key: key(3, 14), reason: 'uprights don\'t line up' }]))
    const html = render()
    expect(html).toContain('Apply to the other 11 rows? 2 skipped.')
    expect(html).toContain('Skipped — Section 4, row 1: uprights don&#x27;t line up')
    expect(html).toContain('Skipped — Section 3, row 14: uprights don&#x27;t line up')
    const srcUps = ups(get(src.id)), h = hist()
    expect(applyPending()).toBe(true)
    await settle()
    expect(hist()).toBe(h + 1)
    expect(st().message).toBe('Applied to 11 rows · 2 skipped')
    // every target: each upright on one of the source's, the beams 96 but bay 5 where the rack starts with the source
    for (const k of sectionKeys(4).filter(k => k !== key(4, 7) && k !== key(4, 1))) {
      for (const o of racksOf(k)) {
        for (const u of ups(o)) expect(Math.min(...srcUps.map(v => Math.abs(v - u)))).toBeLessThanOrEqual(TOL)
        expect(o.beams.filter(b => b !== 96).length).toBe(Math.abs(ups(o)[0] - srcUps[0]) < TOL ? 1 : 0)
      }
    }
    expect(racksOf(key(4, 6)).find(o => o.type === 'rack_row').beams[4]).toBe(84)   // the half row
    expect(ft(RG.geom(pairOf(key(4, 2))).r0)).toBe(223.75)                          // a short row: 224.75' → slid 1' with the source
    expect(racksOf(key(4, 1))).toEqual(before.filter(o => rows().get(key(4, 1)).ids.includes(o.id)))
    // one undo: the apply goes, the edit stays; a second: the edit goes
    store.getState().undo()
    expect(beamRacks(objs())).toEqual(beamRacks(afterEdit))
    store.getState().undo()
    expect(beamRacks(objs())).toEqual(beamRacks(before))
  })

  /* ── 3. dropped bays: the bar says so before Apply; the preview marks them apart from skipped rows ── */
  it('RG-drop: bay 5 96" → 108" (b2): "Apply to the other 11 rows? 11 rows lose a bay (11 bays). 2 skipped." — the preview marks 11 dropped bays (red, solid) apart from the 2 skipped rows (amber, dashed); after Apply no target passes the wall and no bay is squeezed', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const src = pairOf(key(4, 7)), wall = 249.75
    const bays0 = new Map(sectionKeys(4).map(k => [k, bayCount(k)]))
    await changeBeam(src, 4, 108)
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 11 rows? 11 rows lose a bay (11 bays). 2 skipped.')
    expect(p.summary).toMatchObject({ apply: 11, lose: 11, bays: 11 })
    expect(render()).toContain('Apply to the other 11 rows? 11 rows lose a bay (11 bays). 2 skipped.')
    const rects = RG.previewRects(objs(), p.plan, GS)
    const kinds = (k) => rects.filter(r => r.kind === k)
    expect(kinds('dropped')).toHaveLength(11)
    const skippedIds = [...rows().get(key(4, 1)).ids, ...rows().get(key(3, 14)).ids]
    expect(kinds('skipped')).toHaveLength(skippedIds.length)
    for (const id of skippedIds) expect(kinds('skipped').some(r => r.key.endsWith(id))).toBe(true)
    expect(new Set(rects.map(r => r.key)).size).toBe(rects.length)              // every outline keyed uniquely
    for (const d of kinds('dropped')) {
      expect(kinds('skipped').some(s => meets(s.f, d.f))).toBe(false)           // a dropped bay is never drawn as a skipped row
      expect(ft(vert ? d.f.y + d.f.h : d.f.x + d.f.w)).toBeGreaterThan(wall)    // the bay that would pass the wall
    }
    for (const t of p.plan.targets.filter(t => t.status === 'apply')) expect(t.dropWhy).toEqual(['a wall'])
    const pv = readFileSync('src/canvas2/RowGroupPreview.jsx', 'utf8')
    expect(pv).toMatch(/export const DROPPED = '#C0392B'/)
    expect(pv).toMatch(/export const SKIPPED = '#E67E22'/)
    expect(pv).toMatch(/p\.kind === 'dropped' \? rect\(p\.f, p\.key, DROPPED, \{ fill: 'rgba\(192,57,43,0\.28\)', width: 1\.5 \}\)/)
    expect(pv).toMatch(/rect\(p\.f, p\.key, SKIPPED, \{ dash: \[3, 3\]/)
    applyPending(); await settle()
    for (const k of sectionKeys(4).filter(k => k !== key(4, 7) && k !== key(4, 1))) {
      expect(bayCount(k)).toBe(bays0.get(k) - 1)
      for (const o of racksOf(k)) {
        expect(RG.geom(o).r1).toBeLessThanOrEqual(wall * GS + 1e-6)
        for (const b of o.beams) expect([96, 108]).toContain(b)                 // dropped, never squeezed
      }
    }
  })

  it('RG-zone: section 3 row 7, bay 11 96" → 132" (b′): "Apply to the other 11 rows? 3 rows lose a bay (3 bays). 2 skipped." — the rows that run to the office lose their last bay to the zone', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC3))
    await changeBeam(pairOf(key(3, 7)), 10, 132)
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 11 rows? 3 rows lose a bay (3 bays). 2 skipped.')
    const lost = p.plan.targets.filter(t => t.dropped)
    expect(lost.map(t => t.key).sort()).toEqual([key(3, 3), key(3, 4), key(3, 5)].sort())
    for (const t of lost) expect(t.dropWhy).toEqual(['a zone'])
  })

  /* ── a bay deleted at the end, added back; a middle bay deleted (the rows split) ── */
  it('RG-add-delete-bay: an end bay deleted → each target loses the bay at that upright; a bay added back → each gets it back; a middle bay deleted → every target with that bay splits there — nothing stacked, nothing off the floor', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const fp = objs().find(o => o.type.startsWith('fp_'))
    const ov0 = overlaps(objs())
    const n0 = new Map(sectionKeys(4).map(k => [k, bayCount(k)]))
    let src = pairOf(key(4, 7))
    store.getState().deleteSingleBay(src.id, src.beams.length - 1); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 11 rows? 2 skipped.')
    applyPending(); await settle()
    for (const k of sectionKeys(4).filter(k => k !== key(4, 1))) expect(bayCount(k)).toBe(n0.get(k) - 1)
    src = get(src.id)
    store.getState().commitObjectUpdate(src.id, Panel.addBayUpdate(src, 96, GS)); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 11 rows? 2 skipped.')
    applyPending(); await settle()
    for (const k of sectionKeys(4)) expect(bayCount(k)).toBe(n0.get(k))
    // a middle bay: bay 7 of row 7 (rows 2-5 start beyond it: nothing to do there)
    src = get(src.id)
    const at = ups(src).slice(6, 8)
    store.getState().deleteSingleBay(src.id, 6); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 7 rows? 2 skipped.')
    applyPending(); await settle()
    for (const k of [6, 8, 9, 10, 11, 12, 13].map(i => key(4, i))) {
      expect(racksOf(k).filter(o => { const g = RG.geom(o); return g.r0 < at[0] + TOL && g.r1 > at[1] })).toEqual([])   // a gap where the bay was
    }
    expect(overlaps(objs())).toEqual(ov0)
    for (const o of beamRacks(objs())) expect(inside(o, fp)).toBe(true)
  })

  /* ── a move across, a delete, a row added beside ── */
  it('RG-across: row 7 of every section; section 4\'s row moved 1\' across → the others move the same 1\'; one undo step', async () => {
    load(filled(vert))
    addRowOf(pairOf(key(4, 7)).id, { otherSections: true })
    const s0 = new Map([1, 2, 3, 4].map(i => [i, RG.geom(pairOf(key(i, 7))).s0]))
    await moveRow(key(4, 7), GS, 0, vert)
    expect(st().pending.summary.text).toBe('Apply to the other 3 rows?')
    const h = hist()
    applyPending(); await settle()
    expect(hist()).toBe(h + 1)
    for (const i of [1, 2, 3, 4]) expect(RG.geom(pairOf(key(i, 7))).s0 - s0.get(i)).toBeCloseTo(GS, 6)
    store.getState().undo()
    for (const i of [1, 2, 3]) expect(RG.geom(pairOf(key(i, 7))).s0).toBeCloseTo(s0.get(i), 6)
  })

  it('RG-along: a move along the row is not replayed — the bar says so, nothing pending', async () => {
    load(filled(vert))
    addRowOf(pairOf(key(4, 7)).id, { otherSections: true })
    await moveRow(key(4, 7), 0, -GS, vert)
    expect(st().pending).toBe(null)
    expect(st().message).toBe('Not applied to the other rows: a move along the row isn\'t replayed.')
  })

  it('RG-delete: row 7 of every section; section 4\'s deleted → "Apply to the other 3 rows?" → every row 7 gone; undo once → back but the source; twice → all back', async () => {
    load(filled(vert))
    addRowOf(pairOf(key(4, 7)).id, { otherSections: true })
    const before = strip(objs())
    store.setState({ selectedIds: rows().get(key(4, 7)).ids }); store.getState().deleteSelected(); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 3 rows?')
    applyPending(); await settle()
    expect(objs().some(o => BEAM.has(o.type) && o.rowIndex === 7)).toBe(false)
    expect(st().keys).toEqual([])                                               // the deleted rows leave the group
    store.getState().undo()
    expect([1, 2, 3].every(i => rows().has(key(i, 7)))).toBe(true)
    expect(rows().has(key(4, 7))).toBe(false)
    store.getState().undo()
    expect(beamRacks(objs())).toEqual(beamRacks(before))
  })

  it('RG-add-row: row 8 gone everywhere; a row placed by hand where section 4\'s was, beside row 7 (grouped in every section) → one beside each other row 7, the same offset across, at that row\'s own length', async () => {
    load(filled(vert))
    addRowOf(pairOf(key(4, 8)).id, { otherSections: true })
    const was = strip(pairOf(key(4, 8)))
    store.setState({ selectedIds: rows().get(key(4, 8)).ids }); store.getState().deleteSelected(); await settle()
    applyPending(); await settle()
    clearGroup()
    addRowOf(pairOf(key(4, 7)).id, { otherSections: true })
    const { id, rowIndex, genSection, genRunFt, genCrossFt, areaId, ...hand } = was   // eslint-disable-line no-unused-vars
    const off = RG.geom(was).s0 - RG.geom(pairOf(key(4, 7))).s0
    const ids0 = new Set(objs().map(o => o.id))
    store.getState().addObject({ ...hand, id: 'hand8' }); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 3 rows?')
    applyPending(); await settle()
    const added = beamRacks(objs()).filter(o => !ids0.has(o.id) && o.id !== 'hand8')
    expect(added).toHaveLength(3)
    for (const i of [1, 2, 3]) {
      const r7 = RG.geom(pairOf(key(i, 7)))
      const a = added.map(o => RG.geom(o)).find(g => Math.abs(g.r0 - r7.r0) < 1e-6)
      expect(a).toBeTruthy()
      expect(a.r1).toBeCloseTo(r7.r1, 6)
      expect(a.s0 - r7.s0).toBeCloseTo(off, 6)
    }
  })

  /* ── the rules around an action ── */
  it('RG-multi: one action touching two group rows (a two-row move, a select-all delete) is not replayed — the bar says why; nothing pending', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    store.getState().moveObjects([...rows().get(key(4, 8)).ids, ...rows().get(key(4, 9)).ids], vert ? GS / 4 : 0, vert ? 0 : GS / 4); await settle()
    expect(st().pending).toBe(null)
    expect(st().message).toBe('This change touches 2 rows in the group, so it isn\'t applied to the others.')
    store.getState().selectAll(); store.getState().deleteSelected(); await settle()
    expect(st().pending).toBe(null)
    expect(st().message).toMatch(/^This change touches \d+ rows in the group/)
  })

  it('RG-always: Always apply applies at once, folded into the edit\'s own history entry — one Ctrl+Z undoes the edit and its apply together; the switch is remembered', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    useRowGroup.getState().setAlwaysApply(true)
    expect(localStorage.getItem('trace.rowGroup.always')).toBe('1')
    const before = strip(objs()), h = hist()
    await changeBeam(pairOf(key(4, 7)), 4, 84)
    expect(st().pending).toBe(null)
    expect(st().message).toBe('Applied to 11 rows · 2 skipped')
    expect(hist()).toBe(h + 1)
    expect(racksOf(key(4, 6)).find(o => o.type === 'rack_row').beams[4]).toBe(84)
    store.getState().undo()
    expect(beamRacks(objs())).toEqual(beamRacks(before))
    store.getState().redo()
    expect(racksOf(key(4, 6)).find(o => o.type === 'rack_row').beams[4]).toBe(84)
    useRowGroup.getState().setAlwaysApply(false)
  })

  it('RG-undo: undo, redo and a new layout end a pending apply; ✕ leaves the edit on its own row; with no group nothing is offered', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    await changeBeam(pairOf(key(4, 7)), 4, 84)
    expect(st().pending).toBeTruthy()
    store.getState().undo()
    expect(st().pending).toBe(null)
    store.getState().redo()
    expect(st().pending).toBe(null)
    await changeBeam(pairOf(key(4, 8)), 4, 84)
    expect(st().pending).toBeTruthy()
    const edited = strip(objs())
    dismissPending()
    expect(st().pending).toBe(null)
    expect(strip(objs())).toEqual(edited)
    await changeBeam(pairOf(key(4, 9)), 4, 84)
    expect(st().pending).toBeTruthy()
    load(filled(vert))
    await settle()
    expect(st().pending).toBe(null)
    clearGroup()
    await changeBeam(pairOf(key(4, 7)), 4, 84)
    expect(st()).toMatchObject({ pending: null, message: null })
  })

  it('RG-message: "Applied to N rows" stays until the next thing starts — a placement clears it', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    await changeBeam(pairOf(key(4, 7)), 4, 84)
    applyPending(); await settle()
    expect(render()).toContain('Applied to 11 rows · 2 skipped')
    startPlacement(store, [strip(pairOf(key(4, 9)))])
    expect(st().message).toBe(null)
    cancelPlacement()
  })

  it('RG-save: the group is presentation state — never in the canvas store, never in the saved file', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    await changeBeam(pairOf(key(4, 7)), 4, 84)
    expect(st().keys.length).toBe(14)
    const file = serializeScene(store.getState())
    expect(file).not.toContain(key(4, 1))
    expect(file).not.toMatch(/rowGroup|alwaysApply/)
    expect(Object.keys(store.getState())).not.toContain('keys')
    const back = {}
    deserializeScene(file, back)
    expect(back.objects.length).toBe(objs().length)
    expect(Object.keys(back)).not.toContain('keys')
  })
})

/* ── the shapes: the replay keeps the layout clean on the rectangle, the L and the T ── */
describe.each([['rectangle'], ['L'], ['T']])('RG-shape — %s', (shape) => {
  it.each([['horizontal', false], ['vertical', true]])('RG-shape (%s): a bay change on a middle row of each section, replayed on its section → no new overlap, every rack inside the walls, every target upright on the source\'s, each target\'s lost bays = its dropped count', async (_, vert) => {
    load(filled(vert, shape))
    const fp = objs().find(o => o.type.startsWith('fp_'))
    const secs = [...new Set([...rows().keys()].map(k => k.split('|')[2]))]
    let applied = 0
    for (const sec of secs) {
      clearGroup()
      const ks = sectionKeys(sec).sort((a, b) => +a.split('|')[3] - +b.split('|')[3])
      const mid = ks[Math.floor(ks.length / 2)], src = pairOf(mid)
      if (src.beams.length < 6) continue
      useRowGroup.setState({ keys: ks })
      const ov0 = overlaps(objs()), bays0 = new Map(ks.map(k => [k, bayCount(k)]))
      await changeBeam(src, 3, 108)
      const p = st().pending
      if (!p || !p.summary.apply) { dismissPending(); continue }
      const srcUps = ups(get(src.id)), g = RG.geom(get(src.id))
      applyPending(); await settle()
      applied += p.summary.apply
      expect(overlaps(objs()).filter(x => !x.split('|').includes(src.id))).toEqual(ov0)   // the source is the user's own edit
      for (const t of p.plan.targets.filter(t => t.status === 'apply')) {
        for (const o of racksOf(t.key)) expect(inside(o, fp)).toBe(true)
        expect(bayCount(t.key)).toBe(bays0.get(t.key) - t.dropped)
        for (const o of racksOf(t.key)) for (const u of ups(o)) if (u >= g.r0 - TOL && u <= g.r1) expect(Math.min(...srcUps.map(v => Math.abs(v - u)))).toBeLessThanOrEqual(TOL)
      }
    }
    expect(applied).toBeGreaterThan(10)
  })
})

/* ── a small building by hand: the skip reasons, reversed racks, hand rows and their split pieces ──
   A 200' × 100' building; rows placed by hand (no stamps — keyed by their racks, chained by line).
   Coordinates are given as (along the run, across) in feet and laid out either way. */
describe.each([['horizontal', false], ['vertical', true]])('RG — %s rows, placed by hand', (_, vert) => {
  const tpl = (() => { const p = filled(false).find(o => o.type === 'rack_double_row'); const { id, rowIndex, genSection, genRunFt, genCrossFt, areaId, parentId, pieceOf, ...t } = p; return t })()   // eslint-disable-line no-unused-vars
  const DEPTH = tpl.height / GS
  const at = (run, across) => (vert ? { x: across * GS, y: run * GS } : { x: run * GS, y: across * GS })
  const fpObj = () => {
    const L = 200 * GS, W = 100 * GS, [w, h] = vert ? [W, L] : [L, W]
    return { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: w, height: h, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }
  }
  /** A rack with its footprint starting at (run, across), its bays in world order along the run. */
  const mk = (id, run, across, beamsWorld, { rev = false, type = 'rack_double_row' } = {}) => {
    const beams = rev ? [...beamsWorld].reverse() : [...beamsWorld]
    const width = ((3 * (beams.length + 1) + beams.reduce((t, b) => t + b, 0)) / 12) * GS, height = tpl.height
    const f = at(run, across)
    const o = vert
      ? { ...tpl, type, id, parentId: 'fp', beams, width, height, rotation: rev ? 270 : 90, x: f.x - width / 2 + height / 2, y: f.y - height / 2 + width / 2 }
      : { ...tpl, type, id, parentId: 'fp', beams, width, height, rotation: rev ? 180 : 0, x: f.x, y: f.y }
    const g = rackFootprint(o)
    expect([g.x, g.y]).toEqual([f.x, f.y])
    return o
  }
  const B5 = [96, 96, 96, 96, 96]
  const setup = (...extra) => { load(rebuildAisles([fpObj(), ...extra], newId).objects); clearGroup() }
  const groupOf = (...ids) => { useRowGroup.getState().setPicking(true); for (const id of ids) toggleRowOf(id); useRowGroup.getState().setPicking(false) }
  const moveAcross = async (id, dFt) => { store.getState().moveObjects(rows().get(RG.rowOfRack(rows(), id)).ids, vert ? dFt * GS : 0, vert ? 0 : dFt * GS); await settle() }
  const reasonOf = (id) => st().pending.plan.targets.find(t => t.key === RG.rowOfRack(rows(), id))
  const across0 = (id) => RG.geom(get(id)).s0 / GS

  /* the travel width, exactly: an aisle of 8.0' takes the move, 7.99' does not */
  it('RG-skip-aisle: B would end 8.0\' from the rack across → applied; 7.99\' → skipped, "an aisle under the travel width"', async () => {
    const C0 = 40 + DEPTH + 10                                                  // a 10' aisle beyond B
    for (const [d, status] of [[2, 'apply'], [2.01, 'skip']]) {
      setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('C', 20, C0, B5))
      groupOf('A', 'B')
      await moveAcross('A', d)
      const t = reasonOf('B')
      expect(t.status).toBe(status)
      if (status === 'skip') expect(t.reason).toBe('an aisle under the travel width')
      else { applyPending(); await settle(); expect(C0 - (across0('B') + DEPTH)).toBeCloseTo(8, 9) }
    }
    expect(render()).toContain('Skipped — Row at')
  })

  it('RG-skip-overlap / wall / zone / column: each skipped row names its reason; the others still apply', async () => {
    // overlap: B would land on C
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('C', 20, 40 + DEPTH + 10, B5))
    groupOf('A', 'B')
    await moveAcross('A', 11)
    expect(reasonOf('B')).toMatchObject({ status: 'skip', reason: 'an overlap' })
    // a wall: B would pass the building's wall
    setup(mk('A', 20, 10, B5), mk('B', 20, 100 - 0.25 - DEPTH - 1, B5))
    groupOf('A', 'B')
    await moveAcross('A', 2)
    expect(reasonOf('B')).toMatchObject({ status: 'skip', reason: 'a wall' })
    // a zone: B would land on an office; D (no zone) still takes it
    const z = at(20, 40 + DEPTH + 1)
    const zone = { id: 'z', type: 'zone_office', parentId: 'fp', x: z.x, y: z.y, width: vert ? 20 * GS : 60 * GS, height: vert ? 60 * GS : 20 * GS }
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('D', 120, 40, B5), zone)
    groupOf('A', 'B', 'D')
    await moveAcross('A', 2)
    expect(reasonOf('B')).toMatchObject({ status: 'skip', reason: 'a zone' })
    expect(reasonOf('D').status).toBe('apply')
    expect(st().pending.summary.text).toBe('Apply to the other 1 row? 1 skipped.')
    // a column: B's first upright would stand on one
    const c = at(20 + 1.5 / 12, 40 + DEPTH + 1)
    const cg = { id: 'cg', type: 'column_grid', parentId: 'fp', x: c.x, y: c.y, spacingX: [1e6], spacingY: [1e6], columnW: GS, columnH: GS }
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), cg)
    groupOf('A', 'B')
    await moveAcross('A', 2)
    expect(reasonOf('B')).toMatchObject({ status: 'skip', reason: 'a column on an upright' })
    expect(render()).toContain(': a column on an upright')
  })

  it('RG-skip-lineup: a row whose uprights are off the source\'s (4\' along) takes no bay edit — "uprights don\'t line up"; a row beside it that lines up does', async () => {
    setup(mk('A', 20, 10, B5), mk('B', 24, 40, B5), mk('E', 20, 70, B5))
    groupOf('A', 'B', 'E')
    await changeBeam(get('A'), 1, 84)
    expect(reasonOf('B')).toMatchObject({ status: 'skip', reason: 'uprights don\'t line up' })
    expect(reasonOf('E').status).toBe('apply')
    applyPending(); await settle()
    expect(get('E').beams).toEqual([96, 84, 96, 96, 96])
    expect(get('B').beams).toEqual(B5)
  })

  it('RG-reversed: a target drawn reversed (180° / 270°) takes the edit at the same bay along the run — its stored bays reversed, its start where the source\'s is', async () => {
    const W = [96, 108, 96, 96, 96]
    setup(mk('A', 20, 10, W), mk('R', 20, 40, W, { rev: true }))
    expect(get('R').beams).toEqual([96, 96, 96, 108, 96])
    groupOf('A', 'R')
    await changeBeam(get('A'), 1, 96)
    expect(st().pending.summary.text).toBe('Apply to the other 1 row?')
    applyPending(); await settle()
    expect(RG.geom(get('R')).beams).toEqual(RG.geom(get('A')).beams)
    expect(RG.geom(get('R')).r0).toBeCloseTo(RG.geom(get('A')).r0, 9)
    expect(RG.geom(get('R')).r1).toBeCloseTo(RG.geom(get('A')).r1, 9)
    expect(get('R').beams).toEqual(B5)
  })

  it('RG-hand: racks in one line (gap under 10.5\') are one row; a bay edit on it replays on the other hand row; a middle bay deleted splits both rows and the pieces stay in the group — a later edit on a piece replays too', async () => {
    const len = (5 * 96 + 6 * 3) / 12
    setup(mk('A1', 20, 10, B5), mk('A2', 20 + len + 5, 10, B5), mk('B1', 20, 40, B5), mk('B2', 20 + len + 5, 40, B5))
    expect(RG.rowOfRack(rows(), 'A1')).toBe(RG.rowOfRack(rows(), 'A2'))
    expect(RG.rowOfRack(rows(), 'A1')).toBe('h|A1,A2')
    groupOf('A1', 'B1')
    expect(st().keys).toEqual(['h|A1,A2', 'h|B1,B2'])
    await changeBeam(get('A1'), 1, 84)
    expect(st().pending.summary.text).toBe('Apply to the other 1 row?')
    applyPending(); await settle()
    expect(get('B1').beams).toEqual([96, 84, 96, 96, 96])
    expect(get('B2').beams).toEqual(B5)
    // a middle bay of A2: both rows split there
    store.getState().deleteSingleBay('A2', 2); await settle()
    applyPending(); await settle()
    const pieceA = objs().find(o => o.pieceOf === 'A2'), pieceB = objs().find(o => o.pieceOf === 'B2')
    expect(pieceA && pieceB).toBeTruthy()
    expect([get('B2').beams.length, pieceB.beams.length]).toEqual([2, 2])
    expect(groupRowsNow().map(r => r.key)).toEqual(['h|A1,A2', 'h|B1,B2'])
    await changeBeam(pieceA, 0, 84)
    expect(st().pending.summary.text).toBe('Apply to the other 1 row?')
    applyPending(); await settle()
    expect(objs().find(o => o.pieceOf === 'B2').beams).toEqual([84, 96])
  })

  it('RG-two-rows: an edit to two group rows at once is not replayed on the third', async () => {
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('E', 20, 70, B5))
    groupOf('A', 'B', 'E')
    store.setState({ activeBaySelection: [{ objId: 'A', bayIdx: 1 }, { objId: 'B', bayIdx: 1 }] }); store.getState().changeSelectedBaysBeam(84); await settle()
    expect(st().pending).toBe(null)
    expect(st().message).toBe('This change touches 2 rows in the group, so it isn\'t applied to the others.')
    expect(get('E').beams).toEqual(B5)
  })
})

/* ── the wiring ── */
describe('RG-wire', () => {
  it('RG-panel: a single and a double row\'s panel offer "+ Row group" and "+ Same row in other sections" — and no Match bays', () => {
    load(filled(false))
    const html = (o) => { Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: o })) }
    for (const o of [objs().find(r => r.type === 'rack_row'), objs().find(r => r.type === 'rack_double_row')]) {
      const h = html(o)
      expect(h).toContain('aria-label="Add this row to the row group"')
      expect(h).toContain('aria-label="Same row in other sections"')
      expect(h).not.toMatch(/Match bays|Apply my changes/)
    }
  })

  it('RG-wire: the app installs the Row group watcher; the canvas shows its bar and outlines; Esc ends picking, then clears the group; the section-copy modules are gone', () => {
    const src = (p) => readFileSync(p, 'utf8')
    expect(src('src/App.jsx')).toMatch(/installRowGroupWatcher\(/)
    expect(src('src/canvas2/Canvas2.jsx')).toMatch(/<RowGroupPreview/)
    expect(src('src/canvas2/Canvas2.jsx')).toMatch(/<RowGroupBar/)
    const kb = src('src/hooks/useKeyboardShortcuts.js')
    expect(kb).toMatch(/if \(g\.picking\) \{ g\.setPicking\(false\); return \}/)
    expect(kb).toMatch(/if \(g\.keys\.length \|\| g\.pending\) \{ clearGroup\(\); return \}/)
    expect(src('src/utils/rackingAreaTool.js')).toMatch(/import \{ skipNextAction \} from '\.\/rowGroupTool'/)
    for (const f of ['src/utils/copyPrompt.js', 'src/utils/sectionCopy.js', 'src/utils/rowEdits.js', 'src/utils/syncSection.js', 'src/canvas2/CopyNote.jsx']) expect(existsSync(f)).toBe(false)
    expect(src('src/components/Toolbar/TopBar.jsx')).not.toMatch(/Always copy/)
  })
})

/* ── three more: the section label, Generate, a hand layout with no group ── */
describe('RG-label', () => {
  it('RG-label: a section reads "section 1", never "section run 1" — in Check layout (row names, overlaps) and in placement (the cross-aisle warning)', async () => {
    const { sectionLabel } = await import('../../utils/copyChange')
    const { checkLayout, rackName } = await import('../../utils/layoutCheck')
    const { generatedCrossAisleGaps } = await import('../../utils/copyChange')
    expect([sectionLabel('run 1'), sectionLabel('run 12'), sectionLabel(3)]).toEqual(['1', '12', '3'])
    // two runs whose racks carry "run 1" / "run 2" section keys, and two overlapping racks in run 1
    const tpl = filled(false).find(o => o.type === 'rack_double_row')
    const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 300 * GS, height: 100 * GS, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: 300 * GS, y: 0 }, { x: 300 * GS, y: 100 * GS }, { x: 0, y: 100 * GS }] }
    const beams = [96, 96, 96, 96, 96], width = ((3 * 6 + 480) / 12) * GS
    const rack = (id, sec, row, runFt, acrossFt) => ({ ...tpl, id, parentId: 'fp', genSection: sec, rowIndex: row, beams, width, rotation: 0, x: runFt * GS, y: acrossFt * GS })
    const objects = [fp, rack('a', 'run 1', 2, 10, 10), rack('b', 'run 1', 3, 10, 10 + DEPTH_FT(tpl) - 1), rack('c', 'run 2', 2, 120, 10)]
    expect(rackName(objects[1], objects.filter(o => BEAM.has(o.type)))).toBe('Row 2, section 1')
    const res = checkLayout(objects, { gridSize: GS })
    const overlap = res.errors.find(e => e.kind === 'overlap')
    expect(overlap.text).toMatch(/^Row \d, section 1 overlaps row \d, section 1 by /)
    for (const item of [...res.errors, ...res.warnings]) expect(item.text).not.toMatch(/run \d/)
    // placement: a rack dropped between the two runs is warned of the cross-aisle "between sections 1 and 2"
    expect(generatedCrossAisleGaps(objects, 'fp', false).map(g => g.between)).toEqual([['run 1', 'run 2']])
    load(objects)
    const one = { ...tpl, id: 'one', parentId: 'fp', beams: [96], width: ((3 * 2 + 96) / 12) * GS, rotation: 0 }
    startPlacement(store, [one])
    const { movePlacement } = await import('../../utils/placement')
    movePlacement(store, { x: 100 * GS, y: (40 + DEPTH_FT(tpl) / 2) * GS }, 1)
    const w = usePlacement.getState().active.warnings
    expect(w).toContain('In the cross-aisle between sections 1 and 2')
    expect(w.join(' ')).not.toMatch(/run \d/)
    cancelPlacement()
  })
})
const DEPTH_FT = (o) => o.height / GS

describe.each([['horizontal', false], ['vertical', true]])('RG — %s rows, Generate', (_, vert) => {
  it('RG-generate: Generate (the batched entry the Generate panel calls) ends a pending apply and clears the group — a hand row on another building included', async () => {
    const { generateAndPlaceBatched } = await import('../../generate/traceGenerate')
    const brief = { ...(vert ? { lengthFt: 200, widthFt: 480 } : { lengthFt: 480, widthFt: 200 }), gridXFt: 0, gridYFt: 0, mhe: 'reach', orientation: vert ? 'vertical' : 'horizontal', rackType: 'rack_double_row', dockDoors: 0, maxRunFt: 120 }
    store.setState({ objects: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
    await generateAndPlaceBatched(brief)
    await settle()
    // a hand-drawn building beside it with one hand row
    const tpl = objs().find(o => o.type === 'rack_double_row')
    const away = { id: 'fp2', type: 'fp_rect', x: 1e6, y: 1e6, width: 100 * GS, height: 100 * GS, wallThicknessFt: 0.25, fpVerts: [{ x: 1e6, y: 1e6 }, { x: 1e6 + 100 * GS, y: 1e6 }, { x: 1e6 + 100 * GS, y: 1e6 + 100 * GS }, { x: 1e6, y: 1e6 + 100 * GS }] }
    const { id, rowIndex, genSection, genRunFt, genCrossFt, areaId, ...h } = tpl   // eslint-disable-line no-unused-vars
    store.getState().addObject(away)
    store.getState().addObject({ ...h, id: 'handrow', parentId: 'fp2', x: 1e6 + 10 * GS, y: 1e6 + 10 * GS, rotation: 0 })
    await settle()
    const k = objs().find(o => o.rowIndex === 3 && o.type === 'rack_double_row')
    expect(addRowOf(k.id, { otherSections: true })).toBeGreaterThanOrEqual(2)
    expect(addRowOf('handrow')).toBe(1)
    await moveRow(RG.rowOfRack(rows(), k.id), GS, 0, vert)
    expect(st().pending).toBeTruthy()
    await generateAndPlaceBatched(brief)
    await settle()
    expect(st()).toMatchObject({ keys: [], pending: null, message: null })
    expect(render()).not.toMatch(/Row group ·|Apply to the other/)
    expect(objs().some(o => o.id === 'handrow')).toBe(true)                      // the hand row itself is untouched
  })
})

describe.each([['horizontal', false], ['vertical', true]])('RG — %s rows, a hand layout with no group', (_, vert) => {
  it('RG-nogroup: rows placed by hand, nothing grouped — a bay change, a move across and a delete offer nothing: no apply, no message', async () => {
    const tpl = (() => { const p = filled(false).find(o => o.type === 'rack_double_row'); const { id, rowIndex, genSection, genRunFt, genCrossFt, areaId, parentId, pieceOf, ...t } = p; return t })()   // eslint-disable-line no-unused-vars
    const L = 200 * GS, W = 100 * GS, [w, h] = vert ? [W, L] : [L, W]
    const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: w, height: h, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }
    const B5 = [96, 96, 96, 96, 96], width = ((3 * 6 + 480) / 12) * GS
    const mk = (id, run, across) => {
      if (!vert) return { ...tpl, id, parentId: 'fp', beams: B5, width, rotation: 0, x: run * GS, y: across * GS }
      const fx = across * GS, fy = run * GS
      return { ...tpl, id, parentId: 'fp', beams: B5, width, rotation: 90, x: fx - width / 2 + tpl.height / 2, y: fy - tpl.height / 2 + width / 2 }
    }
    load(rebuildAisles([fp, mk('A', 20, 10), mk('B', 20, 40), mk('E', 20, 70)], newId).objects)
    clearGroup()
    expect(st().keys).toEqual([])
    const quiet = () => expect(st()).toMatchObject({ keys: [], pending: null, message: null })
    await changeBeam(get('A'), 1, 84); quiet()
    expect(get('B').beams).toEqual(B5)
    store.getState().moveObjects(['A'], vert ? GS : 0, vert ? 0 : GS); await settle(); quiet()
    store.setState({ selectedIds: ['B'] }); store.getState().deleteSelected(); await settle(); quiet()
    expect(get('E').beams).toEqual(B5)
    expect(render()).not.toMatch(/Apply to the other|Row group ·/)
  })
})
