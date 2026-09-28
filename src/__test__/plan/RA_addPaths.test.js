// Area RA — a row ADDED by the user is copied by "Apply my changes to all
// sections", whichever way it was added: dragged from the left panel,
// copy-pasted, or duplicated (Ctrl+D = copy + paste). The button's count
// includes it. 1080 x 410, 25 x 30, reach; horizontal and vertical.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline, pendingEdits, dropRotation, describeEdits } from '../../utils/rowEdits'
import { rackIssues } from '../../utils/bayBeam'
import { installRowEditKeeper } from '../../utils/rowEditKeeper'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, stops = []
let seq = 0
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
const racksNow = () => objs().filter(o => BEAM.has(o.type))

/** The building's run axis for a footprint (the layout's direction). */
const axes = (rot) => ({
  run: (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w]),
  cross: (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h]),
})

/** Rows 3.. of the shortest section moved 8 ft across (away from row 2) to
 *  open a gap after row 2. Returns what the tests need about it. */
function openGap(orientation) {
  const base = layout(orientation)
  const { sections } = buildingSections(base, 'r0')
  const rot = rackFootprint(sections[0].rows[0]).rotated
  const A = axes(rot)
  const len = (s) => { const r = s.rows[0]; return A.run(rackFootprint(r))[1] - A.run(rackFootprint(r))[0] }
  const src = [...sections].sort((a, b) => len(a) - len(b))[0]
  load(base)
  const ids = src.rows.filter(r => r.rowIndex >= 3).map(r => r.id)
  store.getState().moveObjects(ids, rot ? 8 * GS : 0, rot ? 0 : 8 * GS)
  const f2 = rackFootprint(get(src.rows.find(r => r.rowIndex === 2).id)), f3 = rackFootprint(get(src.rows.find(r => r.rowIndex === 3).id))
  const gapMid = (A.cross(f2)[1] + A.cross(f3)[0]) / 2
  const secStart = (s) => Math.min(...s.rows.map(r => A.run(rackFootprint(r))[0]))
  return { base, sections, src, rot, A, gapMid, secStart, moves: pendingEdits(objs(), get('fp'), GS).length }
}

/** After Apply: one copy of `added` in every other section, at the same
 *  place across the aisles and (within the paste nudge `slack`) the same
 *  offset from its section's start; each copy inside its section and the
 *  building, overlapping nothing. */
function expectCopiedEverywhere(g, addedId, res, slack = 0) {
  const added = get(addedId)
  const copies = racksNow().filter(o => o.rowIndex === added.rowIndex && o.id !== addedId)
  const others = g.sections.filter(s => s !== g.src)
  expect(res.skipped).toEqual([])
  expect(copies).toHaveLength(others.length)
  const fa = rackFootprint(added), off = g.A.run(fa)[0] - g.secStart(g.src)
  for (const s of others) {
    const c = copies.find(o => o.genSection === s.rows[0].genSection)
    expect(c).toBeDefined()
    const fc = rackFootprint(c)
    expect(r6(g.A.cross(fc)[0])).toBe(r6(g.A.cross(fa)[0]))
    if (res.added[0].fullLength) {
      // a full-length row: full length HERE — the bays, start and end of the row next to it in this section (area RL)
      const mid = (f) => (g.A.cross(f)[0] + g.A.cross(f)[1]) / 2
      const nb = s.rows.map(r => get(r.id)).filter(Boolean).sort((a, b) => Math.abs(mid(rackFootprint(a)) - mid(fc)) - Math.abs(mid(rackFootprint(b)) - mid(fc)))[0]
      expect(c.beams).toEqual(nb.beams)
      expect(r6(g.A.run(fc)[0])).toBe(r6(g.A.run(rackFootprint(nb))[0]))
      expect(r6(g.A.run(fc)[1])).toBe(r6(g.A.run(rackFootprint(nb))[1]))
      expect([c.height, c.rotation, c.type]).toEqual([added.height, added.rotation, added.type])
    } else {
      expect(Math.abs((g.A.run(fc)[0] - g.secStart(s)) - off)).toBeLessThanOrEqual(slack + 1e-6)
      expect([c.beams, c.width, c.height, c.rotation, c.type]).toEqual([added.beams, added.width, added.height, added.rotation, added.type])
    }
    expect(rackIssues(c, objs(), GS)).toEqual({ overlaps: [], wallOutIn: 0 })
  }
}
const buttonCount = () => {
  Object.assign(store.getInitialState(), store.getState())
  const html = renderToStaticMarkup(createElement(Panel.ApplyRowChanges, { fpId: 'fp' }))
  return +(html.match(/Apply my changes to all sections \((\d+) changes?\)/) || [])[1]
}

describe('RA — added rows are copied, however they were added', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`RA-panel ${orientation}: rows moved to open a gap, a row dragged from the left panel into it -> counted (button includes it), Apply copies it into every other section at the same place`, () => {
      const g = openGap(orientation)
      // exactly what FloatingToolbar's drop builds for a single row (5 x 96" bays)
      const beams = [96, 96, 96, 96, 96], w = ((3 * 6 + 480) / 12) * GS, h = 140
      const fp = get('fp')
      const runMid = g.secStart(g.src) + 10 * GS + w / 2
      const wx = g.rot ? g.gapMid : runMid, wy = g.rot ? runMid : g.gapMid
      store.getState().addObject({
        id: 'drop', type: 'rack_row', x: wx - w / 2, y: wy - h / 2, width: w, height: h,
        beams, activeBayIdx: null, uprightWidth: 3, palletWIn: 40, palletDIn: 48, parentId: fp.id,
        ...dropRotation(objs(), fp, 'rack_row'),
      })
      expect(get('drop').rotation || 0).toBe(g.rot ? 90 : 0)          // runs with the rows
      const edits = pendingEdits(objs(), get('fp'), GS)
      expect(edits.filter(e => e.kind === 'add')).toHaveLength(1)
      expect(edits).toHaveLength(g.moves + 1)
      expect(buttonCount()).toBe(g.moves + 1)
      const before = racksNow().length
      const res = Panel.applyRowEdits(store.getState, 'fp')
      expectCopiedEverywhere(g, 'drop', res)
      expect(racksNow().length).toBe(before + g.sections.length - 1)
      expect(pendingEdits(objs(), get('fp'), GS)).toEqual([])
    })

    it(`RA-across ${orientation}: a row dropped the other way round is still counted as an added row (never silently ignored)`, () => {
      const g = openGap(orientation)
      const w = ((3 * 6 + 480) / 12) * GS, h = 140
      const runMid = g.secStart(g.src) + 10 * GS + w / 2
      const wx = g.rot ? g.gapMid : runMid, wy = g.rot ? runMid : g.gapMid
      store.getState().addObject({ id: 'wrong', type: 'rack_row', x: wx - w / 2, y: wy - h / 2, width: w, height: h, beams: [96, 96, 96, 96, 96], uprightWidth: 3, parentId: 'fp', rotation: g.rot ? 0 : 90 })
      const adds = pendingEdits(objs(), get('fp'), GS).filter(e => e.kind === 'add')
      expect(adds.map(e => e.line.pieces.map(p => p.id))).toEqual([['wrong']])
      expect(buttonCount()).toBe(g.moves + 1)
    })

    for (const how of ['paste', 'duplicate']) {
      it(`RA-${how} ${orientation}: rows moved to open a gap, a row ${how === 'paste' ? 'copy-pasted' : 'duplicated'} and dragged into it -> counted, Apply copies it into every other section at the same place`, () => {
        const g = openGap(orientation)
        const single = g.src.rows.find(r => r.type === 'rack_row') || g.src.rows[0]
        store.setState({ selectedIds: [single.id] })
        store.getState().copySelected(); store.getState().paste()          // Ctrl+V, and Ctrl+D (copy + paste)
        const pastedId = store.getState().selectedIds[0]
        const pf = rackFootprint(get(pastedId))
        const d = g.gapMid - (g.A.cross(pf)[0] + g.A.cross(pf)[1]) / 2        // dragged across into the gap
        store.getState().moveObjects([pastedId], g.rot ? d : 0, g.rot ? 0 : d)
        expect(get(pastedId).rowIndex).toBeUndefined()                      // a paste is an added row, not the row it came from
        const edits = pendingEdits(objs(), get('fp'), GS)
        expect(edits.filter(e => e.kind === 'add').map(e => e.line.pieces.map(p => p.id))).toEqual([[pastedId]])
        expect(buttonCount()).toBe(g.moves + 1)
        const res = Panel.applyRowEdits(store.getState, 'fp')
        expectCopiedEverywhere(g, pastedId, res, 20)                         // paste nudges 20 px along; copies slide back into their section
      })
    }
  }

  it('RA-tooltip: the same change to many rows is said once ("Move rows 3–21 by 8\'")', () => {
    const mv = (i, dRunFt, dCrossFt) => ({ kind: 'move', rowIndex: i, dRunFt, dCrossFt })
    const edits = [...Array.from({ length: 19 }, (_, k) => mv(k + 3, 0, 8)), { kind: 'delete', rowIndex: 5 }, { kind: 'delete', rowIndex: 9 }, mv(2, 6, 0), { kind: 'add' }]
    expect(describeEdits(edits)).toBe("Move rows 3–21 by 8' · Delete rows 5, 9 · Move row 2 by 6' · Add 1 row")
  })

  it('RA-wire: both left-panel drop handlers turn a dropped row with the building (dropRotation); Ctrl+D is copy + paste (nudged, the copy selected)', () => {
    for (const f of ['src/components/LeftPanel/FloatingToolbar.jsx', 'src/components/LeftPanel/WarehouseObjectPicker.jsx']) {
      const src = readFileSync(new URL('../../../' + f, import.meta.url), 'utf8')
      expect(src).toMatch(/\.\.\.dropRotation\(objects, parentFp, item\.type\)/)
    }
    const kb = readFileSync(new URL('../../../src/hooks/useKeyboardShortcuts.js', import.meta.url), 'utf8')
    expect(kb).toMatch(/case 'd': \{[\s\S]*?getState\(\)\.copySelected\(\)\s*\n\s*pasteAt\(useCanvasStore, 'nudge', nanoid\)/)
  })
})
