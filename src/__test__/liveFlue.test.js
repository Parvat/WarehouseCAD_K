import { describe, it, expect } from 'vitest'
import { computeLiveFlue } from '../canvas2/liveFlue'

const GS = 40

/* A rack_double_row at rest: 200px wide (5ft), depth built from two 42in
 * (140px) rows + a 9in (30px) default flue = 310px total height. Centred at
 * world (400, 400) when undragged (x=300,y=245). */
const flueBase = { flueSpaceIn: 9, height: 310, width: 200, rotation: 0 }

/* A single 12" column, grid-line at (400,400) -> true rendered face box
 * 380-420 both axes (expandColumnGrid centres each square on its line). */
const columnAt = (x, y, colSizeIn = 12) => [{
  id: 'cg1', type: 'column_grid',
  x, y, spacingX: [], spacingY: [], colSizeIn,
  columnW: (colSizeIn / 12) * GS, columnH: (colSizeIn / 12) * GS,
}]

describe('liveFlue — computeLiveFlue', () => {
  it('stays at the base flue when no column is anywhere near', () => {
    const r = computeLiveFlue(flueBase, 400, 400, columnAt(2000, 2000), GS)
    expect(r.targetFlueIn).toBe(9)
    expect(r.targetHeight).toBe(310)
  })

  it('widens to the column size when a column sits in the flue gap', () => {
    // Object centred at (400,400): flue band is the middle 30px, y in
    // [385,415]. A column centred exactly there is squarely in the gap.
    const r = computeLiveFlue(flueBase, 400, 400, columnAt(400, 400, 12), GS)
    expect(r.targetFlueIn).toBe(12)
    // row depth stays fixed (140px each): new height = 140*2 + 12/12*40 = 320
    expect(r.targetHeight).toBe(320)
  })

  it('never shrinks the flue below the object\'s own configured base, even for a smaller column', () => {
    const smallBase = { ...flueBase, flueSpaceIn: 14 }   // dealer's own flue already wider than a 12" column
    const r = computeLiveFlue(smallBase, 400, 400, columnAt(400, 400, 12), GS)
    expect(r.targetFlueIn).toBe(14)   // max(14, 12) = 14, not shrunk to 12
  })

  it('picks the LARGEST overlapping column when more than one is in the gap', () => {
    const cols = [...columnAt(390, 400, 12), ...columnAt(410, 400, 18)]
    const r = computeLiveFlue(flueBase, 400, 400, cols, GS)
    expect(r.targetFlueIn).toBe(18)
  })

  it('does NOT widen for a column sitting in one of the ROWS instead of the flue gap', () => {
    // Top row occupies y in [245, 385) relative to this box (rowH=140,
    // flue starts at 385). A column centred well inside the row, not the
    // gap, must not trigger widening.
    const r = computeLiveFlue(flueBase, 400, 400, columnAt(400, 300, 12), GS)
    expect(r.targetFlueIn).toBe(9)
    expect(r.targetHeight).toBe(310)
  })

  it('does NOT widen for a column off to the side, outside the rack\'s own width', () => {
    const r = computeLiveFlue(flueBase, 400, 400, columnAt(700, 400, 12), GS)
    expect(r.targetFlueIn).toBe(9)
  })

  it('releases cleanly — widens while over the column, reverts the instant the centre moves away', () => {
    const over = computeLiveFlue(flueBase, 400, 400, columnAt(400, 400, 12), GS)
    expect(over.targetFlueIn).toBe(12)
    const movedAway = computeLiveFlue(flueBase, 800, 400, columnAt(400, 400, 12), GS)
    expect(movedAway.targetFlueIn).toBe(9)
    expect(movedAway.targetHeight).toBe(310)
  })

  it('keeps the box symmetric around the live centre — x/y both shift by half the flue growth', () => {
    const base = computeLiveFlue(flueBase, 400, 400, columnAt(2000, 2000), GS)
    const widened = computeLiveFlue(flueBase, 400, 400, columnAt(400, 400, 12), GS)
    expect(widened.targetHeight - base.targetHeight).toBe(10)   // (12-9)/12*40 = 10px growth
    expect(base.y - widened.y).toBe(5)      // top moved up by half the growth
    expect(widened.x).toBe(base.x)          // x (run axis) never changes
  })

  it('accounts for rotation — a 90°-rotated rack tests against its true (rotated) flue zone, not the unrotated one', () => {
    const rotated = { ...flueBase, rotation: 90 }
    // Unrotated, the narrow flue band (±15px) runs along local Y and the
    // wide run band (±100px) along local X. Rotated 90°, those swap in
    // world space: a column 50px along world Y from the centre now falls
    // in the (wide, rotated-in) run tolerance on one transformed axis and
    // the (narrow) flue tolerance on the other — it overlaps ONLY because
    // the rotation was actually applied; ignoring `rotation` entirely
    // (a plausible bug: forgetting to thread it through) would test this
    // same offset against the UNROTATED band and find no overlap, since
    // 50px clears the unrotated flue's own ±15px tolerance.
    const alongWorldY = computeLiveFlue(rotated, 400, 400, columnAt(400, 450, 12), GS)
    expect(alongWorldY.targetFlueIn).toBe(12)
    // The mirror case: 50px along world X clears the ROTATED flue band's
    // tolerance (it would only have overlapped pre-rotation).
    const alongWorldX = computeLiveFlue(rotated, 400, 400, columnAt(450, 400, 12), GS)
    expect(alongWorldX.targetFlueIn).toBe(9)
  })
})
