// generate/wallRun.js — a single row flush on a wall: ONE rack per stretch of wall, on one standard-bay grid,
// not broken where a cross-aisle meets it and exempt from the max run (a zone, the end of the stretch or the
// floor still end it — the caller hands in the stretches). Its bays sit on the grid the layout fixes (its
// first run's uprights, carried on), so moving a stretch's ends only adds or drops bays at the ends.
// Shared by Fill racking (fillRacking.js, patternFill) and Generate (sizingLayout.js, sizingSheetLayout), so
// the two lay the same wall rows. Imports nothing.
//
// It also holds THE on-wall rule (wallLineFor): an edge that stops short of a wall by no more than a rack's depth —
// 3 ft 6 in for the standard 42" frame, a strip too thin to hold any rack — counts as on that wall. Fill's and racking
// areas' box snap (fillRacking.js snapToWalls) and the frame-depth change (utils/rackDepth.js wallSideOf) both ask it.

/** How far short of a wall an edge may stop and still be on it, by default: a 42" frame's depth (3 ft 6 in). */
export const WALL_REACH_FT = 3.5
/** The reach for a rack `depthIn` deep: its own depth (ft) — WALL_REACH_FT when it has none. */
export const wallReachFt = (depthIn) => (depthIn > 0 ? depthIn / 12 : WALL_REACH_FT)
/** The on-wall rule: the wall line an edge at `v` counts as on — the nearest of `lines` beyond it (`dir` −1: below
 *  `v`, +1: above) within `reach` (the same units) — or null when none is that near. */
export function wallLineFor(v, lines, dir, reach) {
  const r = reach + 1e-6
  const near = lines.filter(l => (dir < 0 ? l < v - 1e-6 && l >= v - r : l > v + 1e-6 && l <= v + r))
  return near.length ? (dir < 0 ? Math.max(...near) : Math.min(...near)) : null
}

/** The whole bays of one wall stretch [a, c] (ft along the run) on the grid anchored at g0 with bay pitch
 *  `pitch` (beam + one upright) and `bayFt` (one bay with both its uprights): { r0, n } — the first upright's
 *  run position and the bay count — or null when no whole bay fits. */
export function wallRun(a, c, g0, pitch, bayFt) {
  const kLo = Math.ceil((a - g0) / pitch - 1e-9), kHi = Math.floor((c - g0 - bayFt) / pitch + 1e-9)
  return kHi < kLo ? null : { r0: g0 + kLo * pitch, n: kHi - kLo + 1 }
}
