// Area Z2 — sync safety. Both sync buttons render; and deleting rows (the
// Delete key on a clicked row removes that bay, splitting the rack; again on
// the front piece shortens it) then syncing never deletes, stacks, or moves
// a rack outside the building: the rack count is unchanged, every rack stays
// inside, a split row's pieces move together, and one undo restores.
import { describe, it, expect, beforeAll } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { pendingEdits } from '../../utils/rowEdits'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline } from '../../utils/rowEdits'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const r6 = (v) => +v.toFixed(6)
// the tooltips as they render in HTML (apostrophes escaped)
const TIP_MATCH = 'Every other row in this section copies this row&#x27;s beam lengths and start point, so uprights line up across the aisles.'
const TIP_APPLY_NONE = 'No row changes since the last sync'
const strip = (o) => JSON.parse(JSON.stringify(o))
const BEAM = new Set(['rack_row', 'rack_double_row'])
const racksOf = (objs) => objs.filter(o => BEAM.has(o.type))
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])

function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects

/* 240 ft run, 60 ft max rack run -> 4 sections of 7 rows (see area Z). */
function layout(orientation) {
  const [L, W] = orientation === 'horizontal' ? [240, 120] : [120, 240]
  const [gx, gy] = orientation === 'horizontal' ? [25, 40] : [40, 25]
  const brief = { lengthFt: L, widthFt: W, gridXFt: gx, gridYFt: gy, mhe: 'reach', orientation, rackType: 'rack_double_row', maxRunFt: 60 }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L * GS, height: W * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)      // as the generator leaves it
  return [fp, ...racks]
}

/** Every rack inside the building's inner box (6" walls -> 0.25 ft = 10 px). */
function allInside(objects) {
  const fp = objects.find(o => o.id === 'fp'), wt = 0.25 * GS
  return racksOf(objects).filter(r => {
    const f = rackFootprint(r)
    return !(f.x >= fp.x + wt - 1e-6 && f.y >= fp.y + wt - 1e-6 && f.x + f.w <= fp.x + fp.width - wt + 1e-6 && f.y + f.h <= fp.y + fp.height - wt + 1e-6)
  }).map(r => r.id)
}
/** Racks drawn exactly on top of another (a stacked copy). */
function stacked(objects) {
  const seen = new Map(), dup = []
  for (const r of racksOf(objects)) {
    const f = rackFootprint(r), k = [f.x, f.y, f.w, f.h].map(r6).join(',')
    if (seen.has(k)) dup.push(r.id); else seen.set(k, r.id)
  }
  return dup
}

/** The user's steps on rows 1-3 of `sec`: click a row's 3rd bay + Delete
 *  (the rack splits at that bay), then its 1st bay + Delete (the front piece
 *  loses a bay, so the row now starts one bay later). */
function chop(sec) {
  for (const r of sec.rows.slice(0, 3)) {
    store.getState().deleteSingleBay(r.id, 2)
    store.getState().deleteSingleBay(r.id, 0)
  }
}

describe('Z2 — sync safety', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`Z2-buttons ${orientation}: a single row and a double row both show "Match bays in this section" AND "Apply my changes to all sections" (labels and tooltips), before and after rows are chopped`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      load(base)
      const render = (o) => { Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: o })) }
      const single = racksOf(objs()).find(r => r.type === 'rack_row'), double = racksOf(objs()).find(r => r.type === 'rack_double_row')
      for (const o of [single, double]) {
        const html = render(o)
        expect(html).toContain('aria-label="Match bays in this section"')
        expect(html).toContain('aria-label="Apply my changes to all sections"')
        expect(html).toMatch(/Match bays in this section \(\d+ other rows\)/)
        expect(html).toMatch(/Apply my changes to all sections \(\d+ changes?\)/)
        expect(html).toContain(`title="${TIP_MATCH}"`)
        expect(html).toContain(`title="${TIP_APPLY_NONE}"`)
      }
      chop(sections[1])
      const piece = objs().find(o => o.id === sections[1].rows[0].id)
      const html = render(piece)
      expect(html).toContain('aria-label="Match bays in this section"')
      expect(html).toContain('aria-label="Apply my changes to all sections"')
    })

    for (const [how, from] of [['all', 1], ['all', 0], ['all', 2], ['section', 1], ['section', 0]]) {
      it(`Z2-delete ${orientation}: rows 1-3 of section 2 chopped (split + front bay gone), then ${how === 'all' ? `row 5 of section ${from + 1} moved 1' across and Apply my changes` : `Match bays from section ${from + 1}`} -> same rack count, every rack inside the building, nothing stacked, split rows move as one; one undo`, () => {
        const base = layout(orientation)
        const { sections } = buildingSections(base, 'r0')
        load(base)
        chop(sections[1])
        const count0 = racksOf(objs()).length
        if (how === 'all') {
          /* the split is local; the front bay deleted next to section 2's start
             cross-aisle is a trim that will be copied (one per chopped row) */
          expect(pendingEdits(objs(), objs().find(o => o.id === 'fp'), GS).map(e => [e.kind, e.end, e.bays])).toEqual([['trim', 'start', 1], ['trim', 'start', 1], ['trim', 'start', 1]])
          const r5 = objs().find(o => o.id === sections[from].rows.find(r => r.rowIndex === 5).id)
          const rot = rackFootprint(r5).rotated
          store.getState().commitObjectUpdate(r5.id, { x: r5.x + (rot ? GS : 0), y: r5.y + (rot ? 0 : GS) })
        }
        const before = strip(objs())
        const count = racksOf(before).length
        expect(count).toBe(count0)
        expect(count).toBe(racksOf(base).length + 3)          // each chopped row became two pieces
        expect(allInside(before)).toEqual([])
        const src = before.find(o => o.id === sections[from].rows[0].id)
        const res = how === 'all' ? Panel.applyRowEdits(store.getState, 'fp') : Panel.applySectionSync(store.getState, src.id)
        const after = objs()
        expect(racksOf(after).length).toBe(count)
        expect(allInside(after)).toEqual([])
        expect(stacked(after)).toEqual([])
        // a split row's pieces moved together: the gap between them is unchanged
        for (const r of sections[1].rows.slice(0, 3)) {
          const pieces = (a) => racksOf(a).filter(o => { const f = rackFootprint(o), g = rackFootprint(r); return r6(crossOf(f)[0]) === r6(crossOf(g)[0]) || o.id === r.id })
          const gapOf = (a) => { const ps = pieces(a).map(o => runOf(rackFootprint(o))).sort((p, q) => p[0] - q[0]); return ps.length === 2 ? r6(ps[1][0] - ps[0][1]) : null }
          if (gapOf(before) != null) expect(gapOf(after)).toBe(gapOf(before))
        }
        if (how === 'all') expect(res.applied).toBe(4)                       // 3 trims + the move
        if (how === 'section' && from === 1) expect(res.split.length).toBe(from === 1 ? 5 : 0)   // the other 2 chopped rows' 4 pieces + the source row's other piece
        store.getState().undo()
        expect(strip(objs())).toEqual(before)
      })
    }
  }
})
