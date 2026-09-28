// Area AR — aisle labels only pair two directly facing rows. After a row is
// deleted and brought back (undo/redo, a hand-added row's copies), after
// "Apply my changes to all sections", bay splits and "Match bays", no aisle
// may run through a rack, every aisle's two rows exist, and every pair of
// facing rows has one.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject, aisleObjectsForRacks } from '../../generate/traceGenerate'
import { rackFootprint, expandColumnGrid } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { rebuildAisles, neighbourPairs } from '../../utils/aisleRebuild'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { makeBaseline } from '../../utils/rowEdits'
import { aisleRect } from '../../canvas2/hitTest'
import { GS, MATRIX } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, stopKeeper
let seq = 0
const newId = () => 'n' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  stopKeeper = installAisleKeeper(store, newId)
})
afterAll(() => stopKeeper && stopKeeper())

const strip = (o) => JSON.parse(JSON.stringify(o))
const BEAM = new Set(['rack_row', 'rack_double_row'])
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a)

/** A generated layout exactly as buildQueue builds it: racks + the
 *  generator's aisles, all parented to the building. */
function layout(orientation, L = 240, W = 120) {
  const brief = { lengthFt: L, widthFt: W, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const aisles = aisleObjectsForRacks(racks).map((a, i) => ({ ...a, id: 'a' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L * GS, height: W * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)        // as the generator leaves it
  return [fp, ...racks, ...aisles]
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const aislesOf = (list) => list.filter(o => o.type === 'aisle')
const hasAisle = (list, a, b) => aislesOf(list).some(o => pairKey(o.row1Id, o.row2Id) === pairKey(a, b))

/** Every aisle: both rows exist, and no other rack lies in the aisle's gap.
 *  Returns the problems (empty = good). */
function audit(list) {
  const byId = new Map(list.map(o => [o.id, o]))
  const racks = list.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_'))
  const out = []
  for (const a of aislesOf(list)) {
    if (!byId.has(a.row1Id) || !byId.has(a.row2Id)) { out.push({ aisle: a.id, dangling: true }); continue }
    const r = aisleRect(a, list)
    if (!r) { out.push({ aisle: a.id, rowsDontFace: true }); continue }
    const between = racks.filter(q => q.id !== a.row1Id && q.id !== a.row2Id).filter(q => {
      const f = rackFootprint(q)
      return f.x < r.x + r.width - 1e-6 && f.x + f.w > r.x + 1e-6 && f.y < r.y + r.height - 1e-6 && f.y + f.h > r.y + 1e-6
    })
    if (between.length) out.push({ aisle: a.id, between: between.map(q => q.id) })
  }
  return out
}
/** Every pair of facing beam rows has an aisle. */
function missingPairs(list) {
  const { pairs } = neighbourPairs(list.filter(o => BEAM.has(o.type)))
  const have = new Set(aislesOf(list).map(a => pairKey(a.row1Id, a.row2Id)))
  return [...pairs.keys()].filter(k => !have.has(k))
}
/** Rows 3, 4, 5 (rowIndex) of a section: A, B (the middle row), C. */
function trio(list, sectionIdx) {
  const { sections } = buildingSections(list, list.find(o => BEAM.has(o.type)).id)
  const rows = sections[sectionIdx].rows
  const by = (i) => rows.find(r => r.rowIndex === i)
  return { A: by(3), B: by(4), C: by(5), sections }
}
const deleteRacks = (ids) => { const s = store.getState(); s.clearSelection(); store.setState({ selectedIds: [...ids] }); store.getState().deleteSelected() }

describe('AR — aisles pair only directly facing rows', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`AR-delete ${orientation}: delete a middle row -> its neighbours get one aisle; apply to all sections -> the same everywhere; undo -> the row is back and no aisle crosses it, both its aisles exist`, () => {
      const base = layout(orientation)
      expect(audit(base)).toEqual([])
      load(base)
      const { A, B, C } = trio(base, 1)
      deleteRacks([B.id])
      expect(audit(objs())).toEqual([])
      expect(hasAisle(objs(), A.id, C.id)).toBe(true)          // the wide aisle, nothing between
      expect(missingPairs(objs())).toEqual([])
      Panel.applyRowEdits(store.getState, 'fp')                  // row 4 goes from every section
      expect(objs().some(o => o.rowIndex === 4)).toBe(false)
      expect(audit(objs())).toEqual([])
      expect(missingPairs(objs())).toEqual([])
      store.getState().undo()                                    // back: row 4 only gone in section 2
      store.getState().undo()                                    // back: row 4 everywhere again
      expect(objs().find(o => o.id === B.id)).toBeDefined()
      expect(hasAisle(objs(), A.id, C.id)).toBe(false)           // it would run through the row that's back
      expect(hasAisle(objs(), A.id, B.id) && hasAisle(objs(), B.id, C.id)).toBe(true)
      expect(audit(objs())).toEqual([])
      expect(missingPairs(objs())).toEqual([])
    })

    it(`AR-handcopy ${orientation}: row 4 deleted everywhere, a hand row added in its place in section 1 and applied -> every copy has an aisle to each neighbour, none crosses a row`, () => {
      const base = layout(orientation)
      load(base)
      const { B, sections } = trio(base, 0)
      deleteRacks([B.id])
      Panel.applyRowEdits(store.getState, 'fp')                  // row 4 goes from every section
      expect(objs().filter(o => o.rowIndex === 4)).toEqual([])
      expect(audit(objs())).toEqual([])
      /* the same place, placed by hand (no stamps), as short as the shortest
         section's row 4 so a copy fits in every section (sections along a
         run can differ by a bay; a copy that doesn't fit is skipped) */
      const { id, rowIndex, genSection, genRunFt, genCrossFt, ...hand } = B
      const bays = Math.min(...sections.map(s => s.rows.find(r => r.rowIndex === 4).beams.length))
      const beams = B.beams.slice(0, bays), width = ((3 * (bays + 1) + beams.reduce((a, b) => a + b, 0)) / 12) * GS
      const f = rackFootprint(B), rot = f.rotated
      const runMid = (rot ? f.y : f.x) + width / 2, crossMid = rot ? f.x + f.w / 2 : f.y + f.h / 2
      const cx = rot ? crossMid : runMid, cy = rot ? runMid : crossMid
      store.getState().addObject({ ...hand, id: 'hand', beams, width, x: cx - width / 2, y: cy - B.height / 2 })
      expect(audit(objs())).toEqual([])
      const res = Panel.applyRowEdits(store.getState, 'fp')
      const copies = objs().filter(o => o.rowIndex === res.added[0].rowIndex)
      expect(copies.length).toBe(sections.length)
      for (const c of copies) expect(aislesOf(objs()).filter(a => a.row1Id === c.id || a.row2Id === c.id).length).toBe(2)
      expect(audit(objs())).toEqual([])
      expect(missingPairs(objs())).toEqual([])
    })

    it(`AR-undo ${orientation}: delete, apply, undo, redo -> aisles right at every step`, () => {
      const base = layout(orientation)
      load(base)
      const { A, B, C } = trio(base, 1)
      deleteRacks([B.id])
      Panel.applyRowEdits(store.getState, 'fp')
      for (const step of ['undo', 'undo', 'redo', 'redo', 'undo']) {
        store.getState()[step]()
        expect(audit(objs())).toEqual([])
        expect(missingPairs(objs())).toEqual([])
      }
      // now: row 4 gone in section 2 only
      expect(objs().some(o => o.id === B.id)).toBe(false)
      expect(hasAisle(objs(), A.id, C.id)).toBe(true)
    })

    /* The apply's OWN commit is already right (not just fixed afterwards by
     * the keeper): with the keeper off, both the canvas and the undo
     * snapshot the apply recorded have every aisle between facing rows. */
    it(`AR-snapshot ${orientation}: with the keeper off, the apply's own undo snapshot already has the right aisles`, () => {
      const base = layout(orientation)
      const { B } = trio(base, 1)
      const deleted = rebuildAisles(base.filter(o => o.id !== B.id), newId).objects
      stopKeeper()
      try {
        load(deleted)
        Panel.applyRowEdits(store.getState, 'fp')
        expect(objs().some(o => o.rowIndex === 4)).toBe(false)
        expect(audit(objs())).toEqual([])
        expect(missingPairs(objs())).toEqual([])
        const snap = JSON.parse(store.getState().history[store.getState().historyIndex]).objects
        expect(audit(snap)).toEqual([])
        expect(missingPairs(snap)).toEqual([])
      } finally {
        stopKeeper = installAisleKeeper(store, newId)
      }
    })

    it(`AR-split ${orientation}: a middle-bay delete and "Match bays in this section" keep every aisle between facing rows`, () => {
      const base = layout(orientation)
      load(base)
      const { B, sections } = trio(base, 0)
      store.getState().deleteSingleBay(B.id, 2)
      expect(audit(objs())).toEqual([])
      expect(missingPairs(objs())).toEqual([])
      Panel.applySectionSync(store.getState, sections[0].rows[0].id)
      expect(audit(objs())).toEqual([])
      expect(missingPairs(objs())).toEqual([])
    })
  }

  /* The generator's own aisles, on every matrix building, both orientations,
   * both "Columns along wall" settings: none has a rack between its rows,
   * every facing pair has one, and a rebuild changes nothing. */
  describe('AR-matrix', () => {
    for (const id of Object.keys(MATRIX)) {
      for (const orientation of ['horizontal', 'vertical']) {
        for (const columnsAlongWall of [true, false]) {
          it(`AR-matrix ${id} ${orientation} wall=${columnsAlongWall ? 'Yes' : 'No'}: no aisle has a rack between its rows`, () => {
            const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = MATRIX[id]
            const brief = { lengthFt, widthFt, gridXFt, gridYFt, mhe, orientation, columnsAlongWall, rackType: 'rack_double_row' }
            const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
            const aisles = aisleObjectsForRacks(racks).map((a, i) => ({ ...a, id: 'a' + i, parentId: 'fp' }))
            const list = [{ id: 'fp', type: 'fp_rect', x: 0, y: 0, width: lengthFt * GS, height: widthFt * GS }, ...racks, ...aisles]
            expect(audit(list)).toEqual([])
            expect(missingPairs(list)).toEqual([])
            expect(rebuildAisles(list, newId).changed).toBe(false)
          }, 30000)
        }
      }
    }
  })
})
