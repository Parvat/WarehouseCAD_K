// Area CF — section-copy fixes found in manual use. Both orientations, on a
// GENERATED layout and a MANUAL one (the same racks placed by hand: no
// generated sections, no row numbers).
//  1. The bar, its buttons and the "Copy your changes?" question appear only
//     when the building has at least 2 generated sections AND the copy would
//     really copy something — never on a manual layout.
//  2. The question reads "section 1", never "section run 1"; Copy and Don't
//     copy always close it; an edit across several sections (select all +
//     Delete) never asks.
//  3. Paste / placement in a cross-aisle is a WARNING (orange outline and a
//     message) and places; only overlapping a rack and outside the building
//     block. A manual layout has no generated cross-aisles: no warning.
//  4. "Match bays in this section" from the right panel shows its result in
//     the bar ("Matched bays on 6 rows in section 3 from row 5") until the
//     next action.
// Driven through the real store with the app's watchers installed.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sizingSheetLayout, columnGridObject } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { installRowEditKeeper } from '../../utils/rowEditKeeper'
import { installCopyWatcher, useCopyPrompt, copyPending, dontCopy, guardEdit, flushCopyWatcher, questionText, multiSectionText } from '../../utils/copyPrompt'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { usePlacement, startPlacement, movePlacement, commitPlacement, cancelPlacement } from '../../utils/placement'
import { pasteAt, setCanvasPointer } from '../../utils/pasteAt'
import { bayRuns } from '../../utils/copyChange'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
let store, Panel, Note, stops = [], seq = 0
const newId = () => 's' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  Note = await import('../../canvas2/CopyNote.jsx')
  stops = [installAisleKeeper(store, newId), installRowEditKeeper(store), installCopyWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { useCopyPrompt.getState().setAlwaysCopy(false); cancelPlacement(); useCopyPrompt.setState({ question: null, message: null, report: null }) })

const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
const r4 = (v) => Math.round(v * 1e4) / 1e4
const AISLE = MHE_PROFILES.reach.aisleFt * GS

function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const L = 1080 * GS, W = 410 * GS
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L, height: W, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }] }
  return rebuildAisles([fp, { ...columnGridObject(brief, 0, 0), id: 'cg', parentId: 'fp' }, ...racks], newId).objects
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], zoom: 1, panX: 0, panY: 0,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const bar = () => useCopyPrompt.getState().pending
const question = () => useCopyPrompt.getState().question
const act = async (fn) => { fn(); await flushCopyWatcher() }
const hist = () => store.getState().historyIndex
const racksSig = (list) => list.filter(o => BEAM.has(o.type)).map(o => [o.id, r4(o.x), r4(o.y), o.width, o.beams.join('/')].join(':')).sort().join('|')

/** Layout axes: run = along the rows, cross = across the aisles. */
const ax = (rot) => ({
  run: (o) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] },
  cross: (o) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] },
  move: (o, dRun, dCross) => (rot ? { x: o.x + dCross, y: o.y + dRun } : { x: o.x + dRun, y: o.y + dCross }),
})
const sectionsNow = () => buildingSections(objs(), objs().find(o => BEAM.has(o.type) && o.genSection != null).id).sections
/** The racks (pieces) of row k in section s, now. */
const rowIn = (sec, k) => objs().filter(o => BEAM.has(o.type) && o.genSection === sec && o.rowIndex === k)
const K = 5
/** The bar as server-rendered HTML (the stores' live state as their initial one). */
const renderNote = () => { Object.assign(useCopyPrompt.getInitialState(), useCopyPrompt.getState()); Object.assign(usePlacement.getInitialState(), usePlacement.getState()); return renderToStaticMarkup(createElement(Note.CopyNote)) }
import { copyablePlan } from '../../utils/copyPrompt'

/** The same racks placed by hand: no generated section or row number, no aisles yet. */
const manual = (orientation) => layout(orientation).filter(o => o.type !== 'aisle')
  .map(o => { if (!BEAM.has(o.type)) return o; const { genSection, rowIndex, genRunFt, genCrossFt, ...r } = o; return r })   // eslint-disable-line no-unused-vars
const noBar = () => {
  expect(bar()).toBe(null)
  expect(question()).toBe(null)
  expect(renderNote()).not.toMatch(/Copy to other sections|Copy your|Pending changes/)
}
/** A one-bay copy of `r`, unstamped, to place somewhere by hand. */
const oneBay = (r) => { const s = { ...strip(r), id: 'one' + (++seq), beams: [96], width: ((3 * 2 + 96) / 12) * GS }; for (const k of ['rowIndex', 'genSection', 'genRunFt', 'genCrossFt']) delete s[k]; return s }
/** The middle of the gap between runs a and b, level with row `r`. */
const inGap = (A, rot, a, b, r) => { const run = (a.end + b.start) / 2, c = A.cross(r), cross = (c[0] + c[1]) / 2; return rot ? { x: cross, y: run } : { x: run, y: cross } }
/** Place `items` at `world` (as a click would), guarded like the canvas does. */
const place = async (items, world) => { startPlacement(store, items); movePlacement(store, world, 1); const ok = commitPlacement(store, guardEdit); await flushCopyWatcher(); return ok }

describe.each(['horizontal', 'vertical'])('CF — %s', (orientation) => {
  const rot = orientation === 'vertical'
  const A = ax(rot)
  const gen = layout(orientation)
  const secKeys = buildingSections(gen, 'r0').sections.map(s => s.key)
  const S = secKeys[2], T = secKeys[1]
  const row = (k, sec = S) => rowIn(sec, k)[0]
  const man = manual(orientation)
  const runs = () => buildingSections(objs(), objs().find(o => BEAM.has(o.type)).id).sections

  it('CF-manual: on a manual layout, placing, pasting and deleting racks shows no bar and no question — and nothing can be copied', async () => {
    load(man)
    const R = runs()
    expect(R.length).toBeGreaterThanOrEqual(2)
    expect(R.every(s => s.key == null)).toBe(true)                          // no generated sections
    // place a one-bay row in the gap between the first two runs
    const r0 = R[0].rows[0]
    expect(await place([oneBay(r0)], inGap(A, rot, R[0], R[1], r0))).toBe(true)
    noBar()
    // paste (follows the mouse) a row into the same gap, further across
    const r1 = R[0].rows[2]
    store.setState({ selectedIds: [r1.id] }); store.getState().copySelected()
    pasteAt(store, 'cursor', newId)
    const items = usePlacement.getState().active.items.map(o => ({ ...o, beams: [96], width: ((3 * 2 + 96) / 12) * GS }))
    cancelPlacement()
    expect(await place(items, inGap(A, rot, R[0], R[1], r1))).toBe(true)
    noBar()
    // move one across, then delete one: still nothing
    const m = R[1].rows[0]
    await act(() => store.getState().commitObjectUpdate(m.id, A.move(m, 0, GS)))
    noBar()
    await act(() => { store.setState({ selectedIds: [R[R.length - 1].rows[1].id] }); store.getState().deleteSelected() })
    noBar()
    expect(copyablePlan(objs(), 'fp', GS)).toBe(null)
    // an edit in another run is never stopped
    expect(guardEdit([R[R.length - 1].rows[0].id])).toBe(true)
    noBar()
  })

  it('CF-generated: on a generated layout a move across still shows the bar (it would copy), and an edit in another section asks', async () => {
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS)))
    expect(bar()).toMatchObject({ section: S, copyCount: 1 })
    expect(renderNote()).toContain(`Section ${S}: 1 change (1 will be copied)`)
    expect(guardEdit([row(K, T).id])).toBe(false)
    expect(questionText(question())).toBe(`Copy your 1 change from section ${S} to the other sections?`)
    dontCopy()
    expect(question()).toBe(null)
  })

  it('CF-select-all: select all + Delete never asks (the edit spans every section): the delete goes ahead, and afterwards there is nothing to copy — on a generated and a manual layout', async () => {
    for (const objects of [gen, man]) {
      load(objects)
      const m = objects === gen ? row(K) : objs().find(o => BEAM.has(o.type))
      await act(() => store.getState().commitObjectUpdate(m.id, A.move(m, 0, GS)))
      const all = objs().map(o => o.id)
      store.getState().selectGroup(all)
      expect(guardEdit(all)).toBe(true)
      expect(question()).toBe(null)
      await act(() => store.getState().deleteSelected())
      expect(objs().filter(o => BEAM.has(o.type))).toHaveLength(0)
      noBar()
    }
  })

  it('CF-question: the question says "section 1" for a run placed by hand, and Copy and Don\'t copy always close it — even when there is nothing they can copy', async () => {
    expect(questionText({ section: 'run 1', count: 2 })).toBe('Copy your 2 changes from section 1 to the other sections?')
    expect(questionText({ section: 3, count: 1 })).toBe('Copy your 1 change from section 3 to the other sections?')
    load(man)
    const m = objs().find(o => BEAM.has(o.type))
    await act(() => store.getState().commitObjectUpdate(m.id, A.move(m, 0, GS)))
    for (const press of [() => copyPending('fp'), dontCopy, () => copyPending()]) {
      useCopyPrompt.setState({ question: { fpId: 'fp', section: 'run 1', count: 2 } })
      expect(renderNote()).toContain('Copy your 2 changes from section 1 to the other sections?')
      expect(press).not.toThrow()
      expect(question()).toBe(null)
    }
    // on a generated layout Copy copies and closes
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS)))
    expect(guardEdit([row(K, T).id])).toBe(false)
    const before = row(K, T), plan = copyPending(question().fpId); await flushCopyWatcher()
    expect(question()).toBe(null)
    expect(plan.copies.length).toBeGreaterThan(0)
    expect(A.cross(row(K, T))[0] - A.cross(before)[0]).toBeCloseTo(GS, 6)
  })

  it('CF-cross-aisle: a row dropped in a generated cross-aisle is placed with a warning (orange outline, message), not blocked; overlap and outside still block; a manual layout has no cross-aisle to warn about', async () => {
    load(gen)
    const secs = sectionsNow(), a0 = secs[0], a1 = secs[1]
    const r0 = rowIn(a0.key, K)[0]
    startPlacement(store, [oneBay(r0)])
    movePlacement(store, inGap(A, rot, a0, a1, r0), 1)
    const a = usePlacement.getState().active
    expect(a.blocked).toBe(null)
    expect(a.crossAisle).toBe(true)
    expect(a.warnings).toContain(`In the cross-aisle between sections ${a0.key} and ${a1.key}`)
    expect(renderNote()).toContain(`Check — In the cross-aisle between sections ${a0.key} and ${a1.key}`)
    expect(readFileSync('src/canvas2/CopyChange.jsx', 'utf8')).toMatch(/const color = a\.blocked \? BLOCKED : a\.crossAisle \? WARNED : PREVIEW/)
    const n = objs().length
    expect(commitPlacement(store)).toBe(true)
    expect(objs().length).toBe(n + 1)
    await flushCopyWatcher()
    // still hard: overlapping a rack, outside the building
    startPlacement(store, [oneBay(r0)])
    const on = rackFootprint(row(K + 3))
    movePlacement(store, { x: on.x + on.w / 2, y: on.y + on.h / 2 }, 1)
    expect(usePlacement.getState().active.blocked).toMatch(/^overlaps /)
    movePlacement(store, { x: -5000, y: -5000 }, 1)
    expect(usePlacement.getState().active.blocked).toBe('outside the building')
    expect(commitPlacement(store)).toBe(false)
    cancelPlacement()
    // manual: the gap between two runs is no cross-aisle
    load(man)
    const R = runs(), m0 = R[0].rows[0]
    startPlacement(store, [oneBay(m0)])
    movePlacement(store, inGap(A, rot, R[0], R[1], m0), 1)
    const b = usePlacement.getState().active
    expect([b.blocked, b.crossAisle]).toEqual([null, false])
    expect(b.warnings.filter(w => /cross-aisle/.test(w))).toEqual([])
    cancelPlacement()
  })

  it('CF-match: "Match bays in this section" from the right panel shows its result in the bar until the next action — "Matched bays on N rows in section S from row K"; on a manual layout "section 1"', async () => {
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K).id, Panel.changeBayUpdate(row(K), 2, 108, GS)))
    expect(bar()).toMatchObject({ copyable: false, matchFrom: { rowIndex: K } })   // a bay change alone: Match bays, no Copy
    const r = Panel.runMatchBays(row(K)); await flushCopyWatcher()
    expect(r.synced).toBeGreaterThan(3)
    expect(useCopyPrompt.getState().report.text).toBe(`Matched bays on ${r.synced} rows in section ${S} from row ${K}`)
    expect(renderNote()).toContain(`Matched bays on ${r.synced} rows in section ${S} from row ${K}.`)
    // the next action clears it
    await act(() => store.getState().commitObjectUpdate(row(K + 1).id, A.move(row(K + 1), 0, GS / 2)))
    expect(useCopyPrompt.getState().report).toBe(null)
    // the panel's button runs exactly this
    expect(readFileSync('src/components/RightPanel/panels/RackRowPanelCore.jsx', 'utf8')).toMatch(/onClick=\{\(\) => \{ const r = runMatchBays\(obj\); setResult/)
    // manual: its run is "section 1"
    load(man)
    const R = runs(), src = R[0].rows[0]
    await act(() => store.getState().commitObjectUpdate(src.id, Panel.changeBayUpdate(src, 0, 108, GS)))
    const rm = Panel.runMatchBays(objs().find(o => o.id === src.id)); await flushCopyWatcher()
    expect(useCopyPrompt.getState().report.text).toBe(`Matched bays on ${rm.synced} row${rm.synced === 1 ? '' : 's'} in section 1`)   // no row number by hand
    // a move spanning two runs: no "affects rows in 2 sections" notice on a manual layout
    const two = [R[0].rows[1], R[1].rows[1]]
    await act(() => { store.setState({ objects: objs().map(o => two.some(t => t.id === o.id) ? { ...o, ...A.move(o, 0, GS / 4) } : o) }); store.getState().commitObjectUpdate(two[0].id, {}) })
    expect(useCopyPrompt.getState().message).toBe(null)
    noBar()
  })
})
