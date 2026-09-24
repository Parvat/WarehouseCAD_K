// Shared fixtures for the TEST_PLAN.md suite. Only INPUTS live here — every
// expected value is written inline in the test that asserts it, taken from
// TEST_PLAN.md (see CANVAS2_TESTS.md for the mapping).
import { sizingSheetLayout, columnGridObject } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { expandColumnGrid, rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'

export const GS = 40   // px per foot, store.gridSize

// TEST_PLAN.md §2 reference cases.
export const R = {
  R1: { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'reach',          orientation: 'horizontal' },
  R2: { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'reach',          orientation: 'vertical' },
  R3: { lengthFt: 240, widthFt: 120, gridXFt: 50, gridYFt: 54, mhe: 'reach',          orientation: 'horizontal' },
  R4: { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'counterbalance', orientation: 'horizontal' },
  R5: { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'vna',            orientation: 'horizontal' },
}

// Every reference case, in both orientations and both "Columns along wall"
// states — for the property checks that must hold for any layout.
export const ALL_CASES = Object.entries(R).flatMap(([id, brief]) =>
  ['horizontal', 'vertical'].flatMap(orientation =>
    [true, false].map(columnsAlongWall => ({
      label: `${id} ${orientation} wall=${columnsAlongWall ? 'Yes' : 'No'}`,
      brief: { ...brief, orientation, columnsAlongWall, rackType: 'rack_double_row' },
    }))))

/** The generated layout exactly as buildQueue assembles it (same generator,
 *  same placementToObject, same grid object), at a zero building origin. */
export function generate(brief) {
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map(placementToObject)
  const grid = columnGridObject(brief, 0, 0)
  const columns = grid ? expandColumnGrid(grid, GS) : []
  return { racks, grid, columns }
}

/** A rack's depth-axis bands in WORLD px — the same front-face / flue /
 *  back-face split columnCheck.js reads (depthIn, flueSpaceIn), measured
 *  along whichever world axis the rack's depth actually runs. */
export function rackBands(r) {
  const f = rackFootprint(r)
  const depthAlongY = !f.rotated
  const start = depthAlongY ? f.y : f.x
  const end = depthAlongY ? f.y + f.h : f.x + f.w
  const runLo = depthAlongY ? f.x : f.y
  const runHi = depthAlongY ? f.x + f.w : f.y + f.h
  if (r.type !== 'rack_double_row') {
    return { depthAlongY, runLo, runHi, bands: [{ kind: 'face', lo: start, hi: end }] }
  }
  const depthPx = (r.depthIn / 12) * GS
  const fluePx = (r.flueSpaceIn / 12) * GS
  return {
    depthAlongY, runLo, runHi,
    bands: [
      { kind: 'face', lo: start, hi: start + depthPx },
      { kind: 'flue', lo: start + depthPx, hi: start + depthPx + fluePx },
      { kind: 'face', lo: start + depthPx + fluePx, hi: end },
    ],
  }
}

export const EPS = 1e-6
