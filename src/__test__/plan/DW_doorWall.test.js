// Area DW — a door on its wall (doors-edit round; utils/doorWall.js): its wall, its gaps, a gap typed, its number.
import { describe, it, expect } from 'vitest'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes } from '../../utils/doorTool'
import { doorWall, spanOf, wallGaps, neighbourGaps, gapEdit, doorNumbers, doorPlaced } from '../../utils/doorWall'

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
  it('DW-numbers: dock and drive-in doors D1, D2 …, man doors M1 …, clockwise from the top-left corner', () => {
    const nums = doorNumbers(objs, GS)
    expect(doors.map(d => nums.get(d.id))).toEqual(['D1', 'D2', 'M1', 'D3', 'M2', 'D4'])
  })
  it('DW-placed: a door re-placed keeps its wall side — the face on the inner face, its low end where asked', () => {
    const d = doors[3], w = doorWall(d, objs, GS), p = { ...d, ...doorPlaced(d, w, w.lo + ft(10), ft(12)) }
    expect([Math.round((spanOf(p)[0] - w.lo) / GS), Math.round((spanOf(p)[1] - spanOf(p)[0]) / GS), doorWall(p, objs, GS)?.edge]).toEqual([10, 12, w.edge])
  })
})
