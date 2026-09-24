# Step 3b — Forward-walk column seating (spec to build)

Replaces the "shift-and-cascade loop" idea. PP confirmed the real method is a
**single forward pass** down the building, deciding each row as you reach it and
**locking** it — never going back. Much simpler and safer than a settling loop:
no cascade, no re-checking placed rows, guaranteed termination (you walk to the
far wall).

Companion: COLUMN_LOGIC_KNOWLEDGE.md (the why). This is the how for 3b.

---

## The algorithm

Walk from the near wall to the far wall, placing one row at a time. Once a row is
placed, it is **LOCKED** — never moved by a later step.

1. **Place the wall single** against the near wall. Lock it.
2. **Walk down.** From the bottom edge of the last locked row, decide the next
   interior pair's position:
   - The next pair must start **at least `minAisle`** below the locked row (the
     forklift needs its aisle — hard floor, never less).
   - **Look ahead to the next column line.** If placing the pair so its flue
     lands on that column keeps the aisle above **≥ minAisle**, place it there
     (seat the column; a wider-than-min aisle above is fine and expected).
   - If seating the column would require an aisle **< minAisle** (column too
     close), don't seat it: place the pair tight at `minAisle`. That column then
     falls in the pair's body → **bay-column** (kept, −1/level, flagged) — or
     into the aisle if it's between rows, handled by the next step's look-ahead.
   - If the next column is **far** (beyond a tight pair), just place tight at
     `minAisle`; that column gets handled when the walk reaches it.
   Lock the pair. Continue from its bottom edge.
3. **Far wall.** When the remaining depth can't fit another pair + minAisle, close
   with a wall single against the far wall. Leftover depth is slack (never an
   aisle below min).

## The per-step decision (the crux)

At each gap, choose the next pair's Y among valid positions (start ≥ lastRow +
minAisle):
- **Prefer** the position whose flue lands on the nearest upcoming column line,
  IF that position's aisle-above ≥ minAisle.
- **Else** place tight (aisle-above = minAisle).
Seating a column is worth a wider aisle above (wasted floor is accepted — access
and column-seating win). But minAisle is never violated to seat a column.

## What each column ends up as (by construction)

Because we place pairs to catch columns as we walk:
- Column caught in a flue → **seated (blue, 0)**.
- Column too close to seat (would break minAisle) → lands in the pair body →
  **bay-column (red, −1/level, rack kept)**.
- Column that ends up in a travel aisle → should be **rare/none** now, because
  the walk positions pairs to avoid leaving columns stranded in aisles. If one
  still lands in an aisle (e.g. can't be seated without breaking minAisle AND
  isn't in a body) → flag it (red, blocks truck) — this is the residual case to
  inspect against real output.

## Termination

Guaranteed: each step advances down the building by at least `pairDepth +
minAisle`. The walk ends at the far wall. No loop, no re-check of locked rows.

## Scope for this build

- **Deterministic single pass** (nearest-column seating, minAisle floor). NO
  branch-and-compare yet — get a correct, accessible layout that matches PP's
  hand-walk first. Optimization refinements (try alternatives, pick max
  positions) come later only if the simple pass leaves positions on the table.
- One orientation (two-orientation pick is a separate later step).
- Capacity unchanged: from placed racks, −1/level per bay-column.
- Column RENDER position (column must not draw over a rack body; sits ~1–2"
  clearance beside the blocked slot) — PARKED, handled in the verdict-render pass.

## Test against the real case

240×120 / 20×25 / double-deep / reach truck (currently 9 aisle-columns at Y≈25):
after 3b, walk the building and report the resulting bands + each column's
outcome (flue/bay/aisle). Compare to what PP would place by hand — the forward
walk should now seat the columns that were stranded in the Y≈25 aisle, or push
them into a body as bay-columns, with NO column left blocking a travel aisle and
every aisle ≥ 10ft. Then PP eyeballs it: does it match the hand layout?

## Lock tests (add once verified)

- 25×30 case still produces its known bands (n=1 path unaffected).
- 20×25 case: no column left in a travel aisle; every aisle ≥ minAisle; columns
  are flue-seated or bay-columns; report positions.
- A grid where a column genuinely can't be seated without breaking minAisle →
  correctly becomes a bay-column, row kept.
