// palletFit.js — how many pallet positions fit across one beam, and the spacing that decides it. On its own so
// capacity.js and bayLedger.js can both use it without importing each other (capacity.js re-exports it).
// Imports nothing.

/* Industry-standard selective-rack convention (verified): a pallet's LOADING
 * FACE — its narrower dimension, GMA default 40" — runs ACROSS the beam; the
 * deeper dimension (default 48") runs INTO the frame, overhanging it by
 * design (~3" each side on a 42" frame — not a fit problem, standard
 * practice). `palletWIn` on a rack object is always this loading-face width,
 * never the depth; there is no facing/orientation choice to make, this is
 * the one standard.
 *
 * Spacing along the beam is the industry standard: 3" between a pallet and
 * each upright, 4" between adjacent pallets, so N pallets fit when
 *   N×face + (N−1)×4" + 2×3" ≤ beam.
 * The SAME numbers drive counting, which position a column blocks, and the
 * blocked-position mark, so all three live here. */
export const UPRIGHT_CLEARANCE_IN = 3
export const PALLET_GAP_IN = 4

/** How many pallet positions fit across one beam. */
export function positionsPerBeam(beamIn, palletFaceIn) {
  if (!(beamIn > 0) || !(palletFaceIn > 0)) return 0
  const n = Math.floor((beamIn - 2 * UPRIGHT_CLEARANCE_IN + PALLET_GAP_IN) / (palletFaceIn + PALLET_GAP_IN))
  return Math.max(0, n)
}
