// Enlarged column markers stay inside the rack face their column sits in.
import { describe, it, expect } from 'vitest'
import { rackBandsWorld, columnMarkerRect } from '../canvas2/columnMarker'

/* Hand geometry, GS 40. Double row at (0, 0), 340 x 310 px: 42" + 9" + 42"
 * -> front face y 0..140, flue 140..170, back face 170..310. A 12" column is
 * 40 px. Marker floor 6 screen px: at zoom 0.1 that is 60 world px, at zoom
 * 0.02 it is 300 world px (deeper than a 140 px face). */
const MIN = 6
const dbl = { id: 'd', type: 'rack_double_row', x: 0, y: 0, width: 340, height: 310, flueSpaceIn: 9 }
const bands = rackBandsWorld([dbl], 40)
const col = (x, y) => ({ x, y, w: 40, h: 40 })
const span = (g, axis) => axis === 'y' ? [g.y, g.y + g.height] : [g.x, g.x + g.width]

describe('column marker — grows inside its own face, away from the flue', () => {
  it('front face, flush against the flue (y 100..140): centred growth would cross 140; drawn 80..140 instead', () => {
    const g = columnMarkerRect(col(50, 100), bands, 0.1, MIN)
    expect(span(g, 'y')).toEqual([80, 140])
    expect(span(g, 'x')).toEqual([40, 100])   // run axis untouched: still centred
  })

  it('back face, flush against the flue (y 170..210): drawn 170..230', () => {
    expect(span(columnMarkerRect(col(50, 170), bands, 0.1, MIN), 'y')).toEqual([170, 230])
  })

  it('when the floor is deeper than the face, it is anchored at the flue edge and grows outward', () => {
    expect(span(columnMarkerRect(col(50, 100), bands, 0.02, MIN), 'y')).toEqual([-160, 140])
    expect(span(columnMarkerRect(col(50, 170), bands, 0.02, MIN), 'y')).toEqual([170, 470])
  })

  it('at working zoom the marker is the column itself', () => {
    expect(span(columnMarkerRect(col(50, 100), bands, 1, MIN), 'y')).toEqual([100, 140])
  })

  it('a column in open floor keeps centred growth', () => {
    expect(span(columnMarkerRect(col(50, -200), bands, 0.1, MIN), 'y')).toEqual([-210, -150])
  })

  /* 90° about the centre (170, 155): local (lx, ly) -> world (325 - ly, lx - 15).
   * Front face (local y 0..140) -> world x 185..325, flue x 155..185. */
  it('rotated 90°: front face flush against the flue (x 185..225) is drawn 185..245, not across 185', () => {
    const rot = rackBandsWorld([{ ...dbl, rotation: 90 }], 40)
    expect(span(columnMarkerRect(col(185, 50), rot, 0.1, MIN), 'x')).toEqual([185, 245])
  })
})
