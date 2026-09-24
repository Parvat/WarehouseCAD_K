// Area R — a marquee selects the racks and bays it visibly touches, the same
// in horizontal and vertical layouts.
import { describe, it, expect } from 'vitest'
import { objectsInMarquee, bayEntriesInMarquee } from '../../canvas2/selection'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject, aisleObjectsForRacks } from '../../generate/traceGenerate'
import { rackFootprint, groupBySegment } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { GS, MATRIX } from './fixtures'

/** The layout with every object mirrored across the x = y diagonal: each
 *  rack's world footprint (x, y, w, h) becomes (y, x, h, w). A horizontal
 *  (0°) rack becomes a 90° one and vice versa; bay order runs the same way
 *  along the run in both (0° along +x, 90° along +y). Aisles are derived
 *  from their rows, so they follow. */
function twin(objects) {
  return objects.map(o => {
    if (o.type === 'aisle') return o
    const f = rackFootprint(o)
    const T = { x: f.y, y: f.x, w: f.h, h: f.w }
    if (f.rotated) return { ...o, rotation: 0, x: T.x, y: T.y }
    const cx = T.x + T.w / 2, cy = T.y + T.h / 2
    return { ...o, rotation: 90, x: cx - o.width / 2, y: cy - o.height / 2 }
  })
}
const T = (r) => ({ x: r.y, y: r.x, width: r.height, height: r.width })
const sel = (objs, rect) => ({
  ids: objectsInMarquee(objs, rect).sort(),
  bays: bayEntriesInMarquee(objs, rect, GS).map(e => `${e.objId}#${e.bayIdx}`).sort(),
})

function layout(id, orientation) {
  const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = MATRIX[id]
  const brief = { lengthFt, widthFt, gridXFt, gridYFt, mhe, orientation, columnsAlongWall: true, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i }))
  return [...racks, ...aisleObjectsForRacks(racks).map((a, i) => ({ ...a, id: 'a' + i }))]
}

/* Marquees built from the layout itself, in world px, along each run:
 *   one  — strictly inside a single rack, a third of the way along it
 *   three — from inside row i to inside row i+2 of the same run, a narrow
 *           window along the run inside all three (so it can touch nothing else) */
function marquees(objs) {
  const out = []
  const racks = objs.filter(o => o.type !== 'aisle')
  for (const run of groupBySegment(racks).slice(0, 2)) {
    const f = run.map(r => ({ r, f: rackFootprint(r) }))
    const stacked = f[0].f.rotated
    f.sort((a, b) => stacked ? a.f.x - b.f.x : a.f.y - b.f.y)
    const lo = (q) => (stacked ? q.f.x : q.f.y), hi = (q) => (stacked ? q.f.x + q.f.w : q.f.y + q.f.h)
    const rlo = (q) => (stacked ? q.f.y : q.f.x), rhi = (q) => (stacked ? q.f.y + q.f.h : q.f.x + q.f.w)
    const mk = (d0, d1, r0, r1) => stacked
      ? { x: d0, y: r0, width: d1 - d0, height: r1 - r0 }
      : { x: r0, y: d0, width: r1 - r0, height: d1 - d0 }
    for (const i of [0, Math.floor(f.length / 2)]) {
      const q = f[i], len = rhi(q) - rlo(q), dep = hi(q) - lo(q)
      out.push({ kind: 'one', expect: [q.r.id], rect: mk(lo(q) + dep * 0.25, hi(q) - dep * 0.25, rlo(q) + len / 3, rlo(q) + len / 3 + 400) })
    }
    if (f.length >= 3) {
      const [a, , c] = f.slice(1, 4)
      const r0 = Math.max(...f.slice(1, 4).map(rlo)) + 50
      out.push({ kind: 'three', expect: f.slice(1, 4).map(q => q.r.id).sort(), rect: mk(lo(a) + 5, hi(c) - 5, r0, r0 + 300) })
    }
  }
  return out
}

describe('R — marquee selects what it visibly touches, same in both orientations', () => {
  for (const id of Object.keys(MATRIX)) {
    for (const orientation of ['horizontal', 'vertical']) {
      it(`R-matrix: ${id} ${orientation} — one-rack and three-rack marquees select exactly those racks, identically on the ${orientation === 'horizontal' ? 'vertical' : 'horizontal'} twin`, () => {
        const objs = layout(id, orientation)
        const mirrored = twin(objs)
        const ms = marquees(objs)
        expect(ms.filter(m => m.kind === 'one').length).toBeGreaterThan(0)
        for (const m of ms) {
          const a = sel(objs, m.rect), b = sel(mirrored, T(m.rect))
          expect(a.ids).toEqual(m.expect)          // exactly the racks it touches — no aisles, no neighbours
          expect(a.bays.length).toBeGreaterThan(0) // and bays inside them
          expect(b).toEqual(a)                     // the mirrored twin selects the same racks and bays
        }
      })
    }
  }

  /* Hand geometry: one rack, 4 bays of 96" on 3" uprights (bay 0 at
   * x 10..330, bay 1 340..660, bay 2 670..990, bay 3 1000..1320), 140 deep,
   * at (100, 100); its 90° twin is drawn at x 100..240, y 100..1430. */
  it('R-hand: a marquee over bays 1-2 selects that rack and bays 1-2, and the same on its 90° twin', () => {
    const r = { id: 'r', type: 'rack_row', x: 100, y: 100, width: 1330, height: 140, beams: [96, 96, 96, 96], uprightWidth: 3 }
    const rect = { x: 100 + 400, y: 150, width: 500, height: 40 }        // local x 400..900 -> bays 1 and 2
    expect(sel([r], rect)).toEqual({ ids: ['r'], bays: ['r#1', 'r#2'] })
    expect(sel(twin([r]), T(rect))).toEqual({ ids: ['r'], bays: ['r#1', 'r#2'] })
    // a marquee in the twin's OLD (unturned) box area touches nothing now
    expect(sel(twin([r]), rect)).toEqual({ ids: [], bays: [] })
  })

  it('R-aisle: a marquee inside an aisle gap only selects nothing (aisles are picked by their labels)', () => {
    const A = { id: 'A', type: 'rack_row', x: 0, y: 0, width: 670, height: 140, beams: [96, 96] }
    const B = { ...A, id: 'B', y: 560 }
    const aisle = { id: 'ai', type: 'aisle', row1Id: 'A', row2Id: 'B' }
    expect(objectsInMarquee([A, B, aisle], { x: 100, y: 300, width: 200, height: 100 })).toEqual([])
    expect(objectsInMarquee([A, B, aisle], { x: 100, y: 100, width: 200, height: 500 }).sort()).toEqual(['A', 'B'])
  })
})
