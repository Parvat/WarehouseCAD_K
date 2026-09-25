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

### X — Per-bay beam length · `X_bayBeam.test.js` (105 tests)
**Beam presets 4′ to 16′** (48″–192″, 12″ steps) and a custom value (`102`,
`9'`, `8' 6"`; 12″–360″). They're used for the rack panel's "Change beam"
and "+ bay", and the multi-bay box's "Change all to". A change applies to one
bay, or to every bay in a multi-bay selection across racks. It holds the
rack's start end where it's drawn, so bays before the changed one stay put
and later ones slide, at any rotation. Pallets per bay recompute; the bay
list shows each bay's pallets, and "0 ✕" for a beam too short for one
pallet (the canvas also shows the oversized-bay X). Each change is one undo.
Shared logic is in `utils/bayBeam.js`.

**Warnings, never blocks.** A pick that would make the rack overlap another
rack, or pass the building's inner wall, gets a red outline and tooltip. The
rack's current problem shows in a red box. The panel's old wall-fit blocking
is removed.

**Three bugs fixed on the way:**
- **Wall clear** is measured along the rack's own length at any rotation. It
  is the chord of the building's inner box through the rack's centre, so the
  inner height is used at 90°/270°; before, it always used the width.
- **"Remaining"** is now the room from the rack's far end, where it grows, to
  the wall ahead. Before, it was the whole wall-to-wall clear minus the
  rack's length.
- **The multi-bay box** now also shows for bays across several racks (the
  multi-select branch) and for bays on grouped racks (the group branch).
- **`changeSelectedBaysBeam`** (store change approved by PP) sizes the rack
  with the store's grid size instead of a hardcoded 40.

Floor plans that aren't rectangles use their bounding box (approximate, agreed).

| Test | Asserts (hand-derived) |
|---|---|
| `X-wall` ×8 (300×120 and 120×300, 0/90/180/270°) | wall clear 3588″ along 300′ or 1428″ along 120′; for a 14-bay rack (1389″) at the wall, remaining 39″ (3′ 3″) or 2199″; +4′ bay → "passes the wall by 1′" on the short run only; bay 0 to 11′ → nothing; to 12′ → "passes the wall by 9″"; the panel's Wall clear and Remaining cells match |
| `X-remaining` ×4 | a centred 14-bay rack: 91′ 7.5″ (0/180°), 1′ 7.5″ (90/270°) |
| `X-presets` | presets = 48…192 in 12″ steps |
| `X-bay` ×64 (4 rotations × 13 presets + 3 custom) | bay 2 of 5 changes: bays 0–1 unmoved, 3–4 moved by exactly the change, pallets and capacity from the hand table; the panel path and the multi-bay path give identical racks; one undo each restores the rack |
| `X-add` ×12 | +4′, +16′, +102″ at 4 rotations: the existing 5 bays unmoved; one undo |
| `X-oversized` | custom 40″ → that bay flagged, 0 pallets, panel shows "0 ✕" |
| `X-parse` | inches, feet, feet+inches; junk and out-of-range rejected |
| `X-multi` ×4 | bays on two racks → the multi-select panel shows the box (13 presets + custom); 12′ on both, earlier bays fixed, later +48″; one undo restores both |
| `X-group` ×4 | grouped racks: one bay or bays on both → the group panel shows the box; no bays → no box; the change applies, the group is kept, one undo |
| `X-overlap` ×4 | end-to-end racks 12″ apart: +12″ touches (no warning), +24″ → "overlaps 1 rack" (panel and multi-bay previews); applied anyway; the red box shows it |
| `X-grid` | gridSize 20 → a 546″ rack is 910 px (the store change) |
| `X-wire` | "Change beam" and "+ bay" each commit once through `changeBayUpdate` / `addBayUpdate`, with no wall block; the multi-bay box calls `changeSelectedBaysBeam` |

**Checked in the app, horizontal and vertical** (240×120, 25×30 grid):
- Wall clear showed 239′ 6″ (horizontal) and 119′ 6″ (vertical).
- 13 presets showed for "Change beam" and for "+ bay".
- The 12′ preset left bays 1–2 unmoved and moved every later bay 160 px;
  custom `8' 6"` gave 102″; two undos restored the rack.
- 16′ on a rack's last bay, 3″ from the wall, showed "passes the wall by
  7′ 9″" (93″ = 96 − 3) and was applied.
- The multi-bay box across two racks and across two grouped racks (a real
  Shift+drag marquee) showed "2 bays selected across 2 rows". Presets applied
  to both racks with earlier bays fixed, the group was kept, and one undo
  restored both.
- No console errors.

### W — Multiple cross-aisles for long rack runs · `W_crossAisles.test.js` (12 tests)
**Rule (PP).** `rowSegments` places the fewest cross-aisles that keep every
continuous rack run within `maxRunFt` (default 150 ft, the Generate panel's
new "Max rack run (ft)" field). Bays are spread evenly in whole bays. Every
cross-aisle has the same width: at least the forklift's cross-aisle width,
at most that plus one bay. They line up straight across every row, and racks
still reach both end walls. Short runs keep their one cross-aisle.

The maximum bays per section is `floor((12·maxRun − 3) / 99)`: 18 at 150 ft
(148.75 ft) and 12 at 100 ft (99.25 ft).

**Columns.** A dynamic program chooses all section sizes together. The
cross-aisles slide the fewest whole bays needed to clear every column line,
and no section goes over the maximum. Placing one boundary at a time could
box a later boundary in (that caused rule 4 straddles on M11-h and M25-h in
the first attempt).

**If no split at the fewest count is column-clear, one more cross-aisle is
added** (up to 3 more). This happens because the 150 ft cap can leave only
positions that cross a column. Example: 300 ft with a 30 ft grid. 18 | 17 or
17 | 18 both cross the column at 150, and 16 | 19 would be over 150 ft. The
layout becomes 11 | 11 | 11, with 2 cross-aisles and 33 bays per row instead
of 35. If nothing clears, the fewest count stays with the split that hits
the fewest columns.

**The example in the request vs the rule:** for a 1,080 ft run, the rule
gives **6 cross-aisles / 7 sections** (18,17,18,18,18,17,18 bays, longest
148.75 ft). The example in the request said 7 cross-aisles / 8 sections of
about 135 ft. The code follows the rule.

| Test | Asserts (hand-derived: reach 9 ft, 96″ on 3″, 0.5 ft end clearance) |
|---|---|
| `W-240` | 240 ft → 1 cross-aisle, 14 | 13, 15.75 ft wide, at 116.25 |
| `W-1080` | 1,080 ft → 6 cross-aisles, 18,17,18,18,18,17,18, each 54.25/6 = 9.042 ft, first rack at 0.5, last ends at 1079.5 |
| `W-1080@100` | max 100 ft → 9 cross-aisles, 10 × 12 bays, each 86.5/9 = 9.611 ft |
| `W-slide` | 240 ft, 25 ft grid → 13 | 14, aisle at 108 (the even spot crosses 125) |
| `W-extra` | 300 ft, 30 ft grid → 2 cross-aisles, 11 | 11 | 11 at 91.5 and 195.5, 13 ft wide; 1 with no columns |
| `W-small` | 60, 120, 150, 240 ft → exactly 1 |
| `W-gen` ×6 (h and v) | through `sizingSheetLayout`, 1080×120 (v: 120×1080), 60 ft grid: default and 150 → 6, 100 → 10 (the forced 10 × 12 split puts aisle 2 at 208.86..218.47 over the column at 210, so one more is added); identical cross-aisles in every row; every section ≤ max; both walls reached |

**Matrix rule 2** now checks every section ≤ 150 ft, every cross-aisle in
[cross-aisle, cross-aisle + 8.25 ft], no column footprint in any
cross-aisle, and the same cross-aisles in every row.

**Before → after** (master 1e25d2c → this change). "Longest" is the longest
single rack. The two "Columns along wall" settings gave identical numbers.

| Case | Orient | Cross-aisles | Longest ft | Gross | Usable |
|---|---|---|---|---|---|
| M11 1080×410 | h | 1 → 7 | 536.5 → 140.5 | 41,280 → 39,040 | 37,680 → 35,060 |
| M11 1080×410 | v | 1 → 2 | 206.5 → 140.5 | 43,776 → 42,864 | 40,356 → 39,444 |
| M13 1200×600 | h | 1 → 8 | 602.5 → 132.25 | 73,728 → 69,632 | 72,128 → 67,904 |
| M13 1200×600 | v | 1 → 4 | 305.5 → 115.75 | 72,704 → 69,632 | 71,296 → 67,968 |
| M14 1000×150 | h | 1 → 6 | 503.5 → 140.5 | 13,328 → 12,768 | 12,312 → 11,744 |
| M14 1000×150 | v | 1 → 1 | 66.25 (unchanged) | 13,568 | 12,528 |
| M23 1500×300 | h | 1 → 10 | 751 → 132.25 | 46,080 → 43,520 | 45,352 → 42,856 |
| M23 1500×300 | v | 1 → 1 | 148.75 (unchanged) | 44,800 | 43,680 |

Auto-pick flips to **vertical** on M13 (67,968 vs 67,904) and M23 (43,680 vs
42,856); both were horizontal before. M11 and M14 stay vertical.

**Checked in the app, horizontal and vertical** (1080×410, 25×30 grid):
- Max rack run defaults to 150.
- Horizontal: 7 cross-aisles, vertical: 2, the same in every row. Longest
  section 140.5 ft. Headline 39,040 · 35,060 (h) and 42,864 · 39,444 (v),
  the same as the unit numbers.
- Every aisle pairs rows in the same section (160 = 8 × 20 h, 171 = 3 × 57
  v). Every aisle has its 3 clearance labels, all inside its own section.
- Regenerate replaces the layout (the same count of racks, aisles and one
  grid).
- Max 100 gives 10 (h) and 3 (v), longest 91 and 99.25 ft.
- Auto picked vertical (2 cross-aisles). No page errors.

### V — A middle bay delete leaves a gap; Shift+click toggles bays · `V_baySplit.test.js` (36 tests)
**Split (store change approved by PP).** Deleting bays from the middle of a run
leaves an empty gap with the uprights on both sides still standing, so the
rack becomes separate pieces, one per run of kept bays (`utils/baySplit.js`).
Each piece is its run's slice of the original's local box, drawn exactly
where those bays were at any rotation. Gap = the deleted beam (320 px for
96″). Adjacent deleted bays make one gap that includes the upright between
them (96 + 3 + 96 = 195″ = 650 px), since that upright is left with no bay.
End deletes don't split: the rack shortens, as before. Deleting both end bays
now leaves the middle bays where they were; they used to shift.

`deleteSingleBay` and `deleteSelectedBays` both call `applyBayDeletes` on their
draft, so a delete is one history entry. Every delete path goes through them:
the Delete key, a bay marquee plus Delete, the panel's "Delete selected
bays", and now the rack panel's "− Bay" and Column Check "Remove section"
(both call `deleteSingleBay`). Remove section now takes the column check's
rotation-aware `bayIndex`; `bayIndexAt` on world x picked the wrong bay on a
vertical rack.

**What points at a rack:**
- **id:** the first piece keeps it.
- **parentId:** every piece copies it.
- **groups:** every piece joins the original's groups.
- **Aisles (row1Id/row2Id):** re-paired with every piece that still faces
  across the aisle. The first pair keeps the aisle's id and label; the rest
  are copies.

**Shift+click toggles single bays** (`selection.js`: `inBayMode`,
`toggleBaySelection`). In bay mode (a bay marquee selection, or a selected
rack with one clicked bay), Shift+click on a selected bay removes it and on
an unselected bay adds it, on top of a marquee and across racks. Racks follow
their bays. Bay mode is sticky: a bay marquee or toggle turns it on; a plain
click or a bay-less marquee turns it off. So toggling the last bay off and
Shift+clicking it again adds it back. Outside bay mode, Shift+click still
toggles whole objects.

**Checked in the app, horizontal and vertical** (R1, a middle bay marquee-selected):
- Shift+click turned the bay off and back on (highlights 2 → 0 → 2
  horizontal; 4 → 2 → 4 vertical, two bays caught).
- Delete split the rack into two pieces. The gap was one beam (37.5 px =
  320 × scale) horizontally, and 96 + 3 + 96″ vertically where two adjacent
  bays were caught. Both outer ends were at 0 px.
- Aisles re-paired (12 → 14, 26 → 28). Undo restored the rack count.

| Test | Asserts |
|---|---|
| `V-middle` ×4 (0/90/180/270°) | delete bay 2 → 2 racks, bays 0,1,3,4 exactly where they were, gap 320 px, both pieces keep parentId; one undo → the original rack |
| `V-apart` ×4 | bays 1 and 3 → 3 racks, gaps [320, 320] |
| `V-adjacent` ×4 | bays 1 and 2 → 2 racks, one gap of 650 px |
| `V-key` ×4 | Delete key (`deleteSingleBay`) on a middle bay splits the same way; undo restores |
| `V-ends` ×4 | first or last bay → still one rack, the others unmoved |
| `V-aisles`, rotated | the aisle becomes two (original id/label on the first piece), both on the facing row; undo restores one aisle |
| `V-groups` | both pieces are in the group |
| `V-helper` ×2 | kept runs; `applyBayDeletes` on a plain state |
| `V-toggle` ×4 per orientation | after a marquee (6 bays over two racks, picked with the rotation-aware `hitTestBay`), Shift+click turns a bay off and on; adds a bay of another rack; a rack whose last bay goes drops out; a clicked bay plus Shift+click selects both |
| `V-toggle` ×2 | the last bay off then on again (sticky); no bay selection → whole-object toggle |
| `V-wire` | the canvas Shift+click path toggles bays in bay mode, sticky until a plain click |

Area T and U updates: middle deletes no longer close up, so T now expects
every remaining bay at its drawn position across the pieces. U's Remove
section and "− Bay" cases call `deleteSingleBay`; their wiring checks now
assert that routing. The middle Remove section case moved to V.

### T — Deleting bays keeps the rack where it is drawn, any rotation · `T_bayDelete.test.js` (30 tests)
A rotated rack is drawn spun about its stored box's centre, and deleting bays
shrinks the stored width, which moves that centre. The store's anchor rule
only adjusted `x` (right at 0°), so at 90° deleting the last bay moved every
remaining bay (−165, +165) px. **Store change, approved by PP:**
`deleteSingleBay` and `deleteSelectedBays` now set `x` and `y` from
`anchoredShrink(obj, newWidth, bayDeleteAnchor(...))` (`utils/bayAnchor.js`).
Same end-holding rule as before (first bay deleted but not the last → hold the
far end; otherwise the near end), now held in WORLD space via the SVG engine's
rotated-anchor correction (new centre = old centre + R(±Δw/2, 0)). At 0° it
reproduces the old result exactly.

These two actions are every bay-delete path: the Delete key with one bay
(`deleteSingleBay`), a bay marquee plus Delete, and the panel's "Delete
selected bays" (`deleteSelectedBays`), including selections across rows.

Checked in the app, horizontal and vertical: delete the first bay → the near
end moved in by exactly one bay (38.7 / 30.7 screen px), the far end and both
sides 0; delete the last bay → the far end moved in, the near end 0; one Ctrl+Z
restored the rack exactly.

| Test | Asserts (a 5-bay rack at 0°, 90°, 180° and 270°) |
|---|---|
| `T-multi` ×5 per rotation | delete first, first two, middle, last, last two: every remaining bay's drawn rect = expected (held-end bays 0 px; bays past a gap close up by exactly 330 px per removed bay along the rack's own run); one undo restores the original object |
| `T-single` per rotation | Delete key on the first bay: same, via `deleteSingleBay` |
| `T-rows` per rotation | one bay selection across three rows (start of one, end of another, middle of a third): every row right; one undo restores all three |
| `T-helper` ×2 | at 0° `anchoredShrink` is exactly the old rule; which end is held |

The same bug class elsewhere was fixed in area U.

### U — Every rack resize gives the 0° result rotated · `U_resizeRotation.test.js` (75 tests)
**Rule (PP):** at any rotation, the result is exactly the 0° result rotated.
Whichever point stays fixed at 0° today stays fixed on screen. One shared
helper, `anchoredResize(obj, { width, height }, { x, y })` (`utils/bayAnchor.js`),
holds a chosen end of each local axis where it is drawn. `anchoredShrink` (bay
deletes) is it on x only; `withAnchoredPosition(obj, updates, anchor)` adds the
resulting x/y to a commit payload.
- **Store, approved:** `changeSelectedBaysBeam` now sets x/y from
  `anchoredShrink(obj, newWidth, 'start')`. The position update only; the
  import was already there from area T.
- **Components:** `RackRowPanelCore` (add, change and remove bay; upright width;
  flue), `CantileverPanel` (add and remove tower; arm length; single/double
  sided), `LaneRackPanels` (all three recalcs: drive-in, drive-through,
  pushback/pallet-flow). Every commit that changes width or height now goes
  through `withAnchoredPosition` (near/top corner held, as at 0° today).
- **Column Check "Remove section":** `withAnchoredPosition(rack, …, { x:
  bayDeleteAnchor(beams.length, [idx]) })`. This also fixes the 0° bug:
  removing the first-end section used to keep x, sliding the rest of the rack.

Checked in the app, horizontal and vertical:
- Panel "− Bay": only the far end moved in (38.7 / 30.8 px).
- Flue 9 → 12″: the front side held and the back grew (bottom at 0°; at 90° the
  front is on the right, and the left grew).
- One Ctrl+Z restored each exactly.

| Test | Asserts |
|---|---|
| `U` ×52 (13 actions × 0/90/180/270°) | the drawn box after the action = the 0° result rotated about the rack's centre; one undo restores the original. Actions: store changeSelectedBaysBeam; panel add bay, change bay, remove bay, upright 3→4″, flue 9→12″; cantilever add tower, remove tower, arm 36→60″, single-sided; lane rack 3 lanes × 6 deep; Column Check remove section (first bay, middle bay) |
| `U-0°` ×13 | at 0° each keeps today's fixed point (x, y unchanged), except Remove section of the first bay, whose bays 1–4 now stay put (no slide) |
| `U-minus-bay` ×4 (0/90/180/270°) | the rack panel's "− Bay" with the first bay selected now uses the bay-delete rule (PP): bays 1–4 keep their exact drawn positions; one undo restores. In the app, horizontal and vertical: only the near end moved in by one bay (38.7 / 30.8 px); undo restored it |
| `U-wire` ×6 | in all four panel files, every commit that sets width/height goes through `withAnchoredPosition`; Column Check passes the bay-delete anchor |

### S — Smart guides snap to racks as drawn, both orientations · `S_snapOrientation.test.js` (61 tests)
`computeSmartGuides` measured the dragged object and every target with its
stored, pre-rotation box. A 90° (vertical-layout) rack is stored wide but
drawn tall, so its snap edges and centre lines were in the wrong places. Both
sides now use `worldBoundsOf`. The moved-set exclusion from area P
(`movedIdsFor`) is unchanged, and is now tested in both orientations. Checked
in the app, horizontal and vertical:
- nudging a rack along its run showed 6 object guides, every one exactly on a
  drawn rack edge or centre (0 px off);
- dragging the building showed 0 guides.

| Test | Asserts |
|---|---|
| `S-hand` ×3 | A (0–670 × 0–140) dragged 995 px snaps its left edge to B's x 1000; the 90° twin dragged 995 px down snaps to y 1000 with the mirrored guides; centre-to-centre mirrors too |
| `S-matrix` ×50 (M1–M25 × both orientations) | in each layout a rack dragged 8 ways (±3, 5/5, −6/4, 150 on each axis): the mirrored twin dragged the mirrored way gives the mirrored snap deltas and the same guides with axes swapped; at least one drag snaps |
| `S-fp` ×2 per orientation | a building dragged 5 px never snaps to its own rack 3 px inside the wall; it still snaps to a rack outside (−2) |
| `S-multi` ×2 per orientation | a two-rack drag never snaps to its members; it still snaps to a rack left behind (300) |

### R — Marquee is the same in both orientations · `R_marquee.test.js` (52 tests)
**Diagnosis** (R1 horizontal and its exact vertical twin, i.e. every rack mirrored
across x = y; the same marquee, mirrored):

| Marquee | Horizontal selected | Vertical twin selected (before) |
|---|---|---|
| inside one rack, over bays 0–1 | r1, bays r1#0 r1#1 | nothing |
| across three rows | r1, r3, aisles a6, a7; 4 bays | aisles a6, a7 only; 0 bays |
| inside an aisle gap | aisle a6 | aisle a6 |

Three causes:
- **Unrotated rack boxes.** `objectsInMarquee` tested each rack's stored,
  pre-rotation box. A 90° rack is stored wide but drawn tall, so a vertical
  rack was caught only when its unturned box happened to overlap the marquee.
- **Unrotated bays.** `bayEntriesInMarquee` walked bays along world x, so it
  found no vertical bays. The group outline is hidden whenever bays are
  selected, so it appeared or vanished depending on those chance hits: the
  "sometimes a group, sometimes not".
- **Aisles caught.** Every marquee crossing rows caught the aisles' invisible
  gaps.

**Fix.**
- `worldBoundsOf` (`hitTest.js`) gives the object's box turned with it (`boundsOf`
  stays unrotated, because the group outline needs the object's own frame).
  `objectsInMarquee` uses it.
- `bayEntriesInMarquee` carries the marquee into each rack's local frame (rotated
  back about its centre) before walking its bays.
- Aisles are no longer marquee-selectable (they're picked by their labels,
  area Q). `O-marquee` was updated to match.

After the fix, both columns of the table above are identical. Checked in the
app: three identical Shift-marquees on a vertical layout each selected the
same 2 racks and 16 bay highlights, and no aisles.

| Test | Asserts |
|---|---|
| `R-matrix` ×50 (M1–M25 × both orientations) | per layout: a marquee inside one rack selects exactly that rack (2 per layout); one spanning rows i..i+2 of a run selects exactly those 3; each also selects bays; the mirrored twin selects the same racks and bays |
| `R-hand` | a 4-bay rack, marquee over local x 400–900 → bays 1 and 2, same on its 90° twin; the twin's old unturned box area selects nothing |
| `R-aisle` | a marquee inside an aisle gap selects nothing; one spanning both rows selects the two rows only |

### Q — Aisle picked by its labels only · `Q_aislePick.test.js` (6 tests)
PP's screenshot showed the real complaint: the selection box was right, but
the aisle's CLICK target was its whole gap, so a press on empty aisle floor
selected the aisle and the building behind it could hardly be grabbed. Now
`hitTest` picks an aisle only through `aisleLabelHit` (`hitTest.js`): a label
pill, or within 5 screen px of its dimension arrow. Empty aisle floor falls
through to the building, so a press there drags the layout. `aisleLabelLayout`
is the one source for where the labels sit; `AisleLabel` draws from it, so
what you can click is exactly what you see. (A marquee still catches an
aisle by its gap.) Checked on the fresh server:
- a click on empty aisle floor selected the building (FP RECT);
- a click on the pill selected the aisle;
- a drag started on aisle floor moved the whole layout by (60, 40) px.

| Test | Asserts |
|---|---|
| `Q-layout` | rows A y 200–340 / B y 760–900 → one station at x 435, pill at y 550, gap 340–760, text 10′ 6″ |
| `Q-floor` | four points of empty aisle floor → the building |
| `Q-label` | the pill → the aisle |
| `Q-arrow` | 2 px off the arrow → the aisle; 11 px off → the building |
| `Q-racks` | the rows still pick as racks |
| `Q-rotated` | the same turned 90°: pill and arrow → aisle, floor → building |

### P — A drag never snaps to what moves with it · `P_dragSnap.test.js` (6 tests)
Snap targets excluded only the selected ids, so a dragged floor plan snapped
to its own children (racks, aisles, column grid), which still sit at their
pre-drag positions in the store. `computeSmartGuides` now excludes the whole
moved set (`movedIdsFor`: the floor plan plus its children; every member of a
multi-selection). Rotate icons: the floor plan's rotate handle had no named
node and the multi-selection's group outline wasn't in the drag's moved
nodes, so both ghosted behind a drag. They're now `fprotate:<id>` (added to
`CHROME_NODE_PREFIXES`) and `grouprotate` (moved when two or more are
dragged). Checked on the fresh server: 0 snap guides across a 24-frame
building drag; the rotate icon moved (96, 72) px with the racks.

| Test | Asserts |
|---|---|
| `P-fp` | building dragged 5 px, its own rack's old edge 2 px away → no snap, no guide |
| `P-fp` (control) | a rack outside the building still snaps (snapDx −2) |
| `P-multi` | a two-rack selection dragged 297 px, 3 px from a member's old edge → no snap |
| `P-multi` (control) | a rack left behind still snaps (snapDx 300) |
| `P-wire` ×2 | the fp rotate handle is a `fprotate:` node the drag moves; `grouprotate` moves with a 2+ selection |

### O — Aisle selection bounds + overlays follow a drag · `O_selectionDrag.test.js` (23 tests)
**Aisle bounds.** An aisle has no box of its own; `getObjectBounds` (protected
`utils/canvas.js`, not touched) returns {0, 0, 0, 0} for it, the world origin,
which is the middle of a generated building. A single aisle's outline and hit
area were already right (`aisleRect`), but three canvas2 paths still read
the zero box:
- the multi-selection outline (`computeGroupOutline`) stretched out to the building's centre;
- every marquee across the centre caught every aisle;
- every aisle offered a smart-guide snap at x = 0 / y = 0.

New `boundsOf(obj, objects)` (`hitTest.js`): aisle → its gap (or null when its
rows are missing, so it's skipped), every other type → `getObjectBounds`.
Used by `computeGroupOutline` (now given all objects), `objectsInMarquee`
and `computeSmartGuides`. Checked in the app: rack + shift-clicked aisle →
the group outline spans the rack and aisle only (bottom at the aisle's
edge), where it used to reach the building's centre.

**Overlays follow a drag.** A plain drag moves Konva nodes and writes the store
only on mouseup, so overlays derived from object positions sat at the
pre-drag layout until the drop: aisle labels, in-rack and pick-zone X marks,
orange upright marks, oversized-bay marks. `Overlays` now draws those from
`pObjects = previewObjects(objects, preview)`, the drag offset published by
`dragPreview.js` (floor-plan drags include every child via
`movedIdsFor`). The clearance labels already re-run the aisle check on the
previewed layout. Column markers and selection outlines ride the drag
directly (their `obj:`/`sel:` nodes move), so they are not also offset.
Checked in the app, building dragged by (80, 53) screen px: rack, aisle
label, clearance label, in-rack X, upright mark and column grid all moved by
exactly that mid-drag (before the fix, the aisle label, X and upright mark
moved 0 until the drop). A two-rack shift-select drag moved that rack's X
mark and the aisle label with it.

| Test | Asserts |
|---|---|
| `O-bounds` ×2 | aisle between A (y 2000–2140) and B (y 2560–2700) = x 1000–1670, y 2140–2560; rotated: x 1140–1560, y 2000–2670 |
| `O-group` | outline of [A, aisle] = x 1000–1670, y 2000–2560 (never to the origin) |
| `O-marquee` | marquee around (0, 0) catches nothing; one inside the aisle catches it |
| `O-guides` | no smart guide at x = 0 / y = 0 from an aisle |
| `O-fp-set`, `O-fp` guard | a floor-plan drag moves every child; the fixture (R1 H, wall = Yes, building at (4000, 3000)) has aisles, aisle columns, in-rack X, pick-zone X and upright hits |
| `O-fp` ×6 | mid-drag (dx 120, dy −80) the aisle label, clearance label, in-rack X, pick-zone X, upright mark and column marker geometry = original + (dx, dy) |
| `O-multi` ×3 | two rows of one aisle dragged: that aisle's label and those rows' marks move by the offset; another rack's X and the column markers stay put |
| `O-wire` ×7 | `pObjects` = previewObjects(objects, preview); AisleLabel, BlockedFaceMarks, UprightConflictMarks, OversizedBayMarks are drawn from it; the clearance labels preview their own layout; column markers' `obj:` node is in the drag's moved set and the drag publishes its offset |

### N — Red aisle warning + two-sided clearance labels · `N_aisleWarning.test.js` (7 tests)
**Rule (PP, 2026-09-24):** an aisle is shaded red when a column stands in it
and **neither** side reaches the forklift's travelFt (= min(8′, aisle)): a
forklift can't pass on either side. That is the same condition as
accessibility level 1, and the generator never produces it (E-no-block). The
first proposal, "either side short", would have flagged 6,328 of 6,354
generated aisle columns (99.6%, 88 of 100 matrix runs): the generator
deliberately leaves the far side at exactly travelFt and the near side
shorter. Visual only; capacity and levels are unchanged.

**Code.** `aisleColumnBlocks` (`columnCheck.js`) is the aisle part of
`checkColumns`, split out and extended: each block carries `nearClearFt`,
`farClearFt`, `nearShort`/`farShort`, `pinched`, its gap axis and the aisle box.
`canvas2/aisleMarks.js` builds the marks in an orientation-free (gap, run)
frame: one arrow per side, from the column edge to the rack face, with the
arrowhead on the rack and the label on the shaft, plus the red shade (the
whole gap, along the run the column ± half the gap). `ColumnClearanceLabels`
draws them. **Live while dragging:** a plain drag writes the store only on
mouseup, so the drag now publishes its offset (`canvas2/dragPreview.js`). The
overlay re-runs just `aisleColumnBlocks` on the previewed layout each frame,
not the full ~28 ms check.

Hand geometry: rows A y 0–140 and B y 820–960 (17′ aisle), column x 300–340,
y 440–480 → near 7.5′, far 8.5′ (reach, travel 8′).

| Test | Asserts |
|---|---|
| `N-one-side-ok` | 7.5′ / 8.5′ → not pinched, no shade |
| `N-both-ok` | 8′ / 8′ (exactly travelFt) → no shade |
| `N-drag` | preview B up 1′ → 7.5′ / 7.5′, pinched; shade {x 0, y 140, w 660, h 640}; both labels red "7.5′ — under travel"; preview back → clear |
| `N-placed` | B placed at 780 (no drag) → red immediately |
| `N-both-sides` | two labels, "7.5′ clear" and "8.5′ clear"; arrows from (320, 440) to A's face (320, 140) and from (320, 480) to B's face (320, 820) |
| `N-same-style` | the same layout turned 90° gives exactly the horizontal marks with x↔y; every mark is an arrow (`style: 'arrow'`, no dash, 3-point head) |
| `N-same-style` (shade) | vertical shade = the horizontal rect, rotated: {x 140, y 0, w 640, h 660} |

**In the running app:**
- 240×120, 25×30, wall = No: horizontal shows 18 aisle columns with 36
  labels, vertical 21 with 39 (a column touching a rack has nothing on that
  side). No red in either.
- Dragging a double row 1.5′ toward its aisle turned 4 aisles red mid-drag.
  Dragging it back cleared them, and the drop at the start position left
  none.
- A label on a gap too short for its pill slides beside the arrow.

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
| 2 no oversized gap | interior aisles = forklift aisle unless a column forced a widen (same detector as E-exact); **far-wall leftover gap holds no legal position for another single row** — under 2 × aisle + single depth (24.5 / 28.5 / 15.5′) it passes on width alone, above it an exhaustive scan runs (aisle ≥ forklift aisle both sides, no straddled column, every column leaving ≥ travelFt on one side; 0.01′ sweep plus every point where legality can change); per row, every stretch longer than a bay is a cross-aisle in [cross-aisle, cross-aisle + 8.25′] with no column footprint inside it; every section ≤ 150′ (max rack run); the same cross-aisles in every row (aligned); wall-end gaps ≤ one bay |
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

| N | **No red shade** (`aisleWarningRect` always null) | 3: `N-drag`, `N-placed`, vertical shade | ✓ |
| N | **Preview ignores the drag** (`previewObjects` returns the store layout) | 2: `N-drag`, vertical shade | ✓ |
| N | **Label one side only** | 2: `N-both-sides`, `N-drag` | ✓ |
| N | **Vertical drawn dashed** (`style: 'dashed'` for the x axis) | 1: `N-same-style` | ✓ |

| O | **Aisle bounds via getObjectBounds** (`boundsOf` skips the aisle branch) | 5: `O-bounds` ×2, `O-group`, `O-marquee`, `O-guides` | ✓ |
| O | **Upright marks off the preview** (`objects` instead of `pObjects`) | 1: `O-wire` UprightConflictMarks | ✓ |
| O | **Aisle labels off the preview** | 1: `O-wire` AisleLabel | ✓ |
| O | **Preview ignores the drag** (`previewObjects` returns the store layout) | 8: `O-fp` ×6, `O-multi` aisle label and marks | ✓ |

| Q | **Whole-gap aisle pick** (rect test instead of `aisleLabelHit`) | 3: `Q-floor`, `Q-arrow` (the 11 px case), `Q-rotated` | ✓ |
| P | **Children back as snap targets** (`moving = new Set(selectedIds)`) | 1: `P-fp` | ✓ |
| P | **Whole moved set back as targets** (`moving = new Set()`) | 2: `P-fp`, `P-multi` | ✓ |

| R | **Unrotated bounds** (`objectsInMarquee` back to `getObjectBounds`) | 49 of 52: every matrix layout with vertical racks, directly or via its twin | ✓ |
| R | **Bays ignore rotation** (no local-frame transform) | 50 of 52 | ✓ |

| S | **Unrotated bounds** (smart guides back to `boundsOf`) | 53 of 61: `S-hand` vertical and centre, every `S-matrix` layout except one (27 vertical, 25 horizontal: each compares against its vertical twin) | ✓ |
| S | **Children back as targets** (`moving = new Set(selectedIds)`) | 2: `S-fp` horizontal and vertical | ✓ |
| S | **Whole moved set back as targets** (`moving = new Set()`) | 4: `S-fp` and `S-multi`, both orientations | ✓ |

| T | **Rotation ignored in the anchor** (`anchoredShrink` with t = 0) | 21 of 30: every 90°, 180° and 270° case (7 each); all 0° cases still pass | ✓ |

| U | **Helper ignores rotation** (`anchoredResize` with t = 0) | 60 of 99 across T and U: every 90°, 180° and 270° test (21 bay-delete + 39 resize); all 0° tests still pass | ✓ |
| U | **Cantilever add tower not anchored** | 1: `U-wire` CantileverPanel | ✓ |
| U | **Remove section without the bay-delete anchor** | 1: `U-wire` Column Check anchor | ✓ |
| U | **"− Bay" without the bay-delete anchor** | 1: `U-wire` rack panel "− Bay" | ✓ |
| U | **Helper ignores the anchor rule** (always holds the near end) | 5: `U-minus-bay` at 0°, 90°, 180°, 270°, plus Column Check remove section (first bay) at 0° | ✓ |

| X | **Wall clear along X only** (the old bug) | 9: X-wall 90/180/270° on both buildings, X-remaining 90/270° | ✓ |
| X | **Remaining = clear − length** (the old rule) | 4: X-remaining at all rotations | ✓ |
| X | **Multi-bay box only for a single object** | 4: X-multi | ✓ |
| X | **No multi-bay box in the group panel** | 4: X-group | ✓ |
| X | **Presets back to 72/96/120/144** | X-presets | ✓ |
| X | **Change holds the far end** | 84: every X-bay except 96″, X-add, X-wall, X-overlap | ✓ |
| X | **Overlap check off** | 4: X-overlap | ✓ |
| X | **Wall warning off** | 4: X-wall on the short run | ✓ |
| X | **Wall block restored** | X-wire | ✓ |
| X | **"+ bay" commits without history** | X-wire | ✓ |
| X | **Store grid size back to 40** | X-grid | ✓ |
| W | **Force a single cross-aisle** (skip the maxRunFt count loop and the extra-aisle fallback) | 61: 8 in W (W-1080, W-1080@100, W-extra, W-gen ×5), the other 53 are matrix rule 2 on long runs (listed output was truncated; seen: M5, M7, M8, M9, M10, M11, M12, M13, M14, M15 v, M17, M18, M19, M21, M23, M24, M25, both orientations wherever the run is long) | ✓ |
| W | **No extra cross-aisle when columns block** (fallback loop off) | 21: rule 2 (column in cross-aisle) on M5 h/v, M10 v, M11 h, M12 h, M13 h/v, M23 h, M25 h (both wall settings each); W-extra; W-gen max 100 h and v | ✓ |
| V | **No split** (all kept bays as one run: middle deletes close up) | 29: T middle and multi-row cases, V split and gap cases | ✓ |
| V | **No aisle re-pairing** | 2: `V-aisles`, rotated | ✓ |
| V | **Toggle only adds** | 4: `V-toggle` off/on and last-bay-drops, both orientations | ✓ |
| V | **Shift+click wiring removed** | 1: `V-wire` | ✓ |
| V | **Sticky bay mode removed** | 1: `V-wire` | ✓ |
| V | **Remove section not routed through the split** | 1: `U-wire` Remove section | ✓ |
| V | **"− Bay" not routed through the split** | 1: `U-wire` "− Bay" | ✓ |

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

- **Plan suite: 1,554 tests, 1,554 passing** (after all breaks reverted).
- **Whole project: 1,957 tests, 1,957 passing.**
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
