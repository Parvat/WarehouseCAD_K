# Trace Generator — S1 final (v9): tight-pack, then flush-to-columns

This corrects every earlier over-complication (fixed-aisle shifting was proven
impossible; "recover slack into an extra row" was wrong — a tight pack is already
max rows). The real algorithm PP places by hand is TWO simple passes.

Supersedes v8's S1 mechanism. S2/S3 definitions from v8 still stand.

## Why the earlier attempts failed (so we don't repeat them)
- "Shift rows but hold every aisle at exactly the forklift width" is
  mathematically impossible: once the wall is fixed and depth+aisle are fixed,
  every row position is forced — zero freedom. A column in a forced aisle can't
  be moved without widening a gap or dropping a row. (Proven, BUG 36 analysis.)
- "Re-check to fit an extra row" is also wrong: a tight forklift-pitch pack is
  ALREADY the max row count the building holds. There is no hidden row to find.
- So the aisle CANNOT always be exactly the forklift width. It is ≥ the forklift
  width, and it gets wider ONLY where cleanup flushes a rack to a column.

## THE TWO PASSES

### Pass 1 — tight pack, NO widening (already built, BUG 35)
- Wall rows single; interior rows back-to-back pairs.
- Every aisle = the forklift's standard width, packed tight, uniform.
- Do NOT touch columns yet. Some columns WILL land in travel aisles — leave them.
- This is the clean, max-row baseline. (This is the current generator output.)

### Pass 2 — flush racks to columns (the new build)
- For each column sitting in a travel aisle: **flush the nearest rack against the
  column** — push that rack until the column sits at its edge / under its body,
  OUT of the travel aisle.
- This makes that one aisle wider (the flushed rack moved away from it). **That is
  accepted** — a wider aisle is fine; a blocked aisle is not.
- Remove any unnecessary nudges so the result looks clean (racks sit flush to
  their columns, not floating at odd offsets).
- Result: no column in a travel aisle; aisles are tight where no column forced a
  flush, wider where one did; every aisle ≥ forklift width; clean look.
- **The dealer adjusts the rest** — the generator gets it ~95% there, not perfect.

## The objective (unchanged, correct)
- #1 Accessibility: no column blocks a travel aisle. Non-negotiable.
- Then: clean, tight where possible, wider only where a column forces it.
- NOT a perfect optimizer — a strong, clean, accessible starting layout the
  dealer fine-tunes.

## Aisle rule (final, correct)
- Aisle ≥ forklift standard width. Tight (= exactly that width) by default.
- Wider ONLY where Pass 2 flushed a rack to clear a column. Varied widths are a
  CONSEQUENCE of cleanup, not a control — expected, not a bug.
- The 22ft blowout was the BUG 36 error (widening every aisle to the column
  pitch); Pass 2 must widen ONLY the specific aisle a flush touches, never
  cascade to all.

## Capacity
From placed racks − 1/level per column now sitting under a rack body (bay-column).

## Build
- Pass 1: DONE (tight pack per forklift, BUG 35).
- Pass 2: BUILD NOW. Flush racks to columns that landed in aisles. Widen only the
  touched aisle; no cascade to the whole building. Keep it clean.

## Verify (all 3 forklifts, 240×120/25×30)
- ZERO columns in any travel aisle after Pass 2.
- Aisles: tight (forklift width) where no column forced a flush; wider only at
  flushed spots — NOT every aisle at 22ft (that's the BUG 36 regression).
- Reach/counterbalance/VNA all accessible; report per-forklift bands, aisle
  widths, row count, bay-columns, positions.
- Looks clean (racks flush to columns, no floating offsets).

## Then (later)
- S2: allow a column to REMAIN in an aisle where the truck can still pass it
  (≥ min clear on one side) instead of flushing — recovers a tight aisle where
  access survives.
- S3: flue-seating (rack between every column).
- Compute all three + present counts (killer feature).
