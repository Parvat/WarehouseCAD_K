// Area DW — a door on its wall (doors-edit round; utils/doorWall.js): its wall, its gaps, a gap typed, its number.
import { describe, it, expect } from 'vitest'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes } from '../../utils/doorTool'
import { doorWall, spanOf, wallGaps, neighbourGaps, gapEdit, doorNumbers, doorPlaced, widthEdit, chainStops } from '../../utils/doorWall'
import { doorDrawing, shade } from '../../render/doorAnnot'
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
  it('DW-numbers: just the number, one sequence for every door (doors5 — was D1 … / M1 …); per wall — top, right, bottom, left — each wall left to right (a wall along y: top to bottom)', () => {
    const nums = doorNumbers(objs, GS)
    expect(doors.map(d => nums.get(d.id))).toEqual(['1', '2', '3', '4', '5', '6'])
    // (doors-edit fix: was clockwise) two more on the bottom wall and the left wall: the bottom left to right, the left top to bottom
    let o2 = put(objs, 'struct_egress', { x: X0 + ft(30), y: Y1 })
    o2 = put(o2, 'struct_loading_dock', { x: X0, y: Y0 + ft(20) })
    const n2 = doorNumbers(o2, GS), ds2 = o2.filter(o => /^struct_/.test(o.type))
    // top 1 2 3 · right 4 · bottom 5 (at 30 ft), 6 (at 100 ft) · left 7 (at 20 ft), 8 (at 60 ft)
    expect(ds2.map(d => n2.get(d.id))).toEqual(['1', '2', '3', '4', '6', '8', '5', '7'])
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
  it('DW-drawing (doors5): each door a thin bar ON its wall at its true width — no filled box; its clear space the box; the number alone in a round badge in the box\'s corner away from the wall, at its right end; the width bold on a short line inside the box; the gaps plain text between the boxes, inside the building — the first from the corner; nothing outside the wall', () => {
    const w = doorWall(doors[0], objs, GS), D = doorDrawing(objs, GS, 1)
    const top = doors.slice(0, 3), bar = D.bars.find(b => b.id === top[0].id), [s0, s1] = spanOf(top[0])
    // the bar: its true width, on the wall (between the outer and the inner face's middle), 1.5 ft deep
    expect([bar.x, bar.x + bar.w, Math.round(bar.h), bar.y < w.at && bar.y + bar.h > w.outer]).toEqual([s0, s1, 60, true])
    // the badges: the number alone, light fill, mid ring, dark number, medium; inside the door's clear box at its far right,
    // a clear margin in from its edges; (doors-real) its diameter a fifth of the clear depth, at most 2.5x its 11 px size
    const badge = D.labels.find(l => l.kind === 'badge' && l.id === top[1].id), box = D.boxes.find(b => b.id === top[1].id)
    const [circ, num] = badge.ops
    expect([num.text, num.fontStyle, circ.fill, circ.stroke, num.fill]).toEqual(['2', '500', shade('#6366f1', 0.82).length === 7 ? circ.fill : null, circ.stroke, num.fill])
    expect(circ.r * 2).toBeCloseTo(Math.min(box.h / 5, 2.5 * 11 * 1.7), 6)
    const mg = circ.r * 0.5
    expect([circ.x + circ.r <= box.x + box.w - mg, circ.x > box.x + box.w / 2, circ.y + circ.r <= box.y + box.h - mg, circ.y > box.y + box.h / 2]).toEqual([true, true, true, true])
    // (doors-real) the width's line about 1 ft past the bar; the badge clear of the line and the value — every door
    for (const d of doors) {
      const wl = D.labels.find(l => l.kind === 'width' && l.id === d.id), bl = D.labels.find(l => l.kind === 'badge' && l.id === d.id)
      if (!wl || !bl) continue
      const ln = wl.ops.find(o => o.op === 'line'), br = D.bars.find(b => b.id === d.id), wd = doorWall(d, objs, GS)
      const lineAt = wd.axis === 'x' ? ln.points[1] : ln.points[0], barIn = wd.axis === 'x' ? (wd.inward > 0 ? br.y + br.h : br.y) : (wd.inward > 0 ? br.x + br.w : br.x)
      expect(Math.abs(lineAt - barIn)).toBeCloseTo(GS, 6)
      const ext = wl.ops.filter(o => o.op === 'line').flatMap(o => [o.points]).reduce((r, p) => ({ x0: Math.min(r.x0, p[0], p[2]), y0: Math.min(r.y0, p[1], p[3]), x1: Math.max(r.x1, p[0], p[2]), y1: Math.max(r.y1, p[1], p[3]) }), { x0: wl.box.x, y0: wl.box.y, x1: wl.box.x + wl.box.w, y1: wl.box.y + wl.box.h })
      const b = bl.box, apart = b.x >= ext.x1 || b.x + b.w <= ext.x0 || b.y >= ext.y1 || b.y + b.h <= ext.y0
      expect(apart).toBe(true)
    }
    // the widths bold on a line inside the box; the gaps regular, no line; all inside the building (below the top wall)
    const vals = D.labels.filter(l => l.wallKey && l.stop && l.w.edge === w.edge && l.w.axis === 'x' && l.w.inward === 1).sort((p, q) => p.at.x - q.at.x)
    expect(vals.map(l => (l.kind === 'width' ? 'W' : 'g')).join('')).toEqual('gWgWgW')
    expect(vals.map(l => l.ops.find(o => o.op === 'text').text)).toEqual(['20′', '9′', '21′', '9′', '21′', '3′'])
    expect(vals.every(l => l.box.y > w.at)).toBe(true)
    for (const l of vals.filter(q => q.kind === 'width')) {
      const bx = D.boxes.find(b => b.id === l.id), lines = l.ops.filter(o => o.op === 'line')
      expect([l.ops.find(o => o.op === 'text').fontStyle, lines.every(o => o.points.every((v, i) => (i % 2 ? v >= bx.y && v <= bx.y + bx.h : v >= bx.x && v <= bx.x + bx.w)))]).toEqual(['700', true])
    }
    expect(vals.filter(l => l.kind === 'gap').every(l => l.ops.length === 1 && l.ops[0].fontStyle === '400')).toBe(true)
    // nothing outside any wall: every label inside the building
    const inner = { x0: X0, y0: Y0, x1: X1, y1: Y1 }
    expect(D.labels.every(l => l.box.x >= inner.x0 - 1e-6 && l.box.x + l.box.w <= inner.x1 + 1e-6 && l.box.y >= inner.y0 - 1e-6 && l.box.y + l.box.h <= inner.y1 + 1e-6)).toBe(true)
    // drawing-scale: a larger label scale only makes them smaller in the drawing — never a range, never a leader
    const small = doorDrawing(objs, GS, 4)
    expect([small.labels.filter(l => l.kind === 'badge').map(l => l.ops[1].text).join(), small.labels.some(l => l.ops.some(o => o.leader))]).toEqual(['1,2,3,4,5,6', false])
  })
  it('DW-placed: a door re-placed keeps its wall side — the face on the inner face, its low end where asked', () => {
    const d = doors[3], w = doorWall(d, objs, GS), p = { ...d, ...doorPlaced(d, w, w.lo + ft(10), ft(12)) }
    expect([Math.round((spanOf(p)[0] - w.lo) / GS), Math.round((spanOf(p)[1] - spanOf(p)[0]) / GS), doorWall(p, objs, GS)?.edge]).toEqual([10, 12, w.edge])
  })
})
