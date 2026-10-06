// Area SB — "Separate bays" (utils/separateBays.js, the rack panel): one bay, or a run of adjacent bays of
// one rack, becomes its own rack in place — the reverse of the in-line snap's join. The rest stays one rack
// on each side (up to three racks); nothing moves, no bay is lost, each cut upright is shared (sharesFrame),
// so the drawing, Check layout and the bay ledger's counts are unchanged. One undo step. Disabled for the
// whole rack, bays in more than one rack, or bays that aren't adjacent. The stamps carry to every piece; the
// Row group offers nothing; a piece dragged straight back rejoins (in-line snap). The layout as saved,
// vertical and turned; single and back-to-back racks; a reversed rack by hand.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { sharesFrame } from '../../utils/bayBeam'
import { checkLayout } from '../../utils/layoutCheck'
import { bayLedger } from '../../utils/bayLedger'
import { getLayoutCapacity } from '../../utils/capacity'
import { rebuildAisles } from '../../utils/aisleRebuild'
import * as RG from '../../utils/rowGroup'
import { separationOf, separateBays, separateSelectedBays } from '../../utils/separateBays'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { installRowEditKeeper } from '../../utils/rowEditKeeper'
import { installPairKeeper } from '../../utils/pairCarryOn'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup } from '../../utils/rowGroupTool'
import { planInlineDrop, applyJoin } from '../../canvas2/inlineSnap'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

let store, Panel, stops = [], seq = 0
const newId = () => 's' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  // as App.jsx
  stops = [installAisleKeeper(store, newId), installRowEditKeeper(store), installPairKeeper(store), installRowGroupWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => clearGroup())

const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
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
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const rowRacks = (sec, ri) => objs().filter(o => BEAM.has(o.type) && o.genSection === sec && o.rowIndex === ri).sort((a, b) => RG.geom(a).r0 - RG.geom(b).r0)
const upsOf = (o) => { const g = RG.geom(o); return RG.uprightsOf(g.r0, g.beams, ((o.uprightWidth || 3) / 12) * GS, GS) }
const allUps = (racks) => [...new Set(racks.flatMap(upsOf).map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
const totals = () => { const L = bayLedger(objs(), GS); return { bays: L.bays, positions: getLayoutCapacity(objs(), undefined, L).total, uncounted: L.uncountedBays } }
const overlapsIn = (racks) => { const ids = new Set(racks.map(o => o.id)); return checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.every(id => ids.has(id))) }
/** Click a bay (the rack selected, its activeBayIdx), or Shift+click several (activeBaySelection). */
const pickBay = (o, i) => { store.setState({ selectedIds: [o.id], activeBaySelection: [] }); store.getState().updateObject(o.id, { activeBayIdx: i }) }
const pickBays = (o, idx) => store.setState({ selectedIds: [o.id], activeBaySelection: idx.map(bayIdx => ({ objId: o.id, bayIdx })) })
const separate = async () => { const id = separateSelectedBays(store, { newId, rebuildAisles }); await settle(); return id }

/** The checks every separation must pass: same uprights, shared cut frames, no overlap, the same counts. */
const unchanged = (before, after, t0) => {
  expect(allUps(after)).toEqual(allUps(before))
  const g0 = before.map(RG.geom), g1 = after.map(RG.geom)
  expect([Math.min(...g1.map(g => g.r0)), Math.max(...g1.map(g => g.r1))]).toEqual([Math.min(...g0.map(g => g.r0)), Math.max(...g0.map(g => g.r1))])
  for (let k = 0; k + 1 < after.length; k++) if (Math.abs(RG.geom(after[k + 1]).r0 - (RG.geom(after[k]).r1 - ((after[k].uprightWidth || 3) / 12) * GS)) < 1e-6) expect(sharesFrame(after[k], after[k + 1], GS)).toBe(true)
  expect(after.reduce((t, o) => t + o.beams.length, 0)).toBe(before.reduce((t, o) => t + o.beams.length, 0))
  expect(overlapsIn(after)).toEqual([])
  expect(totals()).toEqual(t0)
}

describe.each([['vertical', true], ['horizontal', false]])('SB — %s', (_, vert) => {
  it('SB-middle: bay 6 of row 7\'s pair (section 2, 14 bays) clicked, Separate → three racks, 5 + 1 + 8 bays, in place: the same uprights, the cut uprights shared, no overlap, the bay ledger\'s bays and positions unchanged; the stamps on every piece, pieceOf on the new ones; the separated rack selected; one history entry, one undo restores the rack', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], before = rowRacks(2, 7).map(strip), t0 = totals(), h = hist()
    pickBay(r, 5)
    const sid = await separate()
    const after = rowRacks(2, 7)
    expect(after.map(o => o.beams.length)).toEqual([5, 1, 8])
    unchanged(before, after, t0)
    expect(after.every(o => o.rowIndex === 7 && o.genSection === 2 && o.parentId === r.parentId && o.type === r.type && o.levels === r.levels)).toBe(true)
    expect(after.filter(o => o.id !== r.id).every(o => o.pieceOf === r.id)).toBe(true)
    expect(after[0].id).toBe(r.id)
    expect(store.getState().selectedIds).toEqual([sid])
    expect(objs().find(o => o.id === sid).beams.length).toBe(1)
    expect(hist()).toBe(h + 1)
    store.getState().undo()
    expect(rowRacks(2, 7).map(strip)).toEqual(before)
  })

  it('SB-run: bays 1-3 of the pair Shift+clicked → two racks, 3 + 11; a single rack (the wall row) → its first two bays apart, the rest one rack', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], before = rowRacks(2, 7).map(strip), t0 = totals()
    pickBays(r, [0, 1, 2])
    await separate()
    expect(rowRacks(2, 7).map(o => o.beams.length).sort((a, b) => a - b)).toEqual([3, 11])
    unchanged(before, rowRacks(2, 7), t0)
    const w = objs().find(o => o.type === 'rack_row' && o.genSection === 1 && o.beams.length >= 10)
    const wb = [strip(w)], t1 = totals(), n = w.beams.length
    pickBays(w, [0, 1])
    await separate()
    const pieces = objs().filter(o => o.id === w.id || o.pieceOf === w.id)
    expect(pieces.map(o => o.beams.length).sort((a, b) => a - b)).toEqual([2, n - 2])
    unchanged(wb, pieces.sort((a, b) => RG.geom(a).r0 - RG.geom(b).r0), t1)
  })

  it('SB-reversed: a rack drawn reversed (180° / 270°): its stored bay 0 sits at the far end of its run — separating it cuts there, nothing moves', async () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0]
    const rev = { ...r, id: 'rev', rotation: (r.rotation || 0) + 180, beams: [...r.beams].reverse(), x: r.x, y: r.y }
    // row 7's pair replaced by the same rack drawn reversed (same footprint, bays counted from the other end)
    const objects = [...objs().filter(o => o.id !== r.id), rev]
    load(objects)
    const before = [strip(rev)], t0 = totals()
    pickBay(objs().find(o => o.id === 'rev'), 0)
    const sid = await separate()
    const pieces = objs().filter(o => o.id === 'rev' || o.pieceOf === 'rev').sort((a, b) => RG.geom(a).r0 - RG.geom(b).r0)
    expect(pieces.map(o => o.beams.length)).toEqual([13, 1])                      // the separated bay is the last along the run
    expect(pieces[1].id).toBe(sid)
    unchanged(before, pieces, t0)
  })

  it('SB-disabled: the whole rack, bays that aren\'t next to each other, or bays in two racks → not offered: the button disabled with the reason as its tooltip; a valid selection enables it', () => {
    load(savedFill(vert))
    const r = rowRacks(2, 7)[0], q = rowRacks(2, 8)[0]
    const ent = (o, idx) => idx.map(bayIdx => ({ objId: o.id, bayIdx }))
    expect(separationOf(objs(), ent(r, r.beams.map((_, i) => i)))).toMatchObject({ ok: false, reason: 'that is the whole rack' })
    expect(separationOf(objs(), ent(r, [1, 3]))).toMatchObject({ ok: false, reason: 'the bays aren\'t next to each other' })
    expect(separationOf(objs(), [...ent(r, [1]), ...ent(q, [1])])).toMatchObject({ ok: false, reason: 'bays in more than one rack' })
    expect(separationOf(objs(), ent(r, [4, 5, 6]))).toMatchObject({ ok: true, from: 4, to: 6 })
    const render = (sel) => { store.setState({ activeBaySelection: sel, selectedIds: [...new Set(sel.map(e => e.objId))] }); Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(createElement(Panel.MultiBayPanel)) }
    let html = render(ent(r, [1, 3]))
    expect(html).toMatch(/<button aria-label="Separate 2 bays" disabled="" title="Can&#x27;t separate: the bays aren&#x27;t next to each other"/)
    html = render(ent(r, [2, 3]))
    expect(html).toMatch(/<button aria-label="Separate 2 bays" title="Make the selected bays their own rack/)
    // a single clicked bay: the rack panel's bay box has the button too
    store.setState({ activeBaySelection: [], selectedIds: [r.id] }); store.getState().updateObject(r.id, { activeBayIdx: 3 })
    Object.assign(store.getInitialState(), store.getState())
    expect(renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: objs().find(o => o.id === r.id) }))).toMatch(/<button aria-label="Separate bay" title="Make the selected bays/)
  })

  it('SB-group: row 7 in a Row group — a separation is no change to the group: nothing offered, nothing said', async () => {
    load(savedFill(vert))
    const keys = [...RG.rowsOf(objs(), GS).keys()].filter(k => k.endsWith('|7'))   // row 7 of every section (two, as saved)
    expect(keys.length).toBeGreaterThanOrEqual(2)
    useRowGroup.setState({ keys })
    pickBay(rowRacks(2, 7)[0], 5)
    await separate()
    expect(useRowGroup.getState()).toMatchObject({ pending: null, message: null })
    expect(useRowGroup.getState().keys).toEqual(keys)
  })

  it('SB-rejoin: the separated rack dragged away and straight back joins again through the in-line snap — one rack fewer, the same bays', async () => {
    load(savedFill(vert))
    pickBay(rowRacks(2, 7)[0], 5)
    const sid = await separate()
    const n0 = rowRacks(2, 7).length, bays0 = rowRacks(2, 7).reduce((t, o) => t + o.beams.length, 0)
    // away 20 ft across, then dropped back where it was
    const d = 20 * GS
    store.getState().moveObjects([sid], vert ? d : 0, vert ? 0 : d); await settle()
    const plan = planInlineDrop(objs(), [sid], sid, vert ? -d : 0, vert ? 0 : -d, GS)
    expect(plan && plan.join).toBeTruthy()
    applyJoin(store, plan.join, { rebuildAisles, newId })
    await settle()
    expect(rowRacks(2, 7).length).toBe(n0 - 1)
    expect(rowRacks(2, 7).reduce((t, o) => t + o.beams.length, 0)).toBe(bays0)
  })
})

describe('SB-wire', () => {
  it('SB-wire: one button for both bay boxes (the multi-bay panel and the rack panel\'s clicked bay), written as one store write and one commit, the aisles re-paired', () => {
    const panel = readFileSync('src/components/RightPanel/panels/RackRowPanelCore.jsx', 'utf8')
    expect((panel.match(/<SeparateBaysButton /g) || []).length).toBe(2)
    const sep = readFileSync('src/utils/separateBays.js', 'utf8')
    expect(sep).toMatch(/store\.setState\(\{ objects, selectedIds: \[separated\], activeBaySelection: \[\] \}\)\n\s+store\.getState\(\)\.commitObjectUpdate\(separated, \{\}\)/)
    expect(sep).toMatch(/if \(rebuildAisles\) objects = rebuildAisles\(objects, newId\)\.objects/)
    void separateBays
  })
})
