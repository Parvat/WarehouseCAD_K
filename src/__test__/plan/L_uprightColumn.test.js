// Area L — a column on an upright frame is flagged (never moved).
import { describe, it, expect } from 'vitest'
import { checkColumns, columnsOnUprights, MHE_PROFILES } from '../../generate/columnCheck'
import { GS } from './fixtures'

/* Hand geometry, GS = 40 px/ft. Two 96" bays on 3" uprights:
 *   frames (uprightXs) at x 0..10, 330..340, 660..670 px   (3" = 10 px)
 *   width (3 + 96 + 3 + 96 + 3)" = 201" = 670 px
 * Single row 42" deep = 140 px. Double row 42 + 9 + 42 = 93" = 310 px:
 *   front band y 0..140, flue 140..170, back band 170..310.
 * A 12" column is 40 x 40 px. 1" = 40/12 = 3.333 px. */
const ONE_IN = GS / 12
const base = { x: 0, y: 0, width: 670, beams: [96, 96], uprightWidth: 3, palletWIn: 40, levels: 1, depthIn: 42 }
const single = (extra = {}) => ({ id: 's', type: 'rack_row', ...base, height: 140, ...extra })
const double = (extra = {}) => ({ id: 'd', type: 'rack_double_row', ...base, height: 310, flueSpaceIn: 9, ...extra })
const col = (x, y) => ({ x, y, w: 40, h: 40 })
const hits = (racks, columns) => columnsOnUprights({ racks, columns, gridSize: GS })
  .map(({ rackId, columnIndex, upright, faces, bays }) => ({ rackId, columnIndex, upright, faces, bays }))

describe('L — column on an upright frame', () => {
  it('L-interior: a column over the frame between bays 1 and 2 (x 330..340) is flagged, with both bays', () => {
    // column x 320..360 overlaps the frame at 330..340
    expect(hits([single()], [col(320, 50)])).toEqual([{ rackId: 's', columnIndex: 0, upright: 1, faces: [0], bays: [0, 1] }])
  })

  it('L-clear: a column 1" clear of the frame is not flagged — either side', () => {
    // right edge 1" short of 330
    expect(hits([single()], [col(330 - ONE_IN - 40, 50)])).toEqual([])
    // left edge 1" past 340
    expect(hits([single()], [col(340 + ONE_IN, 50)])).toEqual([])
  })

  it('L-touch: a column exactly touching the frame (no overlap) is not flagged', () => {
    expect(hits([single()], [col(290, 50)])).toEqual([])   // 290..330
  })

  it('L-end: a column over an end frame names the one bay it closes', () => {
    expect(hits([single()], [col(-20, 50)])).toEqual([{ rackId: 's', columnIndex: 0, upright: 0, faces: [0], bays: [0] }])
    expect(hits([single()], [col(650, 50)])).toEqual([{ rackId: 's', columnIndex: 0, upright: 2, faces: [0], bays: [1] }])
  })

  it('L-double: frames exist per face and never across the flue', () => {
    // back band only (y 200..240)
    expect(hits([double()], [col(320, 200)])).toEqual([{ rackId: 'd', columnIndex: 0, upright: 1, faces: [1], bays: [0, 1] }])
    // wholly inside the 9" flue line? a 12" column can't be — y 135..175 clips both bands
    expect(hits([double()], [col(320, 135)])).toEqual([{ rackId: 'd', columnIndex: 0, upright: 1, faces: [0, 1], bays: [0, 1] }])
    // a 12" flue holds a 12" column exactly: y 140..180 in a 12" flue (bands 0..140, 180..320) touches neither
    expect(hits([double({ flueSpaceIn: 12, height: 320 })], [col(320, 140)])).toEqual([])
  })

  /* 90° about the centre (335, 155): local (lx, ly) -> world (490 - ly, lx - 180).
   * Frame 1 (local x 330..340) -> world y 150..160; front band (local y
   * 0..140) -> world x 350..490. */
  it('L-rotated: a 90° double row is checked on its rotated frames', () => {
    const rot = double({ rotation: 90 })
    expect(hits([rot], [col(400, 135)])).toEqual([{ rackId: 'd', columnIndex: 0, upright: 1, faces: [0], bays: [0, 1] }])
    // mid-bay (local x 200..240 -> world y 20..60): no frame there
    expect(hits([rot], [col(400, 20)])).toEqual([])
  })

  it('L-check: checkColumns reports it (uprightHits + summary count) without moving anything', () => {
    const r = single()
    const before = JSON.stringify(r)
    const res = checkColumns({ racks: [r], columns: [col(320, 50), col(100, 300)], profile: MHE_PROFILES.reach, gridSize: GS })
    expect(res.uprightHits.map(h => [h.rackId, h.columnIndex, h.upright])).toEqual([['s', 0, 1]])
    expect(res.summary.columnsOnUprights).toBe(1)
    expect(JSON.stringify(r)).toBe(before)
  })
})
