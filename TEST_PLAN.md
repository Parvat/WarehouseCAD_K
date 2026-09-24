# Trace canvas2 + Generator — Test Plan

Purpose: lock the generator and editing precision so it cannot silently regress.

Lesson this plan exists for: earlier reports said "verified / tests pass" and were
wrong on screen. A passing test only proves the code agrees with the test. So every
test here must (1) assert a number that comes from the spec or hand math, never from
running the current code, and (2) be proven able to FAIL.

---

## 1. Rules for every test

1. **Expected values come from this document**, not from the code's current output.
   If a value isn't in this doc, add it here first (with how it was derived) before
   writing the test.
2. **No snapshot-of-current-output tests.** Capturing whatever the code returns and
   calling it "expected" locks in bugs.
3. **Test the real path.** Geometry tests use the same functions the renderer and
   generator use. Rendering claims are checked against rendered output, not object
   fields.
4. **Both orientations** wherever orientation could matter.
5. **Every area passes the break-it check** (section 4).

---

## 2. Reference cases

| ID | Building | Grid | Forklift | Orientation |
|---|---|---|---|---|
| R1 | 240×120 | 25×30 | Reach | Horizontal |
| R2 | 240×120 | 25×30 | Reach | Vertical |
| R3 | 240×120 | 50×54 | Reach | Horizontal |
| R4 | 240×120 | 25×30 | Counterbalance | Horizontal |
| R5 | 240×120 | 25×30 | VNA | Horizontal |

Capacity totals for these cases are NOT hardcoded yet. They changed several times
during development. Record them here only after PP confirms a layout by eye and with
the measuring tool:

| ID | Confirmed total positions | Confirmed by / date |
|---|---|---|
| R1 | _pending_ | |
| R2 | _pending_ | |
| R3 | _pending_ | |
| R4 | _pending_ | |
| R5 | _pending_ | |

---

## 3. Areas and expected values

### A. Pallet position counting
Rule (industry standard, confirmed by PP): pallet loading face runs across the
beam; 3" clearance at each upright, 4" between pallets. N positions fit if
`N×face + (N−1)×4" + 2×3" ≤ beam`. Each position covers its pallet plus half the
4" gap on each side; end positions run out to the uprights.

| Beam | Face | Expected positions |
|---|---|---|
| 96" | 40" | 2 |
| 108" | 40" | 2 |
| 120" | 40" | 2 |
| 144" | 40" | 3 |
| 156" | 40" | 3 |
| 168" | 40" | 3 |

- Oversized threshold on a 96" beam: face up to 90" → 1 position; face 91" or more
  → 0 positions and the bay is flagged oversized (full-bay X, 0 capacity).
- 40" face boundary: 133" beam → 2 positions, 134" → 3.
- A column blocking one position in a 2-position bay → exactly −1 per level, not −2.
- Frame depth never limits position count (48" pallet on a 42" frame is valid).

### B. Flue sizing
- Default flue between back-to-back rows: **9"**.
- Column seated in a flue: flue = **exactly the column size** (12" column → 12").
  No added clearance.
- `flueBaseIn` stays 9" when a drag or the generator widens `flueSpaceIn`.
- Generated double rows carry `flueBaseIn = 9"` even when placed widened.
- No yellow flue line is drawn.

### C. Column seating
- Every column is fully in exactly one of: flue, rack face (bay), travel aisle.
  **Never straddling** a face/flue boundary.
- Holds in both orientations.

### D. Grid origin ("Columns along wall") — applies to BOTH axes
- **Yes:** grid lines start ON the wall (offset 0) on both X and Y.
- **No:** first line is one full pitch in from the near wall on EACH axis (X pitch
  from left, Y pitch from top); no column on ANY of the four walls, including the
  far wall when the length/width is an exact multiple of the pitch.
- Example, 240×120, 25×30 grid:
  - X Yes: 0, 25 … 225 · X No: 25 … 225
  - Y Yes: 0, 30, 60, 90, 120 · Y No: 30, 60, 90
- Drawn grid and rack-avoidance math read from one shared function (axisGridLines),
  both axes, both orientations.
- The drawn grid position equals the position the rack-avoidance math uses, for both
  toggle states and both orientations.
- Exactly one `column_grid` object per generation.

### E. Aisles and accessibility
| Forklift | Aisle (pick) | travelFt = min(8, aisle) | Cross-aisle |
|---|---|---|---|
| Reach | 10.5' | 8' | 9' |
| Counterbalance | 12.5' | 8' | 13' |
| VNA | 6' | 6' | 8.5' |

- Rows pack at pitch = pairDepth + aisle; aisles equal the forklift width except
  where a column forced a widen, AND except the aisle before the far-wall row,
  which absorbs leftover space (whole rows can't fill any width exactly). That
  aisle may be wider than the forklift aisle, never narrower.
- Widen only when the gap to the next column is **less than travelFt**.
- No aisle narrower than travelFt anywhere (no "blocked" level-1 aisle).
- Level 2 (clear ≥ travelFt but < aisle) counts as accessible.

### F. Cross-aisle
- Width per forklift (table above).
- No column inside the cross-aisle.
- Racks reach both end walls (no gap), both orientations.

### G. Walls
- Wall rows are single; interior rows are back-to-back, EXCEPT the row before the
  far-wall row may be a single when a pair won't fit (buys positions). There must
  be a travel aisle ≥ forklift aisle width between that single and the far-wall
  single, so both are accessible.
- Wall clearance default **6"**: first row starts 6" off the wall.

### H. Orientation
- Auto runs both orientations and places the one with more positions (tie →
  horizontal). The placed layout is the reported winner.
- Only `axisFrame` reads orientation (no other orientation branches).

### I. Regenerate
- Generating twice leaves exactly one generated layout (no stacked duplicates).
- Still true after a page reload between generations.
- A hand-drawn floor plan is never removed by Generate.

### J. Snapping and live flue
- Dragging a row toward a column snaps its edge to the face it approaches (guide on
  that face, on the column border, not inside).
- Center snap: row midline to column center works with no other row present.
- Live flue: dragging a pair over a column widens the flue to the column size;
  dragging away returns it to 9". Works on generated and hand-placed racks, and on a
  rotated rack.

---

### K. Pick zone (columns in the aisle blocking positions)
- Pick zone = rectangle in front of a pallet position on each pick side: width of
  that position × depth of the forklift pick aisle (aisleFt), straight out from the
  pick face. A column overlapping it blocks that position from that side.
- Pick sides: double-row face → its aisle side only. Single row → every side with
  an aisle ≥ aisleFt (one side if against a wall, two if aisles both sides).
- A position is lost (red X, −1 capacity) only when EVERY pick side is blocked.
- Single row blocked on one side, clear on the other → still pickable, no X.
- A position already blocked by a column inside the rack counts once.
- Works for rotated racks, both orientations, updates live while dragging.

---

## 4. Break-it proof (required)

For each area, deliberately break the production code, run the suite, confirm the
listed tests FAIL, then revert. Record the result.

| Area | Break to apply | Tests that must fail | Result |
|---|---|---|---|
| A | Change per-pallet clearance 8" → 0" | A: 120"/168" counts, 88" oversize limit (108" cannot fail: 3×40" > 108" regardless) | |
| B | Default flue 9" → 6" | B: default flue | |
| B | Re-add 4.8" clearance | B: column-fit flue | |
| C | Skip the face-seat fallback | C: no-straddle | |
| D | Ignore toggle, always offset 0 | D: No = inset | |
| D | Shift drawn grid only, not avoidance | D: sync test | |
| E | Compare gap to aisleFt instead of travelFt | E: widen gate | |
| F | Center the cross-aisle, ignore columns | F: no column in cross-aisle | |
| G | Wall clearance 6" → 0" | G: wall offset | |
| H | Always return horizontal | H: auto-pick | |
| I | Skip clearGeneratedLayout | I: no duplicates | |
| J | Remove center snap | J: lone-column center snap | |
| J | Drag writes flueSpaceIn into flueBaseIn | J: shrink back to 9" | |
| K | Pick zone depth → 0 | K: aisle-column blocks position | |

**Any row where no test failed means those tests are not real. Fix before trusting.**

---

## 5. Manual checks (PP, with the measuring tool)

After the suite passes and the break-it table is complete:

1. R1: measure a double row's flue gap with no column → **9"**.
2. R1: measure a flue with a seated 12" column → **12"**.
3. R1 with "Columns along wall" = No: measure left wall to first column →
   **25'**, and top wall to first column → **30'**. With Yes: a column on the
   left wall and on the top wall.
4. R1: measure a regular aisle → **10'6"**.

If any measurement disagrees with the test's expected value, the test is wrong or
the render is wrong. Stop and investigate before continuing.
