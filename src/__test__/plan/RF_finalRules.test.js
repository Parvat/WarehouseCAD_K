// Area RF — the final rules of "Apply my changes to all sections":
//   - delete row / add row -> every other section;
//   - move row -> ONLY the movement made, on the axis that changed (a row
//     moved along in one section and up in another ends up moved along AND
//     up, never pushed back);
//   - end bay deleted next to a cross-aisle -> the same end of the same row
//     in every section where that end also borders a cross-aisle (never at a
//     wall end);
//   - middle-bay delete, beam-length change -> local, not copied.
// 1080 x 410, 25 x 30, reach: 8 sections horizontal, 3 vertical.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline, pendingEdits, dropRotation, describeEdits } from '../../utils/rowEdits'
import { installRowEditKeeper } from '../../utils/rowEditKeeper'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, stops = [], seq = 0
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  stops = [installRowEditKeeper(store), installAisleKeeper(store, () => 'k' + (++seq))]
})
afterAll(() => stops.forEach(f => f()))

const r6 = (v) => +v.toFixed(6)
const strip = (o) => JSON.parse(JSON.stringify(o))
const BEAM = new Set(['rack_row', 'rack_double_row'])
const WT = 0.25 * GS

function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)
  return [fp, ...racks]
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], pasteCount: 0,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const pending = () => pendingEdits(objs(), get('fp'), GS)
const apply = () => Panel.applyRowEdits(store.getState, 'fp')
const setup = (orientation) => {
  const base = layout(orientation)
  const { sections } = buildingSections(base, 'r0')
  const rot = rackFootprint(sections[0].rows[0]).rotated
  load(base)
  const row = (s, i) => get(s.rows.find(r => r.rowIndex === i).id)
  const run = (o) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const cross = (o) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
  const move = (o, dRunFt, dCrossFt) => store.getState().commitObjectUpdate(o.id, { x: o.x + (rot ? dCrossFt : dRunFt) * GS, y: o.y + (rot ? dRunFt : dCrossFt) * GS })
  return { base, sections, rot, row, run, cross, move, last: sections[sections.length - 1] }
}
const runEnd = (orientation) => (orientation === 'horizontal' ? 1080 : 410) * GS - WT

describe('RF — Apply my changes: final rules', () => {
  for (const [orientation, nSec] of [['horizontal', 8], ['vertical', 3]]) {
    it(`RF-axis-two ${orientation}: left-section row 5 moved 3' along + Apply, then right-section rows 4-6 moved 1' up + Apply -> the left row keeps its along-run position and only moves up`, () => {
      const g = setup(orientation)
      const L0 = { run: g.run(g.row(g.sections[0], 5))[0], cross: g.cross(g.row(g.sections[0], 5))[0] }
      g.move(g.row(g.sections[0], 5), 3, 0)
      apply()
      const afterFirst = new Map(g.sections.map(s => [s, g.run(g.row(s, 5))[0]]))
      for (const i of [4, 5, 6]) g.move(g.row(g.last, i), 0, -1)
      expect(pending().map(e => [e.kind, e.rowIndex, e.dRunFt, e.dCrossFt])).toEqual([['move', 4, 0, -1], ['move', 5, 0, -1], ['move', 6, 0, -1]])
      const hist = store.getState().historyIndex
      apply()
      expect(store.getState().historyIndex).toBe(hist + 1)                          // one undo step
      const left = g.row(g.sections[0], 5)
      expect(r6(g.run(left)[0])).toBe(r6(L0.run + 3 * GS))                           // kept its along-run move
      expect(r6(g.cross(left)[0])).toBe(r6(L0.cross - 1 * GS))                         // and only moved up
      for (const s of g.sections) {
        expect(r6(g.run(g.row(s, 5))[0])).toBe(r6(afterFirst.get(s)))                  // the up-move changed nothing along the run
        expect(r6(g.cross(g.row(s, 5))[0])).toBe(r6(L0.cross - 1 * GS))
      }
    })

    it(`RF-axis-one ${orientation}: the same two edits in ONE apply (along in the left section first, up in the right later) -> every section's row 5 moved along AND up`, () => {
      const g = setup(orientation)
      const base5 = new Map(g.sections.map(s => [s, { run: g.run(g.row(s, 5))[0], end: g.run(g.row(s, 5))[1], cross: g.cross(g.row(s, 5))[0] }]))
      g.move(g.row(g.sections[0], 5), 3, 0)
      g.move(g.row(g.last, 5), 0, -1)
      apply()
      for (const s of g.sections) {
        const b = base5.get(s), o = g.row(s, 5)
        const along = Math.min(3 * GS, runEnd(orientation) - b.end)                    // the last section only up to its wall
        expect(r6(g.run(o)[0])).toBe(r6(b.run + along))
        expect(r6(g.cross(o)[0])).toBe(r6(b.cross - 1 * GS))
      }
      expect(pending()).toEqual([])
    })

    it(`RF-add ${orientation}: rows moved to open a gap, a row dropped from the left panel into it and row 9 deleted -> one Apply moves, deletes and copies the new row into every section`, () => {
      const g = setup(orientation)
      const s2 = g.sections[1]
      for (const r of s2.rows.filter(r => r.rowIndex >= 3)) g.move(get(r.id), 0, 8)
      store.setState({ selectedIds: [s2.rows.find(r => r.rowIndex === 9).id] }); store.getState().deleteSelected()
      const f2 = g.cross(g.row(s2, 2)), f3 = g.cross(g.row(s2, 3))
      const beams = [96, 96, 96, 96], w = ((3 * 5 + 384) / 12) * GS, h = 140
      const start = Math.min(...s2.rows.filter(r => get(r.id)).map(r => g.run(get(r.id))[0]))
      const runMid = start + 10 * GS + w / 2, crossMid = (f2[1] + f3[0]) / 2
      const wx = g.rot ? crossMid : runMid, wy = g.rot ? runMid : crossMid
      store.getState().addObject({ id: 'drop', type: 'rack_row', x: wx - w / 2, y: wy - h / 2, width: w, height: h, beams, uprightWidth: 3, parentId: 'fp', ...dropRotation(objs(), get('fp'), 'rack_row') })
      expect(pending().filter(e => e.kind === 'add')).toHaveLength(1)
      expect(describeEdits(pending())).toContain('Add 1 row')
      const hist = store.getState().historyIndex
      const res = apply()
      expect(store.getState().historyIndex).toBe(hist + 1)
      expect(res.skipped).toEqual([])
      expect(objs().filter(o => o.rowIndex === get('drop').rowIndex)).toHaveLength(nSec)
      for (const s of g.sections) expect(objs().some(o => o.genSection === s.rows[0].genSection && o.rowIndex === 9)).toBe(false)
    })

    it(`RF-trim ${orientation}: the far-end bay of row 7 deleted in a middle section (next to a cross-aisle) -> trimmed at the far end in every section that has a cross-aisle there, NOT in the last one (wall)`, () => {
      const g = setup(orientation)
      const mid = g.sections[1]
      const before = new Map(g.sections.map(s => [s, { beams: g.row(s, 7).beams.length, run: g.run(g.row(s, 7)) }]))
      const r7 = g.row(mid, 7)
      store.getState().deleteSingleBay(r7.id, r7.beams.length - 1)                      // far end bay (0°/90°: local end = far end)
      expect(pending().map(e => [e.kind, e.rowIndex, e.end, e.bays])).toEqual([['trim', 7, 'end', 1]])
      expect(describeEdits(pending())).toBe('Remove 1 end bay at the far end of row 7')
      const hist = store.getState().historyIndex
      const res = apply()
      expect(store.getState().historyIndex).toBe(hist + 1)
      for (const s of g.sections) {
        const b = before.get(s), o = g.row(s, 7)
        if (s === g.last) { expect(o.beams.length).toBe(b.beams); continue }          // far end is the wall here
        expect(o.beams.length).toBe(b.beams - 1)
        expect(r6(g.run(o)[0])).toBe(r6(b.run[0]))                                     // the start stays put
      }
      expect(res.trimmed.map(t => t.section).sort()).toEqual(g.sections.filter(s => s !== mid && s !== g.last).map(s => s.rows[0].genSection).sort())
      store.getState().undo()
      for (const s of g.sections) if (s !== mid) expect(g.row(s, 7).beams.length).toBe(before.get(s).beams)
    })

    it(`RF-trim-start ${orientation}: the start-end bay deleted in a middle section -> trimmed at the start everywhere except the first section (wall)`, () => {
      const g = setup(orientation)
      const before = new Map(g.sections.map(s => [s, { beams: g.row(s, 7).beams.length, end: g.run(g.row(s, 7))[1] }]))
      store.getState().deleteSingleBay(g.row(g.sections[1], 7).id, 0)
      expect(pending().map(e => [e.kind, e.end, e.bays])).toEqual([['trim', 'start', 1]])
      apply()
      for (const s of g.sections) {
        const o = g.row(s, 7)
        expect(o.beams.length).toBe(s === g.sections[0] ? before.get(s).beams : before.get(s).beams - 1)
        expect(r6(g.run(o)[1])).toBe(r6(before.get(s).end))                             // the far end stays put
      }
    })

    it(`RF-wall-trim ${orientation}: an end bay deleted at a WALL end (first section's start) is local: nothing pending, nothing copied`, () => {
      const g = setup(orientation)
      store.getState().deleteSingleBay(g.row(g.sections[0], 7).id, 0)
      expect(pending()).toEqual([])
    })

    it(`RF-middle ${orientation}: a middle bay deleted (a split) and a beam-length change are local: nothing pending, other sections unchanged`, () => {
      const g = setup(orientation)
      const r7 = g.row(g.sections[1], 7)
      store.getState().deleteSingleBay(r7.id, 4)
      const r8 = g.row(g.sections[1], 8)
      store.getState().commitObjectUpdate(r8.id, Panel.changeBayUpdate(r8, 2, 120, GS))
      expect(pending()).toEqual([])
      const snap = strip(objs())
      apply()
      expect(strip(objs())).toEqual(snap)
    })
  }
})
