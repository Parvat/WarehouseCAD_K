// Area RP — a pasted, duplicated or dropped row is an ADDED row, decided by
// rack id (not stamps): "Apply my changes" adds a copy in every section and
// never moves an existing row for it. Paste lands at the mouse cursor;
// Ctrl+Shift+V pastes in place. 1080 x 410, 25 x 30, reach; both orientations.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline, pendingEdits, dropRotation } from '../../utils/rowEdits'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { pasteAt, setCanvasPointer, pointerWorld } from '../../utils/pasteAt'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, stop, seq = 0
const newId = () => 'p' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  stop = installAisleKeeper(store, newId)          // no row-edit keeper: stamps on a copy are NOT stripped for us
})
afterAll(() => stop && stop())

const r6 = (v) => +v.toFixed(6)
const strip = (o) => JSON.parse(JSON.stringify(o))
const BEAM = new Set(['rack_row', 'rack_double_row'])

function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)
  return [fp, ...racks]
}
function load(objects, view = { zoom: 1, panX: 0, panY: 0 }) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], pasteCount: 0,
    ...view, history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const pending = () => pendingEdits(objs(), get('fp'), GS)

/** Rows 3-10 of the shortest section moved 10 ft across: a 20.5 ft gap after
 *  row 2. A copy of row 3 centred in the gap then sits CLOSER to row 3's
 *  baseline spot than row 3 itself — which is what fooled a stamp-based rule
 *  into taking the copy for row 3 (row 3 "moved" the wrong amount, no row added). */
function setup(orientation) {
  const base = layout(orientation)
  const { sections } = buildingSections(base, 'r0')
  const rot = rackFootprint(sections[0].rows[0]).rotated
  const run = (o) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const cross = (o) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
  const src = [...sections].sort((a, b) => (run(a.rows[0])[1] - run(a.rows[0])[0]) - (run(b.rows[0])[1] - run(b.rows[0])[0]))[0]
  load(base)
  const moved = src.rows.filter(r => r.rowIndex >= 3 && r.rowIndex <= 10).map(r => r.id)
  store.getState().moveObjects(moved, rot ? 10 * GS : 0, rot ? 0 : 10 * GS)
  const row = (s, i) => get(s.rows.find(r => r.rowIndex === i).id)
  const gapMid = (cross(row(src, 2))[1] + cross(row(src, 3))[0]) / 2
  const r3 = row(src, 3)
  const runMid = (run(r3)[0] + run(r3)[1]) / 2
  const world = rot ? { x: gapMid, y: runMid } : { x: runMid, y: gapMid }
  return { base, sections, src, rot, run, cross, row, gapMid, world, r3 }
}
/** After Apply: rows 3-10 moved 6 ft across in every section and nothing
 *  else moved (no row moved for the added one); the added row is in every
 *  section, in the gap. */
function expectAddedNotMoved(g, addedId) {
  const idx = get(addedId).rowIndex
  expect(idx).toBeGreaterThan(Math.max(...g.base.filter(o => BEAM.has(o.type)).map(o => o.rowIndex)))   // its own new rowIndex
  for (const s of g.sections) {
    for (const r of s.rows) {
      const now = get(r.id)
      const d = r.rowIndex >= 3 && r.rowIndex <= 10 ? 10 * GS : 0
      expect(r6(g.cross(now)[0])).toBe(r6(g.cross(r)[0] + d))
      expect(r6(g.run(now)[0])).toBe(r6(g.run(r)[0]))
    }
    const copy = objs().find(o => o.rowIndex === idx && o.genSection === s.rows[0].genSection)
    expect(copy).toBeDefined()
    expect(r6((g.cross(copy)[0] + g.cross(copy)[1]) / 2)).toBe(r6(g.gapMid))
  }
}

describe('RP — pasted / duplicated / dropped rows are added rows', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`RP-paste ${orientation}: row 3 copied and pasted (Ctrl+V) at the cursor in the gap -> an added row; Apply adds it in every section and moves no existing row for it`, () => {
      const g = setup(orientation)
      store.setState({ selectedIds: [g.r3.id] }); store.getState().copySelected()
      setCanvasPointer({ x: g.world.x, y: g.world.y })                  // zoom 1, no pan: px = world
      const hist = store.getState().historyIndex
      pasteAt(store, 'cursor', newId)
      expect(store.getState().historyIndex).toBe(hist + 1)               // one undo step
      const pasted = store.getState().selectedIds[0]
      expect(get(pasted).rowIndex).toBeUndefined()                      // a new row: no stamps of row 3
      expect(pending().filter(e => e.kind === 'add').map(e => e.line.pieces.map(p => p.id))).toEqual([[pasted]])
      expect(pending().filter(e => e.kind === 'move').map(e => e.rowIndex).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
      Panel.applyRowEdits(store.getState, 'fp')
      expectAddedNotMoved(g, pasted)
    })

    it(`RP-duplicate ${orientation}: row 3 duplicated (Ctrl+D = copy + the store's nudged paste, KEEPING row 3's stamps) and dragged into the gap -> still an added row by id; Apply adds it everywhere, row 3 moves only by its own 10'`, () => {
      const g = setup(orientation)
      store.setState({ selectedIds: [g.r3.id] }); store.getState().copySelected(); store.getState().paste()
      const dup = store.getState().selectedIds[0]
      expect(get(dup).rowIndex).toBe(3)                                  // the copy still carries row 3's stamps
      const d = g.gapMid - (g.cross(get(dup))[0] + g.cross(get(dup))[1]) / 2
      store.getState().moveObjects([dup], g.rot ? d : 0, g.rot ? 0 : d)
      expect(pending().filter(e => e.kind === 'add').map(e => e.line.pieces.map(p => p.id))).toEqual([[dup]])
      expect(pending().find(e => e.kind === 'move' && e.rowIndex === 3).dCrossFt).toBe(10)
      Panel.applyRowEdits(store.getState, 'fp')
      expectAddedNotMoved(g, dup)
    })

    it(`RP-panel ${orientation}: a row dragged from the left panel into the gap -> an added row; Apply adds it everywhere, nothing else moves`, () => {
      const g = setup(orientation)
      const w = g.run(g.r3)[1] - g.run(g.r3)[0], h = 140
      store.getState().addObject({ id: 'drop', type: 'rack_row', x: g.world.x - (g.rot ? h : w) / 2 + (g.rot ? (h - w) / 2 : 0), y: g.world.y - (g.rot ? w : h) / 2 + (g.rot ? (w - h) / 2 : 0),
        width: w, height: h, beams: [...g.r3.beams], uprightWidth: 3, parentId: 'fp', ...dropRotation(objs(), get('fp'), 'rack_row') })
      expect(pending().filter(e => e.kind === 'add')).toHaveLength(1)
      Panel.applyRowEdits(store.getState, 'fp')
      expectAddedNotMoved(g, 'drop')
    })

    it(`RP-cursor ${orientation}: paste lands at the cursor, with the view zoomed and panned`, () => {
      const base = layout(orientation)
      load(base, { zoom: 0.5, panX: 120, panY: 60 })
      const r = base.find(o => o.id === 'r5')
      store.setState({ selectedIds: [r.id] }); store.getState().copySelected()
      setCanvasPointer({ x: 700, y: 400 })
      const at = pointerWorld(store.getState())
      expect(at).toEqual({ x: (700 - 120) / 0.5, y: (400 - 60) / 0.5 })
      pasteAt(store, 'cursor', newId)
      const p = get(store.getState().selectedIds[0])
      expect(r6(p.x + p.width / 2)).toBe(r6(at.x))
      expect(r6(p.y + p.height / 2)).toBe(r6(at.y))
      expect(p.parentId).toBe('fp')
    })

    it(`RP-inplace ${orientation}: Ctrl+Shift+V lands exactly on the original (and is an added row, not a move); one undo removes it`, () => {
      const base = layout(orientation)
      load(base)
      const r = base.find(o => o.id === 'r5')
      store.setState({ selectedIds: [r.id] }); store.getState().copySelected()
      pasteAt(store, 'inPlace', newId)
      const p = get(store.getState().selectedIds[0])
      expect([p.x, p.y, p.width, p.height, p.rotation]).toEqual([r.x, r.y, r.width, r.height, r.rotation])
      expect(pending().map(e => e.kind)).toEqual(['add'])
      store.getState().undo()
      // (the aisle keeper adds the layout's aisle labels; compare everything else)
      expect(strip(objs().filter(o => o.type !== 'aisle'))).toEqual(strip(base))
    })

    it(`RP-split ${orientation}: a middle-bay split's new piece is part of its row (pieceOf), not an added row`, () => {
      const base = layout(orientation)
      load(base)
      store.getState().deleteSingleBay('r5', 4)
      const piece = objs().find(o => o.pieceOf === 'r5')
      expect(piece).toBeDefined()
      expect(pending()).toEqual([])
    })
  }

  it('RP-wire: Ctrl+V pastes at the cursor and Ctrl+Shift+V in place; the top bar has both', () => {
    const kb = readFileSync(new URL('../../../src/hooks/useKeyboardShortcuts.js', import.meta.url), 'utf8')
    expect(kb).toMatch(/case 'v':[\s\S]*?pasteAt\(useCanvasStore, e\.shiftKey \? 'inPlace' : 'cursor', nanoid\)/)
    const tb = readFileSync(new URL('../../../src/components/Toolbar/TopBar.jsx', import.meta.url), 'utf8')
    expect(tb).toMatch(/pasteAt\(useCanvasStore, 'cursor', nanoid\)/)
    expect(tb).toMatch(/pasteAt\(useCanvasStore, 'inPlace', nanoid\)/)
  })
})
