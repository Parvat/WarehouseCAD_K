// Area EX — fixes from the exploratory check of section copy. Both
// orientations; a GENERATED layout and a MANUAL one (the same racks placed by
// hand) where it applies.
//  1. A result ("Copied 7 rows", "Matched bays …") clears on the next action:
//     undo, redo, Esc, Ctrl+D / a placement.
//  2. Match bays is a finished action: its rows don't join the pending set,
//     the bay changes it resolved stop counting, the bar's source stays the
//     row the user changed.
//  3. A live-flue drag re-centres on the rack's CURRENT depth (a turned rack
//     no longer creeps along its run); an automatic flue change is no change;
//     copies take the source's exact net delta across.
//  4. The hover preview keys every outline uniquely.
//  5. After "Copy your changes?" is answered, the edit that raised it is
//     finished (Delete, placement, a panel change); a drag says "Drag
//     cancelled — drag again".
//  6. Every snap reaches the smaller of 12 px on screen or 1 ft.
//  Minor: "Copied N rows" always; NET counts; Match bays counts rows that
//  really changed; the bar offers Match bays whenever a bay change is pending.
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
import { beginMatch } from '../../utils/copyPrompt'
import { previewKey, copyPreviewRects } from '../../utils/copyChange'
import { pendingPlan } from '../../utils/copyPrompt'
import { flueDragPlacement } from '../../canvas2/liveFlue'
import { computeSmartGuides } from '../../canvas2/smartGuides'
import { snapPlacement } from '../../utils/placement'

const manual = (orientation) => layout(orientation).filter(o => o.type !== 'aisle')
  .map(o => { if (!BEAM.has(o.type)) return o; const { genSection, rowIndex, genRunFt, genCrossFt, ...r } = o; return r })   // eslint-disable-line no-unused-vars
const report = () => useCopyPrompt.getState().report
const centreAcross = (o, rot) => { const f = rackFootprint(o); return rot ? f.x + f.w / 2 : f.y + f.h / 2 }

describe.each(['horizontal', 'vertical'])('EX — %s', (orientation) => {
  const rot = orientation === 'vertical'
  const A = ax(rot)
  const gen = layout(orientation)
  const secKeys = buildingSections(gen, 'r0').sections.map(s => s.key)
  const S = secKeys[2], T = secKeys[1]
  const row = (k, sec = S) => rowIn(sec, k)[0]
  const others = secKeys.filter(k => k !== S)
  const rowsIn = (sec) => objs().filter(o => BEAM.has(o.type) && o.genSection === sec)
  const man = manual(orientation)

  it('EX-results: "Copied N rows" and "Matched bays …" clear on the next action — undo, redo, a placement (Ctrl+D / paste), Esc; on a generated and a manual layout', async () => {
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS)))
    copyPending(); await flushCopyWatcher()
    expect(report().text).toBe(`Copied ${others.length} rows`)
    await act(() => store.getState().undo())
    expect(report()).toBe(null)                                                  // undo
    copyPending(); await flushCopyWatcher()
    expect(report()).not.toBe(null)
    await act(() => store.getState().undo()); await act(() => store.getState().redo())
    expect(report()).toBe(null)                                                  // redo
    const r = Panel.runMatchBays(row(K + 2)); await flushCopyWatcher()
    expect(report().text).toMatch(/^Matched bays on/)
    store.setState({ selectedIds: [row(K).id] }); store.getState().copySelected()
    pasteAt(store, 'nudge', newId)                                               // Ctrl+D: the row follows the mouse
    expect(report()).toBe(null)
    cancelPlacement()
    copyPending(); await flushCopyWatcher()
    useCopyPrompt.setState({ report: { text: 'x', skipped: [], warnings: [] } })
    expect(cancelPlacement()).toBe(false)
    const keys = readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')
    expect(keys).toMatch(/if \(e\.key === 'Escape'\) \{\s*\n\s*useCopyPrompt\.getState\(\)\.dismissReport\(\)/)   // Esc
    expect(keys).toMatch(/case 'd': \{\s*\n\s*useCopyPrompt\.getState\(\)\.dismissReport\(\)/)                   // Ctrl+D
    void r
    // manual: the Match result clears on undo too
    load(man)
    const m = objs().filter(o => BEAM.has(o.type))[1]
    await act(() => store.getState().commitObjectUpdate(m.id, Panel.changeBayUpdate(m, 0, 108, GS)))
    Panel.runMatchBays(objs().find(o => o.id === m.id)); await flushCopyWatcher()
    expect(report().text).toMatch(/^Matched bays on \d+ rows? in section \d+$/)
    await act(() => store.getState().undo())
    expect(report()).toBe(null)
  })

  it('EX-match: Match bays is a finished action — the matched rows are not added to the set, the bay change it resolved stops counting, the bar keeps the user\'s row as its source; the move across still counts and copies', async () => {
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K + 4).id, A.move(row(K + 4), 0, GS)))      // across: copies
    await act(() => store.getState().commitObjectUpdate(row(K).id, Panel.changeBayUpdate(row(K), 2, 108, GS)))
    expect(bar()).toMatchObject({ count: 2, copyCount: 1, matchFrom: { id: row(K).id, rowIndex: K } })
    const logBefore = objs().find(o => o.id === 'fp').copyPending.log.length
    const r = Note.matchBays(bar()); await flushCopyWatcher()
    expect(r.synced).toBeGreaterThan(3)
    expect(objs().find(o => o.id === 'fp').copyPending.log.length).toBe(logBefore)   // nothing added
    expect(bar()).toMatchObject({ count: 1, copyCount: 1, matchFrom: null })       // the bay change is resolved
    expect(bar().lines).toEqual([`Row ${K + 4}: moved 1' across`])
    const before = row(K + 4, T), plan = copyPending(); await flushCopyWatcher()
    expect(plan.copies.length).toBe(others.length)
    expect(centreAcross(row(K + 4, T), rot) - centreAcross(before, rot)).toBeCloseTo(GS, 6)
    // a second bay change: the button offers THAT row (not the last one matched)
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K + 4).id, A.move(row(K + 4), 0, GS)))
    await act(() => store.getState().commitObjectUpdate(row(K + 6).id, Panel.changeBayUpdate(row(K + 6), 1, 108, GS)))
    expect(bar().matchFrom).toEqual({ id: row(K + 6).id, rowIndex: K + 6 })
    const lastRow = Math.max(...rowsIn(S).map(o => o.rowIndex))
    expect(lastRow).not.toBe(K + 6)
  })

  it('EX-flue: a live-flue drag re-centres on the rack\'s depth at drag start — dragged straight across, a rack whose flue narrows (12" → 9") keeps its start along the run exactly and its centre moves exactly the drag; the automatic flue change is not a change; copies take the exact net delta', async () => {
    const r = strip(row(K))
    const wide = { ...r, flueSpaceIn: 12, flueBaseIn: 9, height: r.height + (3 / 12) * GS }
    if (rot) wide.y = r.y - (3 / 12) * GS / 2                                   // same centre as r (turned: stored height is across)
    else wide.y = r.y - (3 / 12) * GS / 2
    const f0 = rackFootprint(wide), d = 48 / 12 * GS
    const dx = rot ? d : 0, dy = rot ? 0 : d
    const at = flueDragPlacement({ x: wide.x, y: wide.y }, { w: wide.width, h: wide.height }, dx, dy, r.height)
    const moved = { ...wide, ...at, height: r.height, flueSpaceIn: 9 }
    const f1 = rackFootprint(moved)
    const along = (f) => (rot ? f.y : f.x), across = (f) => (rot ? f.x + f.w / 2 : f.y + f.h / 2)
    expect(along(f1)).toBeCloseTo(along(f0), 9)                                   // nothing along
    expect(across(f1) - across(f0)).toBeCloseTo(d, 9)                              // exactly the drag across
    // in the section: the widened row is the baseline; the drag lands; one net change; copies move exactly d
    load(gen.map(o => (o.id === r.id ? wide : o)))
    await act(() => { store.setState({ objects: objs().map(o => (o.id === r.id ? moved : o)) }); store.getState().commitObjectUpdate(r.id, {}) })
    expect(bar()).toMatchObject({ count: 1, copyCount: 1 })
    expect(bar().lines).toEqual([`Row ${K}: moved 4' across`])
    const before = new Map(others.map(s => [s, centreAcross(row(K, s), rot)]))
    copyPending(); await flushCopyWatcher()
    for (const s of others) expect(centreAcross(row(K, s), rot) - before.get(s)).toBeCloseTo(d, 6)
    expect(readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')).toMatch(/flueDragPlacement\(d\.origin, d\.size, dx, dy, liveFlue\.targetHeight\)/)
  })

  it('EX-preview: the Copy hover preview keys every outline uniquely — with added rows pending (they share a placeholder id) all outlines are kept', async () => {
    load(gen)
    await act(() => { store.setState({ selectedIds: [row(K).id] }); store.getState().deleteSelected() })
    const r6 = strip(row(K + 1))
    // a plain added row: put a copy of row K+1 back where row K was
    const was = gen.find(o => o.genSection === S && o.rowIndex === K)
    await act(() => { store.setState({ objects: [...objs(), { ...r6, id: 'addedA', x: was.x, y: was.y, rowIndex: undefined, genSection: undefined }] }); store.getState().commitObjectUpdate('addedA', {}) })
    useCopyPrompt.setState({ hover: true })
    const plan = pendingPlan()
    const rects = copyPreviewRects(objs(), plan)
    const ids = rects.map(q => q.id)
    expect(new Set(ids).size).toBeLessThan(ids.length)                           // the ids alone collide
    const keys = rects.map((q, i) => previewKey(q, i))
    expect(new Set(keys).size).toBe(keys.length)                                 // the keys never do
    expect(readFileSync('src/canvas2/CopyChange.jsx', 'utf8')).toMatch(/previewKey\(r, i\)/)
    useCopyPrompt.setState({ hover: false })
  })

  it('EX-resume: after the question is answered the edit that raised it is finished — a placement is placed, a panel change re-applied, a Delete run again; a drag says "Drag cancelled — drag again"; the bar\'s own Copy never runs a stale one', async () => {
    const pendS = async () => { load(gen); await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS))) }
    // a placement in T (its row K taken out to make room): asked, Copy, placed
    load(gen.filter(o => !(BEAM.has(o.type) && o.rowIndex === K && o.genSection === T)))
    await act(() => store.getState().commitObjectUpdate(row(K + 2).id, A.move(row(K + 2), 0, GS / 2)))
    const src = strip(row(K - 1, T))
    store.setState({ selectedIds: [src.id] }); store.getState().copySelected()
    setCanvasPointer({ x: 0, y: 0 }); pasteAt(store, 'cursor', newId)
    const g = A.cross(src)[1] + AISLE + (A.cross(src)[1] - A.cross(src)[0]) / 2, rr = A.run(src)
    movePlacement(store, rot ? { x: g, y: (rr[0] + rr[1]) / 2 } : { x: (rr[0] + rr[1]) / 2, y: g }, 1)
    const n0 = objs().filter(o => BEAM.has(o.type)).length
    expect(commitPlacement(store, guardEdit)).toBe(false)
    expect(question()).toMatchObject({ section: S })
    copyPending(); await flushCopyWatcher()
    expect(question()).toBe(null)
    expect(usePlacement.getState().active).toBe(null)
    expect(objs().filter(o => BEAM.has(o.type)).length).toBe(n0 + 1)
    expect(objs().some(o => BEAM.has(o.type) && Math.abs(centreAcross(o, rot) - g) < GS)).toBe(true)      // the row was placed
    expect(report().text).toMatch(/^Copied \d+ rows$/)                          // the answer's result outlives the placement
    // a panel change in T: taken back, asked, Don't copy, re-applied
    await pendS()
    const t = row(K, T), beams = t.beams.join('/')
    await act(() => store.getState().commitObjectUpdate(t.id, Panel.changeBayUpdate(t, 1, 108, GS)))
    expect(question()).toMatchObject({ section: S })
    expect(row(K, T).beams.join('/')).toBe(beams)                                // taken back
    dontCopy(); await flushCopyWatcher()
    expect(question()).toBe(null)
    expect(row(K, T).beams[1]).toBe(108)                                          // re-applied
    expect(bar()).toMatchObject({ section: T })                                   // a new set in T
    // Delete (the keyboard passes itself as the resume) and a drag
    await pendS()
    let ran = 0
    expect(guardEdit([row(K + 1, T).id], { resume: () => { ran++ } })).toBe(false)
    dontCopy(); await flushCopyWatcher()
    expect(ran).toBe(1)
    await pendS()
    expect(guardEdit([row(K + 1, T).id], { drag: true })).toBe(false)
    copyPending(); await flushCopyWatcher()
    expect(useCopyPrompt.getState().message).toBe('Drag cancelled — drag again.')
    // a question cleared without an answer: the bar's Copy later runs nothing stale
    await pendS()
    let stale = 0
    guardEdit([row(K + 1, T).id], { resume: () => { stale++ } })
    useCopyPrompt.setState({ question: null })
    copyPending(); await flushCopyWatcher()
    expect(stale).toBe(0)
    const keys = readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')
    expect(keys).toMatch(/guardEdit\(\[\.\.\.selectedIds, [^\n]*\{ resume: \(\) => handler\(\{ key: e\.key/)
    expect(readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')).toMatch(/guardEdit\(\[\.\.\.new Set\(\[hitId, \.\.\.st\.selectedIds\]\)\], \{ drag: true \}\)/)
  })

  it('EX-snap: every snap reaches the smaller of 12 px on screen or 1 ft — at 15 % a column face 1.5 ft away no longer catches a dragged rack (it did at 30 px = 5 ft); 0.8 ft away it does; at 100 % the reach is 12 px; placement the same', () => {
    const colGrid = { id: 'cg1', type: 'column_grid', x: 1000, y: 1000, spacingX: [2000], spacingY: [2000], columnW: GS, columnH: GS }
    const rack = { id: 'r1', type: 'rack_row', x: 700, y: 5000, width: 200, height: 80, beams: [96], uprightWidth: 3 }
    const face = 1000 - GS / 2, exact = face - 200 - 700
    for (const [zoom, reach] of [[0.15, GS], [1, 12], [0.5, 24]]) {
      expect(computeSmartGuides(['r1'], [colGrid, rack], GS, zoom, exact - reach * 0.8, 0).snapDx).toBeCloseTo(exact, 9)
      expect(computeSmartGuides(['r1'], [colGrid, rack], GS, zoom, exact - reach * 1.2, 0).snapDx).toBe(null)
    }
    expect(computeSmartGuides(['r1'], [colGrid, rack], GS, 0.15, exact - 1.5 * GS, 0).snapDx).toBe(null)
    // placement: the same reach
    load(gen)
    const src = strip(row(K)), [c0, c1] = A.cross(row(K + 1)), cLen = A.cross(src)[1] - A.cross(src)[0]
    const behind = c1 + AISLE                                                     // an aisle's width from row K+1: a snap target
    const at = (off) => { const cross = behind + cLen / 2 + off, run = (A.run(src)[0] + A.run(src)[1]) / 2; return rot ? { x: cross, y: run } : { x: run, y: cross } }
    expect(snapPlacement([src], objs(), at(0.8 * GS), GS, 0.15).snapped.cross).toBe('aisle')
    // wherever it is dropped, a snap never moves it more than 1 ft at 15 % (12 px would be 2 ft)
    const c = rackFootprint(src), cx = c.x + c.w / 2, cy = c.y + c.h / 2
    let pulled = 0
    for (let off = 0; off <= 3 * GS; off += GS / 10) {
      const w = at(off), sp = snapPlacement([src], objs(), w, GS, 0.15)
      const moved = Math.hypot(sp.dx - (w.x - cx), sp.dy - (w.y - cy))
      expect(moved).toBeLessThanOrEqual(GS + 1e-6)
      if (moved > 0) pulled++
    }
    expect(pulled).toBeGreaterThan(0)
    void c0
  })

  it('EX-minor: "Copied N rows" with no warnings; the same row moved twice is ONE change; Match bays counts only rows that really change (manual: one rack off → 1 row); the bar offers Match bays for a bay change alone, without a Copy button', async () => {
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS / 2)))
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS / 2)))
    expect(bar()).toMatchObject({ count: 1, copyCount: 1 })
    expect(bar().lines).toEqual([`Row ${K}: moved 1' across`])
    await act(() => store.getState().commitObjectUpdate(row(K + 2, T).id, A.move(row(K + 2, T), 0, GS)))
    expect(question()).toMatchObject({ section: S, count: 1 })                   // "Copy your 1 change"
    const plan = copyPending(); await flushCopyWatcher()
    expect(report()).toMatchObject({ text: `Copied ${plan.copies.length} rows` })
    // Match bays on a manual run where only one rack is off
    load(man)
    const run = buildingSections(objs(), objs().find(o => BEAM.has(o.type)).id).sections[0].rows
    const off = run[1]
    await act(() => store.getState().commitObjectUpdate(off.id, A.move(off, 2 * GS, 0)))      // along: off by 2'
    const r = Panel.runMatchBays(objs().find(o => o.id === run[0].id)); await flushCopyWatcher()
    expect(r.synced).toBe(1)
    expect(report().text).toBe('Matched bays on 1 row in section 1')
    // a bay change alone (generated): Match bays, no Copy
    load(gen)
    await act(() => store.getState().commitObjectUpdate(row(K).id, Panel.changeBayUpdate(row(K), 0, 108, GS)))
    expect(bar()).toMatchObject({ copyable: false, matchFrom: { rowIndex: K } })
    const html = renderNote()
    expect(html).toContain(`Match bays in section ${S} (from row ${K})`)
    expect(html).not.toContain('Copy to other sections')
  })
})
