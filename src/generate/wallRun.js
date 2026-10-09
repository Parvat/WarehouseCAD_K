// generate/wallRun.js — a single row flush on a wall: ONE rack per stretch of wall, on one standard-bay grid,
// not broken where a cross-aisle meets it and exempt from the max run (a zone, the end of the stretch or the
// floor still end it — the caller hands in the stretches). Its bays sit on the grid the layout fixes (its
// first run's uprights, carried on), so moving a stretch's ends only adds or drops bays at the ends.
// Shared by Fill racking (fillRacking.js, patternFill) and Generate (sizingLayout.js, sizingSheetLayout), so
// the two lay the same wall rows. Imports nothing.

/** The whole bays of one wall stretch [a, c] (ft along the run) on the grid anchored at g0 with bay pitch
 *  `pitch` (beam + one upright) and `bayFt` (one bay with both its uprights): { r0, n } — the first upright's
 *  run position and the bay count — or null when no whole bay fits. */
export function wallRun(a, c, g0, pitch, bayFt) {
  const kLo = Math.ceil((a - g0) / pitch - 1e-9), kHi = Math.floor((c - g0 - bayFt) / pitch + 1e-9)
  return kHi < kLo ? null : { r0: g0 + kLo * pitch, n: kHi - kLo + 1 }
}
