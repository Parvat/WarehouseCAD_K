# Max-positions column-aware generator — spec v6 (complete rule)

Supersedes v5. v5 got Y placement + fixed forklift aisles right (Step 1, done).
v6 adds the real objective PP places by hand: an **optimization** — maximize
pallet positions subject to a hard accessibility constraint.

---

## THE OBJECTIVE (the whole thing in two lines)

- **HARD CONSTRAINT — everything accessible.** No column may block a travel
  aisle the forklift can't route around. An inaccessible layout is worthless.
- **OBJECTIVE — maximum pallet positions** among all accessible layouts.

Everything below is how that objective is reached.

## COLUMN OUTCOMES — three cases, by where the column lands

- **In a flue** (between the two rows of a back-to-back pair) → GOOD, 0 lost. The goal.
- **In a bay / pick face** → ACCEPTABLE. Accessible; costs 1 position/level for
  that bay. Keep the bay, flag it (red). Do NOT drop a row for this — 1 lost vs ~10.
- **In a travel aisle** → NOT ACCEPTABLE. Blocks the forklift's path down that
  aisle. Must be fixed (see moves). This is the case that forces action.

## THE MOVES (to keep columns out of aisles)

When a column falls in a travel aisle, shift to fix it:
- shift the offending row up, widening that aisle so the column lands in a flue;
- push subsequent rows forward to keep every aisle ≥ the forklift minimum;
- if the cascade forces it, DROP a row.
Aisle width floor is always the forklift's specified minimum (Step 1 rule) —
never go below it to make something fit.

## THE SEARCH

It is not a one-shot formula. Among the layouts reachable by the moves above that
keep EVERY aisle accessible (no column in an aisle, every aisle ≥ forklift min),
**pick the one with the most pallet positions.** Bay-columns are allowed (they're
accessible); aisle-columns are not.

## FIXED INPUTS (Step 1, unchanged)

- Wall rows single; interior rows back-to-back pairs.
- Aisle = forklift minimum pick aisle (the AISLE input), every aisle that width
  or wider; rows packed at pitch = pairDepth + aisle. Leftover collects at the
  far wall (never an aisle below minimum).
- Column grid positions from columnGridObject (flush-from-origin, one source of
  truth — rowBands and the fixture agree).

## TWO-ORIENTATION OPTIMIZE (from v5)

Run the whole search for both orientations (rows along length / along width),
pick the orientation with more positions. Forklift is a fixed input, not a
search variable.

## AXES

- **Y (which rows a column falls between)** — Step 1 handles row placement; the
  search shifts rows so columns seat in flues not aisles.
- **X (column position along a row's length)** — a column landing inside a bay
  along the row is the "in a bay" case: accessible, flag −1/level, keep the row.
  (This is the "12 columns in racks" the check reported — bay-columns, acceptable.)

## VERDICTS (rendered from the result, never re-derived)

- In flue / absorbed by wall → blue, 0.
- In a bay → red, −1/level (accessible, kept).
- In an aisle → should not occur in a final layout (the search prevents it); if it
  does (fallback/irregular grid) → red, "blocks truck," flag approximate.
- Square marks, blue = free / red = costs.

## CAPACITY

Σ placed rows (bays × palletsPerBay × levels) − 1/level per bay-column. From
placed racks, never a separate formula.

## SCOPE / DEFERRED

- Rectangle buildings only (Cord is a rectangle); L/T/U later.
- Cross-aisle as today (one centered).
- Compare-trucks upsell out of scope (forklift fixed).
- The far-wall leftover strip (e.g. 23ft) — left as slack for now; could later
  hold a single far-wall row or a cross-aisle. Not part of the column search.

## ARCHITECTURE

Generator logic — `src/generate/sizingLayout.js`. Canvas/store frozen. Verdicts
are a render concern reading the result.

## BUILD ORDER

1. ✅ Column-driven Y placement + fixed forklift aisles (Step 1 — DONE, tested).
2. **Bay-columns (X + the un-seated Y ones): accept + flag.** A column in a bay →
   keep row, −1/level, red. No shifting. This closes the "12 in racks" as
   *accepted*, not errors. (Simplest half of the objective — do first.)
3. **Aisle-columns: the row-shift search.** Detect a column in a travel aisle →
   shift rows / drop a row to move it to a flue, keeping aisles ≥ min, choosing
   the max-positions accessible result. (The real optimizer — the hard part.)
4. **Two-orientation optimize** — run 1–3 both ways, pick max positions.
5. **Verdict render** — blue/red from the result.

## LOCK TESTS

- Step 1 cases still pass (25×30 bands; 240×120/50×54 → 10.5 aisles, 23 trailing).
- A column in a bay → flagged red, −1/level, row kept, count reflects it.
- A column in an aisle → search moves it out (shift or drop), final layout has NO
  aisle-column and every aisle ≥ min; result is the max-position accessible option.
- Two orientations differ → returns the higher position count.
