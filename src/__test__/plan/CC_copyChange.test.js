// Area CC — "Copy this change" (replaces "Apply my changes to all sections").
// After each row / bay action the change stays where it was made and a note
// offers ONE copy:
//   ACROSS SECTIONS "Copy to all sections": a row moved across the aisles
//     (the delta only), deleted, or added;
//   WITHIN THE SECTION "Copy to this section's rows": a row moved along its
//     run (the delta only), bays added / deleted / re-beamed.
// Hovering the button previews the copies without changing anything;
// ignoring the note leaves the change local and the note goes at the next
// action; "Always copy" copies straight away. Rows added by paste /
// duplicate / the left panel follow the mouse and are placed on a click.
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
import { installCopyWatcher, useCopyPrompt, copyNow, flushCopyWatcher, buttonText, turnCopyingOn, MANUAL_NOTICE, BACK_ON_NOTICE } from '../../utils/copyPrompt'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { copyPreviewRects, bayRuns } from '../../utils/copyChange'
import { usePlacement, startPlacement, movePlacement, commitPlacement, cancelPlacement } from '../../utils/placement'
import { pasteAt, setCanvasPointer } from '../../utils/pasteAt'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
let store, Panel, Note, stops = [], seq = 0
const newId = () => 'c' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  Note = await import('../../canvas2/CopyNote.jsx')
  stops = [installAisleKeeper(store, newId), installRowEditKeeper(store), installCopyWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { useCopyPrompt.getState().setAlwaysCopy(false); cancelPlacement(); useCopyPrompt.getState().dismiss() })

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
const offer = () => useCopyPrompt.getState().offer
const act = async (fn) => { fn(); await flushCopyWatcher() }
const hist = () => store.getState().historyIndex

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
/** The note as server-rendered HTML (the stores' live state as their initial one). */
const renderNote = () => { Object.assign(useCopyPrompt.getInitialState(), useCopyPrompt.getState()); Object.assign(usePlacement.getInitialState(), usePlacement.getState()); return renderToStaticMarkup(createElement(Note.CopyNote)) }

describe.each(['horizontal', 'vertical'])('CC — %s', (orientation) => {
  const rot = orientation === 'vertical'
  const A = ax(rot)
  const base = layout(orientation)
  const secKeys = buildingSections(base, 'r0').sections.map(s => s.key)
  const S = secKeys[1]                                   // a middle section
  const src = () => rowIn(S, K)[0]

  it('CC-layout: the orientation is right, and row 5 exists once in every section', () => {
    expect(secKeys.length).toBeGreaterThanOrEqual(3)
    load(base)
    for (const s of secKeys) expect(rowIn(s, K)).toHaveLength(1)
    expect(rackFootprint(src()).rotated).toBe(rot)
  })

  it('CC-across: a row moved ACROSS -> "Copy to all sections"; hover previews without changing anything; the copy moves row 5 of every other section by the DELTA only (a row already offset keeps its offset); first undo takes the copies, second the move', async () => {
    // section 1's row 5 already sits 1' along and 6" across from the others (the layout came that way)
    const off = base.find(o => o.genSection === secKeys[0] && o.rowIndex === K)
    load(base.map(o => (o.id === off.id ? { ...o, ...A.move(o, GS, -GS / 2) } : o)))
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, { run: A.run(o), cross: A.cross(o) }]))
    const h0 = hist()
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    const o = offer()
    expect(o.parts.map(p => p.button)).toEqual(['Copy to all sections'])
    expect(o.text).toBe(`Row ${K} moved 1' across the aisles`)
    expect(o.parts[0].count).toBe(secKeys.length - 1)
    // hover: outlines where the copies land; nothing changes
    const snap = JSON.stringify(objs()), h1 = hist()
    useCopyPrompt.getState().setHover(true)
    const rects = copyPreviewRects(objs(), o.parts[0].plan)
    expect(rects).toHaveLength(secKeys.length - 1)
    expect(JSON.stringify(objs())).toBe(snap)
    expect(hist()).toBe(h1)
    useCopyPrompt.getState().setHover(false)
    copyNow()
    await flushCopyWatcher()
    expect(offer()).toBe(null)
    for (const s of secKeys.filter(k => k !== S)) {
      const r = rowIn(s, K)[0], w = was.get(r.id)
      expect(A.cross(r).map(r4)).toEqual(w.cross.map(v => r4(v + GS)))      // + the delta, from its OWN place
      expect(A.run(r).map(r4)).toEqual(w.run.map(r4))                      // along: untouched
      const f = rackFootprint(r), p = rects.find(q => q.id === r.id)
      expect([p.x, p.y, p.w, p.h].map(r4)).toEqual([f.x, f.y, f.w, f.h].map(r4))   // the preview was exactly right
    }
    // nothing else moved
    for (const r of objs().filter(q => BEAM.has(q.type) && q.rowIndex !== K)) expect(A.cross(r).map(r4)).toEqual(was.get(r.id).cross.map(r4))
    expect(hist()).toBe(h0 + 2)                                            // the move, then the copy
    store.getState().undo()
    for (const s of secKeys.filter(k => k !== S)) expect(A.cross(rowIn(s, K)[0]).map(r4)).toEqual(was.get(rowIn(s, K)[0].id).cross.map(r4))
    expect(A.cross(src()).map(r4)).toEqual(was.get(src().id).cross.map(v => r4(v + GS)))   // the move is still there
    store.getState().undo()
    expect(A.cross(src()).map(r4)).toEqual(was.get(src().id).cross.map(r4))
  })

  it('CC-flue: a drag that also re-seats a double row\'s flue (the live auto-flue: depth and flue change) is still a move ACROSS, copied as exactly the move; re-seating a flue in place is no move', async () => {
    load(base)
    const s0 = strip(src()), was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, A.cross(o)]))
    const grow = 10                                                        // 9" -> 12" flue: 10 px deeper, about the same centre
    const c = { x: s0.x + s0.width / 2, y: s0.y + s0.height / 2 }
    const moved = rot ? { x: c.x + 2 * GS - s0.width / 2, y: c.y - (s0.height + grow) / 2 } : { x: c.x - s0.width / 2, y: c.y + 2 * GS - (s0.height + grow) / 2 }
    await act(() => store.getState().commitObjectUpdate(s0.id, { ...moved, height: s0.height + grow, flueSpaceIn: (s0.flueSpaceIn || 9) + 3 }))
    expect(offer().text).toBe(`Row ${K} moved 2' across the aisles`)
    copyNow(); await flushCopyWatcher()
    for (const s of secKeys.filter(k => k !== S)) { const r = rowIn(s, K)[0]; expect(A.cross(r).map(r4)).toEqual(was.get(r.id).map(v => r4(v + 2 * GS))) }
    // the flue alone, in place
    const s1 = strip(rowIn(S, K + 4)[0])
    await act(() => store.getState().commitObjectUpdate(s1.id, { y: s1.y - grow / 2, height: s1.height + grow, flueSpaceIn: 12 }))   // same centre
    expect(offer()).toEqual({ text: "This change can't be copied: a flue or depth change.", blocked: true })
  })

  it('CC-diagonal: a row dragged both across and along -> BOTH buttons, each copying only its own part; the other stays on offer after one is used; each copy is its own undo step', async () => {
    load(base)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, { run: A.run(o), cross: A.cross(o) }]))
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 3 * GS, 2 * GS)))
    const o = offer()
    expect(o.text).toBe(`Row ${K} moved 2' across the aisles and 3' along the row`)
    expect(o.parts.map(p => p.button)).toEqual(['Copy to all sections', "Copy to this section's rows"])
    expect(o.parts[0].count).toBe(secKeys.length - 1)
    // hovering the along button previews only this section's rows
    useCopyPrompt.getState().setHover(1)
    const rects = copyPreviewRects(objs(), o.parts[useCopyPrompt.getState().hover].plan)
    expect(rects.length).toBe(o.parts[1].count)
    expect(rects.every(r => objs().find(q => q.id === r.id).genSection === S)).toBe(true)
    useCopyPrompt.getState().setHover(null)
    const h0 = hist()
    copyNow(0); await flushCopyWatcher()                                 // the across part
    for (const s of secKeys.filter(k => k !== S)) {
      const r = rowIn(s, K)[0], w = was.get(r.id)
      expect(A.cross(r).map(r4)).toEqual(w.cross.map(v => r4(v + 2 * GS)))
      expect(A.run(r).map(r4)).toEqual(w.run.map(r4))                     // not the along part
    }
    for (const r of objs().filter(q => BEAM.has(q.type) && q.genSection === S && q.rowIndex !== K)) expect(A.run(r).map(r4)).toEqual(was.get(r.id).run.map(r4))
    expect(offer().parts.map(p => p.button)).toEqual(["Copy to this section's rows"])   // still on offer
    copyNow(0); await flushCopyWatcher()                                 // the along part
    for (const r of objs().filter(q => BEAM.has(q.type) && q.genSection === S && q.rowIndex !== K)) {
      const w = was.get(r.id)
      expect(A.cross(r).map(r4)).toEqual(w.cross.map(r4))                 // not the across part
      if (A.run(r)[0] !== w.run[0]) expect(A.run(r).map(r4)).toEqual(w.run.map(v => r4(v + 3 * GS)))
    }
    expect(offer()).toBe(null)
    expect(hist()).toBe(h0 + 2)
    store.getState().undo()                                              // the along copies
    for (const r of objs().filter(q => BEAM.has(q.type) && q.genSection === S && q.rowIndex !== K)) expect(A.run(r).map(r4)).toEqual(was.get(r.id).run.map(r4))
    store.getState().undo()                                              // the across copies
    for (const s of secKeys.filter(k => k !== S)) expect(A.cross(rowIn(s, K)[0]).map(r4)).toEqual(was.get(rowIn(s, K)[0].id).cross.map(r4))
  })

  it('CC-count: each note button shows its copy count ("Copy to all sections · N copies"; "1 copy")', async () => {
    load(base)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 3 * GS, 2 * GS)))
    const html = renderNote()
    const [a, b] = offer().parts
    expect(html).toContain(`>Copy to all sections · ${secKeys.length - 1} copies</button>`)
    expect(html).toContain(`>Copy to this section&#x27;s rows · ${b.count} copies</button>`)
    expect(a.count).toBe(secKeys.length - 1)
    expect(buttonText('Copy to all sections', 1)).toBe('Copy to all sections · 1 copy')
  })

  it('CC-cant: other changes the note can\'t copy say why (upright width; a move and a bay change in one go); "Match bays" and moving the building say nothing', async () => {
    load(base)
    const s0 = strip(src())
    await act(() => store.getState().commitObjectUpdate(s0.id, { uprightWidth: 4, width: s0.width + (s0.beams.length + 1) / 12 * GS }))
    expect(offer()).toEqual({ text: "This change can't be copied: an upright width change.", blocked: true })
    const s1 = strip(rowIn(S, K + 1)[0])
    await act(() => store.getState().commitObjectUpdate(s1.id, { ...Panel.addBayUpdate(s1, 96, GS), ...A.move(s1, 0, GS / 2) }))
    expect(offer().blocked).toBe(true)
    expect(offer().text).toBe("This change can't be copied: it moves the row across the aisles and changes its bays in one go.")
    await act(() => Panel.applySectionSync(store.getState, rowIn(S, K + 3)[0].id))
    expect(offer()).toBe(null)
    await act(() => store.getState().moveObjects(['fp'], 5 * GS, 5 * GS))
    expect(offer()).toBe(null)
  })

  it('CC-along: a row moved ALONG -> "Copy to this section\'s rows"; every other row of that section moves by the delta (from its own place); other sections untouched', async () => {
    const other = base.find(o => o.genSection === S && o.rowIndex === K + 1)
    load(base.map(o => (o.id === other.id ? { ...o, ...A.move(o, -GS, 0) } : o)))            // already 1' back
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, { run: A.run(o), cross: A.cross(o) }]))
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 2 * GS, 0)))
    const o = offer()
    expect(o.parts.map(p => p.button)).toEqual(["Copy to this section's rows"])
    expect(o.text).toBe(`Row ${K} moved 2' along the row`)
    const lines = sectionsNow().find(s => s.key === S).lines.length
    expect(o.parts[0].count + o.parts[0].skipped.length).toBe(lines - 1)
    copyNow()
    await flushCopyWatcher()
    let moved = 0
    for (const r of objs().filter(q => BEAM.has(q.type))) {
      const w = was.get(r.id)
      if (!w || r.id === src().id) continue
      expect(A.cross(r).map(r4)).toEqual(w.cross.map(r4))
      if (r.genSection === S) { expect(A.run(r).map(r4)).toEqual(w.run.map(v => r4(v + 2 * GS))); moved++ }
      else expect(A.run(r).map(r4)).toEqual(w.run.map(r4))
    }
    expect(moved).toBe(o.parts[0].count)
    expect(o.parts[0].count).toBeGreaterThan(5)
  })

  it('CC-delete: a row deleted -> "Copy to all sections"; the preview marks the rows that would go; the copy deletes row 5 everywhere; undo brings them back, then the original', async () => {
    load(base)
    const n0 = objs().filter(o => BEAM.has(o.type)).length
    await act(() => { store.setState({ selectedIds: [src().id] }); store.getState().deleteSelected() })
    const o = offer()
    expect(o.parts.map(p => p.button)).toEqual(['Copy to all sections'])
    expect(o.text).toBe(`Row ${K} deleted`)
    const rects = copyPreviewRects(objs(), o.parts[0].plan)
    expect(rects.length).toBe(secKeys.length - 1)
    expect(rects.every(r => r.gone)).toBe(true)
    copyNow(); await flushCopyWatcher()
    expect(objs().filter(q => BEAM.has(q.type) && q.rowIndex === K)).toEqual([])
    expect(objs().filter(o2 => BEAM.has(o2.type)).length).toBe(n0 - secKeys.length)
    store.getState().undo()
    expect(objs().filter(q => BEAM.has(q.type) && q.rowIndex === K).length).toBe(secKeys.length - 1)
    store.getState().undo()
    expect(objs().filter(q => BEAM.has(q.type) && q.rowIndex === K).length).toBe(secKeys.length)
  })

  it('CC-add: a row pasted into a gap follows the mouse, is placed on a click (one undo step), then "Copy to all sections" puts one in every section, full length for each section', async () => {
    load(base)
    await act(() => { store.setState({ selectedIds: [src().id] }); store.getState().deleteSelected() })
    copyNow(); await flushCopyWatcher()                                  // row 5 gone everywhere: a gap
    const nb = rowIn(S, K - 1)[0]
    store.setState({ selectedIds: [nb.id] }); store.getState().copySelected()
    const gapCross = A.cross(nb)[1] + AISLE, depth = A.cross(nb)[1] - A.cross(nb)[0]
    const run = A.run(nb), centre = rot ? { x: gapCross + depth / 2, y: (run[0] + run[1]) / 2 } : { x: (run[0] + run[1]) / 2, y: gapCross + depth / 2 }
    const h0 = hist(), n0 = objs().length
    setCanvasPointer({ x: centre.x + 3, y: centre.y - 2 })               // zoom 1, no pan: pointer = world
    pasteAt(store, 'cursor', newId)
    const a = usePlacement.getState().active
    expect(a).not.toBe(null)
    expect(objs().length).toBe(n0)                                       // nothing in the layout yet
    expect(hist()).toBe(h0)
    movePlacement(store, centre, 1)
    expect(usePlacement.getState().active.blocked).toBe(null)
    expect(usePlacement.getState().active.snapped.cross).toBe('aisle')   // aisle = the forklift aisle
    await act(() => expect(commitPlacement(store)).toBe(true))
    expect(hist()).toBe(h0 + 1)
    const placed = objs().find(q => q.id === store.getState().selectedIds[0])
    expect(A.cross(placed)[0] - A.cross(nb)[1]).toBeCloseTo(AISLE, 6)
    const o = offer()
    expect(o.parts.map(p => p.button)).toEqual(['Copy to all sections'])
    expect(o.text).toBe('Row added')
    copyNow(); await flushCopyWatcher()
    const stamped = get(placed.id).rowIndex
    const copies = objs().filter(q => BEAM.has(q.type) && q.rowIndex === stamped)
    expect(copies.length).toBe(secKeys.length)
    for (const c of copies) {
      const n = rowIn(c.genSection, K - 1)[0]
      expect(A.run(c).map(r4)).toEqual(A.run(n).map(r4))               // full length for its own section
      expect(A.cross(c)[0] - A.cross(n)[1]).toBeCloseTo(AISLE, 6)
    }
  })

  const bayCase = (name, doIt, check) => it(`CC-bays ${name}: copied to this section's rows only, at the same spot; other sections untouched`, async () => {
    load(base)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, strip(o)]))
    const s0 = strip(src())
    await act(() => doIt(s0))
    const o = offer()
    expect(o.parts.map(p => p.button)).toEqual(["Copy to this section's rows"])
    copyNow(); await flushCopyWatcher()
    const lines = sectionsNow().find(s => s.key === S).lines
    let done = 0
    for (const line of lines) {
      if (line.pieces.some(p => p.rowIndex === K)) continue
      const bw = was.get(line.pieces[0].id) || was.get(line.pieces[0].pieceOf)
      check(line.pieces, bw, s0); done++
    }
    expect(done).toBe(lines.length - 1)
    for (const r of objs().filter(q => BEAM.has(q.type) && q.genSection !== S)) expect(strip(r)).toEqual(was.get(r.id))
  })
  bayCase('end bay deleted', (s0) => store.getState().deleteSingleBay(s0.id, s0.beams.length - 1), (pieces, bw) => {
    expect(pieces).toHaveLength(1)
    expect(pieces[0].beams.length).toBe(bw.beams.length - 1)
  })
  bayCase('middle bay deleted (the row splits)', (s0) => store.getState().deleteSingleBay(s0.id, 3), (pieces, bw) => {
    expect(pieces).toHaveLength(2)
    expect(pieces.reduce((n, p) => n + p.beams.length, 0)).toBe(bw.beams.length - 1)
    const srcGap = bayRuns(bw, GS)[3]
    for (const p of pieces) for (const b of bayRuns(p, GS)) expect(Math.min(b.hi, srcGap.hi) - Math.max(b.lo, srcGap.lo)).toBeLessThanOrEqual(1e-6)
  })
  bayCase('bay added', (s0) => store.getState().commitObjectUpdate(s0.id, Panel.addBayUpdate(s0, 96, GS)), (pieces, bw) => {
    expect(pieces[0].beams.length).toBe(bw.beams.length + 1)
  })
  bayCase('beam length changed', (s0) => store.getState().commitObjectUpdate(s0.id, Panel.changeBayUpdate(s0, 2, 108, GS)), (pieces, bw, s0) => {
    const spot = bayRuns(s0, GS)[2]
    const at = bayRuns(pieces[0], GS).find(b => Math.min(b.hi, spot.hi) - Math.max(b.lo, spot.lo) > (b.hi - b.lo) / 2)
    expect(at.beam).toBe(108)
    expect(pieces[0].beams.filter(b => b === 108).length).toBe(bw.beams.filter(b => b === 108).length + 1)
  })

  it('CC-manual: shorten a row, ignore the note, move another row up -> manual mode: the notice, no copy note, nothing copied; the building carries the mode', async () => {
    load(base)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, strip(o)]))
    const s0 = src()
    await act(() => store.getState().deleteSingleBay(s0.id, s0.beams.length - 1))          // shorten a row
    expect(offer().parts.map(p => p.button)).toEqual(["Copy to this section's rows"])
    const r2 = rowIn(S, K + 2)[0]
    await act(() => store.getState().commitObjectUpdate(r2.id, A.move(r2, 0, -GS)))          // ignored: move another row up
    expect(useCopyPrompt.getState().manual).toBe(true)
    expect(useCopyPrompt.getState().notice).toBe(MANUAL_NOTICE)
    expect(MANUAL_NOTICE).toBe('Sections no longer match, so copying is turned off. Changes now apply only where you make them.')
    expect(offer()).toBe(null)
    expect(get('fp').copyManual).toBe(true)
    const html = renderNote()
    expect(html).toContain('aria-label="Turn copying back on"')
    expect(html).not.toMatch(/Copy to (all sections|this section)/)
    // nothing copied: every other rack is as it was
    for (const r of objs().filter(o => BEAM.has(o.type) && o.id !== s0.id && o.id !== r2.id)) expect(strip(r)).toEqual(was.get(r.id))
    // later changes: still no note; undo / redo keep the mode
    const r3 = rowIn(S, K + 4)[0]
    await act(() => store.getState().commitObjectUpdate(r3.id, A.move(r3, 0, GS / 2)))
    expect(offer()).toBe(null)
    store.getState().undo(); await flushCopyWatcher(); store.getState().undo(); await flushCopyWatcher()
    expect(get('fp').copyManual).toBe(true)
    expect(useCopyPrompt.getState().manual).toBe(true)
  })

  it('CC-manual-ways: dismissing an unused note -> manual mode; an undone change does not; using one of a diagonal drag\'s two buttons and leaving the other does not', async () => {
    load(base)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    useCopyPrompt.getState().dismiss()
    expect(useCopyPrompt.getState().manual).toBe(true)
    load(base)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    store.getState().undo(); await flushCopyWatcher()                              // the change is gone: nothing left unmatched
    const r2 = rowIn(S, K + 2)[0]
    await act(() => store.getState().commitObjectUpdate(r2.id, A.move(r2, 0, -GS / 2)))
    expect(useCopyPrompt.getState().manual).toBe(false)
    expect(offer().parts.length).toBe(1)
    load(base)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 3 * GS, 2 * GS)))
    copyNow(0); await flushCopyWatcher()                                           // the across part; the along part left
    await act(() => store.getState().commitObjectUpdate(r2.id, A.move(r2, 0, -GS / 2)))
    expect(useCopyPrompt.getState().manual).toBe(false)
    expect(offer().text).toBe(`Row ${K + 2} moved 6" across the aisles`)
  })

  it('CC-manual-multi: rows in two sections moved together -> manual mode with the notice; no copy buttons; nothing copied', async () => {
    load(base)
    const two = [rowIn(secKeys[0], K)[0].id, src().id]
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, A.cross(o)]))
    await act(() => { store.setState({ selectedIds: two }); const d = A.move({ x: 0, y: 0 }, 0, GS); store.getState().moveObjects(two, d.x, d.y) })
    expect(useCopyPrompt.getState().manual).toBe(true)
    expect(useCopyPrompt.getState().notice).toBe(MANUAL_NOTICE)
    expect(offer()).toBe(null)
    expect(renderNote()).not.toMatch(/Copy to (all sections|this section)/)
    expect(copyNow()).toBe(null)
    for (const r of objs().filter(o => BEAM.has(o.type) && !two.includes(o.id))) expect(A.cross(r)).toEqual(was.get(r.id))
  })

  it('CC-manual-always: with Always copy on, manual mode is never entered (the multi-section move is only a warning)', async () => {
    load(base)
    useCopyPrompt.getState().setAlwaysCopy(true)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    const r2 = rowIn(S, K + 2)[0]
    await act(() => store.getState().commitObjectUpdate(r2.id, A.move(r2, 0, -GS / 2)))
    const two = [rowIn(secKeys[0], K + 4)[0].id, rowIn(S, K + 4)[0].id]
    await act(() => { const d = A.move({ x: 0, y: 0 }, 0, GS / 2); store.getState().moveObjects(two, d.x, d.y) })
    expect(useCopyPrompt.getState().manual).toBe(false)
    expect(get('fp').copyManual).toBeUndefined()
    expect(offer()).toEqual({ text: "This change affects rows in 2 sections, so it can't be copied. Make the change in one section, then copy it.", blocked: true })
    useCopyPrompt.getState().setAlwaysCopy(false)
  })

  it('CC-manual-on: "Turn copying back on" warns that sections may differ, and copy notes come back', async () => {
    load(base)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    useCopyPrompt.getState().dismiss()
    expect(useCopyPrompt.getState().manual).toBe(true)
    turnCopyingOn()
    expect(useCopyPrompt.getState().manual).toBe(false)
    expect(get('fp').copyManual).toBeUndefined()
    expect(useCopyPrompt.getState().notice).toBe(BACK_ON_NOTICE)
    expect(BACK_ON_NOTICE).toMatch(/may already differ/)
    const r2 = rowIn(S, K + 2)[0]
    await act(() => store.getState().commitObjectUpdate(r2.id, A.move(r2, 0, -GS / 2)))
    expect(offer().parts.map(p => p.button)).toEqual(['Copy to all sections'])
  })

  it('CC-manual-save: manual mode is saved with the layout and comes back on reload', async () => {
    load(base)
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    useCopyPrompt.getState().dismiss()
    const file = serializeScene({ ...store.getState() })
    load(base)                                                                     // another layout: copying on
    expect(useCopyPrompt.getState().manual).toBe(false)
    const loaded = {}
    deserializeScene(file, loaded)
    load(loaded.objects)                                                           // the saved one again
    expect(get('fp').copyManual).toBe(true)
    expect(useCopyPrompt.getState().manual).toBe(true)
    const r2 = rowIn(S, K + 2)[0]
    await act(() => store.getState().commitObjectUpdate(r2.id, A.move(r2, 0, -GS / 2)))
    expect(offer()).toBe(null)
  })

  it('CC-always: "Always copy" on -> copied straight away with no note, in the action\'s own history entry: one undo takes the change and its copies', async () => {
    load(base)
    useCopyPrompt.getState().setAlwaysCopy(true)
    const was = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, A.cross(o)]))
    const h0 = hist()
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, GS)))
    expect(offer()).toBe(null)
    expect(hist()).toBe(h0 + 1)
    for (const s of secKeys) expect(A.cross(rowIn(s, K)[0]).map(r4)).toEqual(was.get(rowIn(s, K)[0].id).map(v => r4(v + GS)))
    // the history entry holds the copies too
    const snap = JSON.parse(store.getState().history[hist()]).objects
    for (const s of secKeys) { const r = snap.find(q => q.genSection === s && q.rowIndex === K); expect(A.cross(r).map(r4)).toEqual(was.get(r.id).map(v => r4(v + GS))) }
    store.getState().undo()
    for (const s of secKeys) expect(A.cross(rowIn(s, K)[0]).map(r4)).toEqual(was.get(rowIn(s, K)[0].id).map(r4))
    useCopyPrompt.getState().setAlwaysCopy(false)
  })

  it('CC-place: paste and duplicate follow the mouse until a click; Esc cancels (nothing placed); a blocked spot (overlap, outside the building, a cross-aisle) takes the click and does nothing', async () => {
    load(base)
    store.setState({ selectedIds: [src().id] }); store.getState().copySelected()
    const n0 = objs().length, h0 = hist()
    // follows the mouse, outside the building: no snapping, blocked
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
    expect(objs().length).toBe(n0)
    // on top of a row: blocked
    const on = rackFootprint(rowIn(S, K + 3)[0])
    movePlacement(store, { x: on.x + on.w / 2, y: on.y + on.h / 2 }, 1)
    expect(usePlacement.getState().active.blocked).toMatch(/^overlaps row \d+/)
    expect(commitPlacement(store)).toBe(false)
    // Esc
    expect(cancelPlacement()).toBe(true)
    expect(usePlacement.getState().active).toBe(null)
    expect(objs().length).toBe(n0)
    expect(hist()).toBe(h0)
    // duplicate (Ctrl+D = copy + paste nudged) also places by mouse
    store.setState({ selectedIds: [src().id] }); store.getState().copySelected()
    pasteAt(store, 'nudge', newId)
    expect(usePlacement.getState().active).not.toBe(null)
    cancelPlacement()
    // a short row in a cross-aisle, in an aisle's band (touching no rack): blocked
    const secs = sectionsNow(), a0 = secs[0], a1 = secs[1]
    const r0 = rowIn(a0.key, K)[0], r1 = rowIn(a0.key, K + 1)[0]
    const short = { ...strip(r0), id: 'short', beams: [96], width: ((3 * 2 + 96) / 12) * GS, rowIndex: undefined, genSection: undefined }
    delete short.rowIndex; delete short.genSection; delete short.genRunFt; delete short.genCrossFt
    startPlacement(store, [short])
    const midRun = (a0.end + a1.start) / 2, midCross = (A.cross(r0)[1] + A.cross(r1)[0]) / 2
    movePlacement(store, rot ? { x: midCross, y: midRun } : { x: midRun, y: midCross }, 1)
    expect(usePlacement.getState().active.blocked).toMatch(/cross-aisle/)
    expect(commitPlacement(store)).toBe(false)
    cancelPlacement()
    expect(objs().length).toBe(n0)
  })

  it('CC-skip: a copy that cannot fit is skipped and the note says which section / row and why; the others are copied', async () => {
    const s0 = secKeys[0]
    const a = base.find(o => o.genSection === s0 && o.rowIndex === K), b = base.find(o => o.genSection === s0 && o.rowIndex === K + 1)
    const sign = A.cross(b)[0] > A.cross(a)[0] ? 1 : -1
    const gap = sign > 0 ? A.cross(b)[0] - A.cross(a)[1] : A.cross(a)[0] - A.cross(b)[1]
    // in section 1, row 6 stands 2' from row 5 (the layout came that way)
    load(base.map(o => (o.id === b.id ? { ...o, ...A.move(o, 0, -sign * (gap - 2 * GS)) } : o)))
    await act(() => store.getState().commitObjectUpdate(src().id, A.move(src(), 0, sign * 3 * GS)))
    const o = offer()
    expect(o.parts[0].skipped).toEqual([`Section ${s0}, row ${K}: overlaps row ${K + 1} by 1'`])
    expect(o.parts[0].count).toBe(secKeys.length - 2)
    const was = A.cross(rowIn(s0, K)[0])
    copyNow(); await flushCopyWatcher()
    expect(A.cross(rowIn(s0, K)[0])).toEqual(was)                        // skipped: left where it was
    expect(useCopyPrompt.getState().report.skipped).toEqual(o.parts[0].skipped)  // and still reported after the copy
  })
})

describe('CC — wiring', () => {
  it('CC-wire: the Apply button, its pending list and baseline are gone; the note, preview, placement and the "Always copy" switch (off by default) are in', () => {
    const src = (f) => readFileSync(f, 'utf8')
    for (const f of ['src/components/RightPanel/panels/RackRowPanelCore.jsx', 'src/components/RightPanel/PropertiesPanel.jsx', 'src/generate/traceGenerate.js', 'src/utils/rowEditKeeper.js']) {
      expect(src(f)).not.toMatch(/Apply my changes|ApplyRowChanges|applyRowEdits|pendingEdits|rowBaseline:|makeBaseline/)
    }
    expect(src('src/components/RightPanel/panels/RackRowPanelCore.jsx')).toMatch(/Match bays in this section/)
    expect(src('src/App.jsx')).toMatch(/installCopyWatcher\(useCanvasStore, nanoid\)/)
    const top = src('src/components/Toolbar/TopBar.jsx')
    expect(top).toMatch(/<Switch on=\{alwaysCopy\} onClick=\{\(\) => setAlwaysCopy\(!alwaysCopy\)\} label="Always copy" \/>/)
    const canvas = src('src/canvas2/Canvas2.jsx')
    expect(canvas).toMatch(/<CopyPreview \/>/)
    expect(canvas).toMatch(/<PlacementGhost gridSize=\{gridSize\} \/>/)
    expect(canvas).toMatch(/<CopyNote \/>/)
    const inter = src('src/canvas2/useCanvasInteraction.js')
    expect(inter).toMatch(/commitPlacement\(useCanvasStore\)/)
    expect(inter).toMatch(/movePlacement\(useCanvasStore, world, view\.current\.zoom\)/)
    expect(src('src/hooks/useKeyboardShortcuts.js')).toMatch(/if \(cancelPlacement\(\)\) return/)
    expect(src('src/components/LeftPanel/FloatingToolbar.jsx')).toMatch(/ROW_TYPES\.has\(item\.type\)\s*\n?\s*\? startPlacement\(useCanvasStore/)
    // off by default
    expect(src('src/utils/copyPrompt.js')).toMatch(/localStorage\.getItem\(LS_KEY\) === '1'/)
  })
})
