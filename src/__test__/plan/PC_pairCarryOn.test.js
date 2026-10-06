// Area PC — a pair taking over its carried-on single's bay (utils/pairCarryOn.js).
// A back-to-back pair whose half carries on as a single (section 2, rows 12 and 14 of the hand-check
// layout as saved: the pair 9' → 108.25', its single from the pair's end upright to 124.75' on one half).
// When the pair grows a bay at that end — by hand, or through a Row group apply — the pair takes that bay
// over from the single: pair +1 bay, single −1 bay from that end (removed when it had one), no overlap,
// bay counts and pallet positions right. Only when the single's bay lines up (uprights within ½", the same
// beam) and the single has the same levels and depth; otherwise the overlap and its warning stay.
// Deleting the pair's end bay is not mirrored. One undo step. Vertical as saved; horizontal = turned 90°.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { getRackCapacity } from '../../utils/capacity'
import { checkLayout } from '../../utils/layoutCheck'
import * as RG from '../../utils/rowGroup'
import { takeOverCarriedBays, installPairKeeper } from '../../utils/pairCarryOn'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup, applyPending } from '../../utils/rowGroupTool'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

let store, Panel, stops = [], seq = 0
const newId = () => 'p' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  // as App.jsx: the pair keeper before the Row group's watcher
  stops = [installPairKeeper(store), installRowGroupWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { clearGroup(); useRowGroup.getState().setAlwaysApply(false) })

const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
/** The layout as saved (vertical); for horizontal rows, the result turned 90° (racks turned with it). */
function savedFill(vert) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })), area = objs.find(o => o.type === 'racking_area')
  const out = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
  if (vert) return out
  return out.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const ft = (px) => Math.round((px / GS) * 1000) / 1000
const rowRacks = (ri, type) => objs().filter(o => o.genSection === 2 && o.rowIndex === ri && (!type || o.type === type))
const pairOf = (ri) => rowRacks(ri, 'rack_double_row')[0]
const singleOf = (ri) => rowRacks(ri, 'rack_row')[0]
const run = (o) => { const g = RG.geom(o); return [ft(g.r0), ft(g.r1)] }
const bays = (ri) => rowRacks(ri).reduce((t, o) => t + o.beams.length, 0)
const positions = (ri) => rowRacks(ri).reduce((t, o) => t + getRackCapacity(o).total, 0)
const overlapsIn = (ri) => { const ids = new Set(rowRacks(ri).map(o => o.id)); return checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.every(id => ids.has(id))) }
const addBay = (o, beam = 96) => store.getState().commitObjectUpdate(o.id, Panel.addBayUpdate(o, beam, GS))
const add2 = (o) => store.getState().commitObjectUpdate(o.id, Panel.addBayUpdate({ ...o, ...Panel.addBayUpdate(o, 96, GS) }, 96, GS))
/** One single-sided 96" bay at 4 levels: what the pair's far half adds. */
const oneHalfBay = () => getRackCapacity({ type: 'rack_row', beams: [96], levels: pairOf(12).levels, palletWIn: pairOf(12).palletWIn }).total

describe.each([['vertical', true], ['horizontal', false]])('PC — %s', (_, vert) => {
  it('PC-take: "+ bay" on row 12\'s pair (by hand) → the pair runs 9\' → 116.5\' with 13 bays, its single 116.25\' → 124.75\' with 1: no overlap; 14 bays as before, pallet positions up by one half-bay (the far half), none counted twice; one history entry, one undo restores both', async () => {
    load(savedFill(vert))
    const p0 = strip(pairOf(12)), s0 = strip(singleOf(12)), b0 = bays(12), pos0 = positions(12), h = hist()
    expect([run(p0), run(s0), p0.beams.length, s0.beams.length]).toEqual([[9, 108.25], [108, 124.75], 12, 2])
    addBay(pairOf(12)); await settle()
    expect(hist()).toBe(h + 1)
    expect([run(pairOf(12)), pairOf(12).beams.length]).toEqual([[9, 116.5], 13])
    expect([run(singleOf(12)), singleOf(12).beams.length, singleOf(12).id]).toEqual([[116.25, 124.75], 1, s0.id])
    expect(overlapsIn(12)).toEqual([])
    expect(bays(12)).toBe(b0)
    expect(positions(12)).toBe(pos0 + oneHalfBay())
    store.getState().undo()
    expect([get(p0.id), get(s0.id)]).toEqual([p0, s0])
  })

  it('PC-remove: two bays added to the pair → both taken from the single, which had two: the single is removed; one undo brings it back', async () => {
    load(savedFill(vert))
    const s0 = strip(singleOf(12))
    add2(pairOf(12)); await settle()
    expect([run(pairOf(12)), pairOf(12).beams.length]).toEqual([[9, 124.75], 14])
    expect(singleOf(12)).toBe(undefined)
    expect(overlapsIn(12)).toEqual([])
    store.getState().undo()
    expect(get(s0.id)).toEqual(s0)
  })

  it('PC-no-match: the single\'s first bay a 108" beam, or other levels, or another depth → nothing taken over: the overlap (and Check layout\'s error) stays', async () => {
    for (const [what, patch] of [['108" first bay', (o) => ({ ...o, ...Panel.changeBayUpdate(o, 0, 108, GS) })], ['5 levels', (o) => ({ ...o, levels: 5 })], ['48" depth', (o) => ({ ...o, depthIn: 48 })]]) {
      const objects = savedFill(vert).map(o => (o.genSection === 2 && o.rowIndex === 12 && o.type === 'rack_row' ? patch(o) : o))
      load(objects)
      const s0 = strip(singleOf(12))
      addBay(pairOf(12)); await settle()
      expect(pairOf(12).beams.length, what).toBe(13)
      expect(singleOf(12), what).toEqual(s0)
      expect(overlapsIn(12).length, what).toBe(1)
    }
  })

  it('PC-reverse: deleting the pair\'s end bay next to its single is not mirrored — both halves go, the single stays where it was, a one-bay gap left', async () => {
    load(savedFill(vert))
    const s0 = strip(singleOf(12))
    store.getState().deleteSingleBay(pairOf(12).id, 11); await settle()
    expect([run(pairOf(12)), pairOf(12).beams.length]).toEqual([[9, 100], 11])
    expect(singleOf(12)).toEqual(s0)
  })

  it('PC-group: rows 12-14 in a Row group (row 13 a plain pair, the custom area beyond it; row 14\'s single on the other half) — "+ bay" on row 12 → "Apply to the other 2 rows? 1 will have warnings." — only row 13, "inside a zone"; row 14 none, its pair takes over its single\'s bay; no overlap anywhere; Auto apply: the edit, its takeover, the apply and row 14\'s takeover are one history entry', async () => {
    for (const auto of [false, true]) {
      load(savedFill(vert))
      useRowGroup.setState({ keys: [12, 13, 14].map(i => [...RG.rowsOf(objs(), GS).keys()].find(k => k.endsWith(`|2|${i}`))) })
      useRowGroup.getState().setAlwaysApply(auto)
      const b14 = bays(14), s14 = strip(singleOf(14)), before = strip(objs()).filter(o => BEAM.has(o.type)), h = hist()
      addBay(pairOf(12)); await settle()
      if (!auto) {
        expect(useRowGroup.getState().pending.summary.text).toBe('Apply to the other 2 rows? 1 will have warnings.')
        expect(useRowGroup.getState().pending.summary.warned).toEqual([{ key: [...RG.rowsOf(objs(), GS).keys()].find(k => k.endsWith('|2|13')), reasons: ['inside a zone'] }])
        applyPending(); await settle()
        expect(hist()).toBe(h + 2)
      } else {
        expect(useRowGroup.getState().pending).toBe(null)
        expect(useRowGroup.getState().message).toBe('Applied to 2 rows · 1 with warnings — see Check layout')
        expect(hist()).toBe(h + 1)
      }
      expect([pairOf(14).beams.length, singleOf(14).beams.length, singleOf(14).id]).toEqual([13, 1, s14.id])
      expect(bays(14)).toBe(b14)
      expect(pairOf(13).beams.length).toBe(13)
      for (const ri of [12, 13, 14]) expect(overlapsIn(ri)).toEqual([])
      store.getState().undo(); if (!auto) store.getState().undo()
      expect(objs().filter(o => BEAM.has(o.type))).toEqual(before)
      useRowGroup.getState().setAlwaysApply(false)
      clearGroup()
    }
  })

  it('PC-group-target: the source has no single — row 13 (a plain pair) given a bay, rows 12 and 14 in its group: the apply grows their pairs into their singles, and the Row group takes those bays over as it writes — no overlap warning on the bar (judged on the layout as written), no overlap after, the singles one bay shorter; in Auto apply too (written into the edit\'s own entry, where the keeper doesn\'t look)', async () => {
    for (const auto of [false, true]) {
      load(savedFill(vert))
      useRowGroup.setState({ keys: [12, 13, 14].map(i => [...RG.rowsOf(objs(), GS).keys()].find(k => k.endsWith(`|2|${i}`))) })
      useRowGroup.getState().setAlwaysApply(auto)
      const s12 = strip(singleOf(12)), s14 = strip(singleOf(14)), h = hist()
      addBay(pairOf(13)); await settle()
      if (!auto) {
        const p = useRowGroup.getState().pending
        expect(p.summary.apply).toBe(2)
        for (const w of p.summary.warned) expect(w.reasons).not.toContain('an overlap')
        applyPending(); await settle()
      } else {
        expect(hist()).toBe(h + 1)
        // the free halves grow into the custom area ("inside a zone") — never "an overlap" with their own singles
        for (const w of useRowGroup.getState().report.warned) expect(w.reasons).not.toContain('an overlap')
      }
      for (const [ri, s0] of [[12, s12], [14, s14]]) {
        expect(pairOf(ri).beams.length).toBe(13)
        expect([singleOf(ri).id, singleOf(ri).beams.length]).toEqual([s0.id, 1])
        expect(overlapsIn(ri)).toEqual([])
      }
      useRowGroup.getState().setAlwaysApply(false)
      clearGroup()
    }
  })

  it('PC-low: a pair whose single carries on BEFORE its start (by hand) — a bay added at that end is taken over the same way', () => {
    const up = (3 / 12) * GS, pitch = (99 / 12) * GS, dep = (93 / 12) * GS, half = (42 / 12) * GS
    const len = (n) => n * pitch + up
    const mk = (id, type, r0, n, s0, h) => vert
      ? { id, type, x: s0 + h / 2 - len(n) / 2, y: r0 + len(n) / 2 - h / 2, width: len(n), height: h, rotation: 90, beams: Array(n).fill(96), uprightWidth: 3, levels: 4, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, parentId: 'fp' }
      : { id, type, x: r0, y: s0, width: len(n), height: h, rotation: 0, beams: Array(n).fill(96), uprightWidth: 3, levels: 4, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, parentId: 'fp' }
    const r0 = 40 * GS
    const before = [mk('P', 'rack_double_row', r0, 5, 10 * GS, dep), mk('S', 'rack_row', r0 - 2 * pitch, 2, 10 * GS + dep - half, half)]
    // the pair grown by one bay at its start (anchored at its end)
    const P = before[0], g = RG.geom(P)
    const grown = RG.withRun(P, g.r0 - pitch, [96, ...g.beams], GS)
    const { objects, taken } = takeOverCarriedBays(before, [grown, before[1]], GS)
    expect(taken).toEqual([{ pair: 'P', single: 'S', bays: 1, removed: false }])
    const s = objects.find(o => o.id === 'S'), gs = RG.geom(s)
    expect([s.beams.length, ft(gs.r1)]).toEqual([1, ft(r0 - pitch + up)])
  })

  it('PC-wire: App installs the pair keeper before the Row group\'s watcher; a Row group apply writes the takeover, and judges warnings on it', () => {
    const app = readFileSync('src/App.jsx', 'utf8')
    expect(app.indexOf('installPairKeeper(useCanvasStore)')).toBeGreaterThan(0)
    expect(app.indexOf('installPairKeeper(useCanvasStore)')).toBeLessThan(app.indexOf('installRowGroupWatcher(useCanvasStore'))
    const tool = readFileSync('src/utils/rowGroupTool.js', 'utf8')
    expect(tool).toMatch(/const written = \(objects, plan\) => rebuildAisles\(takeOverCarriedBays\(objects, applyReplay\(objects, plan\), gs\(\)\)\.objects, watch\.newId\)\.objects/)
    expect(tool).toMatch(/finalize: \(a, w\) => takeOverCarriedBays\(a, w, gridSize\)\.objects/)
    void rebuildAisles
  })
})
