# Canvas2 + Generator — Test Suite Record

Implements `TEST_PLAN.md` (areas A–J), plus area K (pick zones) and the §2b building variation matrix (M1–M24). This file records what each test covers,
the expected values it asserts, the break-it proof, and the final result.
Bugs are logged in `CANVAS2_BUGLOG.md`; nothing here belongs there.

- **Location:** `src/__test__/plan/` — one file per area, plus `fixtures.js`
  (inputs only: the R1–R5 briefs and helpers that build a layout the same way
  `buildQueue` does).
- **Run:** `npx vitest run src/__test__/plan` (plan suite) or `npx vitest run`
  (everything).
- **Date:** 2026-09-24. Branch `canvas2-test-plan`.

---

## 1. Ground rules as applied

- Every expected number is copied from `TEST_PLAN.md`, or hand-derived in a
  comment next to the test from the plan's rules. None came from running the
  code.
- No snapshots of current output.
- Generated-layout checks run on the **real path**: `sizingSheetLayout` →
  `placementToObject` → `columnGridObject` → `expandColumnGrid` (the function
  `ColumnGridShape` draws from). Area I drives the real store and
  `generateAndPlace`. The only stand-in is a bare `document` object, because
  `placeFpObject` reads the canvas size from the DOM and already handles a
  missing element.
- **Property sweep:** C, E, F and G run over every reference case, in both
  orientations and both "Columns along wall" states: 5 × 2 × 2 = 20
  layouts per check.
- Capacity totals for R1–R5 are **not asserted**. They stay pending in
  TEST_PLAN.md §2 until PP confirms them.

---

## 2. Coverage by area

### A — Pallet position counting · `A_positions.test.js` (10 tests)
| Test | Asserts |
|---|---|
| `A-table` ×6 | 40" face: 96"→2, 108"→2, 120"→2, 144"→3, 156"→3, 168"→3 |
| `A-oversize` (90") | 96" beam, 90" face → 1 position, not flagged (90 + 2×3 = 96) |
| `A-oversize` (>90") | faces 91, 92, 96 → 0 positions, bay flagged, rack capacity 0 |
| `A-column` | a 12" column inside position 0 (beam-local 0–45") of a 96" bay (2 positions, 3 levels) → `positionsLostIfAbsorb` = 3, i.e. −1 per level; capacity before = 6 |
| `A-depth` | 48" pallet on a 42" frame, one 96" bay, 1 level → 4 positions (2 × 2 faces) |

### B — Flue sizing · `B_flue.test.js` (6 tests)
| Test | Asserts |
|---|---|
| `B-default` ×2 | configured default flue = 9"; every generated pair with no column grid has a 9" flue |
| `B-column-fit` | hand-derived single column at 19.5': the seating pair's flue = **12"** exactly, and the pair is 42+12+42 = 96" deep |
| `B-column-fit` | the same with an 18" column → **18"** flue ("exactly the column size") |
| `B-base` | R2's generated double rows all carry `flueBaseIn = 9"`; a guard asserts at least one is actually widened |
| `B-line` | double-row render ops: every rect and every divider segment lies wholly outside the flue gap, so no line is drawn in it |

### C — Column seating · `C_seating.test.js` (21 tests)
| Test | Asserts |
|---|---|
| `C-fallback` | hand-derived column at 19.375' that can't be flue-seated without shrinking the aisle ends up wholly inside exactly one face |
| `C-no-straddle` ×20 | every column touching a rack lies wholly inside one of its depth bands (front face / flue / back face) and inside its run extent. A column touching no rack is in open floor. |

### D — Grid origin · `D_gridOrigin.test.js` (42 tests)
The rule applies to **both** axes: Yes → line #0 on the near wall on X and Y;
No → line #0 one full pitch in (gridXFt from left/right, gridYFt from
top/bottom), and no column on any of the four walls.

| Test | Asserts |
|---|---|
| `D-yes` ×5 (R1–R5) | first drawn Y line = 0 (on the wall) |
| `D-no` ×5 (R1–R5) | first drawn Y line = one full pitch (30' or 54'); no line at 0 or at the far wall |
| `D-axes` ×20 (R1–R5 × both orientations × both toggles) | on X **and** Y, for the drawn lines **and** the avoidance lines: Yes → first line 0; No → first line = that axis's pitch, and no line on either wall of that axis |
| `D-values` Yes | 240×120 / 25×30: X = 0, 25, …, 225; Y = 0, 30, 60, 90, 120 |
| `D-values` No | 240×120 / 25×30: X = 25, 50, …, 225; Y = 30, 60, 90 |
| `D-sync` ×8 (R1, R3 × both orientations × both toggles) | drawn line set = the avoidance line set, on **both** axes, first line to last |
| `D-one-grid` ×2 | exactly one `column_grid` per generation, both toggles |

### E — Aisles and accessibility · `E_aisles.test.js` (47 tests)
| Test | Asserts |
|---|---|
| `E-table` ×3 | reach 10.5 / 8 / 9 · counterbalance 12.5 / 8 / 13 · VNA 6 / 6 / 8.5 (aisle / travel / cross-aisle), in both the rules table and the column-check profiles |
| `E-pitch` | no columns: first aisle 10.5', then pair-to-pair pitch 7.75 + 10.5 = 18.25' |
| `E-widen-gate` | gap to column 9' (≥ travel, < aisle) → aisle stays 10.5'. Gap 7' (< travel) → widens, far side clears ≥ 8'. |
| `E-levels` | clear 10' on a reach aisle → level 2, not blocked; clear 7' → level 1, blocked |
| `E-exact` ×20 | every aisle equals the forklift width unless a column forced a widen; the last aisle before the far-wall row is only required to be ≥ the width (**amended**, §3). A widen counts as column-forced if a column lies between the aisle's start and the next row's far face, **inclusive** (see §3). |
| `E-no-block` ×20 | every row-to-row gap ≥ travelFt; no level-1 column block |

### F — Cross-aisle · `F_crossAisle.test.js` (21 tests)
| Test | Asserts |
|---|---|
| `F-column` | hand-derived lone column at 124', inside the centred split, is moved out of the cross-aisle; width ≥ 9' |
| `F-generated` ×20 | each band has 2 segments; racks start 0.5' from one end wall and end 0.5' from the other; cross-aisle ≥ 9 / 13 / 8.5' per forklift; no column footprint inside it |

### G — Walls · `G_walls.test.js` (22 tests)
| Test | Asserts |
|---|---|
| `G-default` | wall clearance default = 6" |
| `G-generated` ×20 | first and last rows are singles, 6" off each wall. Interior rows are back-to-back, except the row directly before the far-wall row, which may be a single (**amended**, §3). If it is a single, the aisle between it and the far-wall single must be ≥ the forklift aisle width. |
| `G-single-aisle` | guard: the interior-single case actually occurs in the reference set, so the aisle check above really runs |

### H — Orientation · `H_orientation.test.js` (17 tests)
| Test | Asserts |
|---|---|
| `H-auto` ×3 | stub generator with hand-set capacities (2 positions per 96" bay, §3A): vertical 10 vs horizontal 6 → vertical, and the vertical layout is placed; reverse → horizontal; tie → horizontal |
| `H-auto` (R1) | the placed layout's gross = the reported winner's gross; the winner has the larger **usable** total |
| `H-usable` | **Auto compares usable, not gross** (2026-09-24). Hand-built 100×100 building, 50×50 grid, wall=No → one 12" column at (2000, 2000) px. Horizontal: single, 3 bays × 1 level, clear of it → gross 6, usable 6. Vertical: single, 2 bays × 2 levels at x 1840, y 1960 → gross 8; the column straddles bay 0's positions 0/1 (boundary at x 2000) → −2 × 2 levels → usable 4. Asserts totals 6/8, usable 6/4, pick **horizontal**, horizontal placements placed. |
| `H-usable` (column moved) | same stub, grid 90×90 → the only column is clear of both racks → usable 8 vs 6 → vertical |
| `H-usable` ×10 (R1–R5 × both toggles) | usable ≤ gross on both sides; the winner's usable ≥ the loser's; a usable tie goes to horizontal |
| `H-single-reader` | `rowBands` / `rowSegments` never mention orientation. Outside `axisFrame`, `sizingLayout.js` has no orientation comparisons. |

### I — Regenerate · `I_regenerate.test.js` (3 tests)
| Test | Asserts |
|---|---|
| `I-twice` | two generations → 1 floor plan, 1 column grid, same object count as one generation |
| `I-reload` | generate, serialize, re-create every module (in-memory state gone, as on a reload), restore, generate again → still 1 floor plan, 1 grid, same count |
| `I-hand-drawn` | a hand-placed floor plan survives two generations (2 floor plans total: it + exactly one generated) |

### J — Snapping and live flue · `J_snapLiveFlue.test.js` (10 tests)
| Test | Asserts |
|---|---|
| `J-face` ×4 | approaching from left / right / above / below, the row's edge snaps exactly onto the approached face. The guide sits on that face of the box `expandColumnGrid` draws — not the centre, not the far face. |
| `J-center` | row midline snaps to a lone column's centre, with no other row present |
| `J-widen` | pair dragged over a 12" column → flue 12" |
| `J-shrink` ×3 | hand-placed pair: a second drag away after the first committed widened → 9" and base height. Generated pair (`flueSpaceIn` 12, `flueBaseIn` 9): first drag away → 9", back → 12". `flueBaseIn` stays 9" through a drag that ends widened. |
| `J-rotated` | 90°-rotated pair widens over a column in its rotated flue, then shrinks away from it |

### K — Pick zones (aisle columns) · `K_pickZone.test.js` (33 tests)
Rule (added 2026-09-24): in front of each pallet position, on each side it is
picked from, the forklift needs a rectangle as wide as that position and as
deep as the selected truck's pick aisle (`aisleFt`: reach 10.5', counterbalance
12.5', VNA 6'), measured straight out from the pick face. Any column overlap
blocks that side. A double row's face is picked from its own side only. A
single row is picked from every side with an open aisle ≥ `aisleFt` (no other
rack in the zone, and inside the building when a floor plan exists). A
position is lost only when **every** pick side is blocked. It gets the same
red X and comes off `positionsLostIfAbsorb`, once.

Hand geometry used throughout: one 96" bay, 3" uprights, 40" face → position
0 at world x 10–160 px, position 1 at 160–310 px (GS 40). Reach zone 420 px
deep: face 0 zone y −420..0, face 1 zone y 310..730 (double, 310 px deep).

| Test | Asserts |
|---|---|
| `K-double` | 1' column 5' out from face 0, in front of position 0 → `pickBlocks` = bay 0, face 0, position 0, 3 lost (3 levels); not an in-rack conflict; total loss 3 |
| `K-double` (face 1) | a column in face 1's zone blocks face 1 position 0 only |
| `K-outside` | column touching the zone's side edge (x −30..10) → nothing blocked, loss 0 |
| `K-deep` | column touching the zone's far edge (y −460..−420, i.e. deeper than 10.5') → nothing; 1 px inside (−459..−419) → blocked |
| `K-single-one-side` | single, aisles both sides, column in one zone only → no block, loss 0 |
| `K-single-both-sides` | single, columns in both zones of position 0 → X on position 0, 3 lost |
| `K-wall` | single 6" off a wall (floor starts y −20): column in its one (far) zone → blocked, 3 lost. Same columns with no floor plan → not blocked (the near aisle still serves it). |
| `K-once` ×3 | in-rack column at position 0 plus both zones blocked → counted once (3, from the in-rack conflict only); two columns in the same zone → 3, not 6; a column straddling the 48" boundary → positions 0 and 1, 6 lost |
| `K-rotated` ×2 | 90° double row: face 0's zone at world x 325..745, face 1's at −405..15 → each blocks its own face; a column where the unrotated zone would be → nothing. 270°: face 0's zone at world x −405..15 → blocks face 0. |
| `K-depth` | column 7' out: blocked for reach (10.5'), not VNA (6'). 12' out: not reach, blocked for counterbalance (12.5'). |
| `K-generated` ×20 | every reference layout, both orientations, both toggles: no position is in both the in-rack and the pick-zone lists, none repeats, and `positionsLostIfAbsorb` = in-rack loss + pick-zone loss |

**Usable capacity** (same change): `generate/usableCapacity.js` — usable =
gross − `positionsLostIfAbsorb` (in-rack + pick-zone, each position once).
The capacity headline reads Column Check's own result, so the two always
agree. The auto-pick scores each candidate with its own column grid and the
building outline, the same inputs Column Check sees once placed.

**Total: 232 plan tests.**

---

### L — Column on an upright frame · `L_uprightColumn.test.js` (7 tests)
A column can't be installed through an upright frame. `columnsOnUprights`
(`columnCheck.js`) flags every column whose footprint overlaps a frame and
moves nothing; the dealer resolves it. Frames are `uprightXs` (both ends and
every interior one, `uprightWidth` wide), one per band: a double row has a
frame line per face and none across the flue. `checkColumns` returns
`uprightHits` and `summary.columnsOnUprights`. On the canvas the frame gets
an orange outline + light orange fill (`UprightConflictMarks`), distinct
from the red pallet X. Column Check lists "Column on upright frame · <rack> ·
between bays N and N+1 · column K".

Hand geometry: two 96" bays on 3" uprights → frames at x 0–10, 330–340,
660–670 px (GS 40); a 12" column is 40 px; 1" = 3.33 px.

| Test | Asserts |
|---|---|
| `L-interior` | column x 320–360 over the frame at 330–340 → flagged: upright 1, bays [0, 1] |
| `L-clear` | column 1" short of 330, and column 1" past 340 → not flagged |
| `L-touch` | column 290–330, exactly touching → not flagged |
| `L-end` | end frames: upright 0 → bay [0]; upright 2 → bay [1] |
| `L-double` | back band only → face [1]; y 135–175 clips both bands → faces [0, 1]; a 12" column exactly filling a 12" flue → not flagged (no frame across the flue) |
| `L-rotated` | 90° double row: frame 1 at world y 150–160, front band x 350–490 → flagged; mid-bay → not |
| `L-check` | `checkColumns` reports it (`uprightHits`, count 1) and the rack object is unchanged |

**Uprights drawn to scale** (`render/rackOps.js`). Upright frames were hairline
bay dividers. They are now one `uprights` op per rack: a filled rect per
frame per band at the real `uprightWidth`. The painter
(`uprightDrawRects`, Konva and PDF) floors the drawn width at
`RACK_LINE.hair` (1.2 px) screen, so at overview zoom a frame still reads as
a line. Note: the SVG reference also drew these as hairlines, never filled
rects, so there was nothing to port; this is new. Tests in `rackOps.test.js`
("uprights drawn to scale"): drawn width = 10 world px (3") at scales 1, 4 and
10; a 4" frame draws 13.33 px; at scale 0.05 the drawn width is 1.2 screen
px, centred on the frame. The old divider-path tests were rewritten for the
new op with the same intent (one node, inside the box, full height, never
across the flue); B-line now checks the upright rects stay out of the flue.

**Across the matrix** (M1–M25, 100 runs):
36 runs have at least one column on an upright frame, **520 columns** in
total. Each case below lists horizontal / vertical, and is the same for wall = Yes and No.

| Case | H | V | Case | H | V |
|---|---|---|---|---|---|
| M2 150×100 | 5 | 0 | M14 1000×150 | 16 | 0 |
| M3 240×120 | 4 | 0 | M15 150×1000 | 80 | 0 |
| M6 300×200 VNA | 2 | 0 | M17 333×217 CB | 0 | 3 |
| M7 400×250 CB | 10 | 3 | M18 480×240 VNA | 2 | 0 |
| M8 500×300 | 16 | 0 | M19 720×360 | 0 | 12 |
| M11 1080×410 | 48 | 0 | M21 900×500 VNA | 0 | 12 |
| M12 1080×410 CB | 4 | 3 | M23 1500×300 | 16 | 0 |
| M24 400×100 CB | 8 | 0 | M25 1080×410 50×54 reach | 16 | 0 |

All other cases: 0.

### Column markers stay in their face · `columnMarker.test.js` (6 tests)
The "column on the joint" report (1080×410, 50×54, reach) was a drawing effect.
No generated layout puts a column across both faces of a pair. At overview
zoom a 12" column is enlarged to a 6 px marker, and it was grown around its
centre, so a column flush against the flue spilled across the 9" gap.
`canvas2/columnMarker.js` now keeps an enlarged marker inside the rack face
(band) its column sits in. If the floor is deeper than the face, the marker
is anchored at the flue edge and grows outward. `ColumnGridShape` receives
the racks from `Scene`. Drawing only.

Hand geometry: double row 340×310 px, front face y 0–140, flue 140–170,
back face 170–310; 40 px column; 6 px floor = 60 world px at zoom 0.1, 300 at
0.02.

| Test | Asserts |
|---|---|
| front face, flush at the flue (y 100–140), zoom 0.1 | drawn y 80–140 (centred would be 90–150); x stays centred 40–100 |
| back face, flush at the flue (y 170–210) | drawn y 170–230 |
| floor deeper than the face (zoom 0.02) | front: y −160–140; back: y 170–470 (anchored at the flue edge) |
| working zoom (1) | drawn = the column, y 100–140 |
| open floor (y −200) | centred growth, y −210 to −150 |
| rotated 90° (front face → world x 185–325, flue x 155–185) | column x 185–225 drawn 185–245 |

### §2b — Building variation matrix · `M_matrix.test.js` (908 tests)
**M25 = 1080×410, 50×54, reach** added permanently (the joint report's case):
all 9 rules pass in all four runs (36 tests).

25 buildings (M1–M25, TEST_PLAN.md §2b + M25) × both orientations × both "Columns
along wall" settings = 100 runs, each checked against all 9 rules (900 tests),
plus 8 scale-sanity tests. Rules only; no totals are captured anywhere.

| Rule | Asserts, per run |
|---|---|
| 1 fills | first/last row within one row module (pair + aisle) of each wall along the stack axis; every row within one bay + cross-aisle of each end along the run |
| 2 no oversized gap | interior aisles = forklift aisle unless a column forced a widen (same detector as E-exact); **far-wall leftover gap holds no legal position for another single row** — under 2 × aisle + single depth (24.5 / 28.5 / 15.5′) it passes on width alone, above it an exhaustive scan runs (aisle ≥ forklift aisle both sides, no straddled column, every column leaving ≥ travelFt on one side; 0.01′ sweep plus every point where legality can change); per row, at most one stretch longer than a bay, and it is the cross-aisle, in [cross-aisle, cross-aisle + 8.25′]; wall-end gaps ≤ one bay |
| 3 travel | every row-to-row gap ≥ travelFt; no level-1 column block |
| 4 no straddle | every column touching a rack is wholly inside one face or flue band and inside the rack's run |
| 5 grid | drawn lines = avoidance lines on X and Y; Yes → first line 0; No → first line one pitch in, none on either wall |
| 6 capacity | gross > 0, usable ≤ gross, usable = gross − in-rack − pick-zone, no position in both lists or twice |
| 7 auto-pick | winner's usable ≥ loser's; tie → horizontal |
| 8 overlaps | no two racks overlap; every rack inside the building |
| 9 regenerate | two `generateAndPlace` runs through the real store → one building, one grid, identical objects (ids normalised); the placed layout = the generator's output |
| scale ×8 | M2 → M9 → M13 (reach), both orientations and toggles: positions ratio ≥ 0.75 × area ratio (density doesn't fall as the building grows; 4× area → ≥ 3× positions) |

**Caps removed (the fix under test):** `MAX_ROWS = 40` and `MAX_BAYS_SEG = 40`
are gone from `sizingLayout.js`. `rowBands` keeps an endless-walk guard
sized from the building (`ceil(stackFt / singleFt) + 2` rounds, each placing
at least a single row). `rowSegments` no longer limits bays or the split.

**Two generator fixes** (after the matrix first ran, 26 failures):
- **Rule 4 — no straddle.** `settleRow` (in `rowBands`): after the flue/face
  seating steps, any column still crossing a row's edge or a face/flue
  boundary pushes the row FORWARD by the least amount that leaves the column
  wholly inside one band or wholly in the aisle before it. For a clipped
  front face that is "just past the column" (start = column's far edge), a
  column-forced widen of under one column width; the face behind it then
  shows the expected pick-zone X. Applied to pairs and to singles. If the
  push would run into the far-wall row, the walk stops there instead.
- **Rule 2 — refill after a pop.** `tryFillSingle`: when the far-wall cleanup
  pops a row (either cleanup pass), it tries a single in the freed gap under
  the walk's own rules — travelFt widen gate, no straddle, ≥ aisle before the
  far-wall row, and no column pinching that last gap below travelFt.

**Matrix result: 908 / 908 pass** (872 for M1–M24, plus 36 for M25).

Rule 2's far-wall check is worded as the scan itself (PP, 2026-09-24): "the
far-wall leftover gap must contain no legal position for another single
row", with the width bound kept as a fast pass. That settles M4 and M19
horizontal (31′ and 27.5′ gaps): the scan finds no legal single in either —
M4's column leaves 7.5′ to the far-wall row (< 8′ travel), M19's sits 7′ past
the last pair — so the generator already fills them as well as the rules
allow.


## 3. Plan-vs-code discrepancies found, and how each was resolved

The first run gave 22 failures. All three causes were genuine differences
between TEST_PLAN.md and the code, not test bugs; each was confirmed by
inspecting the real generated geometry. Resolved by user decision on
2026-09-24:

| Area | Finding | Decision |
|---|---|---|
| **D** | "Columns along wall" = No still drew a column **on the far wall** whenever the width is an exact multiple of the pitch (R1: lines at 30, 60, 90, **120**) | **Code fixed.** `axisGridLines` (new, `sizingLayout.js`) is the single definition of grid-line positions, used by both `columnGridObject` (drawn) and `axisFrame` (avoidance). "No" drops a far-wall line. `rowBands` and `rowSegments` are now bounded by the same first and last line. |
| **E** | The aisle before the far-wall row absorbs leftover space (R1: 14' at 102→116' instead of 10.5', no column involved). Whole rows can't fill an arbitrary width, so the leftover has to go somewhere. | **Plan amended:** the aisle directly before the far-wall row may be wider. It must still be ≥ the forklift width. Every other aisle is unchanged. |
| **G** | When a final pair won't fit, the generator places it as a single (R1: an interior single at 98.5' next to the far-wall single) | **Plan amended:** the row before the far-wall row may be a single. **Added requirement:** the aisle between it and the far-wall single must be ≥ the forklift aisle width, or it's a bug. It holds in all 20 layouts. |

**Please carry the E and G amendments into TEST_PLAN.md.** It isn't in the
repo, so it hasn't been edited.

### Side effects of the D fix
- `rowBands` previously let `k` go negative, so in "No" mode it could see a
  phantom column **on** the wall, one pitch before line #0. The drawn grid
  never had that column. It never influenced a real layout (the wall row
  region isn't tested), but the line sets now match exactly.
- `rowSegments` previously saw one line **fewer** than the drawn grid: the
  last drawn line was missing from the avoidance math. It now sees the same
  lines.
- A "No" building only one pitch wide has no interior Y line at all, so
  `columnGridObject` returns no grid.
- All 393 pre-existing tests still pass.

### Other notes (no test failures)
- **A — formula resolved (industry standard).** The code now uses
  `N×face + (N−1)×4" + 2×3" ≤ beam` (`UPRIGHT_CLEARANCE_IN` = 3,
  `PALLET_GAP_IN` = 4), replacing `N×(face + 8") ≤ beam`. The single-pallet
  limit on a 96" beam is now **90"** (was 88"); 91" and up is oversized. The
  40" table is unchanged (96/108/120 → 2, 144/156/168 → 3). A position's
  footprint is its pallet ± 2" (half the gap). The first position runs from
  the upright (0); the last runs to its pallet end + 3". `positionFootprintIn`
  drives both `blockedPositionIndices` and the drawn blocked marks
  (`shapes.jsx` `positionRectForIndex`). Slack past the last position costs
  nothing.
- **D — both axes.** The first fix handled Y only; X stayed centred (7.5,
  32.5, …, 232.5 on 240/25, both toggles). `axisGridLines` now drives X and
  Y with the same toggle rule, in both `columnGridObject` and `axisFrame`.
  Pre-existing tests that pinned layout counts from the centred X grid (row
  count, widened-pair count, totals, aisle count) became property checks,
  because the plan forbids snapshots of current output.
- **E — detector widened.** In R1/R2 vertical, a pair was shifted forward to
  flue-seat a column and then turned into a single by the far-wall cleanup.
  The single kept its shifted start, which left an 11.5' aisle with the
  column flush against the single's back face. That widen is still
  column-caused, so the "column in window" check now includes a column
  touching the next row's far face.
- **J — refactor for testability.** The drag-start base and commit logic moved
  out of the React hook into `liveFlue.js` (`resolveFlueBase`,
  `flueCommitFields`), and `useCanvasInteraction.js` calls them. Behaviour is
  unchanged, and the J tests now exercise the real code.
- **H — scope.** "Only `axisFrame` reads orientation" is checked for the
  generator module. `traceGenerate.js` reads `orientation === 'auto'` to choose
  between auto and manual; that is not a geometry branch.

---

## 4. Break-it proof

Method: record a baseline (0 failures), apply one break to production code, run
the plan suite, and list the tests that **newly** fail. Then restore the file
from a pre-break copy and verify it is byte-identical before the next break.
Every break was reverted, and the suite returned to all-passing afterwards.
Round 2 ran on the current code (both-axes grid rule, industry pallet formula)
with the whole project suite (581 tests) as the baseline. Round 1 ran on the
original code.

**Round 2 (current code):**

| Area | Break applied | Tests that failed | Reverted |
|---|---|---|---|
| D | **Re-centre the X axis** (drawn grid and avoidance together) | 26: `D-axes` ×20, `D-values` Yes and No, plus 4 pre-existing `sizingLayout` grid/axisFrame tests | ✓ |
| D | Re-centre the X axis on the **drawn** grid only | 58: `D-sync` ×8, `D-axes` ×20, `D-values` ×2, plus real layout fallout (`C-no-straddle` ×4, `E-exact` ×6, `E-no-block` ×9, `F-generated` ×5) and 4 pre-existing tests | ✓ |
| A | Upright clearance 3" → 0" | 10: `A-oversize` (>90"), plus 9 `capacity.test.js` tests (constants, 133/134" flip, 44" face, footprints, blocked straddle, 91" oversize ×3, 91" capacity) | ✓ |
| A | Revert to the old `floor(beam / (face + 8"))` | 3: `A-oversize` (90"), the capacity 90" limit test, the 133/134" flip | ✓ |

With 0" at the uprights, three 40" faces still need 128", so the 108" and
120" counts stay at 2 and can't fail.

| K | **Pick-zone depth → 0** (`pickZoneBlocks`: `aislePx = 0`) | 10: every blocking test — `K-double` ×2, `K-deep`, `K-single-both-sides`, `K-wall`, `K-once` (two in one zone), `K-once` (straddle), `K-rotated` ×2, `K-depth`. The ones that stay green assert "not blocked" or bookkeeping (`K-outside`, `K-single-one-side`, `K-once` in-rack, `K-generated`), which a zero-depth zone can't break. | ✓ |

| H | **Auto-pick compares gross again** (`vertical.total > horizontal.total`) | 3: `H-usable` hand-built (picks vertical), `H-usable` R3 wall=Yes, R3 wall=No (gross picks vertical, usable favours horizontal) | ✓ |

| §2b | **Re-add the caps** (restore the committed `sizingLayout.js` with `MAX_ROWS`/`MAX_BAYS_SEG` = 40) | 34 newly failing: rule 2 on M10, M11, M12, M13, M14, M21, M23 (all four runs each) and M15 vertical ×2; scale sanity M9 → M13 ×4. **M9 does not fail** — at 600×400 neither cap binds (33 rows, 72 bays), so the plan's "M9–M13 must fail" expectation is off for M9; M14, M15 and M21 also fail. | ✓ |

| §2b | **Remove the straddle push** (`settleRow` returns the row's start unchanged) | 18: rule 4 on M4 V, M7 H, M8 H, M12 V, M16 H, M17 V, M19 V, M23 H, M24 V (both wall settings each) — exactly the pre-fix set | ✓ |
| §2b | **Remove the single refill** (`tryFillSingle` returns false) | 4: rule 2 on M2 H and M15 H (both wall settings) — exactly the pre-fix set that the refill resolves | ✓ |

| §2b | **Scan rule: remove the single refill AND re-add the caps** (`tryFillSingle` returns false; `bands.length < 40`; bays capped at 80 / 40 per segment) | 40: rule 2 ×36 and scale M9 → M13 ×4. **The scan finds a legal single in 20 runs:** M2 H 30′ gap (legal at 76.5′), and the capped-row sides of M10 V, M11 V (341.5′ gap), M12 V, M13 V, M14 V, M15 H, M21 V, M23 V (761.5′). The other 16 rule-2 failures are the capped-bay sides failing the cross-aisle bound (e.g. M11 H 418.5′). | ✓ |

| L | **Remove the detection** (`columnsOnUprights` returns []) | 5: `L-interior`, `L-end`, `L-double`, `L-rotated`, `L-check`. (`L-clear` / `L-touch` assert "not flagged" and can't fail this way.) | ✓ |

| Marker | **Centred growth again** (`columnMarkerRect` returns the centred rect) | 4: front face, back face, deeper-than-face, rotated. (Working zoom and open floor can't fail this way.) | ✓ |

**Round 1 (original code):**

| Area | Break applied | Tests that failed | Reverted |
|---|---|---|---|
| A | *(superseded by round 2)* **"End clearance 3" → 0"":** the code has no separate 3" end term. It uses one 8" allowance per pallet slot (`PALLET_CLEARANCE_IN`). Applied the two closest real breaks. **A1:** 8 → 5 (strip the 3") | `A-oversize` (>88") | ✓ |
| A | **A2:** 8 → 0 (all clearance removed, ends included) | `A-table` 120", `A-table` 168", `A-oversize` (>88") | ✓ |
| B | Default flue 9" → 6" (`DEFAULT_RULES.selective.flueIn`) | `B-default` ×2, `B-base` | ✓ |
| B | Re-add 4.8" clearance (`flueInForColumn` = max(flue, col + 4.8)) | `B-column-fit` ×2 | ✓ |
| C | Skip the face-seat fallback in `rowBands` | `C-fallback`, `C-no-straddle` R1/R2 horizontal (both toggles) | ✓ |
| D | Ignore the toggle: grid and avoidance always flush | `D-no` ×5 (R1–R5) | ✓ |
| D | Shift the drawn grid only: avoidance stays flush | `D-sync` ×4 (every wall=No case) | ✓ |
| D | *(extra)* Don't drop the far-wall line | `D-no` R1, R2, R4, R5 (the exact-multiple widths) | ✓ |
| E | Widen gate compares the gap to aisleFt instead of travelFt | `E-widen-gate` (9' case); collateral: `B-base` (R2 no longer produces a widened pair, so its guard trips) | ✓ |
| F | Centre the cross-aisle and ignore columns | `F-column`, `F-generated` ×10 | ✓ |
| G | Wall clearance 6" → 0" | `G-default`, `G-generated` ×20; collateral: `C-no-straddle` ×10 (a wall column now straddles the wall row), `F-generated` ×20 | ✓ |
| H | `pickOrientation` always returns horizontal | `H-auto` vertical-wins, `H-auto` R1 | ✓ |
| I | Skip `clearGeneratedLayout` in `buildQueue` | `I-twice`, `I-reload`, `I-hand-drawn` | ✓ |
| J | Remove the column centre snap | `J-center` | ✓ |
| J | Drag commit writes the live `flueSpaceIn` into `flueBaseIn` | `J-shrink` hand-placed, `J-shrink` base-stays-9, `J-rotated` | ✓ |

**Every row failed at least one test. No row came back empty.**

One cell of the plan's table can't be met as written. The plan expects the A
break to fail the **108"** count, but no clearance change can do that: three
40" faces are 120", already more than 108", so 108" gives 2 positions whatever
the clearance. The 120" count does fail (A2). The plan's expected-failures
cell for A should read "120" / 168" counts and the oversize threshold".

---

### K — notes
- **Where it lives:** `pickZoneBlocks` / `pickZoneRect` in
  `generate/columnCheck.js`, called from `checkColumns` after the in-rack
  pass. The result carries `pickBlocks` (same shape as a rack conflict:
  `rackId`, `bayIndex`, `faces`, `positionIndices`, `positionsLost`) and
  `summary.positionsLostToPickZone`, and adds the loss to
  `positionsLostIfAbsorb`. `BlockedFaceMarks` draws `rackConflicts` +
  `pickBlocks` through the same `positionRectForIndex`, so it's the same red X.
  `useColumnCheck` passes the floor-plan polygons (`fpVerts`) for the wall
  test. The Column Check panel adds "−N blocked from the aisle".
- **Live while dragging:** same path as the existing X marks (derived from the
  store's `objects`). Checked in the running app on R1 horizontal: the mark
  set changed on every sampled frame of a double-row drag.
- **Racks at angles other than 0/90/180/270°** are skipped, not approximated.
- **A single with no qualifying pick side** (e.g. boxed in by a wall and a
  close rack) gets no pick-zone X: that's not a column problem.
- **Impact on generated layouts** (reach, no floor plan passed in the unit
  fixture; the app with its floor plan gave the same R1 figure):
  R1/R2/R4 horizontal −108, vertical −192; R3 horizontal 0, vertical −72;
  R5 horizontal 0, vertical −48 — on top of the in-rack losses. The generator
  doesn't yet steer columns out of pick zones.
- **The "Total pallet positions" headline** is unchanged by column losses.
  That was already true for in-rack columns. The loss shows in Column Check
  ("If absorbed").

### H — gross vs usable by orientation (reach/CB/VNA per case, 240×120)
| Case | Horizontal gross / usable | Vertical gross / usable | Pick on gross | Auto now (usable) |
|---|---|---|---|---|
| R1 (25×30, reach) | 2,376 / 2,236 | 2,600 / 2,408 | vertical | vertical |
| R2 (same inputs as R1) | 2,376 / 2,236 | 2,600 / 2,408 | vertical | vertical |
| R3 (50×54, reach) | 2,592 / 2,564 | 2,600 / 2,528 | vertical | **horizontal — changed** |
| R4 (25×30, counterbalance) | 2,376 / 2,236 | 2,112 / 1,888 | horizontal | horizontal |
| R5 (25×30, VNA) | 3,456 / 3,456 | 3,328 / 3,232 | horizontal | horizontal |

Identical for "Columns along wall" Yes and No. R1 and R3 were checked in the
running app: headline, Column Check and the Generate result all agree
(R3: 2,592 positions · 2,564 usable, −28; R1 vertical: 2,600 · 2,408, −192).
These are observed values, not assertions: TEST_PLAN.md §2 totals are still
pending.

## 5. Final result

- **Plan suite: 1,147 tests, 1,147 passing** (after all breaks reverted).
- **Whole project: 1,550 tests, 1,550 passing.**
- **1080×410 vertical in the running app** (headless Chrome, software
  rendering, same machine, old capped layout vs uncapped): 116 racks,
  43,776 positions. Rack drag p50 13 ms, p95 27 ms, 1 frame > 33 ms (capped:
  p95 13 ms, 0). Pan p95 40 ms, ~19% of frames > 33 ms (capped: p95 27 ms,
  ~4%). Wheel zoom unchanged (p50 27 ms both). Generate 1.7–1.9 s (capped
  1.1 s).
- Production build clean.
- Capacity totals R1–R5: **pending**, as TEST_PLAN.md §2 requires.
- Still to do by PP: the manual measuring-tool checks in TEST_PLAN.md §5, and
  carrying the E and G amendments, the 90" single-pallet limit and the
  both-axes grid rule into TEST_PLAN.md.
