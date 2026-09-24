// Area Q — an aisle is picked by its labels only; its empty floor grabs the building.
import { describe, it, expect } from 'vitest'
import { hitTest, aisleLabelLayout } from '../../canvas2/hitTest'
import { GS } from './fixtures'

/* A building 0..2000 x 0..1200 px with two facing rows inside it:
 *   A: x 100..770, y 200..340   B: x 100..770, y 760..900
 * The aisle between them is x 100..770, y 340..760 (670 px = 16.75' long,
 * under 20', so ONE label station at the middle of the run, x 435; the pill
 * sits at the middle of the gap, y 550). */
const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 2000, height: 1200,
  fpVerts: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1200 }, { x: 0, y: 1200 }] }
const row = (id, x, y, extra = {}) => ({ id, type: 'rack_row', x, y, width: 670, height: 140, beams: [96, 96], uprightWidth: 3, parentId: 'fp', ...extra })
const A = row('A', 100, 200), B = row('B', 100, 760)
const aisle = { id: 'ai', type: 'aisle', row1Id: 'A', row2Id: 'B', parentId: 'fp' }
const OBJS = [fp, A, B, aisle]
/* hitTest only picks objects on a visible, unlocked layer */
const LAYERS = [{ id: 'L', visible: true, locked: false }]
const onLayer = (objs) => objs.map(o => ({ ...o, layerId: 'L' }))
const pick = (x, y, objs = OBJS) => hitTest(onLayer(objs), LAYERS, x, y, 1, GS)

describe('Q — aisle picking', () => {
  it('Q-layout: one label station mid-run (x 435), pill mid-gap (y 550), text 10\' 6"', () => {
    const L = aisleLabelLayout(aisle, OBJS, GS)
    expect(L.isHoriz).toBe(true)
    expect(L.positions).toEqual([435])
    expect([L.gapLo, L.gapHi, L.labelMid]).toEqual([340, 760, 550])
    expect(L.text).toBe(`10' 6"`)
  })

  it('Q-floor: a press on empty aisle floor picks the BUILDING, not the aisle', () => {
    for (const [x, y] of [[200, 450], [700, 700], [300, 360], [600, 740]]) {
      expect(pick(x, y)).toBe('fp')
    }
  })

  it('Q-label: a press on the label pill picks the aisle', () => {
    expect(pick(435, 550)).toBe('ai')
    expect(pick(450, 553)).toBe('ai')   // inside the pill's text width
  })

  it('Q-arrow: a press on the dimension arrow across the gap picks the aisle', () => {
    expect(pick(437, 400)).toBe('ai')   // 2 px off the arrow, well above the pill
    expect(pick(446, 400)).toBe('fp')   // 11 px off it: floor again
  })

  it('Q-racks: the rows themselves still pick as racks', () => {
    expect(pick(435, 270)).toBe('A')
    expect(pick(435, 830)).toBe('B')
  })

  /* Rotated 90° (a vertical layout): the gap runs along X, the arrow is
   * horizontal. A footprint x 200..340, y 100..770; B x 760..900. */
  it('Q-rotated: same rule turned 90° — floor picks the building, the label picks the aisle', () => {
    const rot = (id, fx) => ({ ...row(id, 0, 0), rotation: 90, x: fx + 70 - 335, y: 100 + 335 - 70 })
    const objs = [fp, rot('A', 200), rot('B', 760), aisle]
    const L = aisleLabelLayout(aisle, objs, GS)
    expect(L.isHoriz).toBe(false)
    expect([L.gapLo, L.gapHi, L.labelMid, L.positions[0]]).toEqual([340, 760, 550, 435])
    expect(pick(550, 435, objs)).toBe('ai')     // the pill
    expect(pick(400, 437, objs)).toBe('ai')     // the arrow
    expect(pick(450, 200, objs)).toBe('fp')     // empty floor
  })
})
