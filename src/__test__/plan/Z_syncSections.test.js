// Area Z — "Sync all sections": row positions adjusted in one section
// (spacing across the aisles, where each row starts along the run) are
// applied to every other section, rows matched by order across the aisles.
// Positions only — beams untouched. Warnings (overlap / cross-aisle / wall)
// never block. One undo for the whole sync.
import { describe, it, expect, beforeAll } from 'vitest'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const r6 = (v) => +v.toFixed(6)
const strip = (o) => JSON.parse(JSON.stringify(o))
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const pos = (o) => { const f = rackFootprint(o); return { run: r6(runOf(f)[0]), cross: r6(crossOf(f)[0]) } }

function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const get = (id) => store.getState().objects.find(o => o.id === id)

/* A 240 ft run with a 60 ft max rack run: 239 ft usable, max 7 bays a
 * section; 3 sections -> 239 - 2 x 9.25 = 220.5 ft -> 26 bays, ceil(26/3)
 * = 9 > 7; 4 sections -> 239 - 3 x 9.25 = 211.25 ft -> 25 bays, 7 max.
 * So 4 sections. Horizontal: 240 x 120; vertical: 120 x 240. Column lines
 * every 25 ft along the run (a 30 ft run grid would force a fifth). */
function layout(orientation) {
  const [L, W] = orientation === 'horizontal' ? [240, 120] : [120, 240]
  const [gx, gy] = orientation === 'horizontal' ? [25, 40] : [40, 25]
  const brief = { lengthFt: L, widthFt: W, gridXFt: gx, gridYFt: gy, mhe: 'reach', orientation, rackType: 'rack_double_row', maxRunFt: 60 }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L * GS, height: W * GS, wallThicknessFt: 0.25 }
  return [fp, ...racks]
}
/** Move a rack's drawn footprint by (dRun, dCross) px. */
function nudge(o, dRun, dCross) {
  const rot = rackFootprint(o).rotated
  return { ...o, x: o.x + (rot ? dCross : dRun), y: o.y + (rot ? dRun : dCross) }
}

describe('Z — Sync all sections', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`Z-sync ${orientation}: 4 sections; section 1 row 2 moved 1' across, row 3 moved 2' along -> sections 2-4 match; beams unchanged; one undo`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      expect(sections).toHaveLength(4)
      const n = sections[0].rows.length
      for (const s of sections) expect(s.rows).toHaveLength(n)
      const s1 = sections[0].rows
      const moved = new Map([[s1[1].id, [0, 40]], [s1[2].id, [80, 0]]])
      const start = base.map(o => (moved.has(o.id) ? nudge(o, ...moved.get(o.id)) : o))
      load(start)
      const res = Panel.applySectionsSync(store.getState, s1[0].id)
      expect(res.sections).toBe(4)
      expect(res.moved).toBe(2 * 3)
      /* row 3 is full length, so 2' along takes it 2' (24") into the next
         cross-aisle in sections 2-3, and past the inner wall in section 4 by
         80 px less the end gap: listed, and applied anyway */
      const innerEnd = 240 * GS - 0.25 * GS, last = sections[3]
      expect(res.warnings.map(w => [w.section, w.row, w.crossAisleIn, w.wallOutIn])).toEqual([
        [2, 3, 24, 0], [3, 3, 24, 0],
        [4, 3, 0, Math.round((((80 - (innerEnd - last.end)) / GS) * 12) * 100) / 100],
      ])
      expect(res.unmatched).toEqual([])
      // every other section: rows where they were, but row 2 +1' across, row 3 +2' along
      for (const sec of sections.slice(1)) {
        sec.rows.forEach((r, i) => {
          const was = pos(r), now = pos(get(r.id))
          const [dRun, dCross] = i === 1 ? [0, 40] : i === 2 ? [80, 0] : [0, 0]
          expect(now).toEqual({ run: r6(was.run + dRun), cross: r6(was.cross + dCross) })
          const o = get(r.id)
          expect([o.beams, o.width, o.height, o.levels, o.rotation]).toEqual([r.beams, r.width, r.height, r.levels, r.rotation])
        })
      }
      // section 1 and the building untouched
      for (const r of s1) expect(get(r.id)).toEqual(start.find(o => o.id === r.id))
      store.getState().undo()
      expect(strip(store.getState().objects)).toEqual(strip(start))
    })

    it(`Z-warn ${orientation}: section 1 row 3 moved 10' along -> row 3 of sections 2-3 is 10' into the cross-aisle, section 4's passes the wall; applied anyway; one undo`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s1 = sections[0].rows
      const start = base.map(o => (o.id === s1[2].id ? nudge(o, 400, 0) : o))
      load(start)
      const res = Panel.applySectionsSync(store.getState, s1[0].id)
      const rows3 = sections.slice(1).map(s => s.rows[2].id)
      expect(res.warnings.map(w => w.id)).toEqual(rows3)
      expect(res.warnings.map(w => [w.section, w.row])).toEqual([[2, 3], [3, 3], [4, 3]])
      // every row in a section is the same length, so the envelope end is the row end: 400 px = 120"
      expect(res.warnings.slice(0, 2).map(w => [w.crossAisleIn, w.wallOutIn, w.overlaps])).toEqual([[120, 0, []], [120, 0, []]])
      // the last section: past the inner wall by 400 px less the end gap
      const last = sections[3]
      const innerEnd = 240 * GS - 0.25 * GS   // the run is 240 ft in both orientations
      const expectIn = Math.round((((400 - (innerEnd - last.end)) / GS) * 12) * 100) / 100
      expect(res.warnings[2]).toMatchObject({ crossAisleIn: 0, wallOutIn: expectIn, overlaps: [] })
      for (const id of rows3) expect(pos(get(id)).run).toBe(r6(pos(start.find(o => o.id === id)).run + 400))
      store.getState().undo()
      expect(strip(store.getState().objects)).toEqual(strip(start))
    })

    /* A lane rack stands in section 3's aisle 1'-2.5' past row 2. Section 1's
     * row 2 moves 3' across (120 px; half the narrowed 10.5' - 3' aisle is
     * 150 px, so it still matches) -> section 3's row 2 now overlaps it. */
    it(`Z-overlap ${orientation}: section 1 row 2 moved 3' across -> section 3's row 2 overlaps a rack in its aisle; listed, applied anyway`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s1 = sections[0].rows, s3 = sections[2]
      const f2 = rackFootprint(s3.rows[1]), hi = crossOf(f2)[1], rot = f2.rotated
      const obs = rot
        ? { id: 'obs', type: 'rack_pushback', x: hi + 40, y: s3.start, width: 60, height: 200 }
        : { id: 'obs', type: 'rack_pushback', x: s3.start, y: hi + 40, width: 200, height: 60 }
      const start = [...base.map(o => (o.id === s1[1].id ? nudge(o, 0, 120) : o)), obs]
      load(start)
      const res = Panel.applySectionsSync(store.getState, s1[0].id)
      expect(res.warnings.map(w => [w.section, w.row, w.overlaps])).toEqual([[3, 2, ['obs']]])
      expect(pos(get(s3.rows[1].id)).cross).toBe(r6(pos(s3.rows[1]).cross + 120))
    })

    /* Section 3 loses its middle row (row 4 of 7). Section 1: row 2 +1'
     * across, row 3 +2' along, row 5 +1' across. Matched by nearest
     * position, section 3's rows 1-3 and 5-7 keep their true partners: its
     * row 5 moves +1' across like section 1's row 5 (by order it would have
     * taken row 4's "no change" and row 6 row 5's +1'), and the missing row 4
     * is reported. Sections 2 and 4 match all 7 rows. */
    it(`Z-gap ${orientation}: section 3 missing its middle row -> its other rows match their true partners, nothing shifts to the wrong row, the gap is reported`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s1 = sections[0].rows, gone = sections[2].rows[3]
      const moves = new Map([[s1[1].id, [0, 40]], [s1[2].id, [80, 0]], [s1[4].id, [0, 40]]])
      const start = base.filter(o => o.id !== gone.id).map(o => (moves.has(o.id) ? nudge(o, ...moves.get(o.id)) : o))
      load(start)
      const res = Panel.applySectionsSync(store.getState, s1[0].id)
      expect(res.gaps).toEqual([{ section: 3, row: 4 }])
      expect(res.unmatched).toEqual([])
      const delta = (i) => (i === 1 ? [0, 40] : i === 2 ? [80, 0] : i === 4 ? [0, 40] : [0, 0])
      for (const sec of sections.slice(1)) {
        sec.rows.forEach((r, i) => {
          if (r.id === gone.id) return
          const [dRun, dCross] = delta(i)          // i = the row's ORIGINAL place across the aisles
          expect(pos(get(r.id))).toEqual({ run: r6(pos(r).run + dRun), cross: r6(pos(r).cross + dCross) })
        })
      }
      store.getState().undo()
      expect(strip(store.getState().objects)).toEqual(strip(start))
    })

    it(`Z-far ${orientation}: a row more than half an aisle from every section-1 row is left unchanged and reported`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s1 = sections[0].rows, s2 = sections[1].rows
      const gap = crossOf(rackFootprint(s2[3]))[0] - crossOf(rackFootprint(s2[2]))[1]
      // section 2's row 3 moved 60% of an aisle toward row 4: no source row within half an aisle
      const start = base.map(o => (o.id === s2[2].id ? nudge(o, 0, 0.6 * gap) : o))
      load(start)
      const res = Panel.applySectionsSync(store.getState, s1[0].id)
      expect(res.unmatched).toEqual([{ id: s2[2].id, section: 2, row: 3 }])
      expect(res.gaps).toEqual([{ section: 2, row: 3 }])
      expect(get(s2[2].id)).toEqual(start.find(o => o.id === s2[2].id))
    })

    it(`Z-unmatched ${orientation}: a section with an extra row -> the extra row is left alone and reported`, () => {
      const base = layout(orientation)
      const { sections } = buildingSections(base, 'r0')
      const s3 = sections[2].rows, lastRow = s3[s3.length - 1]
      const extra = { ...nudge(lastRow, 0, 3000), id: 'extra' }
      const start = [...base, extra]
      load(start)
      const res = Panel.applySectionsSync(store.getState, sections[0].rows[0].id)
      expect(res.unmatched).toEqual([{ id: 'extra', section: 3, row: s3.length + 1 }])
      expect(get('extra')).toEqual(extra)
    })
  }

  it('Z-panel: "Sync all sections (3 other sections)"; one section -> disabled', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const base = layout('horizontal')
    load(base)
    Object.assign(store.getInitialState(), store.getState())
    expect(renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: base[1] }))).toContain('Sync all sections (3 other sections)')
    const lone = { id: 'lone', type: 'rack_row', x: 0, y: 0, width: 1000, height: 140, beams: [96, 96, 96], uprightWidth: 3 }
    load([lone])
    Object.assign(store.getInitialState(), store.getState())
    expect(renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: lone }))).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Sync all sections"/)
  })
})
