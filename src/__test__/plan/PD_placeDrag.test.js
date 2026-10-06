// Area PD — placing and dragging rows: the checks from the section-copy areas (SC, CF, EX) that are
// not about copying, kept when the Row group replaced section copy.
//   1. Paste and duplicate follow the mouse until a click; Esc cancels; a blocked spot takes the click
//      and does nothing (from SC-place, without the "Copy your changes?" question it used to end with).
//   2. A row dropped in a generated cross-aisle is a warning, not a block; overlap and outside still
//      block; a manual layout has no cross-aisle (from CF-cross-aisle).
//   3. A live-flue drag re-centres on the rack's depth at drag start; the automatic flue change is no
//      change; the Row group replays the exact net delta across (from EX-flue — it was "copies").
//   4. Every snap reaches the smaller of 12 px on screen or 1 ft (from EX-snap).
// 1080 x 410, 25 x 30, reach; horizontal and vertical. Driven through the real store with the app's
// watchers installed.
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
import { installRowGroupWatcher, flushRowGroupWatcher, useRowGroup, addRowOf, applyPending, clearGroup } from '../../utils/rowGroupTool'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { usePlacement, startPlacement, movePlacement, commitPlacement, cancelPlacement, snapPlacement } from '../../utils/placement'
import { pasteAt, setCanvasPointer } from '../../utils/pasteAt'
import { flueDragPlacement } from '../../canvas2/liveFlue'
import { computeSmartGuides } from '../../canvas2/smartGuides'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
let store, Bar, stops = [], seq = 0
const newId = () => 'p' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Bar = await import('../../canvas2/RowGroupBar.jsx')
  stops = [installAisleKeeper(store, newId), installRowEditKeeper(store), installRowGroupWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { useRowGroup.getState().setAlwaysApply(false); clearGroup(); cancelPlacement() })

const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
const AISLE = MHE_PROFILES.reach.aisleFt * GS

function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const L = 1080 * GS, W = 410 * GS
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L, height: W, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }] }
  return rebuildAisles([fp, { ...columnGridObject(brief, 0, 0), id: 'cg', parentId: 'fp' }, ...racks], newId).objects
}
const manual = (orientation) => layout(orientation).filter(o => o.type !== 'aisle')
  .map(o => { if (!BEAM.has(o.type)) return o; const { genSection, rowIndex, genRunFt, genCrossFt, ...r } = o; return r })   // eslint-disable-line no-unused-vars
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], zoom: 1, panX: 0, panY: 0,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const act = async (fn) => { fn(); await flushRowGroupWatcher() }
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
const oneBay = (r) => { const s = { ...strip(r), id: 'one' + (++seq), beams: [96], width: ((3 * 2 + 96) / 12) * GS }; for (const k of ['rowIndex', 'genSection', 'genRunFt', 'genCrossFt']) delete s[k]; return s }
/** A point in the cross-aisle between runs a and b, across from rack r. */
const inGap = (A, rot, a, b, r) => { const run = (a.end + b.start) / 2, c = A.cross(r), cross = (c[0] + c[1]) / 2; return rot ? { x: cross, y: run } : { x: run, y: cross } }
/** The bar as server-rendered HTML (the stores' live state as their initial one). */
const renderBar = () => { for (const x of [useRowGroup, usePlacement, store]) Object.assign(x.getInitialState(), x.getState()); return renderToStaticMarkup(createElement(Bar.RowGroupBar)) }
const centreAcross = (o, rot) => { const f = rackFootprint(o); return rot ? f.x + f.w / 2 : f.y + f.h / 2 }

describe.each(['horizontal', 'vertical'])('PD — %s', (orientation) => {
  const rot = orientation === 'vertical'
  const A = ax(rot)
  const gen = layout(orientation)
  const secKeys = buildingSections(gen, 'r0').sections.map(s => s.key)
  const S = secKeys[2]
  const row = (k, sec = S) => rowIn(sec, k)[0]
  const others = secKeys.filter(k => k !== S)
  const man = manual(orientation)
  const runs = () => buildingSections(objs(), objs().find(o => BEAM.has(o.type)).id).sections

  it('PD-place: paste and duplicate follow the mouse until a click; Esc cancels; a blocked spot takes the click and does nothing; a cross-aisle is a warning and places (from SC-place)', async () => {
    load(gen)
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
    // a cross-aisle is a warning (orange outline), not a block: it is placed
    expect(usePlacement.getState().active.blocked).toBe(null)
    expect(usePlacement.getState().active.crossAisle).toBe(true)
    expect(usePlacement.getState().active.warnings).toContain(`In the cross-aisle between sections ${a0.key} and ${a1.key}`)
    const nPlace = objs().length
    expect(commitPlacement(store)).toBe(true)
    expect(objs().length).toBe(nPlace + 1)
    // placing never asks anything any more: no guard, no question
    expect(readFileSync('src/utils/placement.js', 'utf8')).toMatch(/export function commitPlacement\(store\) \{/)
  })

  it('PD-cross-aisle: a row dropped in a generated cross-aisle is placed with a warning (orange outline, message), not blocked; overlap and outside still block; a manual layout has no cross-aisle to warn about (from CF-cross-aisle)', async () => {
    load(gen)
    const secs = sectionsNow(), a0 = secs[0], a1 = secs[1]
    const r0 = rowIn(a0.key, K)[0]
    startPlacement(store, [oneBay(r0)])
    movePlacement(store, inGap(A, rot, a0, a1, r0), 1)
    const a = usePlacement.getState().active
    expect(a.blocked).toBe(null)
    expect(a.crossAisle).toBe(true)
    expect(a.warnings).toContain(`In the cross-aisle between sections ${a0.key} and ${a1.key}`)
    expect(renderBar()).toContain(`Check — In the cross-aisle between sections ${a0.key} and ${a1.key}`)
    expect(readFileSync('src/canvas2/CopyChange.jsx', 'utf8')).toMatch(/const color = a\.blocked \? BLOCKED : a\.crossAisle \? WARNED : PREVIEW/)
    const n = objs().length
    expect(commitPlacement(store)).toBe(true)
    expect(objs().length).toBe(n + 1)
    await flushRowGroupWatcher()
    // still hard: overlapping a rack, outside the building
    startPlacement(store, [oneBay(r0)])
    const on = rackFootprint(row(K + 3))
    movePlacement(store, { x: on.x + on.w / 2, y: on.y + on.h / 2 }, 1)
    expect(usePlacement.getState().active.blocked).toMatch(/^overlaps /)
    movePlacement(store, { x: -5000, y: -5000 }, 1)
    expect(usePlacement.getState().active.blocked).toBe('outside the building')
    expect(commitPlacement(store)).toBe(false)
    cancelPlacement()
    // manual: the gap between two runs is no cross-aisle
    load(man)
    const R = runs(), m0 = R[0].rows[0]
    startPlacement(store, [oneBay(m0)])
    movePlacement(store, inGap(A, rot, R[0], R[1], m0), 1)
    const b = usePlacement.getState().active
    expect([b.blocked, b.crossAisle]).toEqual([null, false])
    expect(b.warnings.filter(w => /cross-aisle/.test(w))).toEqual([])
    cancelPlacement()
  })

  it('PD-flue: a live-flue drag re-centres on the rack\'s depth at drag start — dragged straight across, a rack whose flue narrows (12" → 9") keeps its start along the run exactly and its centre moves exactly the drag; the automatic flue change is not a change; the Row group replays the exact net delta (from EX-flue)', async () => {
    load(gen)
    const r = strip(row(K))
    const wide = { ...r, flueSpaceIn: 12, flueBaseIn: 9, height: r.height + (3 / 12) * GS }
    wide.y = r.y - (3 / 12) * GS / 2                                           // same centre as r (turned: stored height is across)
    const f0 = rackFootprint(wide), d = 24 / 12 * GS   // 2': the aisles beside row K stay at the travel width or more (4' would leave 6.5' — skipped)
    const dx = rot ? d : 0, dy = rot ? 0 : d
    const at = flueDragPlacement({ x: wide.x, y: wide.y }, { w: wide.width, h: wide.height }, dx, dy, r.height)
    const moved = { ...wide, ...at, height: r.height, flueSpaceIn: 9 }
    const f1 = rackFootprint(moved)
    const along = (f) => (rot ? f.y : f.x), across = (f) => (rot ? f.x + f.w / 2 : f.y + f.h / 2)
    expect(along(f1)).toBeCloseTo(along(f0), 9)                                   // nothing along
    expect(across(f1) - across(f0)).toBeCloseTo(d, 9)                              // exactly the drag across
    // in the building: the widened row is the baseline, row K in every section grouped; the drag lands;
    // the Row group offers it and the others move exactly d
    load(gen.map(o => (o.id === r.id ? wide : o)))
    addRowOf(r.id, { otherSections: true })
    await act(() => { store.setState({ objects: objs().map(o => (o.id === r.id ? moved : o)) }); store.getState().commitObjectUpdate(r.id, {}) })
    // vertical: the 2' narrows row K's aisle (10' 6") under the pick width — applied, with that warning, as Check layout would say of a hand move;
    // horizontal: its aisles stay wide enough, no warning
    expect(useRowGroup.getState().pending.summary.text).toBe(`Apply to the other ${others.length} rows?${rot ? ` ${others.length} will have warnings.` : ''}`)
    for (const w of useRowGroup.getState().pending.summary.warned) expect(w.reasons).toEqual(['an aisle under the pick width'])
    const before = new Map(others.map(s => [s, centreAcross(row(K, s), rot)]))
    applyPending(); await flushRowGroupWatcher()
    for (const s of others) expect(centreAcross(row(K, s), rot) - before.get(s)).toBeCloseTo(d, 6)
    expect(readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')).toMatch(/flueDragPlacement\(d\.origin, d\.size, dx, dy, liveFlue\.targetHeight\)/)
  })

  it('PD-snap: every snap reaches the smaller of 12 px on screen or 1 ft — at 15 % a column face 1.5 ft away no longer catches a dragged rack; 0.8 ft away it does; at 100 % the reach is 12 px; placement the same (from EX-snap)', () => {
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
    const src = strip(row(K)), c1 = A.cross(row(K + 1))[1], cLen = A.cross(src)[1] - A.cross(src)[0]
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
  })
})
