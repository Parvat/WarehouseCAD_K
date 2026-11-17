// Area DR — the Door row tool (door-row round; utils/doorRowTool.js; mockup rowcard.png): every door type, its Type switch
// (the type's width and height until typed), Gap between, Start gap (from the corner, or the last door on the wall), Fill the
// rest (stopping before a door further along — never skipping over it) or Count (refused when it does not fit).
import { describe, it, expect, beforeEach } from 'vitest'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes } from '../../utils/doorTool'
import { spanOf } from '../../utils/doorWall'
import { useDoorRow, setDoorRow, setRowType, openDoorRow, rowWallAt, rowDoors, ROW_TYPES } from '../../utils/doorRowTool'

const GS = 40, ft = (v) => v * GS
let n = 0
const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: ft(200), height: ft(100), wallThicknessFt: 0.25 }
const inner = innerOutline(fp, GS), X0 = Math.min(...inner.map(p => p.x)), Y0 = Math.min(...inner.map(p => p.y))
const T = doorTypes()
const put = (objs, id, x) => { const spec = T.find(t => t.id === id), at = doorAt(objs, { x: X0 + ft(x), y: Y0 }, spec, GS, 0); return [...objs, { ...doorObject(at, spec, () => 'd' + (++n)), parentId: 'fp' }] }
/** the top wall, clicked (the whole wall) or dragged from `a` to `b` ft */
const clickTop = (objs) => { const r = rowWallAt(objs, { x: X0 + ft(100), y: Y0 }, GS); return { w: r.w, lo: r.w.lo, hi: r.w.hi, whole: true, ref: r.d } }
const dragTop = (objs, a, b) => { const r = rowWallAt(objs, { x: X0 + ft(100), y: Y0 }, GS); return { w: r.w, lo: r.w.lo + ft(a), hi: r.w.lo + ft(b), whole: false, ref: r.d } }
const lows = (r, w) => r.doors.map(d => Math.round((spanOf(d)[0] - w.lo) / GS * 1000) / 1000)

describe('DR — the Door row tool', () => {
  beforeEach(() => { useDoorRow.setState({ gapFt: 12, startFt: 10, mode: 'fill', count: 4 }); openDoorRow('struct_loading_dock') })

  it('DR-types: every door type; the Type switch takes the type\'s width and height until typed; opened on the Add door bar\'s type', () => {
    expect(ROW_TYPES).toEqual(['struct_egress', 'struct_loading_dock', 'struct_drive_in'])
    openDoorRow('struct_egress')
    expect([useDoorRow.getState().typeId, useDoorRow.getState().widthFt, useDoorRow.getState().heightFt]).toEqual(['struct_egress', T.find(t => t.id === 'struct_egress').widthFt, 7])
    setRowType('struct_drive_in')
    expect([useDoorRow.getState().widthFt, useDoorRow.getState().heightFt]).toEqual([T.find(t => t.id === 'struct_drive_in').widthFt, 14])
    setDoorRow({ widthFt: 11, widthTyped: true })
    setRowType('struct_loading_dock')
    expect([useDoorRow.getState().widthFt, useDoorRow.getState().heightFt]).toEqual([11, 10])   // the typed width kept, the height the type's
    openDoorRow('struct_loading_dock')
    expect(useDoorRow.getState().widthFt).toBe(T.find(t => t.id === 'struct_loading_dock').widthFt)
  })

  it('DR-fill: a click on an empty wall — from the corner: the Start gap, then door, gap, door … as many as fit; the length left at the end', () => {
    const objs = [fp], sp = clickTop(objs), r = rowDoors(objs, sp, GS), W = 9
    const L = (sp.w.hi - sp.w.lo) / GS, k = Math.floor((L - 10 + 12) / (W + 12))
    expect([r.mode, r.n, lows(r, sp.w).slice(0, 3)]).toEqual(['fill', k, [10, 31, 52]])
    expect(r.leftover / GS).toBeCloseTo(L - (10 + k * W + (k - 1) * 12), 6)
  })

  it('DR-from-door: a click on a wall with doors — the Start gap is measured from the last door on it', () => {
    const objs = put(put([fp], 'struct_loading_dock', 24.5), 'struct_loading_dock', 60.5), sp = clickTop(objs), r = rowDoors(objs, sp, GS)
    const last = Math.max(...objs.filter(o => o.id !== 'fp').map(d => spanOf(d)[1]))
    expect(Math.round((spanOf(r.doors[0])[0] - last) / GS * 1000) / 1000).toBe(10)
  })

  it('DR-stop: Fill the rest stops one Gap before the first door further along — never skips over it', () => {
    const objs = put([fp], 'struct_loading_dock', 104.5), d = objs[1], sp = dragTop(objs, 0, 190), r = rowDoors(objs, sp, GS)
    const [a] = spanOf(d), lastEnd = Math.max(...r.doors.map(q => spanOf(q)[1]))
    expect([r.stopDoor != null, lastEnd <= a - ft(12) + 0.5, r.doors.every(q => spanOf(q)[0] < a)]).toEqual([true, true, true])
    expect(r.leftover).toBeCloseTo(a - lastEnd, 6)
  })

  it('DR-count: Count places that many — the length needed, the free length after the last; too many: refused with a reason, nothing placed; never over a door already there', () => {
    const objs = [fp], sp = clickTop(objs)
    setDoorRow({ mode: 'count', count: 3 })
    let r = rowDoors(objs, sp, GS)
    expect([r.n, r.fits, r.doors.length, r.need / GS, lows(r, sp.w)]).toEqual([3, true, 3, 3 * 9 + 2 * 12, [10, 31, 52]])
    expect(r.free / GS).toBeCloseTo((sp.w.hi - sp.w.lo) / GS - 10 - 51, 6)
    setDoorRow({ count: 50 })
    r = rowDoors(objs, sp, GS)
    expect([r.fits, r.doors.length, /need .* only .* is free/.test(r.why)]).toEqual([false, 0, true])
    // a drag over a door already on the wall: refused, not overlapped
    const o2 = put([fp], 'struct_loading_dock', 30.5)
    setDoorRow({ count: 3 })
    r = rowDoors(o2, dragTop(o2, 0, 150), GS)
    expect([r.fits, r.doors.length, /overlap/.test(r.why)]).toEqual([false, 0, true])
  })

  it('DR-man: a row of man doors — 3 ft wide, 7 ft high, their own clear spaces', () => {
    openDoorRow('struct_egress')
    setDoorRow({ gapFt: 6 })
    const objs = [fp], r = rowDoors(objs, clickTop(objs), GS)
    expect([r.doors.every(d => d.type === 'struct_egress'), r.doors.length > 10, lows(r, clickTop(objs).w).slice(0, 2)]).toEqual([true, true, [10, 10 + T.find(t => t.id === 'struct_egress').widthFt + 6]])
  })
})
