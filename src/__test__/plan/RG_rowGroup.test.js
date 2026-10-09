// Area RG — the Row group (utils/rowGroup.js plans, utils/rowGroupTool.js runs it on the store,
// canvas2/RowGroupBar.jsx + RowGroupPreview.jsx show it). Replaces Match bays in section, the
// section-copy bar and its Copy / Don't copy question.
//   1. Picking: the Row group tool (next to Fill racking) — a box adds the rows it touches, a click toggles
//      one row; one action, then back to Select. The group stays until Esc or ✕; never saved in the file.
//   2. An edit to one group row is replayed on the others, relative to each:
//        - bays: the source's uprights wherever both have racks (within ½"); a target gets exactly what the
//          source got — a bay through a wall or a zone included (a warning, never dropped);
//        - a move across: the same delta;  - a delete: the others deleted;
//        - a row added next to a group row: one beside each other group row, same offset, its own length.
//   3. The bar: "Row group · N rows", an "Ask / Auto apply" switch, ✕. Ask: "Apply to the other N rows?
//      W will have warnings. S skipped." — Apply and Skip, with a live preview (warned rows orange, skipped
//      rows amber). Auto apply: at once. Several rows edited the same way are applied
//      to the rest; a levels change is replayed too.
//   4. A target gets exactly what the source got: what Check layout flags after the apply and didn't
//      before (through a wall, inside a zone, an overlap, a narrow aisle, no way in, a column on an
//      upright) is a WARNING — applied, counted on the bar, marked in the preview. Skipped only: uprights
//      that don't line up (and a rack only partly inside a dragged stretch, which would need splitting).
//   5. One undo step per apply; Auto apply folds the edit and its apply into one step.
// On the hand-check layout (realLayout.fixture.js): horizontal rows as saved, vertical rows on the
// layout turned 90° (x and y swapped — the same rows mirrored); rectangle, L and T.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaCreate, planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import * as RG from '../../utils/rowGroup'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup, toggleRowOf, addRowsInBox, addRowOf, applyPending, dismissPending, groupRowsNow, ROW_GROUP_TOOL, startGroupBox, moveGroupBox, commitGroupBox } from '../../utils/rowGroupTool'
import { usePlacement, startPlacement, cancelPlacement } from '../../utils/placement'
import { TOOLS } from '../../constants'

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
  return planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation: vert ? 'vertical' : 'horizontal', wallClearIn: 0 }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
/** The layout exactly as saved: vertical, its racking area refit with its stored pattern; for horizontal rows,
 *  that result turned 90° (racks turned with it — a 90° rack becomes a 0° one, 270° → 180°). */
function savedFill(vert) {
  const objs = REAL_LAYOUT.map(o => ({ ...o }))
  const area = objs.find(o => o.type === 'racking_area')
  const out = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
  if (vert) return out
  return out.map(o => {
    if (!BEAM.has(o.type)) return turn(o)
    const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360
    return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x }
  })
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
  it('RG-pick: the Row group tool — a box adds every row it touches and the tool goes back to Select; with the tool again a click toggles one row and Select is back; the bar shows "Row group · N rows", Ask / Auto apply and ✕ — and none of the old buttons', async () => {
    load(filled(vert))
    const tool = () => store.getState().activeTool
    const box = (b) => { store.getState().setActiveTool(ROW_GROUP_TOOL); startGroupBox({ x: b.x, y: b.y }); moveGroupBox({ x: b.x + b.w, y: b.y + b.h }); return commitGroupBox(store, true, TOOLS.SELECT) }
    const click = (id) => { store.getState().setActiveTool(ROW_GROUP_TOOL); const f = rackFootprint(get(id)); startGroupBox({ x: f.x + f.w / 2, y: f.y + f.h / 2 }, id); return commitGroupBox(store, false, TOOLS.SELECT) }
    expect(box(runBox(vert, ...SEC4))).toBe(14)
    expect(tool()).toBe(TOOLS.SELECT)
    expect(st().keys).toEqual(expect.arrayContaining([...sectionKeys(4), key(2, 14)]))
    expect(st().keys).toHaveLength(14)
    const r = pairOf(key(2, 7))
    expect(click(r.id)).toBe(1)
    expect(tool()).toBe(TOOLS.SELECT)
    expect(st().keys).toContain(key(2, 7))
    expect(click(r.id)).toBe(1)
    expect(st().keys).not.toContain(key(2, 7))
    // a second box adds to the group
    expect(box(runBox(vert, -120, -15))).toBeGreaterThan(5)
    expect(st().keys.length).toBeGreaterThan(14)
    // the bar: the count, one switch, ✕ — no + This row / + Same row in other sections / Pick rows, even with a rack selected
    store.setState({ selectedIds: [r.id] })
    const html = render()
    expect(html).toMatch(/Row group · \d+ rows/)
    expect(html).toContain('role="switch" aria-checked="false" aria-label="Auto apply"')
    expect(html).toMatch(/>Ask<\/span><span[^>]*>Auto apply</)
    expect(html).toContain('aria-label="Clear the row group"')
    expect(html).not.toMatch(/This row|Same row in other sections|Pick rows|Always apply/)
    store.setState({ selectedIds: [] })
    clearGroup()
    expect(st()).toMatchObject({ keys: [], pending: null, drag: null })
    // the wiring: the toolbar button beside Fill racking, the canvas routing, Esc leaving the tool
    const tb = readFileSync('src/components/LeftPanel/FloatingToolbar.jsx', 'utf8')
    expect(tb.indexOf("label:'Row group'")).toBeGreaterThan(tb.indexOf("label:'Fill racking'"))
    const c2 = readFileSync('src/canvas2/Canvas2.jsx', 'utf8')
    expect(c2).toMatch(/const grouping = !measuring && activeTool === ROW_GROUP_TOOL/)
    expect(c2).toMatch(/commitGroupBox\(useCanvasStore, moved, TOOLS\.SELECT\)/)
    expect(readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')).toMatch(/activeTool === ROW_GROUP_TOOL\) \{ cancelGroupBox\(\); useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\); return \}/)
    // the select tool no longer picks rows (it only asks the Row group which racks a dragged group row skips)
    expect(readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')).not.toMatch(/toggleRowOf|addRowsInBox|picking\)/)
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
    expect(p.summary.skipped.map(t => t.key).sort()).toEqual([key(4, 1), key(2, 14)].sort())
    for (const t of p.summary.skipped) expect(t.reason).toMatch(/^uprights don't line up \(\d+(\.\d+)?" off\)$/)
    const html = render()
    expect(html).toContain('Apply to the other 11 rows? 2 skipped.')
    expect(html).toMatch(/Skipped — Section 4, row 1: uprights don&#x27;t line up \(\d+(\.\d+)?&quot; off\)/)
    expect(html).toMatch(/Skipped — Section 2, row 14: uprights don&#x27;t line up \(\d+(\.\d+)?&quot; off\)/)
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
  /* ── 3. a bay through the wall: applied, a warning (it used to be dropped) ── */
  it('RG-drop: bay 5 96" → 108" (b2) — the targets end 1\' past the wall: "Apply to the other 11 rows? 11 will have warnings. 2 skipped." — each "through a wall", their racks marked warned in the preview; Apply gives every target the same bays as the source (nothing dropped), and Check layout reports each one past the wall', async () => {
    const { checkLayout } = await import('../../utils/layoutCheck')
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const src = pairOf(key(4, 7)), wall = 249.75
    const bays0 = new Map(sectionKeys(4).map(k => [k, bayCount(k)]))
    await changeBeam(src, 4, 108)
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 11 rows? 11 will have warnings. 2 skipped.')
    expect(p.summary.text).not.toMatch(/lose/)
    expect(p.summary.warned).toHaveLength(11)
    for (const w of p.summary.warned) expect(w.reasons).toEqual(expect.arrayContaining(['through a wall']))
    expect(render()).toContain('Apply to the other 11 rows? 11 will have warnings. 2 skipped.')
    const rects = RG.previewRects(objs(), p.plan, GS)
    const kinds = (k) => rects.filter(r => r.kind === k)
    expect(kinds('dropped')).toEqual([])
    for (const w of p.summary.warned) for (const r of p.plan.targets.find(t => t.key === w.key).racks) expect(kinds('warned').some(q => q.key.endsWith(r.id))).toBe(true)
    const skippedIds = [...rows().get(key(4, 1)).ids, ...rows().get(key(2, 14)).ids]
    expect(kinds('skipped')).toHaveLength(skippedIds.length)
    expect(new Set(rects.map(r => r.key)).size).toBe(rects.length)              // every outline keyed uniquely
    const pv = readFileSync('src/canvas2/RowGroupPreview.jsx', 'utf8')
    expect(pv).not.toMatch(/DROPPED/)
    expect(pv).toMatch(/export const SKIPPED = '#E67E22'/)
    expect(pv).toMatch(/rect\(p\.f, p\.key, SKIPPED, \{ dash: \[3, 3\]/)
    applyPending(); await settle()
    const outside = checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'outside')
    for (const w of p.summary.warned) {
      expect(bayCount(w.key)).toBe(bays0.get(w.key))                           // nothing dropped
      expect(Math.max(...racksOf(w.key).map(o => RG.geom(o).r1))).toBeGreaterThan(wall * GS)
      expect(outside.some(e => e.ids.some(id => rows().get(w.key).ids.includes(id)))).toBe(true)
    }
    expect(st().message).toBe('Applied to 11 rows · 11 with warnings — see Check layout · 2 skipped')
  })

  it('RG-zone: section 3 row 7, bay 11 96" → 132" (b′) — the rows that run to the office get the bay into it: "Apply to the other 11 rows? 3 will have warnings. 2 skipped.", each "inside a zone"; Check layout reports them after', async () => {
    const { checkLayout } = await import('../../utils/layoutCheck')
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC3))
    await changeBeam(pairOf(key(3, 7)), 10, 132)
    const p = st().pending
    // (BUG 79: the run's start end snapped to the wall, the cross-aisles are 9' 3" — the bay 3' longer closes the one
    // past it to 6' 3" in the other rows too: 3 → 10 warnings)
    expect(p.summary.text).toBe('Apply to the other 11 rows? 10 will have warnings. 2 skipped.')
    const zoned = [key(3, 3), key(3, 4), key(3, 5)], narrowed = [6, 8, 9, 10, 11, 12, 13].map(i => key(3, i))
    expect(p.summary.warned.map(w => w.key).sort()).toEqual([...zoned, ...narrowed].sort())
    for (const w of p.summary.warned) expect(w.reasons).toEqual(zoned.includes(w.key) ? expect.arrayContaining(['inside a zone']) : ['a cross-aisle under the travel width'])
    applyPending(); await settle()
    const inZone = checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'zone')
    for (const w of p.summary.warned.filter(w => zoned.includes(w.key))) expect(inZone.some(e => e.ids.some(id => rows().get(w.key).ids.includes(id)) && /inside the Office by/.test(e.text))).toBe(true)
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
  it('RG-across: row 7 of every section; section 4\'s row moved 1\' across → the others move the same 1\', each with a warning — the move leaves 9\' 6" on one side, under the pick width (an aisle Check layout sees since BUG 74); one undo step', async () => {
    load(filled(vert))
    addRowOf(pairOf(key(4, 7)).id, { otherSections: true })
    const s0 = new Map([1, 2, 3, 4].map(i => [i, RG.geom(pairOf(key(i, 7))).s0]))
    await moveRow(key(4, 7), GS, 0, vert)
    expect(st().pending.summary.text).toBe('Apply to the other 3 rows? 3 will have warnings.')
    const warned = st().pending.plan.targets.filter(t => (t.warnings || []).length)
    expect(warned.length).toBe(3)
    for (const t of warned) expect(t.warnings).toEqual([RG.WARN_KINDS['aisle-pick']])
    const h = hist()
    applyPending(); await settle()
    expect(hist()).toBe(h + 1)
    for (const i of [1, 2, 3, 4]) expect(RG.geom(pairOf(key(i, 7))).s0 - s0.get(i)).toBeCloseTo(GS, 6)
    store.getState().undo()
    for (const i of [1, 2, 3]) expect(RG.geom(pairOf(key(i, 7))).s0).toBeCloseTo(s0.get(i), 6)
  })

  it('RG-together: every row in the group, one moved 3.875\' across → the others move with it: no aisle warning between rows (rows moving together are judged where they end up); the two wall rows go through the wall — applied, with that warning; 23 rows end up with a column in their aisle leaving under 8\' (the column-in-aisle check, BUG 75) — warned', async () => {
    load(filled(vert))
    addRowsInBox({ x: -1e6, y: -1e6, w: 2e6, h: 2e6 })
    const n = st().keys.length
    await moveRow(key(4, 7), 3.875 * GS, 0, vert)
    const p = st().pending
    expect(p.summary.text).toBe(`Apply to the other ${n - 1} rows? 25 will have warnings.`)
    expect(p.summary.skipped).toEqual([])
    expect(p.summary.warned).toHaveLength(25)
    const wall = p.summary.warned.filter(w => w.reasons.includes('through a wall')), cols = p.summary.warned.filter(w => !w.reasons.includes('through a wall'))
    expect(wall).toHaveLength(2)
    for (const w of wall) expect(w.reasons.some(r => /aisle/.test(r))).toBe(false)
    expect(cols).toHaveLength(23)
    for (const w of cols) expect(w.reasons).toEqual(['an aisle under the travel width'])
    applyPending(); await settle()
    // the reason is a column standing in the aisle, never the gap between the rows
    const { checkLayout } = await import('../../utils/layoutCheck')
    const drive = checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'aisle-drive')
    expect(drive.length).toBeGreaterThan(0)
    expect(drive.every(e => /a column leaves/.test(e.text))).toBe(true)
    expect(RG.geom(pairOf(key(1, 7))).s0 - RG.geom(pairOf(key(1, 8))).s0).toBeCloseTo(RG.geom(filled(vert).find(o => o.genSection === 1 && o.rowIndex === 7 && o.type === 'rack_double_row')).s0 - RG.geom(filled(vert).find(o => o.genSection === 1 && o.rowIndex === 8 && o.type === 'rack_double_row')).s0, 6)
  })

  it('RG-drift: a drag with a snap\'s drift along (1\' across, 0.9\' along) → only the across part is replayed: the others move 1\' across and not at all along; 3 warned — 2 with a column in their aisle leaving under 8\' (the column-in-aisle check, BUG 75)', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const g0 = RG.geom(pairOf(key(4, 9)))
    await moveRow(key(4, 7), GS, 0.9 * GS, vert)
    expect(st().pending.summary.text).toBe('Apply to the other 13 rows? 3 will have warnings.')
    expect(st().pending.summary.warned.filter(w => w.reasons.includes('an aisle under the travel width'))).toHaveLength(2)
    applyPending(); await settle()
    const { checkLayout } = await import('../../utils/layoutCheck')
    const drive = checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'aisle-drive')
    expect(drive.length).toBeGreaterThan(0)
    expect(drive.every(e => /a column leaves/.test(e.text))).toBe(true)
    const g1 = RG.geom(pairOf(key(4, 9)))
    expect(g1.s0 - g0.s0).toBeCloseTo(GS, 6)
    expect(g1.r0).toBeCloseTo(g0.r0, 9)
    expect(RG.geom(pairOf(key(4, 7))).r0 - g0.r0).toBeCloseTo(0.9 * GS, 6)   // the source keeps its own drift
  })

  it('RG-part: only the pair of the half row 4/6 dragged 1\' across → the racks more than half inside its stretch move (rows 2-5, and row 1\'s wall rack); a row whose rack is only partly inside is skipped with the reason — no rack is split', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const n0 = beamRacks(objs()).length
    const before = new Map(beamRacks(objs()).map(o => [o.id, RG.geom(o)]))
    const pr = racksOf(key(4, 6)).find(o => o.type === 'rack_double_row')
    store.getState().moveObjects([pr.id], vert ? GS : 0, vert ? 0 : GS); await settle()
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 5 rows? 8 skipped.')
    expect(new Set(p.summary.skipped.map(t => t.reason))).toEqual(new Set(['a rack only partly inside the stretch that moved']))
    expect(p.summary.skipped.map(t => t.key).sort()).toEqual([...[7, 8, 9, 10, 11, 12, 13].map(i => key(4, i)), key(2, 14)].sort())
    applyPending(); await settle()
    expect(beamRacks(objs()).length).toBe(n0)                                   // nothing split
    for (const i of [2, 3, 4, 5]) expect(RG.geom(pairOf(key(4, i))).s0 - before.get(pairOf(key(4, i)).id).s0).toBeCloseTo(GS, 6)
    for (const i of [7, 8, 13]) expect(RG.geom(pairOf(key(4, i))).s0).toBeCloseTo(before.get(pairOf(key(4, i)).id).s0, 9)
    const single = racksOf(key(4, 6)).find(o => o.type === 'rack_row')
    expect(RG.geom(single).s0).toBeCloseTo(before.get(single.id).s0, 9)       // the rest of the source row untouched
  })

  it('RG-warn-bays: bays are no longer dropped at a cross-aisle or a rack along — section 2\'s row 7 given two bays toward section 3: every row takes both, "11 will have warnings" (an overlap), and Check layout reports the overlaps after', async () => {
    const { checkLayout } = await import('../../utils/layoutCheck')
    load(filled(vert))
    addRowsInBox(runBox(vert, -120, -15))
    const n0 = new Map(sectionKeys(2).map(k => [k, bayCount(k)]))
    const src = pairOf(key(2, 7))
    store.getState().commitObjectUpdate(src.id, Panel.addBayUpdate({ ...src, ...Panel.addBayUpdate(src, 96, GS) }, 96, GS)); await settle()
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 11 rows? 11 will have warnings. 2 skipped.')
    for (const w of p.summary.warned) expect(w.reasons).toEqual(['an overlap'])
    applyPending(); await settle()
    // (the far wall row's piece, stamped section 2 since BUG 79, is not in the group: it keeps its bays)
    for (const k of sectionKeys(2).filter(k => k !== key(2, 14))) expect(bayCount(k)).toBe(n0.get(k) + 2)
    const overlaps = checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'overlap')
    for (const w of p.summary.warned) expect(overlaps.some(e => e.ids.some(id => rows().get(w.key).ids.includes(id)))).toBe(true)
    expect(st().message).toBe('Applied to 11 rows · 11 with warnings — see Check layout · 2 skipped')
  })

  it('RG-along: a move along the row is replayed like one across — row 7 in every section moved 1\' along → every row 7 moves 1\' along; one pushed through the end wall is applied with "through a wall"', async () => {
    load(filled(vert))
    addRowOf(pairOf(key(4, 7)).id, { otherSections: true })
    const r0 = new Map([1, 2, 3, 4].map(i => [i, RG.geom(pairOf(key(i, 7))).r0]))
    await moveRow(key(4, 7), 0, -GS, vert)
    expect(st().pending.edit.kind).toBe('along')
    // (section 1's row 7 starts at the wall since BUG 79: moved 1' toward it, it goes through — before, no warning)
    expect(st().pending.summary.text).toBe('Apply to the other 3 rows? 1 will have warnings.')
    expect(st().pending.summary.warned).toEqual([{ key: key(1, 7), reasons: ['through a wall'] }])
    applyPending(); await settle()
    for (const i of [1, 2, 3, 4]) expect(RG.geom(pairOf(key(i, 7))).r0 - r0.get(i)).toBeCloseTo(-GS, 6)
    // section 4's row 7 runs to the end wall: 2' further toward it — applied, "through a wall"
    await moveRow(key(1, 7), 0, 3 * GS, vert)
    const p = st().pending
    expect(p.summary.skipped).toEqual([])
    // (BUG 79: section 3's row 7 no longer puts an upright on a column there — before, 2 warnings with it)
    expect(p.summary.text).toBe('Apply to the other 3 rows? 1 will have warnings.')
    expect(p.summary.warned).toEqual([{ key: key(4, 7), reasons: expect.arrayContaining(['through a wall']) }])
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
  it('RG-multi: one action changing several group rows the same way is applied to the rest — two rows moved the same 3" across → "Apply to the other 12 rows? 1 will have warnings." (the wall row through the wall); select-all + Delete deletes every row, so nothing is left to offer', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const s0 = RG.geom(pairOf(key(4, 11))).s0
    store.getState().moveObjects([...rows().get(key(4, 8)).ids, ...rows().get(key(4, 9)).ids], vert ? GS / 4 : 0, vert ? 0 : GS / 4); await settle()
    // row 7 keeps the column already on its upright (the move adds none); section 3's row 14 goes through the wall
    expect(st().pending.summary.text).toBe('Apply to the other 12 rows? 1 will have warnings.')
    expect(st().pending.summary.warned).toEqual([{ key: key(2, 14), reasons: ['through a wall'] }])
    applyPending(); await settle()
    expect(RG.geom(pairOf(key(4, 11))).s0 - s0).toBeCloseTo(GS / 4, 6)
    store.getState().selectAll(); store.getState().deleteSelected(); await settle()
    expect(st()).toMatchObject({ pending: null, message: null })
  })

  it('RG-bayclick: a bay clicked in one row, changed; then a bay clicked in another row, changed — the second edit is offered too (a bay click is selection, not an edit)', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const r7 = pairOf(key(4, 7)).id, r8 = pairOf(key(4, 8)).id
    store.getState().selectObject(r7); store.getState().updateObject(r7, { activeBayIdx: 4 })
    store.getState().commitObjectUpdate(r7, Panel.changeBayUpdate(get(r7), 4, 84, GS)); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 11 rows? 2 skipped.')
    dismissPending()
    store.getState().selectObject(r8); store.getState().updateObject(r8, { activeBayIdx: 2 })
    expect(get(r7).activeBayIdx).toBe(null)                                     // the first row's click cleared, with no history entry
    store.getState().commitObjectUpdate(r8, Panel.changeBayUpdate(get(r8), 2, 84, GS)); await settle()
    expect(st().message).toBe(null)
    expect(st().pending.summary.text).toMatch(/^Apply to the other \d+ rows\?/)
    expect(st().pending.edit.source).toBe(key(4, 8))
  })

  it('RG-same-edit: the same bay changed on rows 7 and 8 at once (a multi-bay selection) → "Apply to the other 10 rows? 2 skipped."; Apply gives every other row that bay', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    store.setState({ activeBaySelection: [{ objId: pairOf(key(4, 7)).id, bayIdx: 4 }, { objId: pairOf(key(4, 8)).id, bayIdx: 4 }] }); store.getState().changeSelectedBaysBeam(84); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 10 rows? 2 skipped.')
    expect([...st().pending.edit.sources].sort()).toEqual([key(4, 7), key(4, 8)].sort())
    applyPending(); await settle()
    for (const i of [9, 10, 11, 12, 13]) expect(pairOf(key(4, i)).beams[4]).toBe(84)
    expect(racksOf(key(4, 6)).find(o => o.type === 'rack_row').beams[4]).toBe(84)
  })

  it('RG-levels: levels 4 → 5 on row 7 → "Apply to the other 13 rows?" → every group row at 5 levels, one undo step; a depth change is still not replayed', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    const before = strip(objs())
    store.getState().commitObjectUpdate(pairOf(key(4, 7)).id, { levels: 5 }); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 13 rows?')
    const h = hist()
    applyPending(); await settle()
    expect(hist()).toBe(h + 1)
    for (const k of st().keys) for (const o of racksOf(k)) expect(o.levels).toBe(5)
    expect(beamRacks(objs()).filter(o => !st().keys.some(k => rows().get(k).ids.includes(o.id))).every(o => o.levels === before.find(b => b.id === o.id).levels)).toBe(true)
    store.getState().undo()
    expect(racksOf(key(4, 9)).every(o => o.levels === before.find(b => b.id === o.id).levels)).toBe(true)
    store.getState().commitObjectUpdate(pairOf(key(4, 9)).id, { depthIn: 48 }); await settle()
    expect(st().pending).toBe(null)
    expect(st().message).toBe('Not applied to the other rows: a change of depth or kind isn\'t replayed.')
  })

  it('RG-always: Auto apply applies at once, folded into the edit\'s own history entry — one Ctrl+Z undoes the edit and its apply together; the switch is remembered', async () => {
    load(filled(vert))
    addRowsInBox(runBox(vert, ...SEC4))
    useRowGroup.getState().setAlwaysApply(true)
    expect(localStorage.getItem('trace.rowGroup.always')).toBe('1')
    expect(render()).toContain('role="switch" aria-checked="true" aria-label="Auto apply"')
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

/* ── the hand check on 3a652bc, on the layout as saved: rows 22-25 of section 1 under the office ── */
describe.each([['horizontal', false], ['vertical', true]])('RG — %s rows, the layout as saved', (_, vert) => {
  const four = () => [22, 23, 24, 25].map(i => key(1, i))
  const r22 = () => pairOf(key(1, 22))
  it('RG-rows22: rows 22-25 grouped, Auto apply — a move with an along drift (3") left on row 22 offsets its uprights 3" from the others; a bay deleted then applies to none: "Nothing applied. 3 skipped", each "uprights don\'t line up (3" off)", no question, no Skip; with the drag\'s axis lock there is no drift and the same delete applies to all three', async () => {
    for (const locked of [false, true]) {
      load(savedFill(vert))
      useRowGroup.setState({ keys: four() })
      useRowGroup.getState().setAlwaysApply(true)
      const ups0 = four().map(k => ups(pairOf(k)))
      expect(ups0.every(u => u.every((v, i) => Math.abs(v - ups0[0][i]) < 1e-6))).toBe(true)          // as loaded: all four identical
      // a 1.5' move across with a 3" drift along — what a wobbly drag used to give; locked: what it gives now
      let d = vert ? { dx: 1.5 * GS, dy: 0.25 * GS } : { dx: 0.25 * GS, dy: 1.5 * GS }
      if (locked) d = RG.lockToAxis(d.dx, d.dy)
      store.getState().moveObjects(rows().get(key(1, 22)).ids, d.dx, d.dy); await settle()
      expect(st().message).toMatch(/^Applied to 3 rows/)
      const off = (RG.geom(r22()).r0 - RG.geom(pairOf(key(1, 23))).r0) / GS * 12
      expect(off).toBeCloseTo(locked ? 0 : 3, 6)
      const h = hist()
      store.getState().deleteSingleBay(r22().id, 1); await settle()
      expect(st().pending).toBe(null)                                            // Auto apply never asks
      if (!locked) {
        expect(hist()).toBe(h + 1)
        expect(st().message).toBe('Nothing applied. 3 skipped')
        expect(st().report.skipped.map(t => t.reason)).toEqual(Array(3).fill('uprights don\'t line up (3" off)'))
        const html = render()
        expect(html).toContain('Nothing applied. 3 skipped')
        expect(html).toContain('Skipped — Section 1, row 23: uprights don&#x27;t line up (3&quot; off)')
        expect(html).not.toMatch(/aria-label="Skip"|Apply to the other/)
      } else {
        expect(st().message).toBe('Applied to 3 rows')
        for (const k of four()) expect(racksOf(k)).toHaveLength(2)                 // every row split at the same bay
      }
      useRowGroup.getState().setAlwaysApply(false)
    }
  })

  it('RG-office-bay: rows 22-25, a bay added at the office end of row 22 — every target gets that bay too, into the office: "Apply to the other 3 rows? 3 will have warnings.", each "inside a zone"; Apply changes all three (it used to drop the bay again and change nothing while saying "3 rows lose a bay"); Check layout reports them', async () => {
    const { checkLayout } = await import('../../utils/layoutCheck')
    load(savedFill(vert))
    useRowGroup.setState({ keys: four() })
    const before = new Map(four().map(k => [k, JSON.stringify(racksOf(k).map(o => [o.x, o.y, o.width, o.beams]))]))
    const src = r22(), g = RG.geom(src)
    const w = RG.withRun(src, g.r0 - (99 / 12) * GS, [96, ...g.beams], GS)
    store.getState().commitObjectUpdate(src.id, { x: w.x, y: w.y, width: w.width, beams: w.beams }); await settle()
    const p = st().pending
    expect(p.summary.text).toBe('Apply to the other 3 rows? 3 will have warnings.')
    for (const t of p.summary.warned) expect(t.reasons).toEqual(expect.arrayContaining(['inside a zone']))
    applyPending(); await settle()
    for (const k of four().slice(1)) {
      expect(JSON.stringify(racksOf(k).map(o => [o.x, o.y, o.width, o.beams]))).not.toBe(before.get(k))
      expect(bayCount(k)).toBe(5)
    }
    const inZone = checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'zone')
    for (const k of four()) expect(inZone.some(e => e.ids.includes(pairOf(k).id))).toBe(true)
  })

  it('RG-nothing: Ask — every target skipped gives no question either: "Nothing applied. N skipped" with the reasons; an edit no other group row has racks for says "Nothing applied: no other group row has racks there."', async () => {
    load(savedFill(vert))
    useRowGroup.setState({ keys: four() })
    const h0 = hist()
    // a bay edit at the row's far end — rows 23-25 line up but a deleted end bay is one they all have: applied; so use the offset rows
    store.getState().moveObjects(rows().get(key(1, 22)).ids, vert ? 0 : 0.25 * GS, vert ? 0.25 * GS : 0); await settle()   // 3" along, replayed
    expect(st().pending.edit.kind).toBe('along')
    dismissPending()                                                            // Skip: only row 22 moved
    store.getState().deleteSingleBay(r22().id, 1); await settle()
    expect(st().pending).toBe(null)
    expect(st().message).toBe('Nothing applied. 3 skipped')
    expect(render()).not.toMatch(/Apply to the other|aria-label="Skip"/)
    expect(hist()).toBeGreaterThan(h0)
    // a group of rows 22-25 and a row of another section nowhere near: a bay edit on that row touches none of them
    load(savedFill(vert))
    useRowGroup.setState({ keys: [...four(), key(2, 3)] })
    await changeBeam(pairOf(key(2, 3)), 1, 84)
    expect(st().pending).toBe(null)
    expect(st().message).toBe('Nothing applied: no other group row has racks there.')
  })

  it('RG-snap: a dragged group row skips the other group rows and every rack lined up with where it started as snap targets — a 2" drag that used to snap back to 0 keeps its 2"; a rack outside the group is not affected; the drag is locked to its axis', async () => {
    const { computeSmartGuides } = await import('../../canvas2/smartGuides')
    const { snapTargets } = await import('../../utils/layers')
    load(savedFill(vert))
    const sec2 = [10, 11, 12, 13, 14, 15, 16].map(i => key(2, i))
    useRowGroup.setState({ keys: sec2 })
    const me = pairOf(key(2, 13)), zoom = 25 / GS, d = (2 / 12) * GS
    const [dx, dy] = vert ? [d, 0] : [0, d]
    const all = snapTargets(objs(), store.getState().layers, new Set([me.id]))
    const snapped = computeSmartGuides([me.id], all, GS, zoom, dx, dy)
    expect(vert ? snapped.snapDx : snapped.snapDy).toBeCloseTo(0, 6)              // every rack a target: pulled back to where it was
    const skip = RG.groupDragExclusions(objs(), [me.id], sec2, GS)
    for (const k of sec2) for (const id of rows().get(k).ids) if (id !== me.id) expect(skip.has(id)).toBe(true)
    expect(skip.has(pairOf(key(1, 13)).id)).toBe(true)                          // the same row in section 1: lined up with it
    const free = computeSmartGuides([me.id], all.filter(o => !skip.has(o.id)), GS, zoom, dx, dy)
    const kept = (vert ? free.snapDx : free.snapDy) ?? d                       // no snap: the drag as it is
    expect(kept).toBeCloseTo(d, 6)
    expect(RG.groupDragExclusions(objs(), [pairOf(key(1, 5)).id], sec2, GS)).toBe(null)   // not a group row: an ordinary drag
    // the axis lock: a wobbly drag keeps nothing on the other axis
    expect(RG.lockToAxis(37, 4)).toEqual({ dx: 37, dy: 0 })
    expect(RG.lockToAxis(-3, 29)).toEqual({ dx: 0, dy: 29 })
    const ci = readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')
    expect(ci).toMatch(/groupNoSnap: groupDragFor\(st\.objects, ids\)/)
    expect(ci).toMatch(/if \(d\.groupNoSnap\) \(\{ dx, dy \} = lockToAxis\(dx, dy\)\)/)
    expect((ci.match(/targetsFor\(/g) || []).length).toBe(4)                    // both drag paths: the smart guides and the in-line snap
    expect(ci).toMatch(/const targetsFor = \(objs\) => \{ const t = snapTargets\(objs, st\.layers, d\.movedIds\); return d\.groupNoSnap \? t\.filter\(o => !d\.groupNoSnap\.has\(o\.id\)\) : t \}/)
    expect((ci.match(/\n\s+lock\(\)\r?\n/g) || []).length).toBe(2)                // locked again after snapping, both paths
    // a live-flue drag that ends where it started writes no history
    expect(ci).toMatch(/if \(back\) st\.updateObject\(d\.ids\[0\], \{ x: s0\.x, y: s0\.y, height: s0\.height, flueSpaceIn: s0\.flueSpaceIn \}\)/)
  })
})

/* ── the shapes: the replay keeps the layout clean on the rectangle, the L and the T ── */
describe.each([['rectangle'], ['L'], ['T']])('RG-shape — %s', (shape) => {
  it.each([['horizontal', false], ['vertical', true]])('RG-shape (%s): a bay change on a middle row of each section, replayed on its section → no new overlap, every target rack inside the walls unless it carries "through a wall", every target upright on the source\'s, no bay dropped', async (_, vert) => {
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
        if (!(t.warnings || []).includes('through a wall')) for (const o of racksOf(t.key)) expect(inside(o, fp)).toBe(true)
        expect(bayCount(t.key)).toBe(bays0.get(t.key))                          // a beam change: the same bays, none dropped
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
  const groupOf = (...ids) => { for (const id of ids) toggleRowOf(id) }
  const moveAcross = async (id, dFt) => { store.getState().moveObjects(rows().get(RG.rowOfRack(rows(), id)).ids, vert ? dFt * GS : 0, vert ? 0 : dFt * GS); await settle() }
  const reasonOf = (id) => st().pending.plan.targets.find(t => t.key === RG.rowOfRack(rows(), id))
  const across0 = (id) => RG.geom(get(id)).s0 / GS

  /* the travel width, exactly: an aisle of 8.0' takes the move, 7.99' does not */
  it('RG-warn-aisle: the travel width is a warning, not a skip — B ends 8.0\' from the rack across → applied, no warning; 7.99\' → applied, "an aisle under the travel width"', async () => {
    const C0 = 40 + DEPTH + 10                                                  // a 10' aisle beyond B (already under the pick width)
    for (const [d, warn] of [[2, null], [2.01, 'an aisle under the travel width']]) {
      setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('C', 20, C0, B5))
      groupOf('A', 'B')
      await moveAcross('A', d)
      const t = reasonOf('B')
      expect(t.status).toBe('apply')
      expect(t.warnings || null).toEqual(warn && [warn])
      expect(st().pending.summary.text).toBe(warn ? 'Apply to the other 1 row? 1 will have warnings.' : 'Apply to the other 1 row?')
      if (warn) expect(render()).toContain('Warning — Row at')
      applyPending(); await settle()
      expect(C0 - (across0('B') + DEPTH)).toBeCloseTo(10 - d, 9)
    }
  })

  it('RG-warn-and-skip: an overlap, a column on an upright, a wall and a zone are all warnings — applied, marked in the preview, reported by Check layout after', async () => {
    const { checkLayout } = await import('../../utils/layoutCheck')
    // overlap: B lands on C — applied, with the warning
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('C', 20, 40 + DEPTH + 10, B5))
    groupOf('A', 'B')
    await moveAcross('A', 11)
    expect(reasonOf('B')).toMatchObject({ status: 'apply', warnings: ['an overlap'] })
    const rects = RG.previewRects(objs(), st().pending.plan, GS)
    expect(rects.filter(r => r.kind === 'warned').map(r => r.key)).toEqual([expect.stringMatching(/B$/)])
    applyPending(); await settle()
    expect(checkLayout(objs(), { gridSize: GS }).errors.some(e => e.kind === 'overlap' && e.ids.includes('B') && e.ids.includes('C'))).toBe(true)
    // a wall: B goes 1' through the building's wall — applied, "through a wall"; Check layout says so after
    setup(mk('A', 20, 10, B5), mk('B', 20, 100 - 0.25 - DEPTH - 1, B5))
    groupOf('A', 'B')
    await moveAcross('A', 2)
    expect(reasonOf('B')).toMatchObject({ status: 'apply', warnings: ['through a wall'] })
    expect(st().pending.summary.text).toBe('Apply to the other 1 row? 1 will have warnings.')
    applyPending(); await settle()
    expect(checkLayout(objs(), { gridSize: GS }).errors.some(e => e.kind === 'outside' && e.ids.includes('B'))).toBe(true)
    // a zone: B lands on an office — applied, "inside a zone"; D (no zone) takes it with no warning
    const z = at(20, 40 + DEPTH + 1)
    const zone = { id: 'z', type: 'zone_office', parentId: 'fp', x: z.x, y: z.y, width: vert ? 20 * GS : 60 * GS, height: vert ? 60 * GS : 20 * GS }
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('D', 120, 40, B5), zone)
    groupOf('A', 'B', 'D')
    await moveAcross('A', 2)
    expect(reasonOf('B')).toMatchObject({ status: 'apply', warnings: ['inside a zone'] })
    expect(reasonOf('D')).toMatchObject({ status: 'apply' })
    expect(reasonOf('D').warnings).toBe(undefined)
    expect(st().pending.summary.text).toBe('Apply to the other 2 rows? 1 will have warnings.')
    applyPending(); await settle()
    expect(checkLayout(objs(), { gridSize: GS }).errors.some(e => e.kind === 'zone' && e.ids.includes('B') && e.ids.includes('z'))).toBe(true)
    // a column: B's first upright would stand on one — applied, with the warning
    const c = at(20 + 1.5 / 12, 40 + DEPTH + 1)
    const cg = { id: 'cg', type: 'column_grid', parentId: 'fp', x: c.x, y: c.y, spacingX: [1e6], spacingY: [1e6], columnW: GS, columnH: GS }
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), cg)
    groupOf('A', 'B')
    await moveAcross('A', 2)
    expect(reasonOf('B')).toMatchObject({ status: 'apply', warnings: ['a column on an upright'] })
    expect(render()).toContain('Warning — Row at')
    expect(render()).toContain(': a column on an upright')
    applyPending(); await settle()
    expect(checkLayout(objs(), { gridSize: GS }).errors.some(e => e.kind === 'upright' && e.ids.includes('B'))).toBe(true)
    const pv = readFileSync('src/canvas2/RowGroupPreview.jsx', 'utf8')
    expect(pv).toMatch(/export const WARNED = '#D35400'/)
    expect(pv).toMatch(/p\.kind === 'warned' \? rect\(p\.f, p\.key, WARNED, \{ dash: \[10, 3\]/)
  })

  it('RG-along-warn: an along move follows the same rules — B moved 13\' along onto C (in line, 11\' beyond it — its own row) is applied with "an overlap"; one through the end wall is applied with "through a wall"', async () => {
    const len = (5 * 96 + 6 * 3) / 12
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('C', 20 + len + 11, 40, B5))
    groupOf('A', 'B')
    const moveAlong = async (id, dFt) => { store.getState().moveObjects(rows().get(RG.rowOfRack(rows(), id)).ids, vert ? 0 : dFt * GS, vert ? dFt * GS : 0); await settle() }
    expect(RG.rowOfRack(rows(), 'C')).toBe('h|C')
    await moveAlong('A', 13)
    expect(st().pending.edit.kind).toBe('along')
    expect(reasonOf('B').status).toBe('apply')
    expect(reasonOf('B').warnings).toEqual(expect.arrayContaining(['an overlap']))
    applyPending(); await settle()
    expect(RG.geom(get('B')).r0 / GS).toBeCloseTo(33, 6)
    setup(mk('A', 20, 10, B5), mk('B', 200 - 0.25 - len - 2, 40, B5))
    groupOf('A', 'B')
    await moveAlong('A', 4)
    expect(reasonOf('B')).toMatchObject({ status: 'apply', warnings: ['through a wall'] })
  })

  it('RG-skip-lineup: a row whose uprights are off the source\'s (4\' along) takes no bay edit — "uprights don\'t line up (48" off)"; a row beside it that lines up does', async () => {
    setup(mk('A', 20, 10, B5), mk('B', 24, 40, B5), mk('E', 20, 70, B5))
    groupOf('A', 'B', 'E')
    await changeBeam(get('A'), 1, 84)
    expect(reasonOf('B')).toMatchObject({ status: 'skip', reason: 'uprights don\'t line up (48" off)' })
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

  it('RG-two-rows: two group rows given the same bay change at once → the third gets it; given different changes → not replayed, the bar says so', async () => {
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('E', 20, 70, B5))
    groupOf('A', 'B', 'E')
    store.setState({ activeBaySelection: [{ objId: 'A', bayIdx: 1 }, { objId: 'B', bayIdx: 1 }] }); store.getState().changeSelectedBaysBeam(84); await settle()
    expect(st().pending.summary.text).toBe('Apply to the other 1 row?')
    applyPending(); await settle()
    expect(get('E').beams).toEqual([96, 84, 96, 96, 96])
    setup(mk('A', 20, 10, B5), mk('B', 20, 40, B5), mk('E', 20, 70, B5))
    groupOf('A', 'B', 'E')
    store.setState({ activeBaySelection: [{ objId: 'A', bayIdx: 1 }, { objId: 'B', bayIdx: 2 }] }); store.getState().changeSelectedBaysBeam(84); await settle()
    expect(st().pending).toBe(null)
    expect(st().message).toBe('These 2 rows were changed in different ways, so the change isn\'t applied to the others.')
    expect(get('E').beams).toEqual(B5)
  })
})

/* ── the column in an aisle: the travel width met to within 0.001 ft, the same tolerance as the lane check ── */
describe.each([['horizontal', false], ['vertical', true]])('RG-travel — %s', (_, vert) => {
  it('RG-travel: a 13\'3" aisle with a 1\' column 4.25\' from one row: the far side 8.000\' (or 7.9996\', built from edges that aren\'t whole feet) passes — not "under travel", not pinched, level 2; 7.99\' is under travel on both sides', async () => {
    const { aisleColumnBlocks, MHE_PROFILES, aisleLevel, TRAVEL_TOL_FT } = await import('../../generate/columnCheck')
    expect(TRAVEL_TOL_FT).toBe(0.001)
    const dep = 7.75, mk = (id, s) => vert
      ? { id, type: 'rack_double_row', x: s * GS - (40 * GS - dep * GS) / 2, y: 20 * GS - (dep * GS - 40 * GS) / 2, width: 40 * GS, height: dep * GS, rotation: 90, beams: [96, 96, 96, 96], uprightWidth: 3 }
      : { id, type: 'rack_double_row', x: 20 * GS, y: s * GS, width: 40 * GS, height: dep * GS, rotation: 0, beams: [96, 96, 96, 96], uprightWidth: 3 }
    for (const [far, pinched] of [[8, false], [8 - 0.0004, false], [7.99, true]]) {
      const a = mk('a', 10), aEnd = 10 + dep, gap = 4.25 + 1 + far, b = mk('b', aEnd + gap)
      const colAt = aEnd + 4.25, col = vert ? { x: colAt * GS, y: 30 * GS, w: GS, h: GS } : { x: 30 * GS, y: colAt * GS, w: GS, h: GS }
      const [blk] = aisleColumnBlocks({ racks: [a, b], columns: [col], profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks
      expect(blk).toMatchObject({ pinched, nearShort: true, farShort: pinched, level: pinched ? 1 : 2 })
      expect(aisleLevel(far * GS, MHE_PROFILES.reach, GS)).toBe(pinched ? 1 : 2)
    }
  })
})

/* ── the wiring ── */
describe('RG-wire', () => {
  it('RG-panel: a single and a double row\'s panel have no Row group buttons (the tool picks rows) and no Match bays', () => {
    load(filled(false))
    const html = (o) => { Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: o })) }
    for (const o of [objs().find(r => r.type === 'rack_row'), objs().find(r => r.type === 'rack_double_row')]) {
      const h = html(o)
      expect(h).toContain('Total length')
      expect(h).not.toMatch(/Row group|Same row in other sections|Match bays|Apply my changes/)
    }
  })

  it('RG-wire: the app installs the Row group watcher; the canvas shows its bar and outlines; Esc leaves the tool, then clears the group; the section-copy modules are gone', () => {
    const src = (p) => readFileSync(p, 'utf8')
    expect(src('src/App.jsx')).toMatch(/installRowGroupWatcher\(/)
    expect(src('src/canvas2/Canvas2.jsx')).toMatch(/<RowGroupPreview/)
    expect(src('src/canvas2/Canvas2.jsx')).toMatch(/<RowGroupBar/)
    const kb = src('src/hooks/useKeyboardShortcuts.js')
    expect(kb).toMatch(/activeTool === ROW_GROUP_TOOL\)/)
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
