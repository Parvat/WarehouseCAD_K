// Area IS — racks in one line (canvas2/inlineSnap.js).
//   1. In-line snap: a dragged rack's end within snap reach of another rack's end, in the same line and
//      orientation, goes end to end onto it SHARING the upright.
//   2. No overlap in a line: dropped overlapping a rack in its line, it settles at that rack's nearest
//      free end; with no free end the drag goes back.
//   3. On drop (option A): a single dragged rack sharing an end upright with one that matches it (type,
//      depth and flue, levels, upright, pallet, rotation, building, layer, racking area, row and section
//      stamps) is joined into it; otherwise it only snaps, two racks.
//   4. One undo step restores the state before the drag.
// Plus: the joined rack's column check is worked out again (it is cached per rack); a join offers nothing
// to the Row group (it is passed over, like a racking area's refit); a multi-selection settles by one
// shift; per-bay beam lengths join in order.
// The drag wiring (useCanvasInteraction.js) is read, as O-wire / P-wire do (Konva can't load under node);
// the calls it makes are the ones these tests make. Both orientations.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const IS = await import('../../canvas2/inlineSnap')
  const { rebuildAisles } = await import('../../utils/aisleRebuild')
  const RGT = await import('../../utils/rowGroupTool')
  const RG = await import('../../utils/rowGroup')
  const UC = await import('../../generate/usableCapacity')
  const CC = await import('../../generate/useColumnCheck.jsx')
  const { rackFootprint } = await import('../../generate/columnCheck')
  return { useCanvasStore, IS, rebuildAisles, RGT, RG, UC, CC, rackFootprint }
}

const UP = 3, BEAM = 96
const lenPx = (beams) => ((UP * (beams.length + 1) + beams.reduce((t, b) => t + b, 0)) / 12) * GS
const pitchPx = ((UP + BEAM) / 12) * GS, upPx = (UP / 12) * GS

describe.each(['horizontal', 'vertical'])('IS — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })
  /** A rack with its run starting at `r0` and its near side across at `s0` (world px), turned for the orientation. */
  const rack = (id, r0, s0, extra = {}) => {
    const type = extra.type || 'rack_row', beams = extra.beams || [BEAM, BEAM, BEAM]
    const width = lenPx(beams), height = type === 'rack_double_row' ? ((2 * 42 + 9) / 12) * GS : (42 / 12) * GS
    const rotation = extra.rotation ?? (vert ? 90 : 0)
    // turned 90° about its centre: the run along y, across along x
    const pos = (rotation % 180) ? { x: s0 + height / 2 - width / 2, y: r0 + width / 2 - height / 2 } : { x: r0, y: s0 }
    return { id, type, ...pos, width, height, rotation, beams, uprightWidth: UP, depthIn: 42, flueSpaceIn: type === 'rack_double_row' ? 9 : 0, levels: 4, palletWIn: 40, palletDIn: 48, layerId: 'racking', ...extra, ...(extra.beams ? {} : {}) }
  }
  const run = (o) => { const f = m.rackFootprint(o); return vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const across = (o) => { const f = m.rackFootprint(o); return vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
  /** (along, across) → (dx, dy) */
  const d = (dAlong, dAcross = 0) => (vert ? { dx: dAcross, dy: dAlong } : { dx: dAlong, dy: dAcross })
  const moved = (o, dd) => ({ ...o, x: o.x + dd.dx, y: o.y + dd.dy })
  const reach = Math.min(12, GS)                                    // 12 px on screen at zoom 1
  /** What the drag does: the in-line snap on the way, then the drop. */
  const dragDrop = (objects, ids, grabbedId, dd) => {
    const g = objects.find(o => o.id === grabbedId)
    const inl = m.IS.inlineSnap(moved(g, dd), objects.filter(o => !ids.includes(o.id)), GS, reach)
    const dx = dd.dx + (inl?.ddx || 0), dy = dd.dy + (inl?.ddy || 0)
    return m.IS.planInlineDrop(objects, ids, grabbedId, dx, dy, GS)
  }

  /* ── 1. In-line snap ── */
  it('IS-snap: a dragged rack whose start comes 0.3\' past another\'s end (and 0.2\' off across) snaps onto it — their ends share one upright, lined up across, a guide line on that upright; its far end onto another\'s start the same way', () => {
    const A = rack('A', 0, 0), B = rack('B', 2000, 0)
    const gap = 0.25 * GS, off = 0.2 * GS
    const dd = d(run(A)[1] + gap - run(B)[0], off)
    const inl = m.IS.inlineSnap(moved(B, dd), [A], GS, reach)
    expect(inl).toBeTruthy()
    const after = moved(moved(B, dd), { dx: inl.ddx, dy: inl.ddy })
    expect(run(after)[0]).toBeCloseTo(run(A)[1] - upPx, 6)               // B's first upright is A's last
    expect(across(after)[0]).toBeCloseTo(across(A)[0], 6)
    expect(inl.guide.axis).toBe(vert ? 'y' : 'x')
    expect(inl.guide.val).toBeCloseTo(run(A)[1] - upPx / 2, 6)
    // its far end onto A's start
    const dd2 = d(run(A)[0] - 0.25 * GS - run(B)[1])
    const inl2 = m.IS.inlineSnap(moved(B, dd2), [A], GS, reach)
    expect(run(moved(moved(B, dd2), { dx: inl2.ddx, dy: inl2.ddy }))[1]).toBeCloseTo(run(A)[0] + upPx, 6)
  })

  it('IS-snap-reach: no snap past the reach — the end 0.5\' off (over 12 px), lined up across 0.5\' off, or the other rack turned the other way', () => {
    const A = rack('A', 0, 0), B = rack('B', 2000, 0)
    expect(m.IS.inlineSnap(moved(B, d(run(A)[1] + 0.5 * GS - run(B)[0])), [A], GS, reach)).toBeNull()
    expect(m.IS.inlineSnap(moved(B, d(run(A)[1] - run(B)[0], 0.5 * GS)), [A], GS, reach)).toBeNull()
    const turned = rack('T', 0, 0, { rotation: vert ? 0 : 90 })
    expect(m.IS.inlineSnap(moved(B, d(run(A)[1] - run(B)[0])), [turned], GS, reach)).toBeNull()
  })

  /* ── 2. No overlap in a line ── */
  it('IS-settle: dropped overlapping a rack in its line, it settles at that rack\'s nearest free end, sharing the upright — nearer its far end, it goes there; nearer its start, there', () => {
    const A = rack('A', 0, 0, { beams: [BEAM, BEAM, BEAM, BEAM, BEAM, BEAM] }), B = rack('B', 3000, 0)
    const objects = [A, B]
    // B's start 1 bay before A's end: nearer A's far end
    let plan = m.IS.planInlineDrop(objects, ['B'], 'B', ...Object.values(d(run(A)[1] - pitchPx - run(B)[0])), GS)
    expect(run(moved(B, plan))[0]).toBeCloseTo(run(A)[1] - upPx, 6)
    // B's far end 1 bay past A's start: nearer A's start
    plan = m.IS.planInlineDrop(objects, ['B'], 'B', ...Object.values(d(run(A)[0] + pitchPx - run(B)[1])), GS)
    expect(run(moved(B, plan))[1]).toBeCloseTo(run(A)[0] + upPx, 6)
    // dropped clear of A: where it was dropped
    plan = m.IS.planInlineDrop(objects, ['B'], 'B', ...Object.values(d(-500)), GS)
    expect(plan.dx).toBe(d(-500).dx); expect(plan.dy).toBe(d(-500).dy)
  })

  it('IS-settle-none: a rack in a line always has a free end somewhere, so a single rack always settles; with a multi-selection whose other rack would land on a rack in its line (the grabbed one clear), there is no shift that frees both — the drag goes back', () => {
    // 3-bay racks are 1000 px long: A and D at 0, B and E dragged 4000 / 4500 px back
    const A = rack('A', 0, 0), B = rack('B', 5000, 0), D = rack('D', 0, 2000), E = rack('E', 4500, 2000)
    const dd = d(-4000)
    expect(m.IS.settleAlong(moved(B, dd), [A, D], GS).dAlong).toBe(0)          // B lands clear (end to end on A's last frame region)
    expect(m.IS.settleAlong(moved(E, dd), [A, D], GS).dAlong).not.toBe(0)      // E lands on D
    expect(m.IS.planInlineDrop([A, B, D, E], ['B', 'E'], 'B', dd.dx, dd.dy, GS)).toBeNull()
    // alone, E settles at D's nearest free end
    const alone = m.IS.planInlineDrop([A, D, E], ['E'], 'E', dd.dx, dd.dy, GS)
    expect(run(moved(E, alone))[0]).toBeCloseTo(run(D)[1] - upPx, 6)
  })

  /* ── 3. Join or snap only ── */
  it('IS-join: a matching rack snapped onto another\'s end joins into it — one rack with the stationary rack\'s id, its bays in order (per-bay lengths kept), as long as both less the shared upright; dragged in front of it, its bays first and it starts where the dragged one did', () => {
    const A = rack('A', 0, 0, { beams: [96, 96, 72] }), B = rack('B', 4000, 0, { beams: [96, 120] })
    // B onto A's far end
    let plan = dragDrop([A, B], ['B'], 'B', d(run(A)[1] + 0.2 * GS - run(B)[0]))
    expect(plan.join).toBeTruthy()
    expect(plan.join.keep).toBe('A'); expect(plan.join.drop).toBe('B')
    let j = plan.join.merged
    expect(j.id).toBe('A')
    expect(j.beams).toEqual([96, 96, 72, 96, 120])
    expect(run(j)[0]).toBeCloseTo(run(A)[0], 6)
    expect(run(j)[1] - run(j)[0]).toBeCloseTo(lenPx([96, 96, 72]) + lenPx([96, 120]) - upPx, 6)
    expect(across(j)).toEqual(across(A).map(v => expect.closeTo(v, 6)))
    // B in front of A: its bays first, starting where B starts
    plan = dragDrop([A, B], ['B'], 'B', d(run(A)[0] - 0.2 * GS - run(B)[1]))
    j = plan.join.merged
    expect(j.id).toBe('A')
    expect(j.beams).toEqual([96, 120, 96, 96, 72])
    expect(run(j)[1]).toBeCloseTo(run(A)[1], 6)
  })

  it.each([
    ['levels', { levels: 5 }], ['depth', { depthIn: 48 }], ['racking area', { areaId: 'a2' }], ['row stamp', { rowIndex: 7 }],
    ['section stamp', { genSection: 3 }], ['turned the other way round', { rotation: vert ? 270 : 180 }], ['a pair, not a single', { type: 'rack_double_row' }],
  ])('IS-snap-only (%s differs): snapped end to end on one upright, but two racks', (_, diff) => {
    const A = rack('A', 0, 0, { rowIndex: 4, genSection: 2 }), B = rack('B', 4000, 0, { rowIndex: 4, genSection: 2, ...diff })
    const plan = dragDrop([A, B], ['B'], 'B', d(run(A)[1] + 0.2 * GS - run(B)[0], (across(A)[0] + across(A)[1]) / 2 - (across(B)[0] + across(B)[1]) / 2))
    expect(plan.join).toBeNull()
    // still snapped: B starts on A's last upright
    expect(run(moved(B, plan))[0]).toBeCloseTo(run(A)[1] - upPx, 6)
  })

  /* ── 4. One undo step ── */
  it('IS-undo: a drop that settles, and a drop that joins, are each one history entry; one undo restores exactly the state before the drag', () => {
    const A = rack('A', 0, 0, { beams: [96, 96, 72] }), B = rack('B', 4000, 0, { beams: [96, 120] })
    s().addObject(A); s().addObject(B)
    const doc = () => JSON.parse(JSON.stringify(s().objects))
    // a settle: dropped overlapping A, moved as one
    let before = doc(), h0 = s().historyIndex
    let plan = m.IS.planInlineDrop(s().objects, ['B'], 'B', ...Object.values(d(run(A)[1] - pitchPx - run(B)[0])), GS)
    s().moveObjects(['B'], plan.dx, plan.dy)
    expect(s().historyIndex).toBe(h0 + 1)
    s().undo()
    expect(doc()).toEqual(before)
    // a join
    before = doc(); h0 = s().historyIndex
    plan = dragDrop(s().objects, ['B'], 'B', d(run(A)[1] + 0.2 * GS - run(B)[0]))
    m.IS.applyJoin(m.useCanvasStore, plan.join, { rebuildAisles: m.rebuildAisles, skipNextAction: m.RGT.skipNextAction, newId: () => 'n' + Math.random() })
    expect(s().historyIndex).toBe(h0 + 1)
    expect(s().objects.filter(o => o.type === 'rack_row').map(o => o.id)).toEqual(['A'])
    expect(s().selectedIds).toEqual(['A'])
    s().undo()
    expect(doc()).toEqual(before)
  })

  /* ── multi-selection ── */
  it('IS-multi: a multi-selection snaps by its grabbed rack and settles as one — the others move by the same shift', () => {
    const A = rack('A', 0, 0, { beams: [BEAM, BEAM, BEAM, BEAM, BEAM, BEAM] }), B = rack('B', 3000, 0), C = rack('C', 3000, 600)
    const dd = d(run(A)[1] - pitchPx - run(B)[0])
    const plan = m.IS.planInlineDrop([A, B, C], ['B', 'C'], 'B', dd.dx, dd.dy, GS)
    expect(plan.join).toBeNull()                                       // never a join with more than one rack moving
    expect(run(moved(B, plan))[0]).toBeCloseTo(run(A)[1] - upPx, 6)
    expect(run(moved(C, plan))[0] - run(moved(B, plan))[0]).toBeCloseTo(run(C)[0] - run(B)[0], 6)
  })

  /* ── the column check after a join ── */
  it('IS-column: after a join the joined rack\'s column check is worked out again — the column under the part that was the dragged rack is now a conflict on the joined rack, and the per-rack geometry cache sees a changed rack', async () => {
    const A = rack('A', 0, 0, { beams: [96, 96, 96] }), B = rack('B', 4000, 0, { beams: [96, 96] })
    const plan = dragDrop([A, B], ['B'], 'B', d(run(A)[1] + 0.2 * GS - run(B)[0]))
    const Bsnapped = moved(B, plan), j = plan.join.merged
    // a 12" column in the middle of B's first bay (as snapped), mid-depth of the single
    const at = (run(Bsnapped)[0] + upPx + (48 / 12) * GS), mid = (across(A)[0] + across(A)[1]) / 2
    const cg = { id: 'cg', type: 'column_grid', x: vert ? mid : at, y: vert ? at : mid, spacingX: [], spacingY: [], columnW: GS, columnH: GS, colSizeIn: 12 }
    const beforeJoin = m.UC.runColumnCheck([A, Bsnapped, cg], { gridSize: GS })
    expect(beforeJoin.rackConflicts.map(c => c.rackId)).toEqual(['B'])
    const afterJoin = m.UC.runColumnCheck([j, cg], { gridSize: GS })
    expect(afterJoin.rackConflicts.map(c => c.rackId)).toEqual(['A'])
    expect(afterJoin.summary.positionsLostIfAbsorb).toBe(beforeJoin.summary.positionsLostIfAbsorb)
    // the cache keyed on each rack's geometry: the joined rack is a changed rack, so the check reruns
    expect(m.CC.rackGeometryKey(j)).not.toBe(m.CC.rackGeometryKey(A))
    expect(m.CC.sameRacks([A, B], [j])).toBe(false)
  })
})

/* ── the Row group: a join is not a bay edit ── */
describe('IS — the Row group', () => {
  it('IS-copy: re-joining a generated rack split by a middle-bay delete offers nothing to its Row group (a bay edit does)', async () => {
    const m = await fresh(), s = () => m.useCanvasStore.getState()
    const { sizingSheetLayout } = await import('../../generate/sizingLayout')
    const { placementToObject } = await import('../../generate/traceGenerate')
    const { DEFAULT_RULES } = await import('../../rules/defaults')
    const { installAisleKeeper } = await import('../../utils/aisleKeeper')
    const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
    let seq = 0; const newId = () => 'q' + (++seq)
    const stops = [installAisleKeeper(m.useCanvasStore, newId), installRowEditKeeper(m.useCanvasStore), m.RGT.installRowGroupWatcher(m.useCanvasStore, newId)]
    try {
      const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 0, gridYFt: 0, mhe: 'reach', orientation: 'horizontal', rackType: 'rack_double_row' }
      const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
      const L = 1080 * GS, W = 410 * GS
      const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L, height: W, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }] }
      const objects = m.rebuildAisles([fp, ...racks], newId).objects
      m.useCanvasStore.setState({ objects, groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
      // a long rack in a section, its section's rows in a Row group: its 3rd bay deleted (a bay edit) — offered; Skip
      const r = s().objects.find(o => o.type === 'rack_double_row' && o.beams.length >= 8 && o.genSection === 2)
      m.RGT.useRowGroup.setState({ keys: [...m.RG.rowsOf(s().objects, GS).keys()].filter(k => k.split('|')[2] === String(r.genSection)) })
      m.useCanvasStore.setState({ activeBaySelection: [{ objId: r.id, bayIdx: 2 }] })
      s().deleteSelectedBays()
      await m.RGT.flushRowGroupWatcher()
      expect(m.RGT.useRowGroup.getState().pending, 'a bay edit is offered to the group').toBeTruthy()
      m.RGT.dismissPending()
      await m.RGT.flushRowGroupWatcher()
      expect(m.RGT.useRowGroup.getState().pending).toBe(null)
      // the two pieces (same row, same section): the far one dragged back onto the near one's end — joined
      const pieces = s().objects.filter(o => o.type === 'rack_double_row' && o.rowIndex === r.rowIndex && o.genSection === r.genSection).sort((a, b) => a.x - b.x)
      expect(pieces.length).toBe(2)
      const [p1, p2] = pieces
      const dx = (p1.x + p1.width - upPx) - p2.x + 0.1 * GS
      const inl = m.IS.inlineSnap({ ...p2, x: p2.x + dx }, s().objects.filter(o => o.id !== p2.id), GS, 12)
      const plan = m.IS.planInlineDrop(s().objects, [p2.id], p2.id, dx + inl.ddx, inl.ddy, GS)
      expect(plan.join, 'the pieces join').toBeTruthy()
      m.IS.applyJoin(m.useCanvasStore, plan.join, { rebuildAisles: m.rebuildAisles, skipNextAction: m.RGT.skipNextAction, newId })
      await m.RGT.flushRowGroupWatcher()
      // a join is passed over by the Row group (skipNextAction): nothing offered, nothing said
      expect(m.RGT.useRowGroup.getState().pending, 'a join offers nothing to the group').toBe(null)
      expect(m.RGT.useRowGroup.getState().message).toBe(null)
      const joined = s().objects.find(o => o.id === plan.join.keep)
      expect(joined.beams.length).toBe(r.beams.length - 1)
    } finally { stops.forEach(f => f()) }
  })
})

/* ── the drag wiring ── */
describe('IS — wiring', () => {
  const inter = readFileSync(new URL('../../canvas2/useCanvasInteraction.js', import.meta.url), 'utf8')
  it('IS-wire: the drag snaps in line on both drag paths (plain and live flue), and the drop goes through planInlineDrop — a join written by applyJoin, a settle by moveObjects, no free end back where it was', () => {
    expect((inter.match(/inlineSnap\(/g) || []).length).toBe(2)
    expect((inter.match(/planInlineDrop\(/g) || []).length).toBe(2)
    expect((inter.match(/applyJoin\(/g) || []).length).toBe(2)
    expect(inter).toMatch(/st\.moveObjects\(d\.ids, plan\.dx, plan\.dy\)/)
    expect(inter).toMatch(/grabbedId: hitId/)
    // the join is passed over by the Row group: its skipNextAction, from utils/rowGroupTool.js
    expect(inter).toMatch(/import \{ groupDragFor, skipNextAction \} from '\.\.\/utils\/rowGroupTool'/)
    expect(inter).not.toMatch(/copyPrompt/)
  })
})
