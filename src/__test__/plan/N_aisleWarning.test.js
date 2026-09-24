// Area N — red aisle warning and two-sided column clearance labels.
import { describe, it, expect } from 'vitest'
import { aisleColumnBlocks, MHE_PROFILES } from '../../generate/columnCheck'
import { clearanceMarks, aisleWarningRect, CLEAR_COLOR, SHORT_COLOR } from '../../canvas2/aisleMarks'
import { previewObjects } from '../../canvas2/dragPreview'
import { GS } from './fixtures'

/* Hand geometry, GS 40, reach (travelFt 8' = 320 px). Two single rows facing
 * each other, 670 px long (two 96" bays), 140 px (42") deep:
 *   A at y 0..140, B at y 820..960 -> aisle 140..820 (17').
 * One 12" column in the aisle at x 300..340, y 440..480:
 *   near (to A) = 440 - 140 = 300 px = 7.5'  -> under 8'
 *   far  (to B) = 820 - 480 = 340 px = 8.5'  -> fine
 * One side reaches travelFt, so the aisle is passable: no red.
 * Drag B up 1' (40 px): far = 300 px = 7.5' -> neither side reaches 8': red. */
const row = (id, y) => ({ id, type: 'rack_row', x: 0, y, width: 670, height: 140, beams: [96, 96], uprightWidth: 3, depthIn: 42 })
const A = row('A', 0), B = row('B', 820)
const COL = { x: 300, y: 440, w: 40, h: 40 }
const blocksFor = (racks, columns = [COL]) =>
  aisleColumnBlocks({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks

/* The same layout turned 90° (a vertical layout): every footprint and the
 * column with x and y swapped. A 90°-rotated rack's footprint is its box
 * spun about its centre, so A (footprint x 0..140, y 0..670) is stored as
 * width 670 x height 140 centred on (70, 335) -> x -265, y 265. */
const rot = (id, fx) => ({ ...row(id, 0), rotation: 90, x: fx + 70 - 335, y: 335 - 70 })
const Av = rot('A', 0), Bv = rot('B', 820)
const COLv = { x: 440, y: 300, w: 40, h: 40 }
const swap = (m) => JSON.parse(JSON.stringify(m, (k, v) =>
  v && typeof v === 'object' && 'x' in v && 'y' in v ? { ...v, x: v.y, y: v.x } : v))

describe('N — red aisle warning (neither side of a column reaches travelFt)', () => {
  it('N-one-side-ok: 7.5\' on one side, 8.5\' on the other -> no red', () => {
    const [b] = blocksFor([A, B])
    expect([b.nearClearFt, b.farClearFt]).toEqual([7.5, 8.5])
    expect(b.pinched).toBe(false)
    expect(aisleWarningRect(b, COL)).toBeNull()
  })

  it('N-both-ok: both sides exactly at travelFt (8\' and 8\') -> no red', () => {
    const [b] = blocksFor([A, B], [{ x: 300, y: 460, w: 40, h: 40 }])   // near 320 px = 8', far 320 px = 8'
    expect([b.nearClearFt, b.farClearFt]).toEqual([8, 8])
    expect(b.pinched).toBe(false)
    expect(aisleWarningRect(b, { x: 300, y: 460, w: 40, h: 40 })).toBeNull()
  })

  it('N-drag: dragging B up 1\' (live preview) turns the aisle red; dragging it back clears it', () => {
    const objects = [A, B]
    const mid = previewObjects(objects, { ids: new Set(['B']), dx: 0, dy: -40 })
    const [b] = blocksFor(mid)
    expect([b.nearClearFt, b.farClearFt]).toEqual([7.5, 7.5])
    expect(b.pinched).toBe(true)
    // shade: across the whole gap (140..780), along the run the column +- half the gap (320), clamped to the rows
    expect(aisleWarningRect(b, COL)).toEqual({ x: 0, y: 140, w: 660, h: 640 })
    const marks = clearanceMarks(b, COL)
    expect(marks.map(m => [m.side, m.color, m.label.text])).toEqual([
      ['near', SHORT_COLOR, "7.5' — under travel"],
      ['far', SHORT_COLOR, "7.5' — under travel"],
    ])
    // dragged back to where it was
    const back = previewObjects(objects, { ids: new Set(['B']), dx: 0, dy: 0 })
    const [c] = blocksFor(back)
    expect(c.pinched).toBe(false)
    expect(aisleWarningRect(c, COL)).toBeNull()
  })

  it('N-placed: right after placing a rack that pinches the aisle, it is red (no drag involved)', () => {
    const [b] = blocksFor([A, row('B', 780)])
    expect(b.pinched).toBe(true)
    expect(aisleWarningRect(b, COL)).not.toBeNull()
  })
})

describe('N — column clearance labels: both sides, one style, both orientations', () => {
  it('N-both-sides: a column in an aisle is labelled on BOTH sides, arrow from the column to each rack face', () => {
    const [b] = blocksFor([A, B])
    const marks = clearanceMarks(b, COL)
    expect(marks.map(m => [m.side, m.label.text, m.color])).toEqual([
      ['near', "7.5' clear", CLEAR_COLOR],
      ['far', "8.5' clear", CLEAR_COLOR],
    ])
    const near = marks[0], far = marks[1]
    expect(near.shaft[0]).toEqual({ x: 320, y: 440 })     // column's near edge, centred on the column
    expect(near.arrowhead[0]).toEqual({ x: 320, y: 140 }) // tip on A's face
    expect(far.shaft[0]).toEqual({ x: 320, y: 480 })
    expect(far.arrowhead[0]).toEqual({ x: 320, y: 820 })  // tip on B's face
  })

  it('N-same-style: the vertical layout draws the identical marks, rotated (x<->y), arrows not dashes', () => {
    const [h] = blocksFor([A, B])
    const [v] = aisleColumnBlocks({ racks: [Av, Bv], columns: [COLv], profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks
    expect(h.axis).toBe('y')
    expect(v.axis).toBe('x')
    expect([v.nearClearFt, v.farClearFt]).toEqual([7.5, 8.5])
    const hm = clearanceMarks(h, COL), vm = clearanceMarks(v, COLv)
    expect(vm).toEqual(swap(hm))
    for (const m of [...hm, ...vm]) {
      expect(m.style).toBe('arrow')
      expect(m.dash).toBeNull()
      expect(m.arrowhead).toHaveLength(3)
    }
  })

  it('N-same-style: the red shade is the same rect, rotated, in a vertical layout', () => {
    const mid = previewObjects([Av, Bv], { ids: new Set(['B']), dx: -40, dy: 0 })
    const [v] = aisleColumnBlocks({ racks: mid, columns: [COLv], profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks
    expect(v.pinched).toBe(true)
    expect(aisleWarningRect(v, COLv)).toEqual({ x: 140, y: 0, w: 640, h: 660 })
  })
})
