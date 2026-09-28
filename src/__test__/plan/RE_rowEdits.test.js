// Area RE — "Apply my changes to all sections": the ROW edits made since the
// last sync (delete, move, add — the difference between the rows now and
// the building's `rowBaseline`) are replayed in every other section. Which
// row is selected doesn't matter. 1080 x 410, 25 x 30, reach: 8 sections
// horizontal, 3 vertical (the run is the 410 ft side).
import { describe, it, expect, beforeAll } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline, pendingEdits, describeEdits } from '../../utils/rowEdits'
import { keepRowEdits } from '../../utils/rowEditKeeper'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const r6 = (v) => +v.toFixed(6)
const strip = (o) => JSON.parse(JSON.stringify(o))
const BEAM = new Set(['rack_row', 'rack_double_row'])
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const pos = (o) => { const f = rackFootprint(o); return { run: r6(runOf(f)[0]), cross: r6(crossOf(f)[0]) } }
const WT = 0.25 * GS

/** A generated building exactly as buildQueue leaves it: racks parented to
 *  the building, which carries the baseline of the rows as generated. */
function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)
  return [fp, ...racks]
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const fpNow = () => get('fp')
const pending = () => pendingEdits(objs(), fpNow(), GS)
const apply = () => Panel.applyRowEdits(store.getState, 'fp')
const rackCount = (list) => list.filter(o => BEAM.has(o.type)).length
const nudge = (o, dRun, dCross) => { const rot = rackFootprint(o).rotated; return { x: o.x + (rot ? dCross : dRun), y: o.y + (rot ? dRun : dCross) } }
/** Hand edits through the store, one commit each (like the user). */
const del = (ids) => { store.setState({ selectedIds: [...ids] }); store.getState().deleteSelected() }
const move = (id, dRunFt, dCrossFt) => store.getState().commitObjectUpdate(id, nudge(get(id), dRunFt * GS, dCrossFt * GS))
function outside(list) {
  const fp = list.find(o => o.id === 'fp')
  return list.filter(o => BEAM.has(o.type)).filter(r => {
    const f = rackFootprint(r)
    return !(f.x >= fp.x + WT - 1e-6 && f.y >= fp.y + WT - 1e-6 && f.x + f.w <= fp.x + fp.width - WT + 1e-6 && f.y + f.h <= fp.y + fp.height - WT + 1e-6)
  }).map(r => r.id)
}
const rowOf = (sec, i) => sec.rows.find(r => r.rowIndex === i)

describe('RE — Apply my changes to all sections', () => {
  for (const [orientation, nSec, nRows] of [['horizontal', 8, 21], ['vertical', 3, 58]]) {
    const mid = Math.ceil(nRows / 2)

    it(`RE-delete ${orientation}: a middle row deleted in the middle section, applied with a DIFFERENT section's row selected -> deleted in all ${nSec} sections, never re-added; list clears; one undo brings the row and the list back`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      expect(sections).toHaveLength(nSec)
      load(base)
      const midSec = sections[Math.floor(nSec / 2)]
      del([rowOf(midSec, mid).id])
      expect(pending().map(e => [e.kind, e.section, e.rowIndex])).toEqual([['delete', midSec.rows[0].genSection, mid]])
      store.getState().selectObject(sections[0].rows[0].id)               // the selection is irrelevant
      const before = strip(objs())
      const res = apply()
      expect(res.deleted).toHaveLength(nSec - 1)
      for (const s of sections) expect(objs().some(o => o.genSection === s.rows[0].genSection && o.rowIndex === mid)).toBe(false)
      expect(rackCount(objs())).toBe(rackCount(base) - nSec)
      expect(pending()).toEqual([])
      apply()                                                                // nothing pending: nothing happens, nothing re-added
      expect(rackCount(objs())).toBe(rackCount(base) - nSec)
      expect(outside(objs())).toEqual([])
      store.getState().undo()
      expect(strip(objs())).toEqual(before)
      expect(pending().map(e => e.kind)).toEqual(['delete'])
    })

    it(`RE-multi ${orientation}: 3 rows moved then 1 deleted in section 2 -> all 4 edits applied in every other section`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      const s2 = sections[1]
      move(rowOf(s2, 2).id, 0, 1.5)      // 1'6" across
      move(rowOf(s2, 6).id, 0, -1)       // 1' across the other way
      move(rowOf(s2, 10).id, 2, 0)       // 2' along
      del([rowOf(s2, 14).id])
      const edits = pending()
      expect(edits.map(e => [e.kind, e.rowIndex]).sort()).toEqual([['delete', 14], ['move', 10], ['move', 2], ['move', 6]])
      expect(describeEdits(edits)).toContain('Delete row 14')
      const res = apply()
      expect(res.applied).toBe(4)
      const last = sections[nSec - 1]
      for (const s of sections) {
        if (s === s2) continue
        expect(pos(get(rowOf(s, 2).id))).toEqual({ run: pos(rowOf(s, 2)).run, cross: r6(pos(rowOf(s, 2)).cross + 1.5 * GS) })
        expect(pos(get(rowOf(s, 6).id))).toEqual({ run: pos(rowOf(s, 6)).run, cross: r6(pos(rowOf(s, 6)).cross - 1 * GS) })
        const want = s === last ? Math.min(2 * GS, (orientation === 'horizontal' ? 1080 : 410) * GS - WT - runOf(rackFootprint(rowOf(s, 10)))[1]) : 2 * GS
        expect(pos(get(rowOf(s, 10).id)).run).toBe(r6(pos(rowOf(s, 10)).run + want))
        expect(get(rowOf(s, 14).id)).toBeUndefined()
      }
      expect(outside(objs())).toEqual([])
      expect(pending()).toEqual([])
    })

    it(`RE-add ${orientation}: a row added by hand in section 2 -> copied into all ${nSec - 1} other sections at the same place in each, one shared new rowIndex; one undo removes every copy`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      const s2 = sections[1]
      // a short single row in the aisle between rows 1 and 2, 10 ft from the section's start
      const f1 = rackFootprint(rowOf(s2, 1)), f2 = rackFootprint(rowOf(s2, 2)), rot = f1.rotated
      const beams = [96, 96, 96, 96], width = ((3 * 5 + 384) / 12) * GS, height = 140
      const secStart = Math.min(...s2.rows.map(r => runOf(rackFootprint(r))[0]))
      const crossMid = (crossOf(f1)[1] + crossOf(f2)[0]) / 2, runMid = secStart + 10 * GS + width / 2
      const cx = rot ? crossMid : runMid, cy = rot ? runMid : crossMid
      store.getState().addObject({ id: 'hand', type: 'rack_row', x: cx - width / 2, y: cy - height / 2, width, height, beams, uprightWidth: 3, rotation: rot ? 90 : 0, levels: 5, depthIn: 42, palletWIn: 40, parentId: 'fp' })
      expect(pending().map(e => e.kind)).toEqual(['add'])
      const before = strip(objs())
      const res = apply()
      const idx = get('hand').rowIndex
      const copies = objs().filter(o => o.rowIndex === idx && o.id !== 'hand')
      expect(copies).toHaveLength(nSec - 1)
      expect(res.skipped).toEqual([])
      for (const s of sections) {
        if (s === s2) continue
        const c = copies.find(o => o.genSection === s.rows[0].genSection)
        const start = Math.min(...s.rows.map(r => runOf(rackFootprint(r))[0]))
        expect(pos(c)).toEqual({ run: r6(start + 10 * GS), cross: pos(get('hand')).cross })
        expect([c.beams, c.width, c.levels, c.depthIn]).toEqual([beams, width, 5, 42])
      }
      expect(pending()).toEqual([])
      store.getState().undo()
      expect(strip(objs())).toEqual(before)
    })

    it(`RE-keep ${orientation}: a row deleted only in section 3 before the last sync stays deleted there and is never re-added; other sections keep theirs`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s3 = sections[2 % nSec], gone = rowOf(s3, 4)
      const earlier = base.filter(o => o.id !== gone.id)
      earlier[0] = { ...earlier[0], rowBaseline: makeBaseline(earlier, earlier[0]) }   // the state as of the last sync
      load(earlier)
      expect(pending()).toEqual([])
      move(rowOf(sections[0], 3).id, 0, 1)                                     // some other edit
      apply()
      expect(objs().some(o => o.genSection === gone.genSection && o.rowIndex === 4)).toBe(false)
      for (const s of sections) if (s !== s3) expect(get(rowOf(s, 4).id)).toBeDefined()
    })

    it(`RE-clash ${orientation}: row 5 moved in section 1, then later in section 2 -> the later move wins in every section, reported`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      move(rowOf(sections[0], 5).id, 0, 1)
      move(rowOf(sections[1], 5).id, 0, 2)
      const res = apply()
      expect(res.clashes).toEqual([{ rowIndex: 5, sections: expect.arrayContaining([sections[0].rows[0].genSection, sections[1].rows[0].genSection]), winner: sections[1].rows[0].genSection, kind: 'move' }])
      for (const s of sections) expect(pos(get(rowOf(s, 5).id)).cross).toBe(r6(pos(rowOf(s, 5)).cross + 2 * GS))
    })

    it(`RE-split ${orientation}: a split row counts as one row — moved in section 2 (both pieces) it moves as one elsewhere; a split row elsewhere moves as one; bay edits are not changes`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      store.getState().deleteSingleBay(rowOf(sections[1], 7).id, 3)             // split row 7 in section 2
      store.getState().deleteSingleBay(rowOf(sections[2 % nSec], 7).id, 3)       // and in section 3
      store.getState().deleteSingleBay(rowOf(sections[0], 8).id, 0)             // an end-bay delete: a bay edit
      expect(pending()).toEqual([])
      const pieces = (s) => objs().filter(o => o.genSection === s.rows[0].genSection && o.rowIndex === 7)
      expect(pieces(sections[1])).toHaveLength(2)
      for (const p of pieces(sections[1])) store.getState().updateObject(p.id, nudge(p, 0, GS))
      store.getState().commitObjectUpdate(pieces(sections[1])[0].id, {})
      expect(pending().map(e => [e.kind, e.rowIndex, e.dCrossFt])).toEqual([['move', 7, 1]])
      const before = new Map(objs().filter(o => BEAM.has(o.type)).map(o => [o.id, pos(o)]))
      apply()
      for (const s of sections) {
        if (s === sections[1]) continue
        for (const p of pieces(s)) expect(pos(get(p.id))).toEqual({ run: before.get(p.id).run, cross: r6(before.get(p.id).cross + GS) })
      }
      expect(pieces(sections[2 % nSec])).toHaveLength(2)
      expect(outside(objs())).toEqual([])
    })

    it(`RE-save ${orientation}: the pending list survives save/reload`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      del([rowOf(sections[1], 9).id])
      move(rowOf(sections[0], 3).id, 0, 1)
      const want = pending().map(e => [e.kind, e.section, e.rowIndex])
      const loaded = {}
      deserializeScene(serializeScene({ ...store.getState() }), loaded)
      const fp = loaded.objects.find(o => o.id === 'fp')
      expect(pendingEdits(loaded.objects, fp, GS).map(e => [e.kind, e.section, e.rowIndex])).toEqual(want)
    })

    it(`RE-undo ${orientation}: undoing an edit takes it off the list; after a sync the list is empty; undoing the sync brings it back`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      move(rowOf(sections[0], 3).id, 0, 1)
      del([rowOf(sections[0], 9).id])
      expect(pending()).toHaveLength(2)
      store.getState().undo()
      expect(pending().map(e => [e.kind, e.rowIndex])).toEqual([['move', 3]])
      apply()
      expect(pending()).toEqual([])
      store.getState().undo()
      expect(pending().map(e => [e.kind, e.rowIndex])).toEqual([['move', 3]])
    })

    it(`RE-buttons ${orientation}: the rack panel and the building panel show "Apply my changes to all sections (N changes)" with the edits as tooltip; with none, disabled with a note`, async () => {
      const { PropertiesPanel } = await import('../../components/RightPanel/PropertiesPanel.jsx')
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      const render = (C, props) => { Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(createElement(C, props)).replace(/&#x27;/g, "'") }
      let html = render(Panel.RackRowPanel, { obj: sections[0].rows[0] })
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Apply my changes to all sections"/)
      expect(html).toContain('Apply my changes to all sections (0 changes)')
      expect(html).toContain('No row changes since the last sync')
      del([rowOf(sections[1], 5).id])
      move(rowOf(sections[0], 2).id, 0, 6)
      html = render(Panel.RackRowPanel, { obj: get(sections[0].rows[0].id) })
      expect(html).toContain('Apply my changes to all sections (2 changes)')
      const tip = (html.match(/aria-label="Apply my changes to all sections" title="([^"]*)"/) || [])[1]
      expect(tip.split(' · ').sort()).toEqual(['Delete row 5', "Move row 2 by 6'"])
      store.setState({ selectedIds: ['fp'] })
      html = render(PropertiesPanel, {})
      expect(html).toContain('Apply my changes to all sections (2 changes)')
    })

    it(`RE-merge ${orientation}: sections come from the generator's stamps — a section moved 12' along (past the ~9' cross-aisle) stays its own section`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s1 = new Set(sections[0].rows.map(r => r.id))
      const moved = base.map(o => (s1.has(o.id) ? { ...o, ...nudge(o, 12 * GS, 0) } : o))
      expect(buildingSections(moved, 'r0').sections).toHaveLength(nSec)
    })
  }

  it('RE-stamps: generated racks carry rowIndex / genSection / generated place, saved with the rack, kept by split pieces', () => {
    const base = layout('horizontal')
    const r = base.find(o => o.id === 'r0')
    expect([r.rowIndex, r.genSection]).toEqual([1, 1])
    const saved = JSON.parse(serializeScene({ objects: base, groups: [], layers: [], activeLayerId: null })).objects.find(o => o.id === 'r0')
    expect([saved.rowIndex, saved.genSection, saved.genRunFt, saved.genCrossFt]).toEqual([r.rowIndex, r.genSection, r.genRunFt, r.genCrossFt])
    load(base)
    store.getState().deleteSingleBay('r0', 2)
    expect(objs().filter(o => o.rowIndex === 1 && o.genSection === 1)).toHaveLength(2)
  })

  it('RE-keeper: a pasted copy of a generated row loses its stamps (it is an added row); a building loaded without a baseline gets one', () => {
    const base = layout('horizontal')
    const r = base.find(o => o.id === 'r0')
    const paste = { ...r, id: 'pasted', y: r.y + 40 * 60 }
    const fixed = keepRowEdits([...base, paste], base, GS)
    expect(fixed.find(o => o.id === 'pasted').rowIndex).toBeUndefined()
    const { rowBaseline, ...bare } = base[0]
    const withBase = keepRowEdits([bare, ...base.slice(1)], null, GS)
    expect(withBase[0].rowBaseline).toEqual(rowBaseline)
  })
})
