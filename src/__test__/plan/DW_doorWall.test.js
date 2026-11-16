// Area DW — a door on its wall (doors-edit round; utils/doorWall.js): its wall, its gaps, a gap typed, its number.
import { describe, it, expect } from 'vitest'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes } from '../../utils/doorTool'
import { doorWall, spanOf, wallGaps, neighbourGaps, gapEdit, doorNumbers, doorPlaced, widthEdit, chainStops } from '../../utils/doorWall'
import { doorTags, doorChain, rangeText } from '../../render/doorAnnot'
import { dimChain } from '../../render/dimChain'

const GS = 40, ft = (v) => v * GS
let n = 0
const newId = () => 'dw' + (++n)
const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: ft(200), height: ft(100), wallThicknessFt: 0.25 }
const inner = innerOutline(fp, GS), X0 = Math.min(...inner.map(p => p.x)), Y0 = Math.min(...inner.map(p => p.y)), X1 = Math.max(...inner.map(p => p.x)), Y1 = Math.max(...inner.map(p => p.y))
const T = doorTypes()
/** a door of `id` placed at world point `w` (on a wall's inner face), as the door tool does */
const put = (objs, id, w) => { const spec = T.find(t => t.id === id), at = doorAt(objs, w, spec, GS, 0); return [...objs, { ...doorObject(at, spec, newId), parentId: 'fp' }] }

describe('DW — doors on their walls', () => {
  // top: docks (9 ft) from 20 ft and 50 ft, a man door (3 ft) from 80 ft; right: dock; bottom: man; left: dock
  let objs = [fp]
  objs = put(objs, 'struct_loading_dock', { x: X0 + ft(24.5), y: Y0 })
  objs = put(objs, 'struct_loading_dock', { x: X0 + ft(54.5), y: Y0 })
  objs = put(objs, 'struct_egress', { x: X0 + ft(81.5), y: Y0 })
  objs = put(objs, 'struct_loading_dock', { x: X1, y: Y0 + ft(40) })
  objs = put(objs, 'struct_egress', { x: X0 + ft(100), y: Y1 })
  objs = put(objs, 'struct_loading_dock', { x: X0, y: Y0 + ft(60) })
  const doors = objs.filter(o => /^struct_/.test(o.type))
  it('DW-wall: each door finds its wall — the axis along it, its ends, the floor side', () => {
    const w = doors.map(d => doorWall(d, objs, GS))
    expect(w.map(q => [q.kind, q.axis, q.inward])).toEqual([['fp', 'x', 1], ['fp', 'x', 1], ['fp', 'x', 1], ['fp', 'y', -1], ['fp', 'x', -1], ['fp', 'y', 1]])
    expect([w[0].lo, w[0].hi]).toEqual([X0, X1])
  })
  it('DW-gaps: from the left corner to the first door, then door to door; a door\'s neighbours', () => {
    const w = doorWall(doors[0], objs, GS)
    expect(wallGaps(objs, w, { gs: GS }).map(g => Math.round((g.hi - g.lo) / GS * 12) / 12)).toEqual([20, 21, 21])
    expect(Object.values(neighbourGaps(doors[1], objs, GS)).filter(v => typeof v === 'number').map(v => Math.round(v / GS * 12) / 12)).toEqual([21, 21])
  })
  it('DW-gap-typed: a gap typed moves the door after it and every door beyond together; past the corner or overlapping — refused', () => {
    const w = doorWall(doors[0], objs, GS), g = wallGaps(objs, w, { gs: GS })[1]
    const r = gapEdit(objs, w, g, ft(12), GS)
    const moved = objs.map(o => { const p = r.patches.find(([id]) => id === o.id); return p ? { ...o, ...p[1] } : o })
    expect(wallGaps(moved, w, { gs: GS }).map(q => Math.round((q.hi - q.lo) / GS * 12) / 12)).toEqual([20, 12, 21])
    expect(gapEdit(objs, w, g, ft(500), GS).error).toMatch(/corner/)
    expect(gapEdit(objs, w, g, -1, GS).error).toMatch(/less than zero/)
  })
  it('DW-numbers: dock and drive-in doors D1, D2 …, man doors M1 …; per wall — top, right, bottom, left — each wall left to right (a wall along y: top to bottom)', () => {
    const nums = doorNumbers(objs, GS)
    expect(doors.map(d => nums.get(d.id))).toEqual(['D1', 'D2', 'M1', 'D3', 'M2', 'D4'])
    // (doors-edit fix: was clockwise) two more on the bottom wall and the left wall: the bottom left to right, the left top to bottom
    let o2 = put(objs, 'struct_egress', { x: X0 + ft(30), y: Y1 })
    o2 = put(o2, 'struct_loading_dock', { x: X0, y: Y0 + ft(20) })
    const n2 = doorNumbers(o2, GS), ds2 = o2.filter(o => /^struct_/.test(o.type))
    // top D1 D2 M1 · right D3 · bottom M2 (at 30 ft), M3 (at 100 ft) · left D4 (at 20 ft), D5 (at 60 ft)
    expect(ds2.map(d => n2.get(d.id))).toEqual(['D1', 'D2', 'M1', 'D3', 'M3', 'D5', 'M2', 'D4'])
  })
  it('DW-width-typed: a door’s width typed holds its low end; every door beyond moves with its far end (their gaps kept); past the corner — refused', () => {
    const w = doorWall(doors[0], objs, GS)
    const r = widthEdit(objs, w, doors[0].id, ft(12), GS)
    const moved = objs.map(o => { const p = r.patches.find(([id]) => id === o.id); return p ? { ...o, ...p[1] } : o })
    expect(wallGaps(moved, w, { gs: GS }).map(q => Math.round((q.hi - q.lo) / GS * 12) / 12)).toEqual([20, 21, 21])
    expect(Math.round((spanOf(moved.find(o => o.id === doors[0].id))[1] - spanOf(moved.find(o => o.id === doors[0].id))[0]) / GS)).toBe(12)
    expect(widthEdit(objs, w, doors[0].id, ft(300), GS).error).toMatch(/corner/)
  })
  it('DW-end-gap: the gap to the far corner typed — every door on the wall moves together, keeping their gaps', () => {
    const w = doorWall(doors[0], objs, GS), end = wallGaps(objs, w, { gs: GS, withEnd: true }).pop()
    const r = gapEdit(objs, w, end, ft(100), GS)
    const moved = objs.map(o => { const p = r.patches.find(([id]) => id === o.id); return p ? { ...o, ...p[1] } : o })
    const g = wallGaps(moved, w, { gs: GS, withEnd: true }).map(q => Math.round((q.hi - q.lo) / GS * 12) / 12)
    expect([g.slice(1, 3), g[3]]).toEqual([[21, 21], 100])
  })
  it('DW-chain: the chain is corner, gap, width, gap, width … far corner; widths bold; a value too long for its segment moves outside on a leader, never hides; the whole chain hides only when its values no longer fit the wall', () => {
    const w = doorWall(doors[0], objs, GS)
    expect(chainStops(objs, w, GS).map(s => s.kind)).toEqual(['gap', 'door', 'gap', 'door', 'gap', 'door', 'gap'])
    const c = doorChain(objs, w, GS, 1)
    expect([c.hidden, c.items.length, c.items.filter(i => i.stop.kind === 'door').every(i => i.stop.bold), c.items.some(i => i.out)]).toEqual([false, 7, true, false])
    // outside the building: past the wall's outer face (the top wall: above it)
    expect(c.items.every(i => i.box.y + i.box.h < w.outer)).toBe(true)
    // at a larger label unit the man door's 3′ no longer fits its 3 ft: outside, with a leader, still drawn; no two values overlap
    const big = doorChain(objs, w, GS, 6)
    const man = big.items.find(i => i.stop.kind === 'door' && i.stop.id === doors[2].id)
    expect([big.hidden, man.out, man.ops.some(o => o.leader)]).toEqual([false, true, true])
    const bx = big.items.map(i => i.box)
    expect(bx.some((a, i) => bx.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))).toBe(false)
    // far out: the whole chain hides
    expect(doorChain(objs, w, GS, 60).hidden).toBe(true)
    expect(dimChain([{ lo: 0, hi: 10, text: '10′' }, { lo: 10, hi: 400, text: '390′' }], { axis: 'x', at: 0, out: -1, u: 1 }).items.map(i => i.out)).toEqual([true, false])
  })
  it('DW-tags: tags that would overlap collapse into one range tag over their doors, and come apart again with room; a wall whose one tag no longer fits it hides its tags', () => {
    expect([rangeText(['D1', 'D2', 'D3']), rangeText(['D4']), rangeText(['D1', 'D2', 'M1'])]).toEqual(['D1–D3', 'D4', 'D1–D2, M1'])
    // eleven docks 9 ft wide, 3 ft apart along the top wall
    let row = [fp]
    for (let i = 0; i < 11; i++) row = put(row, 'struct_loading_dock', { x: X0 + ft(30 + i * 12 + 4.5), y: Y0 })
    const top = (u) => doorTags(row, GS, u).map(t => t.text)
    expect(top(1)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'])
    const mid = top(25)
    expect([mid.length < 11, mid.length > 1, mid.join(',').includes('–')]).toEqual([true, true, true])
    expect(top(80)).toEqual(['D1–D11'])
    expect(top(400)).toEqual([])
    // never two tags over each other
    for (const u of [1, 6, 12, 25, 50, 80]) {
      const b = doorTags(row, GS, u)
      expect([u, b.some((p, i) => b.some((q, j) => j > i && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h))]).toEqual([u, false])
    }
  })
  it('DW-placed: a door re-placed keeps its wall side — the face on the inner face, its low end where asked', () => {
    const d = doors[3], w = doorWall(d, objs, GS), p = { ...d, ...doorPlaced(d, w, w.lo + ft(10), ft(12)) }
    expect([Math.round((spanOf(p)[0] - w.lo) / GS), Math.round((spanOf(p)[1] - spanOf(p)[0]) / GS), doorWall(p, objs, GS)?.edge]).toEqual([10, 12, w.edge])
  })
})
