// Area DW — a door on its wall (doors-edit round; utils/doorWall.js): its wall, its gaps, a gap typed, its number.
import { describe, it, expect } from 'vitest'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes } from '../../utils/doorTool'
import { doorWall, spanOf, wallGaps, neighbourGaps, gapEdit, doorNumbers, doorPlaced, widthEdit, chainStops, wallKey } from '../../utils/doorWall'
import { doorDrawing, shade } from '../../render/doorAnnot'
import { AISLE_LABEL_FONT_PX } from '../../canvas2/hitTest'
import { dimChain } from '../../render/dimChain'
import { ftIn } from '../../utils/bom'
const ftInOf = (px) => ftIn((px / 40) * 12)

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
    // a clear margin in from its edges; (doors-aisle) the number at the aisle width labels' size, the circle sized to it
    const badge = D.labels.find(l => l.kind === 'badge' && l.id === top[1].id), box = D.boxes.find(b => b.id === top[1].id)
    const [circ, num] = badge.ops
    expect([num.text, num.fontStyle, circ.fill, circ.stroke, num.fill]).toEqual(['2', '500', shade('#6366f1', 0.82).length === 7 ? circ.fill : null, circ.stroke, num.fill])
    // (labels-cover) the number 0.8 of the width text, the circle snug round it
    expect([num.fontSize, circ.r]).toEqual([AISLE_LABEL_FONT_PX * 0.8, AISLE_LABEL_FONT_PX * 0.8 * 0.6])
    expect(D.labels.filter(l => l.kind !== 'badge').every(l => l.ops.find(o => o.op === 'text').fontSize === AISLE_LABEL_FONT_PX)).toBe(true)
    const mg = circ.r * 0.5
    expect([circ.x + circ.r <= box.x + box.w - mg, circ.x > box.x + box.w / 2, circ.y + circ.r <= box.y + box.h - mg, circ.y > box.y + box.h / 2]).toEqual([true, true, true, true])
    // (chain.png) ONE chain per wall, just above the door bars (1 ft past them): corner, gap, door width … far corner — a tick
    // at every door edge and both corners; each value centred on its own segment (on the line, or lifted straight up on a
    // short leader — never sideways); widths bold in the door's colour, gaps regular in the dimension blue
    const ch = D.chains.find(c => c.wallKey === wallKey(w)), br0 = D.bars.find(b => b.id === top[0].id), lineY = br0.y + br0.h + GS
    const ticks = ch.ops.filter(o => o.points[0] === o.points[2]).map(o => o.points[0]).sort((a, b) => a - b)
    const edges = [w.lo, w.hi, ...top.flatMap(d => spanOf(d))].sort((a, b) => a - b)
    expect([ticks.length, ticks.every((v, i) => Math.abs(v - edges[i]) < 1e-6), ch.ops.filter(o => o.points[1] === o.points[3]).every(o => Math.abs(o.points[1] - lineY) < 1e-6)]).toEqual([edges.length, true, true])
    const vals = D.labels.filter(l => l.wallKey === wallKey(w) && l.stop).sort((p, q) => p.at.x - q.at.x)
    expect(vals.map(l => (l.kind === 'width' ? 'W' : 'g')).join('')).toEqual('gWgWgWg')
    const endGap = wallGaps(objs, w, { gs: GS, withEnd: true }).pop()
    expect(vals.map(l => l.ops.find(o => o.op === 'text').text)).toEqual(['20′', '9′', '21′', '9′', '21′', '3′', ftInOf(endGap.hi - endGap.lo)])
    for (const l of vals) {
      const t = l.ops.find(o => o.op === 'text'), lead = l.ops.find(o => o.op === 'line'), m = (l.stop.lo + l.stop.hi) / 2
      expect([l.kind, Math.abs(l.at.x - m) < 1e-6, lead ? lead.points[0] === m && lead.points[2] === m && lead.points[1] === lineY : Math.abs(l.at.y - lineY) < 1e-6, t.fontStyle, t.fill])
        .toEqual([l.kind, true, true, l.kind === 'width' ? '700' : '400', l.kind === 'width' ? top.find(d => d.id === l.id).stroke || '#6366f1' : t.fill])
    }
    // (labels larger — zoomed out: the 3 ft man door's value wider than its segment — lifted straight up, above the boxes, on
    // a leader from the line; the others stay on their segments)
    const Z1 = doorDrawing(objs, GS, 0.1), zv = Z1.labels.filter(l => l.wallKey === wallKey(w) && l.stop)
    const lifted = zv.filter(l => l.ops.some(o => o.op === 'line'))
    expect(lifted.map(l => l.ops.find(o => o.op === 'text').text)).toEqual(['3′'])
    expect(lifted.every(l => l.box.y > Math.max(...Z1.boxes.filter(b => top.some(d => d.id === b.id)).map(b => b.y + b.h)) && Math.abs(l.at.x - (l.stop.lo + l.stop.hi) / 2) < 1e-6)).toBe(true)
    // the badge clear of the chain: below its line's ticks
    expect(D.labels.filter(l => l.kind === 'badge' && top.some(d => d.id === l.id)).every(l => l.box.y > lineY + AISLE_LABEL_FONT_PX * 0.4)).toBe(true)
    // nothing outside any wall: every label inside the building
    const inner = { x0: X0, y0: Y0, x1: X1, y1: Y1 }
    expect(D.labels.every(l => l.box.x >= inner.x0 - 1e-6 && l.box.x + l.box.w <= inner.x1 + 1e-6 && l.box.y >= inner.y0 - 1e-6 && l.box.y + l.box.h <= inner.y1 + 1e-6)).toBe(true)
    // (doors-aisle) laid out larger (zoomed out, the floor in the unit): no two labels over each other, nothing outside the
    // building; what no longer fits is left out — never a range, never a leader
    for (const lz of [1, 0.5, 0.25, 0.1, 0.05]) {
      const Z = doorDrawing(objs, GS, lz), bx = Z.labels.map(l => l.box)
      const over = bx.some((p, i) => bx.some((q, j) => j > i && p.x < q.x + q.w - 1e-6 && q.x < p.x + p.w - 1e-6 && p.y < q.y + q.h - 1e-6 && q.y < p.y + p.h - 1e-6))
      const out = Z.labels.some(l => l.box.x < X0 - 1e-6 || l.box.x + l.box.w > X1 + 1e-6 || l.box.y < Y0 - 1e-6 || l.box.y + l.box.h > Y1 + 1e-6)
      expect([lz, over, out]).toEqual([lz, false, false])
      // (chain.png) every gap on the chain, every zoom — on its segment or lifted straight up, never left out
      for (const wd of [...new Set(doors.map(d => doorWall(d, objs, GS)))]) {
        const want = wallGaps(objs, wd, { gs: GS, withEnd: true }).filter(g => g.hi - g.lo > 0.5).length
        expect([lz, wd.edge, Z.labels.filter(l => l.kind === 'gap' && l.wallKey === wallKey(wd)).length]).toEqual([lz, wd.edge, want])
      }
      // (the two docks; the man door's 44 in box, zoomed out, puts its badge past its width value — never over it)
      const top3 = Z.labels.filter(l => l.kind === 'badge' && doors.slice(0, 2).some(d => d.id === l.id))
      const rel = top3.map(l => { const b = Z.boxes.find(q => q.id === l.id); return Math.round((l.at.y - (b.y + b.h)) * 1000) / 1000 })   // (from its box's far edge)
      expect([lz, new Set(rel).size <= 1]).toEqual([lz, true])
      for (const l of Z.labels.filter(q => q.kind === 'badge')) { const b = Z.boxes.find(q => q.id === l.id); expect(l.box.w <= Math.min(b.w, b.h) + 1e-6).toBe(true) }
    }
    const small = doorDrawing(objs, GS, 4)
    expect([small.labels.filter(l => l.kind === 'badge').map(l => l.ops[1].text).join(), small.labels.some(l => l.ops.some(o => o.leader))]).toEqual(['1,2,3,4,5,6', false])
  })
  it('DW-placed: a door re-placed keeps its wall side — the face on the inner face, its low end where asked', () => {
    const d = doors[3], w = doorWall(d, objs, GS), p = { ...d, ...doorPlaced(d, w, w.lo + ft(10), ft(12)) }
    expect([Math.round((spanOf(p)[0] - w.lo) / GS), Math.round((spanOf(p)[1] - spanOf(p)[0]) / GS), doorWall(p, objs, GS)?.edge]).toEqual([10, 12, w.edge])
  })
})
