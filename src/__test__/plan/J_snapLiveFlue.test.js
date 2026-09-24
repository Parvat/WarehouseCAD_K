// TEST_PLAN.md §3J — snapping and live flue.
import { describe, it, expect } from 'vitest'
import { computeSmartGuides } from '../../canvas2/smartGuides'
import { computeLiveFlue, resolveFlueBase, flueCommitFields } from '../../canvas2/liveFlue'
import { expandColumnGrid } from '../../generate/columnCheck'
import { GS } from './fixtures'

// One 12" column, grid line at world (1000, 1000) px.
const colGrid = { id: 'cg', type: 'column_grid', x: 1000, y: 1000, spacingX: [], spacingY: [], columnW: GS, columnH: GS, colSizeIn: 12 }
// The box the renderer actually draws (ColumnGridShape -> expandColumnGrid).
const drawn = expandColumnGrid(colGrid, GS)[0]
const L = drawn.x, Rt = drawn.x + drawn.w, T = drawn.y, B = drawn.y + drawn.h
const CX = drawn.x + drawn.w / 2, CY = drawn.y + drawn.h / 2

const guideAt = (guides, axis, val) => guides.some(g => g.axis === axis && Math.abs(g.val - val) < 1e-6)

describe('J — snapping', () => {
  // A 200x80 row, far off on the other axis so only the axis under test can snap.
  const cases = [
    { dir: 'left',  rack: { x: 600,  y: 5000 }, axis: 'x', face: L,  edge: r => r.x + 200, move: (d) => [d, 0] },
    { dir: 'right', rack: { x: 1400, y: 5000 }, axis: 'x', face: Rt, edge: r => r.x,       move: (d) => [d, 0] },
    { dir: 'above', rack: { x: 5000, y: 600 },  axis: 'y', face: T,  edge: r => r.y + 80,  move: (d) => [0, d] },
    { dir: 'below', rack: { x: 5000, y: 1400 }, axis: 'y', face: B,  edge: r => r.y,       move: (d) => [0, d] },
  ]
  for (const c of cases) {
    it(`J-face: approaching from ${c.dir}, the edge snaps to that face and the guide sits on the column border`, () => {
      const rack = { id: 'r', type: 'rack_row', x: c.rack.x, y: c.rack.y, width: 200, height: 80 }
      const exact = c.face - c.edge(rack)      // delta that lands the edge on the face
      const [dx, dy] = c.move(exact + (exact > 0 ? -5 : 5))   // 5px short
      const { guides, snapDx, snapDy } = computeSmartGuides(['r'], [colGrid, rack], GS, 1, dx, dy)
      expect(c.axis === 'x' ? snapDx : snapDy).toBeCloseTo(exact, 9)
      expect(guideAt(guides, c.axis, c.face)).toBe(true)
      // not inside the column: neither the centre line nor the opposite face
      const opposite = c.axis === 'x' ? (c.face === L ? Rt : L) : (c.face === T ? B : T)
      expect(guideAt(guides, c.axis, c.axis === 'x' ? CX : CY)).toBe(false)
      expect(guideAt(guides, c.axis, opposite)).toBe(false)
    })
  }

  it('J-center: row midline snaps to a lone column\'s centre with no other row present', () => {
    const rack = { id: 'r', type: 'rack_row', x: 300, y: 5000, width: 200, height: 80 }
    const exact = CX - (rack.x + 100)
    const { guides, snapDx } = computeSmartGuides(['r'], [colGrid, rack], GS, 1, exact - 5, 0)
    expect(snapDx).toBeCloseTo(exact, 9)
    expect(guideAt(guides, 'x', CX)).toBe(true)
  })
})

describe('J — live flue', () => {
  const colsAt = (x, y) => [{ ...colGrid, x, y }]
  // Pair: two 42" rows (140px each) + flue.
  const pairObj = (flueSpaceIn, extra = {}) => ({
    type: 'rack_double_row', x: 0, y: 0, width: 200,
    height: 140 * 2 + (flueSpaceIn / 12) * GS, flueSpaceIn, ...extra,
  })

  /** One drag: resolve the base at pick-up, evaluate the flue with the
   *  object's centre at (cx, cy), return the fields the drag would commit. */
  function drag(obj, cx, cy, columnGrids) {
    const base = resolveFlueBase(obj, GS)
    const live = computeLiveFlue(base, cx, cy, columnGrids, GS)
    const lastFrame = { ...obj, flueSpaceIn: live.targetFlueIn, height: live.targetHeight }
    return flueCommitFields(lastFrame, base)
  }

  it('J-widen: dragging a pair over a column widens the flue to the column size (12")', () => {
    const after = drag(pairObj(9), 1000, 1000, colsAt(1000, 1000))
    expect(after.flueSpaceIn).toBe(12)
  })

  it('J-shrink: dragging away returns it to 9" (hand-placed rack)', () => {
    const onCol = drag(pairObj(9), 1000, 1000, colsAt(1000, 1000))
    expect(onCol.flueSpaceIn).toBe(12)
    const away = drag(onCol, 3000, 3000, colsAt(1000, 1000))   // a SECOND drag, after the first committed
    expect(away.flueSpaceIn).toBe(9)
    expect(away.height).toBeCloseTo(140 * 2 + (9 / 12) * GS, 9)
  })

  it('J-shrink: a generated rack placed widened (flueSpaceIn 12, flueBaseIn 9) shrinks to 9" on its first drag away', () => {
    const generated = pairObj(12, { flueBaseIn: 9 })
    const away = drag(generated, 3000, 3000, colsAt(1000, 1000))
    expect(away.flueSpaceIn).toBe(9)
    const back = drag(away, 1000, 1000, colsAt(1000, 1000))
    expect(back.flueSpaceIn).toBe(12)
  })

  it('J-shrink: flueBaseIn stays 9" through a drag that ends widened', () => {
    const onCol = drag(pairObj(9), 1000, 1000, colsAt(1000, 1000))
    expect(onCol.flueSpaceIn).toBe(12)
    expect(onCol.flueBaseIn).toBe(9)
  })

  it('J-rotated: a 90°-rotated pair widens over a column in its rotated flue, and shrinks away from it', () => {
    // Rotated 90°, the flue band runs along world X through the centre, so a
    // column offset 50px along world Y (the rotated run axis) is in the gap.
    const rotated = pairObj(9, { rotation: 90 })
    const onCol = drag(rotated, 1000, 1000, colsAt(1000, 1050))
    expect(onCol.flueSpaceIn).toBe(12)
    const away = drag(onCol, 3000, 3000, colsAt(1000, 1050))
    expect(away.flueSpaceIn).toBe(9)
  })
})
