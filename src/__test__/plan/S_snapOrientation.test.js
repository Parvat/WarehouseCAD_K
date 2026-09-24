// Area S — smart guides snap to racks as drawn, identically in horizontal and
// vertical layouts, and never to anything moving with the drag.
import { describe, it, expect } from 'vitest'
import { computeSmartGuides } from '../../canvas2/smartGuides'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint, groupBySegment } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { GS, MATRIX } from './fixtures'

/** Mirror across x = y: each rack's drawn footprint (x, y, w, h) becomes
 *  (y, x, h, w) — a 0° rack becomes a 90° one and vice versa. */
function mirror(o) {
  if (o.type === 'fp_rect') {
    return { ...o, x: o.y, y: o.x, width: o.height, height: o.width, fpVerts: o.fpVerts.map(v => ({ x: v.y, y: v.x })) }
  }
  const f = rackFootprint(o)
  const T = { x: f.y, y: f.x, w: f.h, h: f.w }
  if (f.rotated) return { ...o, rotation: 0, x: T.x, y: T.y }
  const cx = T.x + T.w / 2, cy = T.y + T.h / 2
  return { ...o, rotation: 90, x: cx - o.width / 2, y: cy - o.height / 2 }
}
const mirrorGuides = (gs) => gs.map(g => ({ ...g, axis: g.axis === 'x' ? 'y' : 'x' }))
const n4 = (v) => (Math.round(+v * 1e4) / 1e4 + 0).toFixed(4)   // + 0 folds -0 into 0
const key = (g) => `${g.axis}|${n4(g.val)}|${n4(g.from)}|${n4(g.to)}|${!!g.isWall}`
const same = (a, b) => expect([...new Set(a.map(key))].sort()).toEqual([...new Set(b.map(key))].sort())

const rack = (id, x, y, extra = {}) => ({ id, type: 'rack_row', x, y, width: 670, height: 140, beams: [96, 96], uprightWidth: 3, ...extra })

describe('S — a vertical rack snaps to the same edges and centres as its horizontal twin', () => {
  /* Horizontal: A (0..670, 0..140) dragged 995 px right lands its left edge
   * 5 px from B's left edge (1000): snaps to 1000. The vertical twin: A' is
   * drawn x 0..140, y 0..670, B' x 500..640, y 1000..1670; dragging A' 995 px
   * DOWN must snap its top edge to B's top at y = 1000. */
  const A = rack('A', 0, 0), B = rack('B', 1000, 500)

  it('S-hand: horizontal — left edge snaps onto B\'s left edge (x 1000)', () => {
    const h = computeSmartGuides(['A'], [A, B], GS, 1, 995, 0)
    expect(h.snapDx).toBe(1000)
    expect(h.guides.some(g => g.axis === 'x' && g.val === 1000)).toBe(true)
  })

  it('S-hand: vertical twin — top edge snaps onto B\'s top edge (y 1000), the same guide mirrored', () => {
    const h = computeSmartGuides(['A'], [A, B], GS, 1, 995, 0)
    const v = computeSmartGuides(['A'], [mirror(A), mirror(B)], GS, 1, 0, 995)
    expect(v.snapDy).toBe(1000)
    expect(v.snapDx).toBe(h.snapDy)
    same(v.guides, mirrorGuides(h.guides))
  })

  it('S-hand: centre lines mirror too — A\'s centre snapping to B\'s centre', () => {
    // horizontal: A centre-x 335 + dx; B centre-x 1335 -> dx 1003 puts it 3 px off
    const h = computeSmartGuides(['A'], [A, B], GS, 1, 1003, 0)
    const v = computeSmartGuides(['A'], [mirror(A), mirror(B)], GS, 1, 0, 1003)
    expect(h.snapDx).toBe(1000)
    expect(v.snapDy).toBe(1000)
    same(v.guides, mirrorGuides(h.guides))
  })

  /* Across the matrix: in each generated layout, drag a rack a little
   * toward its neighbours in several directions; the mirrored layout,
   * dragged the mirrored way, must produce the mirrored snap and guides. */
  for (const id of Object.keys(MATRIX)) {
    for (const orientation of ['horizontal', 'vertical']) {
      it(`S-matrix: ${id} ${orientation} — every snap mirrors on the ${orientation === 'horizontal' ? 'vertical' : 'horizontal'} twin`, () => {
        const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = MATRIX[id]
        const brief = { lengthFt, widthFt, gridXFt, gridYFt, mhe, orientation, columnsAlongWall: true, rackType: 'rack_double_row' }
        const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i }))
        const twin = racks.map(mirror)
        const run = groupBySegment(racks)[0]
        const pick = run[Math.floor(run.length / 2)]
        let snapped = 0
        for (const [dx, dy] of [[3, 0], [0, 3], [-3, 0], [0, -3], [5, 5], [-6, 4], [0, 150], [150, 0]]) {
          const h = computeSmartGuides([pick.id], racks, GS, 1, dx, dy)
          const v = computeSmartGuides([pick.id], twin, GS, 1, dy, dx)
          const r4 = (q) => (q == null ? null : n4(q))
          expect([r4(v.snapDx), r4(v.snapDy)]).toEqual([r4(h.snapDy), r4(h.snapDx)])
          same(v.guides, mirrorGuides(h.guides))
          if (h.snapDx != null || h.snapDy != null) snapped++
        }
        expect(snapped).toBeGreaterThan(0)   // guard: the drags really do reach snap targets
      })
    }
  }
})

describe('S — a drag never snaps to what moves with it, in both orientations', () => {
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1000, height: 1600,
    fpVerts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1600 }, { x: 0, y: 1600 }] }

  for (const orientation of ['horizontal', 'vertical']) {
    const flip = orientation === 'vertical'
    const M = (o) => (flip ? mirror(o) : o)
    const d = (dx, dy) => (flip ? [dy, dx] : [dx, dy])
    const snapOnDragAxis = (res) => (flip ? res.snapDy : res.snapDx)

    it(`S-fp ${orientation}: dragging a floor plan never snaps to its own children`, () => {
      // its own rack 3 px in from the near wall; the drag puts the wall 2 px from where the rack was
      const child = M(rack('c', 3, 200, { parentId: 'fp' }))
      const res = computeSmartGuides(['fp'], [M(fp), child], GS, 1, ...d(5, 0))
      expect(snapOnDragAxis(res)).toBeNull()
      expect(res.guides).toEqual([])
    })

    it(`S-fp ${orientation}: ...it still snaps to a rack outside the building`, () => {
      const outside = M(rack('o', -672, 1800))            // far edge at -2
      const res = computeSmartGuides(['fp'], [M(fp), outside], GS, 1, ...d(3, 0))
      expect(snapOnDragAxis(res)).toBe(-2)
    })

    it(`S-multi ${orientation}: a multi-select drag never snaps to its own members`, () => {
      const A = M(rack('A', 100, 2000)), B = M(rack('B', 400, 2400))
      const res = computeSmartGuides(['A', 'B'], [A, B], GS, 1, ...d(297, 0))
      expect(snapOnDragAxis(res)).toBeNull()
      expect(res.guides).toEqual([])
    })

    it(`S-multi ${orientation}: ...it still snaps to a rack left behind`, () => {
      const A = M(rack('A', 100, 2000)), B = M(rack('B', 400, 2400)), C = M(rack('C', 400, 3000))
      const res = computeSmartGuides(['A', 'B'], [A, B, C], GS, 1, ...d(297, 0))
      expect(snapOnDragAxis(res)).toBe(300)
    })
  }
})
