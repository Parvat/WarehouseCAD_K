// Area DR — a row of doors in the Add door bar (door-row round; utils/doorRowTool.js; design/doorbar.png): Row on with a
// Count — the row follows the pointer along a wall, its live distances to the corner or the nearest door each side, a left
// distance typed, refused over a door; Count empty — a drag fills its span from its start, stopping before a door.
import { describe, it, expect, beforeEach } from 'vitest'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes, useDoorTool } from '../../utils/doorTool'
import { spanOf } from '../../utils/doorWall'
import { rowWallAt, hoverRow, rowNow, rowFill, rowSettings } from '../../utils/doorRowTool'

const GS = 40, ft = (v) => v * GS
let n = 0
const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: ft(200), height: ft(100), wallThicknessFt: 0.25 }
const inner = innerOutline(fp, GS), X0 = Math.min(...inner.map(p => p.x)), Y0 = Math.min(...inner.map(p => p.y))
const T = doorTypes()
const put = (objs, id, x) => { const spec = T.find(t => t.id === id), at = doorAt(objs, { x: X0 + ft(x), y: Y0 }, spec, GS, 0); return [...objs, { ...doorObject(at, spec, () => 'd' + (++n)), parentId: 'fp' }] }
const at = (x) => ({ x: X0 + ft(x), y: Y0 })
const r3 = (v) => Math.round(v * 1000) / 1000

describe('DR — a row of doors in the Add door bar', () => {
  beforeEach(() => useDoorTool.setState({ typeId: 'struct_loading_dock', widthFt: null, row: true, rowGapFt: 12, rowCount: 3, typed: null, hover: null, rowDrag: null, onlySection: null }))

  it('DR-follow: Count 3 — the whole row (3 × 9 ft, 12 ft apart: 51 ft) centred on the pointer along the wall; its distances to the corners each side', () => {
    const objs = [fp]
    hoverRow(objs, at(100), GS, 1)
    const R = rowNow(objs, GS)
    expect([R.count, r3((R.s1 - R.s0) / GS), r3(((R.s0 + R.s1) / 2 - R.w.lo) / GS), R.starts.map(s => r3((s - R.s0) / GS)), R.refused]).toEqual([3, 51, 100, [0, 21, 42], false])
    expect([r3(R.leftDist / GS), r3(R.rightDist / GS)]).toEqual([r3(100 - 25.5), r3((R.w.hi - R.w.lo) / GS - 100 - 25.5)])
  })

  it('DR-nearest: the distance on a side runs to the nearest door there, not the corner', () => {
    const objs = put([fp], 'struct_loading_dock', 30.5), d = objs[1]
    hoverRow(objs, at(100), GS, 1)
    const R = rowNow(objs, GS)
    expect(r3((R.left - spanOf(d)[1]) / GS)).toBe(0)
    expect(r3(R.leftDist / GS)).toBe(r3((R.s0 - spanOf(d)[1]) / GS))
  })

  it('DR-typed: a number typed sets the LEFT distance — the row placed that far from the corner or the door on its left', () => {
    const objs = [fp]
    hoverRow(objs, at(100), GS, 1)
    useDoorTool.setState({ typed: '20' })
    const R = rowNow(objs, GS)
    expect([r3((R.s0 - R.w.lo) / GS), r3(R.leftDist / GS), R.typed, R.refused]).toEqual([20, 20, 20, false])
  })

  it('DR-refused: over a door already on the wall, or past a corner — refused (drawn red, never dropped)', () => {
    const objs = put([fp], 'struct_loading_dock', 100)
    hoverRow(objs, at(100), GS, 1)
    let R = rowNow(objs, GS)
    expect([R.refused, /overlap/.test(R.why)]).toEqual([true, true])
    useDoorTool.setState({ typed: '190' })
    hoverRow([fp], at(100), GS, 1)
    R = rowNow([fp], GS)
    expect([R.refused, /corner/.test(R.why)]).toEqual([true, true])
  })

  it('DR-fill: Count empty — a drag fills its span from its start with as many as fit; it stops before a door already there; with a Count, at most that many', () => {
    useDoorTool.setState({ rowCount: null })
    const objs = [fp], h = rowWallAt(objs, at(100), GS)
    const drag = (a, b) => ({ w: h.w, p0: h.w.lo + ft(a), p1: h.w.lo + ft(b), ref: h.d })
    let F = rowFill(objs, drag(10, 100), GS)
    expect([F.n, F.starts.map(s => r3((s - h.w.lo) / GS))]).toEqual([4, [10, 31, 52, 73]])
    // dragged right to left: from the start toward the end
    F = rowFill(objs, drag(100, 10), GS)
    expect(F.starts.map(s => r3((s - h.w.lo) / GS))).toEqual([91, 70, 49, 28])
    // a door at 60–69 ft: the fill stops before it (10, 31 — a third at 52 would overlap it)
    const o2 = put([fp], 'struct_loading_dock', 64.5), [a] = spanOf(o2[1]), h2 = rowWallAt(o2, at(100), GS)
    F = rowFill(o2, { w: h2.w, p0: h2.w.lo + ft(10), p1: h2.w.lo + ft(150), ref: h2.d }, GS)
    expect([F.n, F.starts.every(s => s + ft(9) <= a + 0.5)]).toEqual([2, true])
    // a Count: at most that many
    useDoorTool.setState({ rowCount: 2 })
    expect(rowFill(objs, drag(10, 150), GS).n).toBe(2)
  })

  it('DR-type: the row takes the bar\'s type and Width; Height its type\'s default', () => {
    useDoorTool.setState({ typeId: 'struct_egress', widthFt: null })
    const r = rowSettings(GS)
    expect([r.spec.id, r.W / GS]).toEqual(['struct_egress', T.find(t => t.id === 'struct_egress').widthFt])
    expect(doorObject({ x: 0, y: 0, width: 1, height: 1, rotation: 0 }, r.spec, () => 'x').meta.heightFt).toBe(7)
  })
})
