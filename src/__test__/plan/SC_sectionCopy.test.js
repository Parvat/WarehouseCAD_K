// Area SC — copying row changes across sections: a per-section PENDING SET
// (replaces the per-change copy notes, the diagonal two-button note and
// manual mode). The user makes any number of changes in ONE section; a bar
// says "Section N: K changes · Copy to other sections". Starting an edit in a
// different section asks "Copy your K changes from section N to the other
// sections?" [Copy] [Don't copy]. Copied: rows moved ACROSS the aisles (net
// delta), added and deleted rows, to the same row in every other section.
// Never copied: bay changes and moves ALONG a row. Always copy copies each
// across-move / add / delete at once. Rows added by paste / duplicate / the
// left panel follow the mouse and are placed on a click.
// 1080 x 410, 25 x 30, reach; horizontal and vertical. Driven through the
// real store with the app's watchers installed.
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

describe.each(['horizontal', 'vertical'])('SC — %s', (orientation) => {
  const rot = orientation === 'vertical'
  const A = ax(rot)
  const base = layout(orientation)
  const secKeys = buildingSections(base, 'r0').sections.map(s => s.key)
  const S = secKeys[2]                                   // "section 3"
  const T = secKeys[4] ?? secKeys[0]                     // "section 5" (vertical has 3 sections: section 1)
  const others = secKeys.filter(k => k !== S)
  const row = (k, sec = S) => rowIn(sec, k)[0]
  /** Move rows K and K+2 of S across (by 1' and -6") and delete row K+4. */
  const threeChanges = async () => {
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS)))
    await act(() => store.getState().commitObjectUpdate(row(K + 2).id, A.move(row(K + 2), 0, -GS / 2)))
    await act(() => { store.setState({ selectedIds: [row(K + 4).id] }); store.getState().deleteSelected() })
  }

  it('SC-layout: the orientation is right, and rows 5, 7 and 9 exist once in every section', () => {
    expect(secKeys.length).toBeGreaterThanOrEqual(3)
    expect(T).not.toBe(S)
    load(base)
    for (const s of secKeys) for (const k of [K, K + 2, K + 4]) expect(rowIn(s, k)).toHaveLength(1)
    expect(rackFootprint(row(K)).rotated).toBe(rot)
  })

  it('SC-stays: a beam change and a move ALONG of the same row in section 3 -> no lock, the bar lists both as staying in section 3, and copying sends nothing to the other sections', async () => {
    load(base)
    const was = racksSig(objs().filter(o => o.genSection !== S))
    await act(() => store.getState().commitObjectUpdate(row(K).id, Panel.changeBayUpdate(row(K), 2, 108, GS)))
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 2 * GS, 0)))
    expect(question()).toBe(null)
    expect(bar()).toMatchObject({ section: S, count: 2, copyCount: 0 })
    expect(bar().lines).toEqual([`Row ${K}: bays changed — stays in section ${S}`, `Row ${K}: moved 2' along — stays in section ${S}`])
    expect(renderNote()).toContain(`Section ${S}: 2 changes (none will be copied)`)
    expect(renderNote()).toContain('disabled=""')                               // nothing here to copy
    // no lock: another row of the same section can be edited straight away
    expect(guardEdit([row(K + 1).id])).toBe(true)
    copyPending(); await flushCopyWatcher()
    expect(racksSig(objs().filter(o => o.genSection !== S))).toBe(was)            // nothing copied
    expect(bar()).toBe(null)
  })

  it('SC-match: a bay change in section 3 puts "Match bays in section 3 (from row 5)" in the bar, from the row LAST changed; clicking gives every row of section 3 row 5\'s bays, as one undo step; no bay change, no button', async () => {
    load(base)
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS / 2)))      // a move across only
    expect(bar().matchFrom).toBe(null)
    expect(renderNote()).not.toContain('Match bays in section')
    load(base)
    await act(() => store.getState().commitObjectUpdate(row(K + 2).id, Panel.changeBayUpdate(row(K + 2), 1, 108, GS)))
    await act(() => store.getState().commitObjectUpdate(row(K).id, Panel.changeBayUpdate(row(K), 2, 108, GS)))   // the last one changed
    expect(bar().matchFrom).toEqual({ id: row(K).id, rowIndex: K })
    expect(Note.matchText(bar())).toBe(`Match bays in section ${S} (from row ${K})`)
    expect(renderNote()).toContain(`>Match bays in section ${S} (from row ${K})</button>`)
    const beforeMatch = racksSig(objs()), h0 = hist()
    const srcBeams = row(K).beams.join('/')
    const r = Note.matchBays(bar()); await flushCopyWatcher()
    expect(r.synced).toBeGreaterThan(5)
    expect(hist()).toBe(h0 + 1)
    const inS = objs().filter(o => BEAM.has(o.type) && o.genSection === S)
    expect(inS.every(o => o.beams.join('/') === srcBeams)).toBe(true)                  // every row: row 5's bays
    expect(useCopyPrompt.getState().report.text).toMatch(new RegExp(`^Matched bays in section ${S}: \\d+ rows`))
    store.getState().undo(); await flushCopyWatcher()
    expect(racksSig(objs())).toBe(beforeMatch)                                          // one undo restores
  })

  it('SC-stays-mixed: bays and along-moves stay even when the same set has a move across: an end bay removed at a cross-aisle and a row moved along are NOT copied; the move across is', async () => {
    load(base)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, { run: A.run(o), cross: A.cross(o), bays: o.beams.length }]))
    const r = row(K)
    const startBay = bayRuns(r, GS)[0].i                                             // section 3 has a section before it: its start end is at a cross-aisle
    await act(() => store.getState().deleteSingleBay(r.id, startBay))
    await act(() => store.getState().commitObjectUpdate(row(K + 1).id, A.move(row(K + 1), 2 * GS, 0)))   // along
    await act(() => store.getState().commitObjectUpdate(row(K + 2).id, A.move(row(K + 2), 0, GS)))       // across
    expect(bar()).toMatchObject({ section: S, count: 3, copyCount: 1 })
    expect(renderNote()).toContain(`Section ${S}: 3 changes (1 will be copied)`)
    expect(bar().lines).toEqual([`Row ${K}: bays changed — stays in section ${S}`, `Row ${K + 1}: moved 2' along — stays in section ${S}`, `Row ${K + 2}: moved 1' across`])
    copyPending(); await flushCopyWatcher()
    for (const s of others) {
      expect(row(K, s).beams.length).toBe(was.get(row(K, s).id).bays)              // no bay removed
      expect(A.run(row(K + 1, s)).map(r4)).toEqual(was.get(row(K + 1, s).id).run.map(r4))   // not moved along
      expect(A.cross(row(K + 2, s)).map(r4)).toEqual(was.get(row(K + 2, s).id).cross.map(v => r4(v + GS)))
    }
  })

  it('SC-question: rows moved across and one deleted in section 3, then a drag started in section 5 -> the question; Copy -> copied everywhere (net delta per row), the set clears and the edit can go ahead', async () => {
    load(base)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, A.cross(o)]))
    await threeChanges()
    expect(bar()).toMatchObject({ section: S, count: 3, copyCount: 3 })
    expect(renderNote()).toContain(`Section ${S}: 3 changes (3 will be copied)`)
    expect(bar().lines).toEqual([`Row ${K}: moved 1' across`, `Row ${K + 2}: moved 6" across`, `Row ${K + 4}: deleted`])
    const h0 = hist()
    expect(guardEdit([row(K, T).id])).toBe(false)                                // the drag start in section 5
    expect(question()).toEqual({ fpId: 'fp', section: S, count: 3 })
    expect(questionText(question())).toBe(`Copy your 3 changes from section ${S} to the other sections?`)
    expect(renderNote()).toMatch(/aria-label="Copy changes to other sections"[^>]*>Copy<\/button>.*aria-label="Don&#x27;t copy"/)
    expect(hist()).toBe(h0)                                                    // nothing happened yet
    const srcSig = racksSig(objs().filter(o => o.genSection === S))
    copyPending(); await flushCopyWatcher()
    expect(racksSig(objs().filter(o => o.genSection === S))).toBe(srcSig)      // section 3's own rows untouched by the copy
    for (const s of others) {
      expect(A.cross(row(K, s)).map(r4)).toEqual(was.get(row(K, s).id).map(v => r4(v + GS)))
      expect(A.cross(row(K + 2, s)).map(r4)).toEqual(was.get(row(K + 2, s).id).map(v => r4(v - GS / 2)))
      expect(rowIn(s, K + 4)).toEqual([])
    }
    expect(bar()).toBe(null)
    expect(question()).toBe(null)
    expect(guardEdit([row(K, T).id])).toBe(true)                                 // the user continues
    await act(() => store.getState().commitObjectUpdate(row(K + 1, T).id, A.move(row(K + 1, T), 0, GS / 2)))
    expect(bar()).toMatchObject({ section: T, count: 1 })                         // a new set in section 5
  })

  it('SC-dont: the same, Don\'t copy -> the changes stay only in section 3, the set clears, and edits in section 5 start a new set', async () => {
    load(base)
    const was = racksSig(objs().filter(o => o.genSection !== S))
    await threeChanges()
    expect(guardEdit([row(K, T).id])).toBe(false)
    dontCopy(); await flushCopyWatcher()
    expect(question()).toBe(null)
    expect(bar()).toBe(null)
    expect(racksSig(objs().filter(o => o.genSection !== S))).toBe(was)
    await act(() => store.getState().commitObjectUpdate(row(K, T).id, A.move(row(K, T), 0, GS)))
    expect(bar()).toMatchObject({ section: T, count: 1, copyCount: 1 })
  })

  it('SC-stop: an edit in section 5 that lands without a check (a panel change) is taken back, and the question asked', async () => {
    load(base)
    await threeChanges()
    const before = racksSig(objs()), h0 = hist()
    await act(() => store.getState().commitObjectUpdate(row(K, T).id, Panel.changeBayUpdate(row(K, T), 1, 108, GS)))
    expect(question()).toMatchObject({ section: S, count: 3 })
    expect(racksSig(objs())).toBe(before)
    expect(hist()).toBe(h0)
  })

  it('SC-bar: the bar\'s Copy works at any time, as one undo step (undo brings the set back)', async () => {
    load(base)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, A.cross(o)]))
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS)))
    expect(bar()).toMatchObject({ section: S, count: 1, copyCount: 1 })
    expect(renderNote()).toContain('aria-label="Copy to other sections"')
    const h0 = hist()
    copyPending(); await flushCopyWatcher()
    expect(hist()).toBe(h0 + 1)
    for (const s of others) expect(A.cross(row(K, s)).map(r4)).toEqual(was.get(row(K, s).id).map(v => r4(v + GS)))
    store.getState().undo(); await flushCopyWatcher()
    for (const s of others) expect(A.cross(row(K, s)).map(r4)).toEqual(was.get(row(K, s).id).map(r4))
    expect(bar()).toMatchObject({ section: S, count: 1 })
  })

  it('SC-always: Always copy copies each across-move, add and delete at once (one Ctrl+Z each undoes it with its copies); bay changes stay; no set, no question', async () => {
    load(base)
    useCopyPrompt.getState().setAlwaysCopy(true)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, A.cross(o)]))
    const h0 = hist()
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, GS)))
    expect(hist()).toBe(h0 + 1)
    for (const s of secKeys) expect(A.cross(row(K, s)).map(r4)).toEqual(was.get(row(K, s).id).map(v => r4(v + GS)))
    expect(bar()).toBe(null)
    await act(() => { store.setState({ selectedIds: [row(K + 4).id] }); store.getState().deleteSelected() })
    for (const s of secKeys) expect(rowIn(s, K + 4)).toEqual([])
    const wasBays = racksSig(objs().filter(o => o.genSection !== S))
    await act(() => store.getState().commitObjectUpdate(row(K + 2).id, Panel.changeBayUpdate(row(K + 2), 1, 108, GS)))
    expect(racksSig(objs().filter(o => o.genSection !== S))).toBe(wasBays)       // bays stay
    expect(bar()).toBe(null)
    expect(guardEdit([row(K, T).id])).toBe(true)
    store.getState().undo(); store.getState().undo(); await flushCopyWatcher()     // the delete, then the move
    for (const s of secKeys) expect(rowIn(s, K + 4)).toHaveLength(1)
    store.getState().undo(); await flushCopyWatcher()
    for (const s of secKeys) expect(A.cross(row(K, s)).map(r4)).toEqual(was.get(row(K, s).id).map(r4))
  })

  it('SC-undo: undo takes a change back out of the set', async () => {
    load(base)
    await threeChanges()
    expect(bar().count).toBe(3)
    store.getState().undo(); await flushCopyWatcher()
    expect(bar()).toMatchObject({ count: 2, copyCount: 2 })
    store.getState().undo(); store.getState().undo(); await flushCopyWatcher()
    expect(bar()).toBe(null)
  })

  it('SC-save: the pending set is saved with the layout and comes back on reload (and can be copied then)', async () => {
    load(base)
    await threeChanges()
    const file = serializeScene({ ...store.getState() })
    load(base)
    expect(bar()).toBe(null)
    const loaded = {}
    deserializeScene(file, loaded)
    load(loaded.objects)
    expect(bar()).toMatchObject({ section: S, count: 3, copyCount: 3 })
    copyPending(); await flushCopyWatcher()
    for (const s of others) expect(rowIn(s, K + 4)).toEqual([])
  })

  it('SC-multi: one action changing rows in two sections is not copied: "This change affects rows in 2 sections, so it stays where you made it."', async () => {
    load(base)
    const two = [row(K, secKeys[0]).id, row(K).id]
    const was = racksSig(objs().filter(o => !two.includes(o.id)))
    await act(() => { const d = A.move({ x: 0, y: 0 }, 0, GS); store.getState().moveObjects(two, d.x, d.y) })
    expect(useCopyPrompt.getState().message).toBe(multiSectionText(2))
    expect(multiSectionText(2)).toBe('This change affects rows in 2 sections, so it stays where you made it.')
    expect(bar()).toBe(null)
    expect(racksSig(objs().filter(o => !two.includes(o.id)))).toBe(was)
  })

  it('SC-regenerate: a regenerated layout clears the set', async () => {
    load(base)
    await threeChanges()
    expect(bar()).not.toBe(null)
    useCopyPrompt.setState({ report: { text: 'Copied from section 3: 7 copies', skipped: [], warnings: [] } })
    const fresh = base.filter(o => BEAM.has(o.type)).map(o => ({ ...o, id: 'g' + o.id }))
    await act(() => { store.setState({ objects: [...objs().filter(o => !BEAM.has(o.type)), ...fresh] }); store.getState().commitObjectUpdate('fp', {}) })
    expect(bar()).toBe(null)
    expect(useCopyPrompt.getState().report).toBe(null)
    expect(get('fp').copyPending).toBeUndefined()
  })

  it('SC-add: a row pasted into a gap follows the mouse and is placed on a click; the set lists it and Copy puts one in every section, full length for each', async () => {
    load(base.filter(o => !(BEAM.has(o.type) && o.rowIndex === K)))         // row 5 gone everywhere: a gap
    const nb = row(K - 1)
    store.setState({ selectedIds: [nb.id] }); store.getState().copySelected()
    const gapCross = A.cross(nb)[1] + AISLE, depth = A.cross(nb)[1] - A.cross(nb)[0]
    const run = A.run(nb), centre = rot ? { x: gapCross + depth / 2, y: (run[0] + run[1]) / 2 } : { x: (run[0] + run[1]) / 2, y: gapCross + depth / 2 }
    const h0 = hist(), n0 = objs().length
    setCanvasPointer({ x: centre.x + 3, y: centre.y - 2 })
    pasteAt(store, 'cursor', newId)
    expect(usePlacement.getState().active).not.toBe(null)
    expect(objs().length).toBe(n0)
    movePlacement(store, centre, 1)
    expect(usePlacement.getState().active.snapped.cross).toBe('aisle')
    await act(() => expect(commitPlacement(store, guardEdit)).toBe(true))
    expect(hist()).toBe(h0 + 1)
    const placed = objs().find(q => q.id === store.getState().selectedIds[0])
    expect(bar()).toMatchObject({ section: S, count: 1, copyCount: 1, lines: ['A row added'] })
    copyPending(); await flushCopyWatcher()
    const stamped = get(placed.id).rowIndex
    const copies = objs().filter(q => BEAM.has(q.type) && q.rowIndex === stamped)
    expect(copies.length).toBe(secKeys.length)
    for (const c of copies) {
      const n = rowIn(c.genSection, K - 1)[0]
      expect(A.run(c).map(r4)).toEqual(A.run(n).map(r4))
      expect(A.cross(c)[0] - A.cross(n)[1]).toBeCloseTo(AISLE, 6)
    }
  })

  it('SC-place: paste and duplicate follow the mouse until a click; Esc cancels; a blocked spot takes the click and does nothing; placing in another section while changes are pending asks first', async () => {
    load(base)
    store.setState({ selectedIds: [row(K).id] }); store.getState().copySelected()
    const n0 = objs().length, h0 = hist()
    setCanvasPointer({ x: -5000, y: -5000 })
    pasteAt(store, 'cursor', newId)
    const f0 = rackFootprint(usePlacement.getState().active.items[0])
    for (const p of [{ x: -5000, y: -5000 }, { x: -7123, y: -4321 }]) {
      movePlacement(store, p, 1)
      const a = usePlacement.getState().active
      expect(f0.x + f0.w / 2 + a.dx).toBeCloseTo(p.x, 6)
      expect(f0.y + f0.h / 2 + a.dy).toBeCloseTo(p.y, 6)
      expect(a.blocked).toBe('outside the building')
    }
    expect(commitPlacement(store)).toBe(false)
    const on = rackFootprint(row(K + 3))
    movePlacement(store, { x: on.x + on.w / 2, y: on.y + on.h / 2 }, 1)
    expect(usePlacement.getState().active.blocked).toMatch(/^overlaps row \d+/)
    expect(commitPlacement(store)).toBe(false)
    expect(cancelPlacement()).toBe(true)
    expect(objs().length).toBe(n0)
    expect(hist()).toBe(h0)
    store.setState({ selectedIds: [row(K).id] }); store.getState().copySelected()
    pasteAt(store, 'nudge', newId)
    expect(usePlacement.getState().active).not.toBe(null)
    cancelPlacement()
    const secs = sectionsNow(), a0 = secs[0], a1 = secs[1]
    const r0 = rowIn(a0.key, K)[0], r1 = rowIn(a0.key, K + 1)[0]
    const short = { ...strip(r0), id: 'short', beams: [96], width: ((3 * 2 + 96) / 12) * GS }
    delete short.rowIndex; delete short.genSection; delete short.genRunFt; delete short.genCrossFt
    startPlacement(store, [short])
    const midRun = (a0.end + a1.start) / 2, midCross = (A.cross(r0)[1] + A.cross(r1)[0]) / 2
    movePlacement(store, rot ? { x: midCross, y: midRun } : { x: midRun, y: midCross }, 1)
    expect(usePlacement.getState().active.blocked).toMatch(/cross-aisle/)
    expect(commitPlacement(store)).toBe(false)
    cancelPlacement()
    // pending in section 3; a row placed in section 5 asks first
    load(base.filter(o => !(BEAM.has(o.type) && o.rowIndex === K && o.genSection === T)))
    await act(() => store.getState().commitObjectUpdate(row(K + 2).id, A.move(row(K + 2), 0, GS / 2)))
    const nb = row(K - 1, T)
    store.setState({ selectedIds: [nb.id] }); store.getState().copySelected()
    pasteAt(store, 'cursor', newId)
    const g = A.cross(nb)[1] + AISLE + (A.cross(nb)[1] - A.cross(nb)[0]) / 2, rr = A.run(nb)
    movePlacement(store, rot ? { x: g, y: (rr[0] + rr[1]) / 2 } : { x: (rr[0] + rr[1]) / 2, y: g }, 1)
    expect(usePlacement.getState().active.blocked).toBe(null)
    expect(commitPlacement(store, guardEdit)).toBe(false)
    expect(question()).toMatchObject({ section: S, count: 1 })
    cancelPlacement()
  })

  it('SC-skip: a copy that cannot fit is skipped and the report says which section / row and why; the others are copied', async () => {
    const s0 = secKeys[0]
    const a = base.find(o => o.genSection === s0 && o.rowIndex === K), b = base.find(o => o.genSection === s0 && o.rowIndex === K + 1)
    const sign = A.cross(b)[0] > A.cross(a)[0] ? 1 : -1
    const gap = sign > 0 ? A.cross(b)[0] - A.cross(a)[1] : A.cross(a)[0] - A.cross(b)[1]
    load(base.map(o => (o.id === b.id ? { ...o, ...A.move(o, 0, -sign * (gap - 2 * GS)) } : o)))
    await act(() => store.getState().commitObjectUpdate(row(K).id, A.move(row(K), 0, sign * 3 * GS)))
    const was = A.cross(rowIn(s0, K)[0])
    const plan = copyPending(); await flushCopyWatcher()
    expect(plan.copies.length).toBe(secKeys.length - 2)
    expect(A.cross(rowIn(s0, K)[0])).toEqual(was)
    expect(useCopyPrompt.getState().report.skipped).toEqual([`Section ${s0}, row ${K}: overlaps row ${K + 1} by 1'`])
  })
})

describe('SC — wiring', () => {
  it('SC-wire: the per-change notes, the two-button note and manual mode are gone; the bar, the question, the checks before an edit and "Always copy" are in', () => {
    const src = (f) => readFileSync(f, 'utf8')
    for (const f of ['src/utils/copyPrompt.js', 'src/canvas2/CopyNote.jsx', 'src/components/Toolbar/TopBar.jsx', 'src/components/RightPanel/panels/RackRowPanelCore.jsx']) {
      expect(src(f)).not.toMatch(/turnCopyingOn|copyManual|MANUAL_NOTICE|Copying off|copyButtonLabel|readChange|quietNextAction/)
    }
    expect(src('src/utils/copyChange.js')).not.toMatch(/export function (readChange|planCopy|describeChange)/)
    expect(src('src/components/RightPanel/panels/RackRowPanelCore.jsx')).toMatch(/Match bays in this section/)
    expect(src('src/App.jsx')).toMatch(/installCopyWatcher\(useCanvasStore, nanoid\)/)
    expect(src('src/components/Toolbar/TopBar.jsx')).toMatch(/<Switch on=\{alwaysCopy\} onClick=\{\(\) => setAlwaysCopy\(!alwaysCopy\)\} label="Always copy" \/>/)
    const inter = src('src/canvas2/useCanvasInteraction.js')
    expect(inter).toMatch(/if \(!guardEdit\(\[\.\.\.new Set\(\[hitId, \.\.\.st\.selectedIds\]\)\]\)\) return/)
    expect(inter).toMatch(/commitPlacement\(useCanvasStore, guardEdit\)/)
    expect(src('src/hooks/useKeyboardShortcuts.js')).toMatch(/if \(!guardEdit\(\[\.\.\.selectedIds/)
    expect(src('src/canvas2/Canvas2.jsx')).toMatch(/<CopyNote \/>/)
    expect(src('src/utils/copyPrompt.js')).toMatch(/localStorage\.getItem\(LS_KEY\) === '1'/)
  })
})
