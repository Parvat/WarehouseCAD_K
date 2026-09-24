// sizingLayout.js
// ─────────────────────────────────────────────────────────────────────────────
// The sizing-sheet layout — the shape a warehouse is actually drawn in, rather
// than the uniform block the Phase-1 stub produced:
//
//   ┌──────────────────────────────────────────────┐
//   │  ────────────  │  ────────────                │  single row, on the wall
//   │                 ▲                              │  12.5' aisle
//   │  ════════════  │  ════════════                │  double row, 9" flue
//   │             cross-aisle                        │
//   │  ────────────  │  ────────────                │  single row, on the wall
//   └──────────────────────────────────────────────┘
//
// Racking fills the FULL building rectangle on the run axis (minus a small
// wall clearance each end) — no baked-in staging/dock carve-out. That zone
// is coming back later as a separate, draggable object; generation doesn't
// reserve space for it for now (see generateFixtures below).
//
// Pure geometry: feet in, placements out. No React, no store — the same
// contract stubGenerateLayout has, so it drops straight into
// generateAndPlace(brief, thisFunction).
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_RULES } from '../rules/defaults'

const GS      = 40   // px per foot — v16b convention (store.gridSize)
const FLUE_IN = 9    // back-to-back flue gap for double rows
const UP_IN   = 3    // upright width

/* No cap on rows, bays or segment length. There used to be two (40 rows,
   40 bays per segment) to bound the shape count, but they were applied to
   the GEOMETRY: a 1080x410 building stopped filling two-thirds of the way
   along and dumped the rest into one 341' "last aisle" (vertical) or a 418'
   "cross-aisle" (horizontal). Drawing cost is already bounded another way —
   each segment is one object and its bays are one path (rackOps) — so the
   layout always runs wall to wall. The only loop limit left is a guard
   against an endless walk, sized from the building so it can never cut a
   real layout short (TEST_PLAN.md §2b, scale sanity). */

/** Bays that fit in a clear run, given the shared-upright layout
 *  `upright | beam | upright | beam | upright`. */
export function baysInRun(runFt, beamIn = 96, upIn = UP_IN) {
  const runIn = runFt * 12
  return Math.max(0, Math.floor((runIn - upIn) / (beamIn + upIn)))
}

/* A column's own physical footprint, half-height in feet — colSizeIn=12in
 * default (columnCheck.js's expandColumnGrid), centred on its grid line. */
const COL_HALF_FT  = 0.5
const COL_WIDTH_FT = 2 * COL_HALF_FT

/** Row bands down the building's depth (Y) — PP's own hand-placement
 *  algorithm (GENERATOR_SPEC_V10.md), not a re-derivation. A single forward
 *  walk from the near wall to the far wall that ALTERNATES placing an
 *  AISLE (Step 2) and a PAIR/single (Step 3), each one absorbing whatever
 *  column lands where it goes:
 *    - a column where the AISLE goes → absorbed into the aisle (widens it).
 *    - a column where the PAIR goes → seated in the flue if it fits (free,
 *      always attempted first), otherwise absorbed into the rack itself as
 *      a bay-column (−1/level, row kept, pick positions lost there). No
 *      customer toggle, no row-dropping — BUG 60 removed the old
 *      allowColumnInRack preference: the generator places columns where
 *      they naturally land and the dealer adjusts by moving rows on the
 *      canvas afterward if they want something different.
 *  Wall rows single (42in reference depth); interior back-to-back pairs.
 *  `travelFt` is the truck's drive-only (not pick) minimum — a
 *  per-forklift placeholder (~8ft) until real numbers land; only used when
 *  Step 2 has to absorb a too-close column into the aisle itself.
 *
 *  `colSizeIn` (BUG 55) is the SAME column footprint `columnGridObject`
 *  draws (brief.colSizeIn, default 12") — threaded through here (not just
 *  hardcoded to the module's own COL_HALF_FT/COL_WIDTH_FT, which stayed
 *  12"-shaped) so a pair's flue-widening math sizes itself to the REAL
 *  column, not an assumed one.
 *
 *  `wallClearFt` (BUG 64) — the gap between the near/far walls and where
 *  the wall rows actually start, the SAME number `rowSegments`' own
 *  `endClearFt` already applies to the run axis (one "wall clearance"
 *  input, both axes — see `sizingSheetLayout`'s own wiring). Defaults to
 *  0 so a direct caller that predates this (a test, say) keeps the old
 *  flush-to-the-wall behaviour unless it opts in.
 */
export function rowBands(widthFt, {
  rackType, depthIn, aisleFt, flueIn = FLUE_IN, gridYFt,
  travelFt = 8, gridOffsetFt = 0, gridMaxFt = Infinity, colSizeIn = 12, wallClearFt = 0,
}) {
  const singleFt = depthIn / 12
  const pairFt   = (2 * depthIn + flueIn) / 12
  const midFt    = rackType === 'rack_double_row' ? pairFt : singleFt
  const flueFt   = flueIn / 12
  const bands    = []
  if (widthFt < singleFt + 2 * wallClearFt) return bands

  /* `wallClearFt` (default 0 — an explicit opt-in, not a silent behaviour
   * change for any existing direct caller that doesn't pass it) offsets
   * BOTH the near and far wall rows off their own wall line by the same
   * gap `rowSegments`' own `endClearFt` already gives the run axis — one
   * "wall clearance" number, both axes. */
  const bottomY = widthFt - singleFt - wallClearFt
  const hasGrid = gridYFt > 0
  const colHalfFt  = colSizeIn / 24   // half the REAL column width, not the 12"-assumed module constant
  /* Endless-walk guard, never a layout limit: every round that doesn't
     break places a row at least `singleFt` deep, so no real walk takes
     more rounds than the building has single-row depths. */
  const walkGuard = Math.ceil(widthFt / singleFt) + 2
  const colWidthFt = 2 * colHalfFt

  /* BUG 59 — the flue width a pair actually needs to physically hold a
   * column standing in it: exactly the column's own real width, no added
   * clearance (that's the dealer's choice, via the flue-spacing property,
   * not baked into the generator) — floored at the standard flue (a pair
   * with no column in its flue keeps the standard flue — never widens for
   * nothing). A 12" column seated in the flue makes the flue exactly 12",
   * a flush fit, not 16.8" (BUG 55's old +4.8" clearance, removed). */
  const flueInForColumn = () => Math.max(flueIn, colSizeIn)

  /* BUG 56 — best-achievable flue-seat for a column at `colY`, given the
   * pair can't start any earlier than `minStart` (the aisle just placed —
   * never shrunk to chase a column) or any later than the far wall allows.
   * The naive version of this (BUG 55's own "any strategy" fallback)
   * widened the flue in place without ever moving `start`, so a column
   * whose ideal centred position fell BEFORE `minStart` ended up with the
   * flue widened the wrong way — half the column still inside the rack
   * face it was supposed to be seated clear of. This clamps `start` to
   * the closest reachable point to that ideal, then — critically —
   * VERIFIES the column's full footprint actually lands inside the
   * resulting flue before accepting it. A column is either FULLY seated
   * or not seated at all; there is no partial-credit "closer than before"
   * result, because a column straddling a rack edge is worse than one
   * plainly absorbed into the rack body (the existing, accepted,
   * pick-position-costing bay-column path) — that one at least doesn't
   * pretend to be collision-free. Returns null when even the closest
   * reachable flue can't fully contain the column, so the caller falls
   * through to that existing path instead. */
  const seatColumnInFlue = (colY, minStart) => {
    const neededFlueIn = flueInForColumn()
    const neededFlueFt = neededFlueIn / 12
    const neededMidFt  = (2 * depthIn + neededFlueIn) / 12
    const maxStart = bottomY - neededMidFt
    if (maxStart < minStart) return null   // doesn't even fit standing alone
    const idealStart = colY - singleFt - neededFlueFt / 2
    const start   = Math.min(maxStart, Math.max(minStart, idealStart))
    const flueLo  = start + singleFt, flueHi = flueLo + neededFlueFt
    const colLo   = colY - colHalfFt, colHi  = colY + colHalfFt
    if (colLo < flueLo - 1e-9 || colHi > flueHi + 1e-9) return null   // still doesn't fully contain it
    return { start, flueIn: neededFlueIn, midFt: neededMidFt }
  }

  /* BUG 57 — the invariant is EITHER fully flue-seated OR fully inside one
   * rack face, never straddling the line between them. When even the
   * closest-reachable flue can't fully contain a column (`seatColumnInFlue`
   * returns null), the pair used to just sit at its plain/standard
   * position anyway, leaving that column exactly on the face/flue boundary
   * — 6" in the rack, 6" in the flue, an uncosted straddle nothing else
   * downstream understood. This shifts the (still-standard-flue) pair so
   * the SAME column lands fully inside one
   * face instead — a clean bay-column, checkColumns' own existing
   * absorb-into-the-rack-body cost, just guaranteed collision-free rather
   * than half-committed. Tries both faces, each clamped to the closest
   * reachable centred position exactly like seatColumnInFlue, and prefers
   * whichever needs the smaller shift off `minStart` — least disruptive.
   * A face only needs `colWidthFt` of clearance (vs a flue's own width
   * plus clearance on both sides), so whenever flue-seating was merely
   * boundary-constrained rather than impossible outright, one of the two
   * faces almost always has room; if truly neither does, this returns
   * null and the column is left exactly where BUG 55/56 already put it —
   * a straddle in that residual case is a genuine "nowhere left to put
   * it" rather than an oversight. */
  const seatColumnInFace = (colY, minStart) => {
    const maxStart = bottomY - midFt
    if (maxStart < minStart) return null
    const tryFace = (faceOffset) => {
      const idealStart = colY - faceOffset - singleFt / 2
      const start = Math.min(maxStart, Math.max(minStart, idealStart))
      const faceLo = start + faceOffset, faceHi = faceLo + singleFt
      const colLo = colY - colHalfFt, colHi = colY + colHalfFt
      if (colLo < faceLo - 1e-9 || colHi > faceHi + 1e-9) return null
      return { start, shift: Math.abs(start - minStart) }
    }
    const candidates = [tryFace(0), tryFace(singleFt + flueFt)].filter(Boolean)
    if (!candidates.length) return null
    candidates.sort((a, b) => a.shift - b.shift)
    return { start: candidates[0].start }
  }

  /* No column may straddle a row's edge or an internal face/flue boundary
   * (TEST_PLAN.md §3C, matrix rule 4). The seating steps above cover a column
   * that lands in a flue or a face; this catches what they can't — above all
   * a column whose far edge just clips a row's FRONT face (the column sits at
   * the very end of the aisle). `cuts` are the row's internal boundaries,
   * offsets from its start: [] for a single, [face, face + flue] for a pair.
   * Returns a straddling column's centre, or null. */
  const straddlingColumn = (start, depthFt, cuts) => columnsOverlapping(start, start + depthFt).find(colY => {
    const lo = colY - colHalfFt, hi = colY + colHalfFt
    return [0, ...cuts, depthFt].some(c => lo < start + c - 1e-9 && hi > start + c + 1e-9)
  }) ?? null

  /* Push a row FORWARD (never back — that would shrink the aisle before it)
   * by the least amount that leaves every column it touches wholly inside
   * one of its bands, or wholly behind it in the aisle. For a clipped front
   * face that is "just past the column": start = the column's far edge, a
   * column-forced aisle widen of under one column width. The face behind
   * the column then reads as a pick-zone block, as intended. */
  const settleRow = (start, depthFt, cuts) => {
    const edges = [0, ...cuts, depthFt]
    for (let k = 0; k < edges.length + 4; k++) {
      const colY = straddlingColumn(start, depthFt, cuts)
      if (colY == null) return start
      const lo = colY - colHalfFt, hi = colY + colHalfFt
      const options = [hi]   // column wholly in the aisle before the row
      for (let b = 0; b < edges.length - 1; b++) {
        const s = Math.max(start, hi - edges[b + 1])   // column's far edge at this band's end
        if (s > start + 1e-9 && s <= lo - edges[b] + 1e-9) options.push(s)
      }
      start = Math.min(...options.filter(s => s > start + 1e-9))
    }
    return start
  }

  /* STEP 1 — the near-wall single row. Locked (position-wise, not column-
   * aware — the far-wall pinch-loop below is the one place a wall row can
   * still move), offset off the wall by wallClearFt. */
  bands.push({ type: 'rack_row', yFt: wallClearFt, depthFt: singleFt })
  let lastEnd = wallClearFt + singleFt

  /* Column lines sit at gridOffsetFt + k*gridYFt (k=0,1,2,...) — flush from
   * the building's own origin when gridOffsetFt is 0 (columnCheck.js's
   * expandColumnGrid Y convention, the default this always used before
   * GENERATOR_SPEC_V10's vertical orientation existed), or at the REAL
   * centred offset columnGridObject computes for its X axis, when this
   * walk is being driven by gridXFt instead. Getting this wrong doesn't
   * fail loudly — it just has the walk correctly avoid columns that don't
   * exist at the positions it thinks they're at, while the REAL columns
   * (drawn elsewhere on the true convention) sit unavoided. */
  /* The line set is bounded on both ends, exactly like the drawn grid:
   * gridOffsetFt is line #0 (k never goes negative — in "Columns along
   * wall" = No mode that would invent a phantom column on the wall one
   * pitch before line #0), and gridMaxFt is the last drawn line (No mode
   * drops a line that would land on the far wall). */
  const nextColumnNearEdge = (fromY) => {
    if (!hasGrid) return Infinity
    const k = Math.max(0, Math.ceil((fromY + colHalfFt - gridOffsetFt) / gridYFt))
    const cy = gridOffsetFt + k * gridYFt
    if (cy > gridMaxFt + 1e-9) return Infinity
    return cy - colHalfFt
  }
  /* Column lines whose own footprint overlaps [y0, y1). */
  const columnsOverlapping = (y0, y1) => {
    if (!hasGrid) return []
    const kLo = Math.max(0, Math.ceil((y0 - colHalfFt - gridOffsetFt) / gridYFt))
    const kHi = Math.floor((y1 + colHalfFt - gridOffsetFt) / gridYFt)
    const out = []
    for (let k = kLo; k <= kHi; k++) {
      const cy = gridOffsetFt + k * gridYFt
      if (cy < 0 || cy > gridMaxFt + 1e-9) continue
      if (cy + colHalfFt > y0 && cy - colHalfFt < y1) out.push(cy)
    }
    return out
  }

  for (let guard = 0; guard < walkGuard; guard++) {
    /* STEP 2 — place an aisle, if there's room for one before the far wall. */
    if (bottomY - lastEnd < aisleFt) break   // NO branch: wall-hit, fall through to cleanup below

    const preAisleEnd = lastEnd
    const gapToNextColumn = nextColumnNearEdge(lastEnd) - lastEnd
    /* BUG 52 — gate on travelFt (the drive-through minimum), not aisleFt
       (the full pick width). A column that lands INSIDE a normal aisleFt
       aisle is not automatically a problem: as long as the near-side gap
       is already >= travelFt, a truck can drive past it fine — that's
       exactly BUG 39's "level 2, one-side pick" case, already accessible
       by default, not something the WALK needs to react to. Widening here
       for every gap under aisleFt (the old gate) meant almost any column
       merely inside the aisle — not actually too close — got the full
       absorb treatment, which is what caused every aisle to blow out to
       ~17.5ft in lockstep with the column grid (the "resonance" traced
       before this fix). Only a gap that's ALSO under travelFt is a truck
       that can't get through at all — THAT'S when the aisle has to widen,
       so the far side of the column still gets a full travelFt clear.

       This is already SUFFICIENT on its own for the interior walk (BUG 53
       looked hard for a case where it wasn't and didn't find one): the
       widen branch below always places `afterAisle` exactly `travelFt`
       past the column's far edge, by construction — so checkColumns' own
       accessibility read (`max(nearClear, farClear) >= travelFt` → level
       2, "one-side pick," not blocked) can never come back level 1 from
       THIS step. A row-drop/shift intervention here (an earlier version
       of this fix had one) was solving a problem that didn't exist and
       cost real capacity doing it — confirmed by testing 240x120/25x30/
       reach horizontal, where it dropped a row despite checkColumns
       already reporting zero blocked aisles for that exact geometry. */
    const aisleWidth = (!hasGrid || gapToNextColumn >= travelFt)
      ? aisleFt
      : Math.max(aisleFt, gapToNextColumn + colWidthFt + travelFt)
    const afterAisle = preAisleEnd + aisleWidth

    /* STEP 3 — place a pair (or a single, if a pair no longer fits). */
    if (afterAisle + midFt <= bottomY) {
      let start = afterAisle
      let pairFlueIn = flueIn   // BUG 55 — this pair's own flue; may widen below
      let pairMidFt  = midFt
      let seated = false
      const overlap = rackType === 'rack_double_row' ? columnsOverlapping(start, start + midFt) : []
      if (overlap.length) {
        /* BUG 60 — always try seating the column in the flue instead of
           eating a pick slot, no customer toggle gating it — only if the
           pair doesn't have to start earlier than the aisle just placed to
           do it (never shrink the aisle to chase a column) and still
           leaves room to close. BUG 56 —
           `seatColumnInFlue` clamps to the CLOSEST reachable centring the
           aisle boundary allows and only accepts it if the column's full
           footprint actually lands inside the resulting flue; if even
           that clamped position can't fully contain it, this is null and
           the column falls through to the existing bay-column path below
           — never a flue "widened" around a column still half in a face. */
        const fit = seatColumnInFlue(overlap[0], afterAisle)
        if (fit) { start = fit.start; pairFlueIn = fit.flueIn; pairMidFt = fit.midFt; seated = true }
      }
      /* BUG 55/56 — even when the attempt above declined (its column
         couldn't be fully seated, or `overlap[0]` wasn't the column that
         actually touches the flue), a DIFFERENT column can still coincide
         with this pair's CURRENT (still-standard, un-slid) flue purely by
         chance. Retried here against the SAME aisle boundary, with the
         SAME all-or-nothing rule — a partial overlap never ships from this
         path either. Only checked when nothing was already seated, both
         because a seated column has nothing left to fix and to avoid
         re-deriving a position `seatColumnInFlue` already committed to. */
      if (!seated) {
        const flueLo = start + depthIn / 12, flueHi = flueLo + pairFlueIn / 12
        const flueColumn = columnsOverlapping(flueLo, flueHi)[0]
        if (flueColumn != null) {
          const fit = seatColumnInFlue(flueColumn, afterAisle)
          if (fit) {
            start = fit.start; pairFlueIn = fit.flueIn; pairMidFt = fit.midFt
          } else {
            /* BUG 57 — this column touches the flue zone but can't be
               fully seated in it at any reachable position; shift the
               pair so it lands fully inside one face instead, rather
               than leaving it straddling the boundary. */
            const faceFit = seatColumnInFace(flueColumn, afterAisle)
            if (faceFit) start = faceFit.start
          }
        }
      }
      const pairCuts = rackType === 'rack_double_row' ? [singleFt, singleFt + pairFlueIn / 12] : []
      start = settleRow(start, pairMidFt, pairCuts)
      if (start + pairMidFt > bottomY + 1e-9) {   // pushed past the far wall's row: stop here
        lastEnd = preAisleEnd
        break
      }
      lastEnd = start + pairMidFt
      bands.push({ type: rackType, yFt: start, depthFt: pairMidFt, flueIn: pairFlueIn })
    } else if (settleRow(afterAisle, singleFt, []) + singleFt <= bottomY) {
      const start = settleRow(afterAisle, singleFt, [])
      lastEnd = start + singleFt
      bands.push({ type: 'rack_row', yFt: start, depthFt: singleFt })
    } else {
      lastEnd = preAisleEnd   // nothing placed this round — undo the aisle-only advance
      break
    }
  }

  /* After the far-wall cleanup pops a row, the gap it leaves can still hold
   * a single row with a full aisle on each side (TEST_PLAN.md §2b rule 2:
   * the last aisle must stay < 2 x aisle + single depth). Try one, under the
   * same rules the walk uses: the travelFt widen gate before it, no
   * straddled column, >= aisleFt left before the far-wall row, and no column
   * pinching that last gap below travelFt on both sides. Returns whether one
   * was placed. */
  const tryFillSingle = () => {
    const gap = nextColumnNearEdge(lastEnd) - lastEnd
    const aisle = (!hasGrid || gap >= travelFt) ? aisleFt : Math.max(aisleFt, gap + colWidthFt + travelFt)
    const start = settleRow(lastEnd + aisle, singleFt, [])
    const end = start + singleFt
    if (bottomY - end < aisleFt - 1e-9) return false
    const pinched = columnsOverlapping(end, bottomY).some(colY =>
      Math.max((colY - colHalfFt) - end, bottomY - (colY + colHalfFt)) < travelFt)
    if (pinched) return false
    bands.push({ type: 'rack_row', yFt: start, depthFt: singleFt })
    lastEnd = end
    return true
  }

  /* Wall-hit cleanup (STEP 2's NO branch): if a back-to-back pair is the
     last thing placed, try swapping it for a single row first — it may
     free enough depth on its own; only if that still isn't enough do we
     start removing rows outright, until the far wall's own aisle fits. */
  let remaining = bottomY - lastEnd
  if (bands.length > 1 && remaining < aisleFt) {
    const last = bands[bands.length - 1]
    if (last.type === 'rack_double_row') {
      /* BUG 55 — this pair's OWN depthFt, not the shared `midFt`: a pair
         that widened its flue to seat a column is deeper than standard,
         so converting it back to a single frees MORE than `midFt -
         singleFt` would assume. */
      const freed = last.depthFt - singleFt
      if (remaining + freed >= aisleFt) {
        last.type = 'rack_row'
        last.depthFt = singleFt
        lastEnd = last.yFt + singleFt
        remaining = bottomY - lastEnd
      }
    }
    let popped = false
    while (remaining < aisleFt && bands.length > 1) {
      bands.pop()
      popped = true
      const prev = bands[bands.length - 1]
      lastEnd = prev.yFt + prev.depthFt
      remaining = bottomY - lastEnd
    }
    if (popped && tryFillSingle()) remaining = bottomY - lastEnd
  }

  /* BUG 53 — the cleanup above only ever checks for enough SPACE before
     the far wall (`remaining >= aisleFt`); it never checked whether a
     column sits INSIDE that final gap close enough that neither side of
     it reaches travelFt. That, not the interior walk (which BUG 52's own
     widen formula already keeps clear — see STEP 2's own comment), is
     where BUG 52's reported "6.8ft clear" blocked aisles actually lived:
     confirmed by testing 240x120/25x30/reach vertical directly — all 3
     blocked aisles sat between the LAST interior row and the far wall's
     own mirror row, both single rows, exactly this transition. Applied
     here instead of the interior walk since the far wall's own position
     (`bottomY`, STEP 1's mirror, "always") is fixed — only the row on
     the near side of this gap can move.

     BUG 60 — always shift the pinching row forward to absorb the column
     (the row is kept, pick positions are lost there) rather than dropping
     it; there is no customer preference to gate a drop on any more, and a
     shift never blocks the aisle the way the drop's old "just remove it
     and re-check space" branch occasionally still could downstream. */
  for (let guard2 = 0; guard2 < walkGuard && hasGrid && bands.length > 1; guard2++) {
    const pinchingCol = columnsOverlapping(lastEnd, bottomY).find(colY => {
      const nearClear = (colY - colHalfFt) - lastEnd
      const farClear  = bottomY - (colY + colHalfFt)
      return Math.max(nearClear, farClear) < travelFt
    })
    if (pinchingCol == null) break

    const prev = bands[bands.length - 1]
    const newFarEdge = pinchingCol + colHalfFt
    prev.yFt += newFarEdge - (prev.yFt + prev.depthFt)
    lastEnd = prev.yFt + prev.depthFt

    /* A shift here can just as easily break the SPACE guarantee the
       cleanup above already established — re-apply it. */
    remaining = bottomY - lastEnd
    if (bands.length > 1 && remaining < aisleFt) {
      const last = bands[bands.length - 1]
      if (last.type === 'rack_double_row') {
        const freed = last.depthFt - singleFt   // BUG 55 — this pair's own depth, see above
        if (remaining + freed >= aisleFt) {
          last.type = 'rack_row'
          last.depthFt = singleFt
          lastEnd = last.yFt + singleFt
          remaining = bottomY - lastEnd
        }
      }
      let popped = false
      while (remaining < aisleFt && bands.length > 1) {
        bands.pop()
        popped = true
        const prev = bands[bands.length - 1]
        lastEnd = prev.yFt + prev.depthFt
        remaining = bottomY - lastEnd
      }
      // the popped row's gap may still hold a single — see tryFillSingle
      if (popped && tryFillSingle()) remaining = bottomY - lastEnd
    }
  }

  /* STEP 1's mirror — the far-wall single row, always. */
  bands.push({ type: 'rack_row', yFt: bottomY, depthFt: singleFt })
  return bands
}

/** Every column line along the run axis, in run-axis feet — the SAME
 *  lines `columnGridObject` draws, fed the run axis's own pitch/offset
 *  instead of hardcoding X or Y (BUG 54): line #0 at the offset, then every
 *  pitch up to and including the last drawn line (`maxFt`, from axisFrame;
 *  defaults to the run's own length for a direct caller). */
function runColumnLinesFt(runGridFt, runGridOffsetFt, lengthFt, maxFt = lengthFt) {
  if (!(runGridFt > 0)) return []
  const out = []
  for (let v = runGridOffsetFt; v <= maxFt + 1e-9; v += runGridFt) out.push(v)
  return out
}

function intervalHitsColumn(startFt, endFt, colLinesFt) {
  return colLinesFt.some(cx => cx + COL_HALF_FT > startFt && cx - COL_HALF_FT < endFt)
}

/** Rack runs across the building's length (X): the FULL run axis is used
 *  (minus a small wall clearance each end — `endClearFt`, a real physical
 *  standoff, not the staging carve-out this used to also subtract) and one
 *  cross-aisle splits what remains into two segments.
 *
 *  No staging/dock carve-out here — BUG 44 removed it. It was a single
 *  fixed-size deduction (`speedBayFt`) applied to whichever axis happened to
 *  be the "run" axis; fine for horizontal (run = the 240ft length, staging
 *  was a minority of it) but for vertical the run axis is the WIDTH, often
 *  much shorter, so the same fixed deduction ate a much bigger fraction of
 *  it — that's what crammed vertical's racking into a thin middle band. The
 *  staging/dock zone is coming back as a separate draggable object later;
 *  generation doesn't reserve space for it until then.
 *
 *  BUG 54 — three fixes at once, all falling out of one fact: `runLenFt(n) =
 *  (upIn*(n+1) + n*beamIn)/12` is AFFINE in bay count `n`, not linear
 *  through the origin — each segment carries its OWN pair of end uprights,
 *  so splitting a run of `total` bays into two independent segments always
 *  costs exactly one upright's width MORE than a single undivided run of
 *  the same `total` would: `runLenFt(n1) + runLenFt(n2) = runLenFt(n1+n2) +
 *  upIn/12` for any `n1 + n2 = total` (verified live — an earlier version
 *  of this fix assumed true linearity and understated that extra upright,
 *  which could silently starve the built aisle below the requested
 *  `crossAisleFt`). What IS true, and still does all the work below: that
 *  extra `upIn/12` depends only on `n1 + n2`, never on the split itself, so
 *  the two segments' COMBINED length is still split-invariant — it just
 *  isn't `runLenFt(total)` bare, it's `runLenFt(total) + upIn/12`. That
 *  means:
 *   1. Both segments can be WALL-FLUSH — segment 1 starts at x0, segment 2
 *      ENDS at x1 — with the one remaining unknown (the cross-aisle's own
 *      width, `usable - runLenFt(total) - upIn/12`) collecting whatever
 *      integer-bay rounding slack is left over, instead of a gap silently
 *      opening up between the last rack and the far wall.
 *   2. Because the split doesn't change that combined length, it can be
 *      chosen for free (zero capacity cost) purely to steer the
 *      cross-aisle's POSITION away from a column — PP's method: hand a bay
 *      from one section to the other "against the wall" and the
 *      cross-aisle boundary just slides over, still filling both walls.
 *   3. `crossAisleFt` is now the caller's per-forklift figure (BUG 54 wired
 *      it from `rules.mhe[...].crossAisleFt` in sizingSheetLayout below),
 *      used as the FLOOR the aisle must clear — reserved UP FRONT (the
 *      extra upright deducted before bays are even counted, not after), so
 *      the actual built width can end up larger (never smaller). */
export function rowSegments(lengthFt, { crossAisleFt, endClearFt, beamIn, upIn = UP_IN, runGridFt = 0, runGridOffsetFt = 0, runGridMaxFt = lengthFt }) {
  const x0     = endClearFt
  const x1     = lengthFt - endClearFt
  const usable = x1 - x0
  if (usable <= 0) return { segments: [], bays: 0, crossAisle: null }

  const runLenFt = (n) => (upIn * (n + 1) + n * beamIn) / 12
  const extraUprightFt = upIn / 12   // the second segment's own extra end-upright

  const capacityFt = usable - crossAisleFt - extraUprightFt
  const total = capacityFt >= beamIn / 12
    ? baysInRun(capacityFt, beamIn, upIn)
    : 0

  /* Too narrow to be worth splitting — one run beats two stubs. */
  if (total < 2) {
    const bays = baysInRun(usable, beamIn, upIn)
    return bays > 0
      ? { segments: [{ xFt: x0, bays }], bays, crossAisle: null }
      : { segments: [], bays: 0, crossAisle: null }
  }

  const aisleWidthFt = usable - runLenFt(total) - extraUprightFt
  const colLinesFt   = runColumnLinesFt(runGridFt, runGridOffsetFt, lengthFt, runGridMaxFt)
  const minN1 = 1
  const maxN1 = total - 1
  const balancedN1 = Math.min(maxN1, Math.max(minN1, Math.round(total / 2)))

  let n1 = null
  for (let d = 0; d <= total && n1 == null; d++) {
    const candidates = d === 0 ? [balancedN1] : [balancedN1 - d, balancedN1 + d]
    for (const cand of candidates) {
      if (cand < minN1 || cand > maxN1) continue
      const aisleStartFt = x0 + runLenFt(cand)
      if (!intervalHitsColumn(aisleStartFt, aisleStartFt + aisleWidthFt, colLinesFt)) { n1 = cand; break }
    }
  }
  if (n1 == null) n1 = balancedN1

  const n2 = total - n1
  const seg1LenFt = runLenFt(n1)
  const seg2LenFt = runLenFt(n2)

  return {
    segments: [
      { xFt: x0, bays: n1 },
      { xFt: x1 - seg2LenFt, bays: n2 },
    ],
    bays: total,
    crossAisle: { xFt: x0 + seg1LenFt, widthFt: aisleWidthFt },
  }
}

/** Frame/beam/flue/depth the layout is built from, resolved from the rules
 *  profile with the brief able to override any of them.
 *
 *  Frame depth is chosen independently of the pallet's own depth — a pallet
 *  is EXPECTED to overhang a selective frame by design (a 48" pallet on a
 *  42" frame, ~3" overhang each side, is the industry-standard stance, not
 *  a fit problem the frame needs to grow to avoid), so this no longer
 *  searches for "the shallowest frame that's still >= the pallet." It
 *  defaults to the standard 42" selective frame depth whenever the rules
 *  table offers one. */
export function layoutSpec(brief = {}, rules = DEFAULT_RULES) {
  const sel     = rules.selective || {}
  const pallet  = rules.pallet || {}
  const beams   = sel.beamLengthsIn?.length ? sel.beamLengthsIn : [96]
  const depths  = sel.frameDepthsIn?.length ? sel.frameDepthsIn : [42]
  const frames  = sel.frameWidthsIn?.length ? sel.frameWidthsIn : [3]
  const palletW = pallet.wIn ?? 40
  const palletD = pallet.dIn ?? 48

  const fitDepth = depths.includes(42) ? 42 : depths[0]

  return {
    beamIn:     brief.beamIn     ?? beams[0],
    depthIn:    brief.depthIn    ?? fitDepth,
    upIn:       brief.uprightIn  ?? frames[0],
    flueIn:     brief.flueIn     ?? sel.flueIn ?? FLUE_IN,
    palletWIn:  brief.palletWIn  ?? palletW,
    palletDIn:  brief.palletDIn  ?? palletD,
    /* Wall clearance is authored in inches — the Generate panel's own
       "WALL CLEARANCE (IN)" field (brief.wallClearanceIn) wins over the
       dealer's rules-table default (sel.wallClearanceIn), which wins over
       a raw feet override (brief.endClearFt, kept for any direct caller
       that predates the panel field) — the layout itself works in feet. */
    endClearFt: brief.endClearFt ?? ((brief.wallClearanceIn ?? sel.wallClearanceIn ?? 36) / 12),
  }
}

/** Column-line positions along ONE building axis, in feet from the
 *  building's own origin — the single definition both the drawn grid
 *  (columnGridObject) and the rack-avoidance walk (axisFrame -> rowBands /
 *  rowSegments) read, so they cannot disagree about where any line is.
 *  The same rule applies to both axes:
 *    "Columns along wall" = Yes — line #0 on the near wall.
 *    "Columns along wall" = No  — line #0 one full pitch in from the near
 *      wall, and a line landing exactly on the far wall is dropped, so no
 *      column sits on any wall. */
export function axisGridLines(totalFt, pitchFt, columnsAlongWall) {
  if (!(pitchFt > 0)) return []
  const n = Math.max(1, Math.floor(totalFt / pitchFt))
  const start = columnsAlongWall ? 0 : pitchFt
  const count = columnsAlongWall ? n + 1 : n
  const lines = Array.from({ length: count }, (_, i) => start + i * pitchFt)
  if (!columnsAlongWall && lines.length && Math.abs(lines[lines.length - 1] - totalFt) < 1e-9) lines.pop()
  return lines
}

/** BUG 46 — the ONLY orientation-aware code in the whole generator. Every
 *  actual placement DECISION (tight-pack an aisle, absorb a column into the
 *  aisle or the rack, apply travelFt, three-level accessibility) lives in
 *  `rowBands`/`rowSegments`/`checkColumns` — none of them know or care which
 *  physical axis they're running along, they just walk a 1D extent against a
 *  1D grid pitch. Vertical was never a second implementation of that walk;
 *  it was always the SAME `rowBands`/`rowSegments` call, fed a different
 *  extent/pitch (BUG 41). What used to live inline in `sizingSheetLayout` as
 *  a scattered `stackFt`/`runFt` setup plus an `if (vertical) {…} else {…}`
 *  branch in the placement loop is pulled out here as ONE small, named,
 *  independently-testable seam — not because the walk itself was ever
 *  duplicated (it wasn't), but because that seam is exactly where BUG 44
 *  (rowSegments given the wrong axis's carve-out) and BUG 45
 *  (aisleObjectsForRacks/AisleLabel reading raw pre-rotation geometry as if
 *  it were the world box) both actually lived — not in the walk, in how its
 *  OUTPUT gets mapped onto world coordinates for each axis. Collapsing that
 *  mapping into one function with one shared call site removes the only
 *  remaining place a future orientation-shaped bug could hide.
 *
 *  `stackFt`/`stackGridFt`: the axis rows are LOCKED ACROSS (bands) and the
 *  column pitch driving that walk. `runFt`/`runGridFt`: the axis a run's
 *  own LENGTH lies along (rowSegments' job — fill the full run axis, split
 *  around one cross-aisle) and the column pitch running ALONG it (BUG 54 —
 *  rowSegments needs this now too, to steer the cross-aisle clear of a
 *  column, the same way rowBands already steers bands clear of one).
 *  `stackGridOffsetFt`/`runGridOffsetFt`: WHERE those column lines actually
 *  sit along each axis — columnGridObject centres X (offX = leftover/2)
 *  but walks Y flush from the origin (an earlier fix so rowBands' own
 *  flush convention would agree with it) — a FIXED building-level
 *  convention, not an orientation-dependent one, so the same
 *  `centeredOffset(lengthFt, gridXFt)` formula applies to X regardless of
 *  whether X is currently playing the stacking role (vertical) or the
 *  running role (horizontal), and flush (0) applies to Y in either role.
 *
 *  `place(band, runPos, runLenFt)` is the per-placement coordinate map: for
 *  horizontal, band.yFt/runPos ARE the stored xFt/yFt directly (angle 0, no
 *  transform needed). For vertical, the stored object is still built
 *  exactly like a horizontal one (beams along its own local X, depth along
 *  its own local Y — traceGenerate.js never changes that), then spun 90° in
 *  place around its own centre (shapes.jsx's spin() — every canvas2 object
 *  rotates that way). So placing it correctly means computing where that
 *  CENTRE needs to land — band.yFt (a position along the building's LENGTH)
 *  plus half the depth is the true centre X; the run position (along the
 *  building's WIDTH) plus half the run's own length is the true centre Y —
 *  then backing out the PRE-rotation x/y from that centre, since
 *  traceGenerate still treats xFt/yFt as the unrotated box's top-left. */
export function axisFrame(orientation, { lengthFt, widthFt, gridXFt, gridYFt, columnsAlongWall = true }) {
  const vertical = orientation === 'vertical'
  const stackFt = vertical ? lengthFt : widthFt
  const runFt    = vertical ? widthFt  : lengthFt
  const stackGridFt = vertical ? gridXFt : gridYFt
  const runGridFt    = vertical ? gridYFt : gridXFt
  /* The avoidance walk reads the SAME line sets columnGridObject draws
   * (axisGridLines), on both axes: flush to the walls ("Columns along
   * wall" = Yes) or inset one pitch with no wall line (= No) — whichever
   * physical axis ends up as this orientation's stack or run axis. First
   * line is the walk's line #0 (…OffsetFt), last line bounds it (…MaxFt). */
  const xLines = axisGridLines(lengthFt, gridXFt, columnsAlongWall)
  const yLines = axisGridLines(widthFt, gridYFt, columnsAlongWall)
  const stackLines = vertical ? xLines : yLines
  const runLines   = vertical ? yLines : xLines
  const first = (l) => (l.length ? l[0] : 0)
  const last  = (l) => (l.length ? l[l.length - 1] : -Infinity)
  const stackGridOffsetFt = first(stackLines), stackGridMaxFt = last(stackLines)
  const runGridOffsetFt   = first(runLines),   runGridMaxFt   = last(runLines)
  return {
    vertical, stackFt, runFt,
    stackGridFt, stackGridOffsetFt, stackGridMaxFt,
    runGridFt, runGridOffsetFt, runGridMaxFt,
    place(band, runPos, runLenFt) {
      if (!vertical) return { xFt: runPos, yFt: band.yFt, angle: 0 }
      const centreXFt = band.yFt + band.depthFt / 2
      const centreYFt = runPos + runLenFt / 2
      return { xFt: centreXFt - runLenFt / 2, yFt: centreYFt - band.depthFt / 2, angle: 90 }
    },
  }
}

/** The generator. Same shape/return as stubGenerateLayout, plus the resolved
 *  rules profile — change the profile and the whole layout re-drives.
 *
 *  `orientation: 'vertical'` runs the SAME walk (rowBands/rowSegments,
 *  unchanged — see `axisFrame` above) along the OTHER pair of axes: rows
 *  stack across the building's LENGTH instead of its WIDTH, driven by the X
 *  column pitch (gridXFt) instead of Y (gridYFt), with wall singles on the
 *  length-walls; the perpendicular runs move to the WIDTH axis. This is not
 *  a visual rotation of the horizontal result — it is the same walk, re-run
 *  with the stacking and running axes swapped, so a column that would only
 *  have mattered to the Y pitch now gets tested against the X pitch
 *  instead, and vice versa. Default is horizontal ('horizontal' or unset). */
export function sizingSheetLayout(brief, rules = DEFAULT_RULES) {
  const spec = layoutSpec(brief, rules)
  const {
    lengthFt, widthFt,
    rackType     = 'rack_double_row',
    levels       = 4,
    aisleFt      = rules.mhe?.[brief.mhe || rules.mheDefault || 'reach']?.aisleFt ?? 12.5,
    /* Capped at aisleFt, not looked up independently from the forklift
       profile — a truck can never need MORE room to drive through than it
       needs to work in (BUG 40), and that invariant has to hold for a
       MANUALLY typed aisle too, not just the forklift's own default. The
       Generate panel's "AISLE (ft)" field is a genuinely free input (it
       predates travelFt entirely and never sends one) — if a dealer types
       an aisle narrower than the selected truck's own profile travelFt,
       using the profile's travelFt as-is would silently claim the truck
       needs more clearance to drive than the aisle it's now told to work
       in actually has. Reduces to exactly the old value whenever aisleFt
       IS the profile's own (the normal, non-overridden case), since a
       shipped profile's travelFt is already <= its own aisleFt by
       construction (columnCheck.js's travelFtFor). */
    travelFt     = Math.min(rules.mhe?.[brief.mhe || rules.mheDefault || 'reach']?.travelFt ?? 8, aisleFt),
    /* Per-forklift (BUG 54) — reach/VNA need less room to drive straight
       through than counterbalance needs to turn, so this is its own
       rules.mhe[...] figure, not aisleFt reused. */
    crossAisleFt = rules.mhe?.[brief.mhe || rules.mheDefault || 'reach']?.crossAisleFt ?? aisleFt,
    /* The SAME column footprint columnGridObject draws (BUG 55) — rowBands
       needs the real width, not an assumed 12", to size a flue that
       actually holds the column standing in it. */
    colSizeIn    = 12,
    gridYFt, gridXFt,
    orientation  = 'horizontal',
    /* "Columns along wall" (BUG 69 redesign) — Yes (default, matches every
       caller that predates this toggle) keeps the grid flush at the wall;
       No insets it one full pitch so no column sits on the wall line. See
       axisFrame's own comment for how this threads into the walk. */
    columnsAlongWall = true,
  } = brief
  const { beamIn, depthIn, upIn, flueIn, palletWIn, endClearFt } = spec

  const frame = axisFrame(orientation, { lengthFt, widthFt, gridXFt, gridYFt, columnsAlongWall })

  const bands = rowBands(frame.stackFt, { rackType, depthIn, aisleFt, flueIn, gridYFt: frame.stackGridFt, travelFt, gridOffsetFt: frame.stackGridOffsetFt, gridMaxFt: frame.stackGridMaxFt, colSizeIn, wallClearFt: endClearFt })
  const { segments, bays } = rowSegments(frame.runFt, {
    crossAisleFt, endClearFt, beamIn, upIn,
    runGridFt: frame.runGridFt, runGridOffsetFt: frame.runGridOffsetFt, runGridMaxFt: frame.runGridMaxFt,
  })
  if (!bands.length || !segments.length || bays <= 0) return []

  const placements = []
  for (const band of bands) {
    for (const seg of segments) {
      /* A run's own length in feet — the SAME totalIn/12 formula
         traceGenerate's beamRackObject will independently compute as its
         (pre-rotation) width, needed here only for `frame.place` to locate
         a vertical rack by its CENTRE. Per-segment (BUG 54) — the two
         segments can now carry different bay counts. */
      const segRunLenFt = (upIn * (seg.bays + 1) + seg.bays * beamIn) / 12
      placements.push({
        type: band.type,
        ...frame.place(band, seg.xFt, segRunLenFt),
        // BUG 55 — this band's OWN flue (widened if it seats a column),
        // not the flat `flueIn` every placement used to share. flueBaseIn
        // (canvas2's live-flue drag feature — see useCanvasInteraction.js's
        // beginDrag) is the UN-widened spec default this band started
        // from, always, even when flueIn above got widened for a seated
        // column — the same distinction RackRowPanelCore's manual Flue
        // control and a live drag's own commit already keep: flueIn/
        // flueSpaceIn is "whatever's currently rendered," flueBaseIn is
        // "what a drag away from every column should shrink back to."
        // Leaving this unset here (as every placement did before) meant a
        // generated rack's genuine base was never recorded at all, so
        // beginDrag's own flueBaseIn-first read fell through to flueIn —
        // for a rack the generator had already widened around a seated
        // column, that IS the widened value, so it could never shrink.
        bays: seg.bays, beamIn, depthIn, flueIn: band.flueIn ?? flueIn, flueBaseIn: flueIn, levels, palletWIn,
        palletDIn: spec.palletDIn, uprightWidthIn: upIn,
      })
    }
  }
  return placements
}

/* ── Fixtures — everything that is not a rack ────────────────────────────────
   Built as plain v16b object literals in WORLD px, offset into the building,
   so generateAndPlace can hand each one to the store's addObject factory
   unchanged. */

const STRUCT = '#6366f1'

/** Structural column grid on the requested spacing. `columnsAlongWall`
 *  sets the origin on BOTH axes: Yes (the default, so any caller that
 *  predates the toggle keeps a wall-flush grid) starts the lines ON the
 *  near walls; No starts them one full pitch in from each near wall
 *  (gridXFt from left/right, gridYFt from top/bottom) and drops a line
 *  that would land exactly on a far wall, so no column sits on any of the
 *  four walls.
 *
 *  The line positions come from axisGridLines — the same definition
 *  axisFrame feeds the rack-avoidance walk (rowBands on the stack axis,
 *  rowSegments on the run axis) — because a drawn column and the walk's
 *  idea of that column disagreeing is silent: the walk steers clear of a
 *  column that isn't there while the real one lands in an aisle or a face.
 *
 *  History: BUG 64 modelled "no columns on the wall" as a separate
 *  wall-grid object layered on an always-flush grid, which never removed
 *  the grid's own wall line; BUG 69 moved the toggle onto this grid's
 *  origin, but only for Y — X stayed centred (7.5' off the left wall on a
 *  240'/25' grid) until both axes were put on the same rule. */
export function columnGridObject(brief, ox, oy) {
  const { lengthFt, widthFt, gridXFt = 50, gridYFt = 54, colSizeIn = 12, columnsAlongWall = true } = brief
  if (!(gridXFt > 0) || !(gridYFt > 0)) return null

  const xs = axisGridLines(lengthFt, gridXFt, columnsAlongWall)
  const ys = axisGridLines(widthFt, gridYFt, columnsAlongWall)
  // "No" on a building only one pitch across leaves no interior line at all.
  if (!xs.length || !ys.length) return null
  const colPx = (colSizeIn / 12) * GS

  const spacingX = Array.from({ length: xs.length - 1 }, () => gridXFt * GS)
  const spacingY = Array.from({ length: ys.length - 1 }, () => gridYFt * GS)

  return {
    type: 'column_grid', label: 'Column Grid',
    x: ox + xs[0] * GS, y: oy + ys[0] * GS,
    width:  spacingX.length * gridXFt * GS + colPx,
    height: spacingY.length * gridYFt * GS + colPx,
    spacingX, spacingY,
    colSizeIn, columnW: colPx, columnH: colPx,
    showGrid: true, wallAttached: false,
    fill: STRUCT + '22', stroke: STRUCT, strokeWidth: 1.5,
  }
}

/** Dock doors spread evenly along the dock (staging) wall. */
export function dockDoorObjects(brief, ox, oy) {
  const { widthFt, dockDoors = 0, doorWidthFt = 9, doorDepthFt = 8 } = brief
  const n = Math.max(0, Math.floor(dockDoors))
  if (!n) return []

  const out = []
  for (let i = 0; i < n; i++) {
    /* Evenly spaced centres, so the first and last sit inboard of the corners
       rather than half-off the end of the wall. */
    const cyFt = (i + 0.5) * (widthFt / n)
    out.push({
      type: 'struct_loading_dock', label: `Dock Door ${i + 1}`,
      /* Straddles the wall line, the way a real door does. */
      x: ox - (doorDepthFt / 2) * GS,
      y: oy + (cyFt - doorWidthFt / 2) * GS,
      width:  doorDepthFt * GS,
      height: doorWidthFt * GS,
      doorWidth: doorWidthFt,
      fill: '#f59e0b22', stroke: '#f59e0b', strokeWidth: 1.5,
    })
  }
  return out
}

/** The staging strip's dashed boundary and its label. */
export function stagingObjects(brief, ox, oy) {
  const { widthFt, speedBayFt = 60 } = brief
  if (!(speedBayFt > 0)) return []

  const xPx = ox + speedBayFt * GS
  /* Sized in FEET, not px. A whole building is viewed at 2–10% zoom, so
     anything specified in raw px — a 2px rule, a 30px glyph — renders
     sub-pixel and simply is not there. Five feet of cap height reads at every
     zoom the building itself is legible at. */
  const labelFt = Math.max(3, Math.min(widthFt * 0.05, 8))
  const labelFs = labelFt * GS
  const ruleFt  = 0.25

  return [
    {
      /* No `label` — the canvas paints an object's label onto the drawing, and
         a rule captioned "Staging boundary" next to a STAGING sign is noise. */
      type: 'line',
      x1: xPx, y1: oy, x2: xPx, y2: oy + widthFt * GS,
      x: xPx, y: oy, width: 0, height: widthFt * GS,
      stroke: '#9A968C', strokeWidth: ruleFt * GS,
      strokeDasharray: `${2 * GS} ${1.2 * GS}`,
      noFill: true,
    },
    {
      type: 'text', text: 'STAGING',
      x: ox + (speedBayFt / 2) * GS,
      y: oy + (widthFt / 2) * GS,
      width: widthFt * GS * 0.6, height: labelFs * 1.4,
      fontSize: labelFs, fontFamily: 'JetBrains Mono',
      fill: '#6B675F', align: 'center',
      /* Reads up the strip, as on the sizing sheet. */
      rotation: -90,
      letterSpacing: labelFs * 0.18,
    },
  ]
}

/** Every non-rack object the brief implies, in placement order.
 *
 *  `stagingObjects`/`dockDoorObjects` are deliberately NOT emitted here
 *  (BUG 44) — racking now fills the full building, so the dashed staging
 *  boundary and dock doors they'd draw at the old `speedBayFt` carve-out
 *  would sit on top of/inside placed racks instead of marking a real
 *  reserved zone. Both functions are kept, still exported and still their
 *  own tests' subject, for the draggable dock/staging zone that replaces
 *  this later — they're just not wired into generation until then. */
export function generateFixtures(brief, ox, oy) {
  const grid = columnGridObject(brief, ox, oy)
  return grid ? [grid] : []
}
