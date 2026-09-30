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

### LY — Layers: six standard layers, each with an eye and a padlock · `LY_layers.test.js` (18 tests)
**The layers** (`utils/layers.js`, the one module every consumer asks):
- **Building** (floor plan, walls, other structure), **Columns** (column
  grid), **Racking** (every rack, plus the floor equipment placed among
  them), **Aisles** (aisle objects, aisle and cross-aisle labels),
  **Checks** (red X marks, red aisle warnings, orange upright flags, column
  clearance arrows and labels) and **Notes** (text, dimensions, drawn shapes).
- **Which layer:** an object's `layerId` if it names a layer in the list,
  else the layer its type belongs on. Generate stamps every object; a
  hand-placed object is stamped by type; a rebuilt aisle goes on Aisles (it
  used to copy its rack's layer). Older layouts (layers 'racks',
  'structural' …) load onto the six by type, with no migration.
- **Hidden:** not drawn (Scene), not pickable, not a snap target, not in
  the PDF.
- **Locked:** drawn, printed and **still a snap target** — racks snap to a
  locked building's walls and to locked columns. Not pickable, not
  draggable, never caught by a marquee (objects or bays), left out of
  Ctrl+A. Locking or hiding a layer drops its objects from the selection,
  so nothing locked can be dragged.
- **Generate** sets the six with **Building and Columns locked**, before the
  first object lands. A press or drag on the building floor or wall then
  picks nothing: the drag pans.
- **Checks hidden:** only the drawing stops. The column check still runs, so
  capacity and usable are unchanged. The View menu's "Column labels" switch
  is gone — its arrows and distances are part of Checks.
- **Saved** with the layout (`serializeScene` already carried `layers`); a
  keeper (`installLayerKeeper`) keeps the list the six, carrying each eye
  and padlock by id.
- **Undo** (approved store change): every undo snapshot carries `layers`,
  undo / redo restore them, and `updateLayer` is its own undo step (and so
  autosaves). Generate's entries carry its locked Building and Columns. A
  layer step changes no object and raises no copy bar.
- **Panel:** six rows, eye + padlock each (`aria-pressed`, "Hide Racking
  layer" / "Lock Racking layer"). No add, rename or delete: custom layers later.

| Test (240×120 Generate; ×2 h/v) | Asserts |
|---|---|
| `LY-assign` | the list is the six in order; every object (with the app's aisle keeper running) is stamped with, and resolves to, its layer; all four layout layers used |
| `LY-generate-locked` | Building and Columns locked and shown, the rest open. Floor points that pick the building when unlocked pick nothing; its wall is grabbed only unlocked; a column square only with Columns open |
| `LY-locked` | Racking locked: the rack isn't picked or marqueed; it still prints (PDF identical). Building locked: a rack dragged 3 px from the wall gets the same wall guide as unlocked; hidden, none. Building and grid are snap targets. With Building hidden, a rack 3 px off a column face gets the column guide while Columns is locked, and none once Columns is hidden |
| `LY-undo` | two layer steps undo and redo one at a time, objects untouched; the current undo entry carries the layers; one more undo goes back before the Generate (no objects, Building unlocked) |
| `LY-hidden` | each of Building, Columns, Racking, Aisles hidden in turn: its objects not shown, not pickable, and the PDF is exactly the PDF of the layout without them. Aisles hidden prints no aisle or cross-aisle labels. Scene draws through the same rule |
| `LY-checks` | Checks hidden: the PDF equals the PDF with marks off (and differs from Checks shown); capacity unchanged; the check modules take no layer input; every mark on the canvas is behind `marksOn`, the aisle labels behind `aislesOn` |
| `LY-select` | locking or hiding Racking drops a selected rack; the drag, marquee, bay marquee, both smart-guide calls and Ctrl+A take only pickable objects |
| `LY-save` | eye / padlock state survives save and reload; an older file with the old layer list loads onto the six, every object on its layer |
| `LY-hand` (once) | the type → layer table; the toolbar and object picker stamp by type, not the active layer |
| `LY-panel` (once) | six rows, eye and padlock through `setLayer`, no add / rename / delete |

**Checked in the app, horizontal and vertical** (1080×410, 25×30 grid):
- Panel: Building and Columns locked after Generate. Every object on its
  layer: fp → Building, 168–174 racks → Racking, 160 / 171 aisles → Aisles,
  the grid → Columns.
- A drag on the building floor: nothing selected, building unmoved, view
  panned. A click on the wall: nothing. Unlock Building: the same floor
  click selects it; lock again: deselected.
- Lock Racking: the selected rack drops out; clicking, dragging and a
  shift-marquee over it do nothing (36 / 69 caught once unlocked).
- Hide Racking: scene nodes 1,151 → 327 (h), 1,213 → 349 (v); back on show.
- Hide Checks: every red (#C0392B), orange (#E67E22) and blue clearance node
  gone (overlay 5,269 → 835 h, 5,591 → 865 v); capacity 39,040 / 35,060 (h)
  and 42,864 / 39,444 (v) before and after.
- Undo: hide Notes, lock Aisles, then Ctrl+Z twice and Ctrl+Y twice step
  through exactly those states, the panel following; no copy bar appears.
- Snap: with Building locked, a rack dragged to 2 px off the left wall
  shows the purple wall guide and lands flush on the wall's inner face
  (10 px); with Building hidden, no guide.
- The View menu has no "Column labels". No console errors.

### LC — Check layout · `LC_layoutCheck.test.js` (31 tests)
A "Check layout" button in the top bar lists every problem in the right
panel (`utils/layoutCheck.js`, `RightPanel/LayoutCheckPanel.jsx`). It only
reports: nothing is blocked or moved. Pressing it again re-checks, and the
count shows on the button ("Check layout · 3 errors" / "· 2 warnings" /
"· no issues").
- **ERRORS** (can't be built or reached):
  - an aisle too narrow to drive (under the travel width) — between rows, or
    a column in it;
  - racks overlapping each other;
  - a rack past a wall, or outside the building;
  - columns on an upright frame (one item per rack);
  - a rack nobody can reach (no aisle on any pick side).
- **WARNINGS** (cost positions, or need a look):
  - an aisle a truck can drive but can't pick from;
  - columns blocking pallets (one item per section, or per building for
    racks placed by hand, with the positions lost);
  - a bay too short for the pallet;
  - angled racks whose column losses weren't checked (only where there
    are columns).
- **Each item** says what and where ("Aisle between rows 4 and 5, section 3:
  7', needs 8' to drive"; "Double row 2: …" for a rack placed by hand).
- **Clicking an item selects NOTHING** (a selection is cleared). It zooms
  to the problem WITH its surroundings — at least 20 ft across each way
  (or the whole issue if bigger), never closer than 100 % (`fitBox`:
  `ISSUE_CONTEXT_FT`, `ISSUE_MAX_ZOOM`) — and highlights the problem itself
  (`canvas2/IssueHighlight.jsx`, from each item's `highlight` shapes):
  - a narrow aisle: the gap shaded red, labelled "7' · needs 8'";
  - an overlap: the overlapping area shaded red;
  - a column on an upright: the frame(s) it stands on, orange;
  - an unreachable rack, or one past a wall / outside: a red outline;
  - a too-short bay: that bay shaded amber;
  - columns blocking pallets: exactly the blocked pallet positions — the X
    marks' own spots (`blockedPositionRects`, the one source the X marks
    and the highlight share), each drawn as a glowing red X; never a whole
    bay or row;
  - an angled rack: an amber outline.
  It pulses briefly (three beats), then stays until the next click on the
  canvas or the next check. The user then clicks what they want to change;
  that click works as usual.
- **One rule each, all reused:**
  - aisle widths: `aisleLevel` over `rowGaps` — the column check's
    column-in-aisle test and the copy warnings now ask the same function;
  - the Column Check (`runColumnCheck`) for upright hits, pinched aisles and
    lost positions;
  - `rackIssues` for overlap and walls;
  - `rackReachable` — the pick-zone test, at the travel width;
  - `oversizedBayIndices` for bays too short for the pallet.
- **PDF export:** with errors it asks "N errors found. Export anyway?"
  [Show issues] [Export anyway]. It never blocks, and without errors it
  exports at once.

| Test (×2 h/v; a hand-drawn 400 × 400 building with four double rows, and generated) | Asserts |
|---|---|
| `LC-clean` | a generated 240 × 120 (30 × 30 grid) and the hand-drawn building: no errors (hand-drawn: nothing at all) |
| `LC-aisle` | 7' between two rows: ERROR "… 7', needs 8' to drive", both racks; 9': a WARNING "… needs 10' 6" to pick"; generated: "Aisle between rows k and k+1, section 1" |
| `LC-overlap` | "Double row 1 overlaps double row 2 by 1'", both racks |
| `LC-outside` | 9" past the wall: "past the wall by 9""; a rack with no building round it: "outside the building" |
| `LC-upright` | a column on the first frame: "a column stands on an upright frame" |
| `LC-unreachable` | a rack back to back with rows on both sides: ERROR on it alone; its neighbours stay reachable |
| `LC-columns` | a column mid-bay in a face: a WARNING with the count of positions lost; no error |
| `LC-oversized` | a 36" bay with a 40" pallet: "bay 2 (36") too short for a 40" pallet — holds nothing" |
| `LC-angled` | a rack at +30°: a WARNING only once there are columns |
| `LC-click` | nothing is selected (an earlier selection is cleared); the spot is on screen and fills the view; the highlight is the item's; the next click clears it and selects only the row it lands on (the canvas press clears it first); a re-check clears it too; the overlay is mounted and never listens |
| `LC-highlight` | each issue highlights the problem at the right place: the aisle gap exactly, red, "7' · needs 8'"; the overlap area exactly; the unreachable rack's outline; the too-short bay 2 exactly, amber; the upright frame (an upright's width) containing the column, orange; blocked pallets: glowing red X marks, one pallet position each (never the bay), at exactly the X marks' centres |
| `LC-zoom` | a column on an upright (under 2 ft): zoom ≤ 100 %, at least 20 ft visible each way, the issue in view; a narrow aisle a whole row long (longer than the screen at 100 %) fits entirely |
| `LC-xmarks` | generated 1080 × 410: a section's blocked-pallets item highlights exactly that section's X marks (same centres as blockedFaceOps draws, > 10 of them), each one position, never a bay; the painter draws a glowing X |
| `LC-recheck` | "Check layout · 1 error"; fixed and pressed again: none (the stored result too), "· no issues" |
| `LC-pdf` | clean: exported at once; with errors: asked (N errors), not exported; Show issues opens the list; Export anyway exports |
| `LC-reuse` (once) | the column check and the copy warnings ask `aisleLevel`; Check layout calls the existing checks and compares no width by hand; the button and panel are mounted |

**Checked in the app, horizontal and vertical:**
- **Generated 1080 × 410** (25 × 30 grid):
  - horizontal: 12 errors (columns on upright frames, one per rack) and 8
    warnings ("Section 1: columns block 356 pallet positions on 19 rows");
  - an aisle narrowed to 7' is added as "Aisle between rows 5 and 6,
    section 2: 7', needs 8' to drive"; clicking it selects the two rows and
    zooms to them;
  - Export asks "14 errors found. Export anyway?" (9 v); Show issues opens
    the list; Export anyway opens the print window;
  - moving the row back and pressing again removes the item.
- **Hand-drawn:** "· no issues". An overlap of 1': "Double row 1 overlaps
  double row 2 by 1'"; fixed: "· no issues"; Export goes straight out.
- **Highlights** (hand-drawn: narrow aisle, overlap, unreachable, oversized
  bay, column on an upright, blocked pallets; generated: a narrow aisle and
  blocked pallets):
  - every click selected nothing, and the canvas drew exactly the item's
    shapes (red gap "7' · needs 8'", red overlap strip, red outline, amber
    bay, orange frame, amber bays);
  - they pulsed (≈0.4–0.8 opacity mid-pulse), then held at 1;
  - clicking a row on the canvas afterwards selected only that row and the
    highlight was gone;
  - blocked pallets: as many glowing Xs as blocked positions, each 3.75 ft
    (one position), glow 14, two lines each;
  - zoom: every issue at ≤ 100 % (0.94 at most) with at least 20 ft each
    way in view (a 1 ft column on an upright: 34 × 25 ft); a 116 ft aisle
    (vertical) whole in view at 16 %.
- No console errors.

### EX — Fixes from the exploratory check of section copy · `EX_exploreFixes.test.js` (14 tests)
1. **Results clear on the next action** — undo, redo, a placement (paste,
   Ctrl+D), Esc (`dismissReport` in the watcher's undo / redo branch,
   `startPlacement` / `cancelPlacement` and the Esc / Ctrl+D keys).
2. **Match bays is a finished action.** Marked with `beginMatch()`; the
   watcher then adds nothing to the pending set and rebases it
   (`rebaseAfterMatch`): each row takes its matched bays and start along,
   keeps its place across. So the bay changes it resolved stop counting, a
   move across still counts (and copies its exact delta), and the bar's
   Match source stays the row the user changed.
3. **Vertical creep — the cause:** a live-flue drag (a double row whose flue
   a column had widened, 12" instead of 9") worked out the rack's centre as
   origin + BASE depth / 2, but the origin was the widened rack's. When the
   flue went back to 9", the centre was off by (current − base) / 2 = 1.5"
   — ALONG the run for a turned rack, across for an unturned one. The drag
   now keeps the rack's size at drag start (`flueDragCentre` /
   `flueDragPlacement` in liveFlue.js). An automatic flue change is no
   longer a "change" (the shape is compared at the base flue). The copies
   always took the source's net centre delta; the source's aisle face had
   differed by half the flue change.
4. **Preview keys** are unique (`previewKey`: position + id — every added
   copy shares one placeholder id while previewing).
5. **The question's edit is finished after the answer:** `guardEdit(racks,
   { resume, drag })`. Delete re-runs itself, a placement commits, a panel
   change (taken back when it landed) is re-applied field by field (so a
   copy to the same rack survives); a drag shows "Drag cancelled — drag
   again". A resume runs only for the question actually answered.
6. **Snap reach** = min(12 px on screen, 1 ft) for every snap: smart guides
   (rack, wall and column — the wall / column reach was 30 px, 5 ft at 15 %)
   and placement.
- **Minor:** "Copied N rows" after every copy; counts are NET (from the
  difference, not per action); Match bays counts only rows that really
  change (and writes no undo step when nothing does); the bar offers Match
  bays whenever a bay change is pending, with no Copy button when nothing
  would be copied. Also: the copy watcher's in-place history write now
  keeps the layers the store's snapshots carry.

| Test (1080×410; ×2 h/v; generated and manual) | Asserts |
|---|---|
| `EX-results` | "Copied 7 rows" (8 sections h); undo, redo, a Ctrl+D placement clear it; Esc and Ctrl+D wired to `dismissReport`; manual: a Match result clears on undo |
| `EX-match` | a move across + a bay change: bar 2 changes, Match from row 5; after Match bays the log is unchanged, the bar is 1 change (the move), no Match button; Copy copies the move exactly; a second bay change is offered from ITS row |
| `EX-flue` | a rack widened to a 12" flue dragged 48" across with its flue back to 9": its start along unchanged, centre exactly +48"; in the section one net change "moved 4' across"; every copy's centre exactly +48" |
| `EX-preview` | with a delete and an added row pending, the preview's ids collide but `previewKey` never does; the painter uses it |
| `EX-resume` | a placement in another section: asked, Copy, placed (and the "Copied" result outlives it); a panel bay change: taken back, asked, Don't copy, re-applied, a new set there; a Delete's resume runs once; a drag: "Drag cancelled — drag again"; a question cleared unanswered never runs later |
| `EX-snap` | at 15 % / 50 % / 100 % a column face 0.8 × the reach away catches, 1.2 × doesn't (reach 1 ft, 24 px, 12 px); at 15 % a face 1.5 ft away no longer catches; placement never pulls a row more than 1 ft at 15 % |
| `EX-minor` | the same row moved twice: 1 change, 1 line; the question says "1 change"; "Copied N rows"; manual: Match bays with one rack off → "Matched bays on 1 row in section 1"; a bay change alone: Match bays, no Copy button |

**Re-run in the app (the exploratory sequences), horizontal and vertical, 30 steps each, no issue:**
- Row 5 of section 3 dragged 4 ft across at 15 %, 50 %, 100 %: no along
  creep (vertical: exactly 48"; horizontal 46.5" after snapping); every
  copy's centre off the source's delta by 0; "Copied 7 rows" (2 v).
- The result cleared on undo, redo, Esc and Ctrl+D (after Copy and after
  panel Match bays).
- A move across + a bay change → bar Match bays: "Section 3: 1 change",
  no Match button, only section 3 changed.
- Delete + paste, hover Copy: 14 (4 v) preview outlines for 14 (4) copies,
  no console warning.
- Delete in section 1 → question → Copy: copied AND row 8 deleted. A drag in
  section 2 → Don't copy: "Drag cancelled — drag again", the row unmoved. A
  panel bay change in section 2 → Don't copy: re-applied, "Section 2: 1
  change … Match bays (from row 7)".
- Manual: a rack off by 3 ft along, Match bays → "Matched bays on 1 row in
  section 1"; undo clears it; a delete shows nothing. No console errors.

### CF — Section-copy fixes from manual use · `CF_copyFixes.test.js` (12 tests)
1. **Bar and question only when a copy would do something.** The bar, its
   buttons and "Copy your changes?" appear only when the building has at
   least 2 GENERATED sections and the copy plan copies (or deletes) at least
   one row (`copyablePlan` in `utils/copyPrompt.js`, which never throws).
   A layout placed by hand has no generated sections: placing, pasting and
   deleting there show nothing. Before, the bar offered "Copy to other
   sections" and the click did nothing: the plan threw (`planReplay`) on a
   layout with no generated sections, so the question never closed either.
2. **The question.** "section 1", never "section run 1" (`sectionLabel`, also
   in the bar, reports and "stays in section" lines). Copy and Don't copy
   always close it. An edit across several sections (select all + Delete) is
   never asked about; the "affects rows in N sections" notice shows only
   where copying exists (≥ 2 generated sections).
3. **Cross-aisle = warning.** Paste / placement in a generated cross-aisle
   is placed, with an orange outline and "In the cross-aisle between
   sections A and B". Only overlapping a rack and outside the building still
   block. Only cross-aisles between generated sections count
   (`generatedCrossAisleGaps`): a manual layout has none to warn about.
4. **Match bays → the bar.** From the right panel (`runMatchBays`) or the
   bar, the result shows in the bar — "Matched bays on 6 rows in section 3
   from row 5" (no "from row" for a row placed by hand), plus warnings —
   until the next action (`showAfterAction`: held until its own action has
   settled, cleared by the next).

| Test (1080×410; ×2 h/v; generated and manual) | Asserts |
|---|---|
| `CF-manual` | manual layout (no generated sections, ≥ 2 runs): a row placed in the gap between runs, a pasted row, a move across and a delete — no bar, no question, nothing in the note; nothing copyable; an edit in another run is never stopped |
| `CF-generated` | a move across shows the bar ("1 will be copied"); an edit in another section asks, worded "section 3"; Don't copy closes it |
| `CF-select-all` | generated and manual, with a change pending: select all + Delete is not stopped, no question; everything goes; no bar after |
| `CF-question` | "Copy your 2 changes from section 1 …" for a hand run; Copy (with and without a building) and Don't copy close a question with nothing to copy, without throwing; on a generated layout Copy copies (row moved in section T) and closes |
| `CF-cross-aisle` | generated: a one-bay row in the cross-aisle between sections 1 and 2 — not blocked, `crossAisle`, the warning in the note, the orange outline; placed. Overlap and outside still block. Manual: the gap between runs gives no cross-aisle warning |
| `CF-match` | generated: a bay change alone shows the bar with Match bays and no Copy button (EX); the panel's Match bays shows "Matched bays on N rows in section S from row K" after its action settles; the next action clears it; the panel button calls `runMatchBays`. Manual: "… in section 1" (no row number); a move spanning two runs gives no notice |

**Checked in the app, horizontal and vertical:**
- **Manual** (a hand-drawn 400 × 400 building, 8 rows in two runs): Ctrl+C /
  Ctrl+V a row into the gap between runs, Delete, a Double Row from the left
  panel into the gap (no orange), Match bays from the panel ("Matched bays on
  3 rows in section 1" h, 2 v), Ctrl+A + Delete — never a bar, question or
  notice.
- **Generated:** a move across → the bar "Section 3: 1 change (1 will be
  copied)". A one-bay row over the cross-aisle between sections 1 and 2:
  orange outline, "Check — In the cross-aisle between sections 1 and 2";
  the click asks "Copy your 1 change from section 3 …" (a change is pending
  there); Don't copy closes it; the next click places the row. Match bays
  from the panel: "Matched bays on 20 rows in section 2 from row 7" (57 v)
  with its warnings; the next action clears it. Ctrl+A + Delete: no
  question, every rack gone. No console errors.

### RL — Every beam rack has levels: 4 unless set · `RL_rackLevels.test.js` (8 tests)
- **The bug:** capacity (`utils/capacity.js`), the column check and the rack
  panel read `levels || 1`. Generated racks carry 4; racks placed from the
  left panel, and pasted / duplicated copies of them, carried none — so they
  counted as ONE level in capacity, usable, Column Check and the headline.
- **The fix** (`utils/rackLevels.js`): single and double rows placed from
  the left panel (both placers) are stamped `levels: 4`, the same as a
  generated rack. A keeper fills 4 on any row still missing a levels value —
  a loaded older layout, an old autosave, any other path. A rack WITH a
  levels value keeps it, so a paste or duplicate keeps its source's.

| Test (×2 h/v) | Asserts |
|---|---|
| `RL-placed` | a generated rack a column costs positions is replaced by a hand-placed one of the same shape: levels 4; its capacity = ground positions × 4; gross rises by ground × 4 (× 1 at one level); its column losses are exactly 4× those at one level; the layout's gross is the generated one again. Both placers stamp `levelsFor` |
| `RL-missing` | a row that arrives with no levels gets 4, a set value (2) stays; gross counts them so |
| `RL-load` | an older file with a level-less hand rack loads with 4; generated racks' 4 and a set 3 stay |
| `RL-paste` | Duplicate (nudge + placement) and paste in place keep the source's 6 and 4 |

**Checked in the app, horizontal and vertical:** a generated double row
deleted and a Double Row placed there from the Racking section: levels 4,
"16 PAL (4 × 4L × 2 rows)", the rack panel "4 pal × 4 levels"; the live
Column Check line rose by 16 gross and 16 usable (38,816 → 38,832 /
34,860 → 34,876 h; 42,640 → 42,656 / 39,220 → 39,236 v). Three racks with
levels stripped from the autosave reloaded with 4. No console errors.

### GU — Generate is one undo step · `GU_generateUndo.test.js` (8 tests)
- **Before:** the store records an entry per action, and Generate is
  hundreds (clear the last layout, place the building, every rack and
  aisle). Ctrl+Z walked back object by object and, past the 60-entry cap,
  the layout from before Generate was gone.
- **Now** (`traceGenerate.js`, no store change): around the whole Generate —
  its layer setup and the aisle keeper's re-pairing included — the history
  is taken as it stood, and at the end replaced by that history plus ONE
  entry, the finished layout. The entry before it is the state Generate
  started from, so one Ctrl+Z restores it exactly (objects, groups, layers)
  and one Ctrl+Y redoes the Generate. Both entries: the sync one and the
  batched one the panel runs. The same outside-the-store history write the
  copy watcher uses.

| Test (1080×410; ×2 h/v) | Asserts |
|---|---|
| `GU-undo` | after a hand-drawn row and a hidden layer: Generate adds exactly one entry; one undo restores objects, groups and layers exactly; one redo the Generate |
| `GU-first` | on an empty canvas with no history: one undo empties it, one redo brings it back |
| `GU-regenerate` | a second Generate (the other orientation, each far over 60 objects) — one undo restores the first layout exactly, one redo the second; two undos the empty canvas |
| `GU-batched` | the batched entry is one step too |

**Checked in the app, horizontal then vertical:** Generate on an empty
canvas: history 0 → 2, Ctrl+Z → 0 objects, Ctrl+Y → 330. Then Vertical over
it: 330 → 347 objects (history +1); Ctrl+Z → the 330-object horizontal
layout, rows at 0°; Ctrl+Y → 347, rows at 90°. No console errors.

### HF — Small fixed-size handles (7569d59's code); no red-warning flicker on a building drag · `HF_handlesFlicker.test.js` (11 tests)
**Handles.** The handle and rotate-grip code is 7569d59's, restored file for
file (handleGeometry, ResizeHandlesOverlay, GroupRotateOverlay, groupRotate,
fpRotate, FpRotateHandleOverlay, and the two handleHitTest calls). Only the
three drawn sizes changed:
- **The sizes:** resize squares 6 px (was 8), white with a 1 px accent
  border; the rotate grip a 10 px white disc (was 14) on a 12 px stem (was
  16). A fixed size on screen at every zoom, always shown.
- **Click areas:** 7569d59's, unchanged: 14 px for a square, 16 px for the grip.
- **One rule for everything:** a rack at any rotation, a selection group and
  a building (all three grips drawn by the shared RotateGrip).
- **No extra line:** a selected rack's length-dimension line (the line under
  it, beside the length label) is gone — every rack type. The labels stay.
- **History:** drawing size (pure 6″ / 10″, then with an on-screen minimum
  and cap), a bigger fixed size (10 / 16 px), a rule hiding handles on
  objects under 12 / 40 px and a handleSizes rewrite were all tried and
  reverted to 7569d59.

**Red "no clear aisle" warnings on a building drag.**
- **The cause:** the clearance labels re-ran the aisle check on the previewed
  layout every frame. On the shifted floats the set of red warnings changed
  on 76 of 300 frames horizontally, and on 140 of 300 vertically (there,
  frames grew red where the layout had none).
- **The fix** (clearanceSource.js): a drag that carries every rack and every
  column grid holds the check's last result and moves it with the drag, with
  no recompute. That covers a building drag, or a selection holding every
  rack and the grid.
- **Any other drag** still re-checks, because it really changes what the
  check sees. Rows the drag doesn't move keep their warnings on every frame.

| Test (1080×410; ×2 h/v) | Asserts |
|---|---|
| `HF-handles` | on racks turned 0°, 90°, 180° and 270°, at 5 %, 20 % and 100 %: squares 6 px, the grip 10 px on a 12 px stem, on screen |
| `HF-hit` | at the same zooms and turns: a press ½ px inside the 14 px square click area hits and ½ px outside misses; the same for the grip's 16 px |
| `HF-grips` | a selection group's grip is 10 px on a 12 px stem with a 16 px click area at every zoom; the building's grip takes GRIP_PX / GRIP_HIT_PX (read from fpRotate.js, which imports the Konva painters) |
| `HF-flicker` | a pinched layout (at least one red warning) and a building drag over 120 fractional frames: the held blocks are used, moved by the drag, and the set of red warnings is identical on every frame |
| `HF-multi` | a selection holding every rack and the column grid: the same. A one-rack selection re-checks, and the red warnings of rows it doesn't move are identical on every frame |
| `HF-wire` (once) | the painters draw the layout's sizes (white, 1 px accent) through one RotateGrip; no dimension line under a selected rack (its length label stays); the clearance group sits at the source's offset |

**Checked in the app, horizontal and vertical:**
- **Handles.** A selected rack at 5 %, 20 % and 100 %: 2 squares of 6 px,
  the grip 10 px, the stem 12 px. With Checks and Aisles hidden the overlay
  holds exactly: the blue outline, the rack's label pills, the two squares,
  the stem, the grip and its glyph — no other line.
- **Building drag.** Several aisles pinched, then the building dragged from
  empty floor (found with the app's own hitTest). The red nodes stayed at
  270 (horizontal) and 216 (vertical) on all 40 frames, and after the drop.
- **One rack dragged** past its columns changed the count, as it should.
- No console errors.

### SC — Copying across sections: a per-section pending set · `SC_sectionCopy.test.js` (33 tests)
This replaces the per-change copy notes, the diagonal two-button note and
manual mode, and their tests (CC). "Always copy" and "Match bays in this
section" stay.

**With Always copy off (the default):**
- **Collecting changes.** The user makes any number of changes in one
  section; nothing is copied or locked meanwhile.
- **The bar** at the bottom reads "Section N: K changes (M will be copied) ·
  Copy to other sections"; with nothing to copy, "(none will be copied)". Its tooltip lists each change, one line per action:
  - "Row 5: moved 1' across" and "Row 9: deleted" are copied;
  - "Row 5: bays changed — stays in section 3" and "Row 5: moved 2' along —
    stays in section 3" are not.

  Clicking copies the set at any time, as one undo step, and clears it.
- **Moving on to another section.** Starting an edit on a row in a
  different section, while copyable changes are pending, stops the edit and
  asks "Copy your K changes from section N to the other sections?" [Copy]
  [Don't copy]. Either way the set clears, and edits in the new section
  start a new one.
  - Drag start, Delete and placing a row are checked before they happen.
  - Any other edit, such as a panel change, is taken back as soon as it
    lands.
  - A set that holds only changes that stay just gives way to the new one.
- **What is copied** to the same row (rowIndex) in every other section:
  - rows moved across the aisles, by the net delta per row;
  - added rows, full length for each section;
  - deleted rows.

  The existing fit, skip and wall rules and the skip report apply.
- **Match bays from the bar.** When the set includes a bay change, the bar
  also offers "Match bays in section 3 (from row 5)". The source is the row
  last given a bay change that still stands. It is the right panel's "Match
  bays in this section" (applySectionSync): same rows, same warnings (shown
  in the bar's report), one undo. The panel button stays.
- **Never copied:** bay changes and moves along a row. For the copy, the
  section's rows are planned in their original shape, moved only by their
  delta across.
- **Rows in several sections.** One action changing rows in more than one
  section is not copied: "This change affects rows in 2 sections, so it
  stays where you made it."

**With Always copy on:** each move across, add and delete is copied at once,
folded into the action's own history entry, so one Ctrl+Z undoes both. There
is no set and no question.

**Storage.** The set is kept on the building (`copyPending`): a snapshot of
the section's racks from just before its first change, and the log. It is
saved with the layout, undo takes a change back out, and a regenerated
layout clears it.

| Test (1080×410, "section 3" and "section 5" — vertical has 3 sections, so section 1; ×2 h/v) | Asserts |
|---|---|
| `SC-layout` | the orientation is right, and rows 5, 7 and 9 exist in every section |
| `SC-stays` | a beam change and a move along the same row in section 3: no question and no lock; nothing would be copied, so no Copy button — the bar shows 1 net change and Match bays (EX); copying changes nothing elsewhere |
| `SC-match` | a move across alone: no Match bays button. A beam change in row 7 alone: Match bays only, no Copy. Then a move across (row 9) and a beam change in row 5: the bar reads "Match bays in section 3 (from row 5)" (the last one). Clicking gives every row of section 3 row 5's bays in one history entry, with the report "Matched bays on N rows in section 3 from row 5"; one undo restores |
| `SC-stays-mixed` | an end bay removed at a cross-aisle, a row moved along and a row moved across, all in section 3: the bar reads "Section 3: 3 changes (1 will be copied)"; only the move across is copied; the other sections keep their bays and their along position |
| `SC-question` | rows moved across (1′, −6″) and one deleted in section 3, then a drag started in section 5. The question "Copy your 3 changes from section 3 …" appears and nothing happens yet. Copy: every other section gets the same net deltas and loses row 9; section 3's own rows are untouched; the set clears; the drag may now go ahead and starts a set in section 5 |
| `SC-dont` | the same, Don't copy: the other sections are unchanged, the set clears, and a change in section 5 starts its own set |
| `SC-stop` | a panel change in section 5, with nothing checked before it, is taken back (layout and history as before) and the question asked |
| `SC-bar` | the bar's Copy is one undo step; undo brings the copies back out and the set back |
| `SC-always` | Always copy: a move across and a delete are copied at once, one history entry each, and each undoes with its copies; a bay change stays; no set, no question |
| `SC-undo` | three changes, then undo → 2 in the set, then undo twice → no set |
| `SC-save` | a layout saved with a pending set comes back with it (serializeScene / deserializeScene), and Copy then works |
| `SC-multi` | rows in two sections moved in one action: the message, no set, nothing copied |
| `SC-regenerate` | a regenerated layout clears the set (and any old report) |
| `SC-add` | a row pasted into a gap follows the mouse, snaps to the forklift aisle and places on one undo step. The set lists "A row added", and Copy puts it in every section, full length for each |
| `SC-place` | paste and duplicate follow the mouse; blocked spots (outside, overlap) take the click and do nothing; a cross-aisle warns and places (CF rule 3); Esc cancels; placing a row in section 5 while section 3 has a copyable change asks first |
| `SC-skip` | a copy that would overlap is skipped: "Section 1, row 5: overlaps row 6 by 1'"; the others are copied |
| `SC-wire` (once) | the notes, two-button note and manual mode are gone. The bar, the question, the checks before a drag, Delete and placing, and the Always copy switch (off by default) are wired |

**Checked in the app, driven by mouse and keyboard in both orientations:**
- **Bays and along moves (section 3).** A beam change (the panel) and a drag
  along the same row: the bar listed "bays changed — stays in section 3" and
  "moved 2' along — stays in section 3", with Copy disabled.
- **Across and delete (section 3).** Rows 5 and 7 dragged across and row 9
  deleted: "Section 3: … changes".
- **The question.** A drag started on row 5 of section 5 (vertical: section
  1) showed "Copy your N changes from section 3 to the other sections?"
  [Copy] [Don't copy], and the row did not move.
  - Copy moved rows 5 and 7 in every section by the dragged deltas: 2′ and
    −2.13′ in all 8 sections (vertical 2.04′ and −0.96′ in all 3). Row 9
    was gone everywhere.
  - Dragging in section 5 then started "Section 5: 1 change".
- **Don't copy.** A drag in section 3 while section 5 had a change asked;
  Don't copy cleared the set, and section 5's change stayed local.
- **Always copy.** A drag across moved the row in all 8 (3) sections, with
  no bar.
- **Match bays from the bar.** Row 5 of section 3 clicked, its bay 3 given a
  9′ beam in the panel. The bar read "Section 3: 1 change (none will be
  copied) · Copy to other sections · Match bays in section 3 (from row 5)".
  - Clicking gave all 21 rows (vertical: 58) row 5's bays: "Matched bays in
    section 3: 20 rows" (57).
  - In vertical it added the panel's own warnings, "Row 1: passes the wall
    by 9″" and so on: section 3 runs to the wall.
  - One Ctrl+Z restored them.
- **A live-flue drag.** Vertical, a row whose flue had widened around a
  column: a small drag re-seats it on the column. It doesn't move, only its
  flue changes, so nothing is copied. That is the existing drag behaviour.
- No console errors.

### PF — Lag fixes, measured before/after, behaviour unchanged · `PF_perf.test.js` (60 tests)
Profiled on 1080×410 in both orientations. The lag was never the sync work;
it came from three older causes, each fixed.

**1. Column check** (`generate/columnCheck.js`, `generate/useColumnCheck.jsx`;
committed as `681878a`, the pick-zone cache added after it).
- **Faster check:** footprints are computed once per rack. Pick-zone and
  upright tests use only the columns and racks near each rack, in the same
  order, so the hits are the same.
- **Per-rack cache:** pick-zone results are kept per rack, keyed on the
  rack's full content, the racks near its zones, its own blocked positions,
  and the columns, floors, profile and grid. An edit re-checks only the
  touched rack and its neighbours.
- **Speed:** 32 → 8 ms in Node before the per-rack cache; per drop in the
  app, 19 → 7 ms.
- **Geometry gate:** the provider reruns only on a geometry change. Racks,
  columns and floors keep their identity while unchanged; bay highlight,
  row stamps and selection don't count.
- **Drag hold:** during any drag (plain, live flue, resize, rotate —
  `dragPreview.dragging`) the full result is held and only the cheap aisle
  check runs per frame. The full check runs once on the drop.

**2. Pan / zoom / selection.**
- **Narrow selectors:** every `useCanvasStore()` whole-store read outside
  the protected folders became a narrow shallow selector (33 sites + TextPanel).
- **View out of the canvas render:** Canvas2 no longer reads the pan;
  `ViewAdopter` and `StoreRulers` do.
- **Memoised canvas:** Scene, Overlays, the shapes, the handle overlays and
  the grid are memoised.
- **Per-rack draw ops:** rack draw ops are cached per rack object, so an edit
  redraws only the rack it changed; aisle shapes get their two rows, not
  `objects`.
- **No hit canvas:** the scene layer no longer redraws Konva's hit canvas.
  Picking is geometry (rule 4); nothing read it.
- **Warning cache:** the beam-preset warnings are cached per objects array
  (one check per preset per layout, not 28 per render).

**3. Drag preview.**
- **Per-item overlays:** X marks, upright marks, oversized-bay marks, aisle
  labels and clearance labels are memoised items fed only their own rack /
  rows / block. A drag, selection or edit redraws only what touches a
  changed object.
- **Rigid drags:** a drag that carries everything the overlays come from
  (the building) draws them unshifted in a group offset by the drag.
- **Exactness guard:** aisle and clearance labels ride the group only while
  this frame's live result equals the held one moved by the drag, and
  otherwise draw the live result as before. A float boundary can add a
  block — seen in the vertical building drag.

**Behaviour check** (`equiv.js`, scratchpad). A fixed script of real
actions, run in both orientations: generate, drag a double row (live flue),
drag a single row, drag the building (each with a mid-drag snapshot),
pan + zoom, click-select, Levels + Enter, custom bay typing, move + Apply,
building selected, undo.
- **Recorded after each action:** every Konva shape (layer-space transform,
  line points, drawing attrs), the page text and a canvas screenshot hash.
- **Compared against:** the original code, served from a copy of the tree.
- **Result, dev and production:** every static state is pixel-identical,
  with the same text and marks.
- **Mid-building-drag:** 13 (h) / 121 (v) pixels of 1.2 M differ by 1 level
  of 255 (anti-aliasing from moving one group instead of every coordinate).
- **Only attribute difference:** the building outline's hit-band width,
  which only the (now skipped, unused) hit pass wrote.

| Test | Asserts |
|---|---|
| `PF-matrix` ×50 | every matrix building, both orientations, both wall settings, both pick-both-sides: `checkColumns` deep-equals a frozen copy of the check before this work (`reference/columnCheck.v1.js`) |
| `PF-edits` ×6 | 12 seeded random edit sets each: racks nudged over columns, turned 90/180, re-levelled, without depthIn, at 45°, single rows dropped in aisles, loose columns |
| `PF-cache` ×3 | 40 incremental edits with the SAME columns / floors / profile objects (the cache engaged): moved copies, racks changed in place, removed, added, turned, pick-both-sides toggled — equal to the reference at every step |
| `PF-aisle` | the per-frame aisle check equals the reference |
| `O-wire` (updated) | the overlays follow the drag: previewed objects, or the store objects in a group offset by a drag that carries everything; aisle labels from their two previewed rows |

**Timing** (`perf.js` + `ab.cjs`, scratchpad). Real input into the running
app; the before and after servers are measured back to back per
orientation, because this machine's speed drifts ±25 ms between runs.
- **Production build.** Continuous actions: median / p95 ms per frame ·
  frames over 50 ms. Single actions: the worst frame.

| action | before H | after H | before V | after V |
|---|---|---|---|---|
| pan | 26.8 / 66.7 · 56/124 | 13.3 / 13.5 · 0/124 | 26.8 / 66.7 · 61/125 | 13.3 / 26.7 · 0/133 |
| zoom | 13.4 / 80.1 · 30/153 | 13.4 / 66.7 · 24/151 | 13.4 / 80.1 · 30/152 | 13.4 / 66.8 · 30/148 |
| drag single row | 13.4 / 26.8 · 1/316 | 13.3 / 13.5 · 1/188 (the drop, 53 ms) | 13.4 / 26.8 · 1/329 | 13.3 / 13.5 · 1/207 (the drop, 53 ms) |
| drag double row | 13.3 / 80 · 19/330 | 13.3 / 26.7 · 0/198 | 13.4 / 80 · 39/326 | 13.3 / 26.6 · 0/211 |
| drag building | 13.4 / 26.8 · 1/318 | 13.3 / 26.6 · 2/220 | 13.4 / 40 · 1/360 | 13.3 / 13.6 · 1/280 |
| selection changes | 26.4 / 40.2 · 2/84 | 13.3 / 13.5 · 0/67 | 13.4 / 40.1 · 1/93 | 13.3 / 13.5 · 0/66 |
| click-select | 52.8 | 13.4 | 53.4 | 13.4 |
| Levels + Enter | 93.6 | 26.5 | 93.3 | 13.4 |
| Apply | 93.4 | 40.1 | 80 | 26.9 |

- **Dev server** (StrictMode renders twice), same format:

| action | before H | after H | before V | after V |
|---|---|---|---|---|
| pan | 26.9 / 93.4 · 61/125 | 13.3 / 13.5 · 0/123 | 53.4 / 93.4 · 62/124 | 13.4 / 26.7 · 0/144 |
| zoom | 13.4 / 120 · 30/156 | 13.4 / 80.1 · 30/151 | 13.4 / 106.8 · 30/157 | 13.4 / 93.3 · 30/149 |
| drag single row | 13.4 / 40.1 · 2/330 | 13.3 / 13.5 · 1/192 | 13.4 / 53.3 · 22/325 | 13.3 / 13.5 · 1/207 |
| drag double row | 13.4 / 133.6 · 20/328 | 13.4 / 40 · 2/202 | 13.4 / 133.5 · 52/334 | 13.3 / 26.7 · 0/239 |
| drag building | 13.4 / 53.5 · 61/325 | 13.4 / 26.7 · 1/241 | 13.4 / 53.5 · 70/348 | 13.3 / 26.6 · 2/288 |
| selection changes | 18.3 / 80 · 40/86 | 13.4 / 26.6 · 0/73 | 13.5 / 66.6 · 32/95 | 13.4 / 26.6 · 0/73 |
| click-select | 106.7 | 26.7 | 93.5 | 26.6 |
| Levels + Enter | 173.5 | 39.9 | 160.2 | 26.7 |
| Apply | 173.4 | 53.1 | 146.6 | 26.7 |

**Not met at this point:**
- **Zoom:** still one slow frame per wheel step (p95 67–80 ms in
  production), because every label was screen-constant (1/zoom). Fixed by
  LZ below: labels are drawing size and nothing re-renders on zoom.
- **Single-row drop:** 40–53 ms in production. 11–16 ms of it is the
  protected store's `moveObjects` / history snapshot.

### CR — Columns at their real size at every zoom · `CR_realColumns.test.js` (3 tests)
Columns are drawn like any other object: each square is exactly the column
(`render/columnDraw.js`, from the same `expandColumnGrid` the check
measures) and scales with the zoom.
- **Removed:** the 6-screen-px minimum (BUG 66), the enlarged marker kept
  inside its rack face (`canvas2/columnMarker.js` and its test), the
  `growToMinScreenSize` helper, and the 1 px screen-constant outline that
  also inflated every column.
- **Scene no longer reads the zoom at all.**
- **Still screen-constant** (UI): selection handles, rotate grips, snap
  guides, the measure tool, rulers.

| Test (1080×410; ×2 h/v) | Asserts |
|---|---|
| `CR-path` | the drawn path is exactly the column check's rects, each 12″ × 12″; nothing grown; a hidden grid draws nothing |
| `CR-wire` | the column shape takes no zoom and no strokeScaleEnabled (its outline is 1″ in drawing units, see FU); Scene reads no zoom; the enlarged-marker module is gone |

**Checked in the app, horizontal and vertical:**
- The drawn column shape's extent equals the grid's exact extent at zoom 3 %
  and 20 %.
- A 12″ column is 1.2 px on screen at 3 % and 8 px at 20 % (40 px/ft ×
  zoom).
- Resize handles stay 12 px at both zooms.
- No console errors.

### LZ — Labels are drawing size (CAD text); Label size setting · `LZ_labelSize.test.js` (9 tests)
Every label and mark on the drawing is a fixed size in feet and scales with
the racks. Nothing is sized by the view zoom, so zooming re-renders none of
them. This replaces the earlier "hold labels while the wheel moves" idea.

**What is drawing size, and what stays screen size:**
- **Drawing size:** aisle and cross-aisle width labels, column clearance
  arrows and labels, the red aisle shade, rack and building dimension
  labels, X marks, orange upright flags, oversized-bay crosses. The
  aisle-label pick area matches the drawn label.
- **Screen size (UI, unchanged):** selection and resize handles, rotate
  grips, group-rotate chrome, snap-guide thresholds, the measure tool,
  rulers. (The column markers' minimum on-screen size and the screen-size
  travel arrows are gone: see CR and FU.)

**How:**
- **Label size** (`render/labelSize.js`): the View menu has Small / Medium /
  Large / Extra large = 12 / 24 / 36 / 48 in reference text, Medium by
  default. It is kept in `canvas2/labelPrefs.js` (localStorage, never the
  store).
- **Label scale:** `labelScale(size, gridSize)` is used everywhere the old
  designs divided by the view zoom. Each design keeps its proportions:
  aisle text 1×, clearance 0.9×, dimensions 1.1×, X-mark stroke 0.2× the
  reference height.
- **One set of ops** (`render/labelOps.js`, renderer-neutral like
  `rackDrawOps`) for every label and mark, in world units. The canvas paints
  them (`canvas2/LabelOps.jsx`); the PDF writes the same ops as SVG
  (`labelsSVG` in `export/pdfExport.js`), with the same Label size, Column
  labels switch and column-check settings as the screen
  (`generate/columnCheckView.js`).
- **Mark geometry:** bay and pallet-position rects moved to
  `render/bayGeom.js` (pure; `shapes.jsx` re-exports them).

| Test (1080×410; ×2 h/v) | Asserts |
|---|---|
| `LZ-feet` | an aisle label's text is exactly 1 / 2 / 3 ft tall for Small / Medium / Large, and there is one label per aisle |
| `LZ-all` | Small → Large scales every kind by 3× — aisle, cross-aisle, clearance + red shade, X marks, upright flags, oversized crosses (fonts, strokes, pills) — and width labels stay centred |
| `LZ-zoom` | the overlays size everything from `labelScale`, never the view zoom: every label / mark component gets `lz`, the dimension labels get it as their zoom, and Canvas2 no longer passes the view zoom to Overlays |
| `LZ-pdf` | the PDF has one label per aisle and per cross-aisle, at the Label size (2 ft Medium, 3 ft Large). Column labels off removes the blue "clear" labels and keeps every "under travel" label, red shade, X mark and upright flag |
| `LZ-default` | Medium and Column labels on by default; an unknown size is ignored; the View menu has S / M / L (XL: `FU-sizes`) |

**Checked in the app, horizontal and vertical** (1080×410, a rack
selected):
- At zoom 0.03 and at 0.12, every label and mark has the same world size:
  aisle and cross-aisle text 2 ft, clearance 1.8 ft, rack dimensions 2.2 ft,
  X-mark and upright strokes 0.4 ft.
- Label size → Large (the real View menu) made them 3, 2.7, 3.3 and 0.6 ft.
- Resize handles stayed 12 screen px at both zooms.
- The PDF's SVG carried 769 (h) / 927 (v) labels at the same 2 / 1.8 ft
  sizes, and 602 / 754 of them are "clear" labels.
- No console errors.

**Production build, before → after:**

| Measure | before H | after H | before V | after V |
|---|---|---|---|---|
| Zoom | 13.4 / 80.1 · 30/171 slow | 13.3 / 26.6 · 1/171 | 13.4 / 93.3 · 30/175 | 13.3 / 26.7 · 0/170 |
| Pan | 26.8 / 66.7 · 54/125 | 13.3 / 13.5 · 0/122 | 39.9 / 66.7 · 58/125 | 13.3 / 13.9 · 0/129 |
| Overlay nodes, whole-building view | 11,363 | 6,642 | 11,934 | 6,927 |
| Overlay nodes, Column labels off | — | 3,933 | — | 3,534 |

### PX — Rack lines: actual size, 1 px floor, whole pixels · `PX_rackLines.test.js` (11 tests)
**What changed:**
- **Rack outlines** are real lines of `RACK_BORDER_IN` = 0.45″, which is
  1.5 world px at 40 px/ft. They are flagged `border: true` in
  `rackOps`. The PDF has always printed them at this width, so the PDF is
  unchanged.
- **Outlines and upright frames** are drawn at their actual size, never
  thinner than one CSS pixel. That is 1 device px at pixel ratio 1, and 2 at
  ratio 1.5 or 2.
- **Every edge is snapped** to a whole device pixel
  (`render/pixelSnap.js`).
- **Painting happens in device space**, from the canvas's live transform
  inside the sceneFunc, so nothing reads the zoom.
- **A rack off the 90° grid** can't land on pixels. It is drawn in world
  space with the same floor instead.
- **One node per rack body:** the fill (still actual size) and the snapped
  outline are one Shape, with a plain-rect `hitFunc` and its own bounds.
- **Unchanged:** lane dividers, rails and other hairlines stay
  screen-constant. Columns are untouched.

| Test (1080×410, every rack; ×2 h/v unless noted) | Asserts |
|---|---|
| `PX-layout` | horizontal racks sit at 0°, vertical at 90°; every rack has an outline at `rackBorderWidth` and one uprights op; every transform is axis-aligned |
| `PX-in` | at 100 / 300 / 500 % and four fractional pans, each outline strip is `round(actual)` px (within ½ px). Each upright edge is its actual edge rounded (within ½ px), so its width is within 1 px |
| `PX-out` | at 2 / 5 / 10 %, every outline strip is exactly 1 px, and every upright thinner than a pixel is exactly 1 px across (over 1,000 of them) |
| `PX-whole` | at pixel ratios 1, 1.5 and 2, five zooms and four pans, every painted rect has integer coordinates and is at least the floor wide |
| `PX-pdf` | the PDF prints every outline at stroke-width 1.5 (0.45″) |
| `PX-wire` (once) | the canvas paints outlines and uprights through the snapper, with a floor from the pixel ratio; the body carries no stroke of its own; the column shape has no snapping |

**Checked in the app, horizontal (0°) and vertical (90° racks):** the
painted width was measured on the scene canvas, with a fractional pan.

| Zoom | Outline, actual → drawn | Upright, actual → drawn |
|---|---|---|
| 5 % | 0.08 → **1** | 0.5 → **1** |
| 20 % | 0.3 → **1** | 2 → 2 |
| 100 % | 1.5 → 2 | 10 → 10 |
| 300 % | 4.5 → 5 | 30 → 30 |

- Both orientations give the same numbers.
- At pixel ratio 2, the 5 % outline is 2 device px (one CSS px) and 100 % is
  3.
- With the floor removed, outlines at 5 % and 20 % disappear (0 px) in both
  orientations.
- Clicking a rack still selects it at 5 %, 30 % and 100 %.
- No console errors.
- **Scene-layer redraw** for the whole layout: about 14–15 ms, against
  12–13 ms before (headless, software rendering). The extra time is
  snapping about 20,000 uprights.

### FU — Follow-ups: real uprights, drawing-size arrows, Extra large, PDF label size, per-aisle size, column look · `FU_labelFollowUps.test.js` (12 tests)
- **Upright frames** are drawn at their real `uprightWidth` at every zoom
  (`uprightDrawRects`); the minimum on-screen width is gone.
- **Rack travel arrows** are drawing size, sized by Label size
  (`travelArrowGeom(op, lz)`), on the canvas and in the PDF.
- **Label size** adds Extra large (48 in text).
- **PDF label size** (View menu) is a separate setting: Auto (default), Same
  as screen, or a fixed size. Auto (`autoPdfLabelInches`) picks the
  smallest size that prints every label at least 2.5 mm tall on the chosen
  sheet.
- **Per-aisle label size:** with one or more aisles selected, the right panel
  shows Default / Small / Medium / Large / Extra large / custom (inches).
  - The choice is stored as `labelSizeIn` on the aisle, which makes it
    document data: saved with the layout, one undo step, and printed in the
    PDF.
  - Default removes the override.
  - "Apply to all aisles" gives every aisle the selection's size.
  - Cross-aisle labels follow the global size.
- **Column look** is the SVG engine's: a solid body in the grid's strong
  colour at 0.85, an I-beam web at 0.5, flanges at 0.9, and a 1″ outline in
  drawing units, inset so the drawn column is exactly the real column.
  Column grids now paint **above** racks, on the canvas and in the PDF. A
  generated grid comes first in the array, so racks used to bury every
  column inside a rack footprint.

| Test (1080×410) | Asserts |
|---|---|
| `FU-upright` h/v | every upright's drawn width equals `uprightWidth` at zoom 0.02, 0.2, 1 and 5; the op carries no minimum |
| `FU-aisle` h/v | Large on one aisle changes only its label (3 ft; the others stay 2 ft). Default restores it. Apply to all sets every aisle. It survives save/reload and appears in the PDF at the override size |
| `FU-pdf-min` h/v | at Auto, every PDF label is ≥ 2.5 mm on the chosen sheet |
| `FU-arrows` | the arrow stroke, length and head scale by exactly Small→Large (3×); the canvas and the PDF both pass `lz` |
| `FU-sizes` | Extra large = 48 in; the View menu has S / M / L / XL and the PDF label size select; Auto is the default |
| `FU-panel` | the per-aisle control is wired into the one-aisle and multi-select panels; Apply to all uses every aisle |
| `FU-columns` | body opacity ≥ 0.8 in the strong colour; web and flanges present; the outline is 1″ in drawing units, inset, with no `strokeScaleEnabled`; the red conflict marks are still drawn above; the PDF prints the same look |
| `FU-columns-top` h/v | the grid comes first in the array, yet the PDF draws every rack before the columns and the labels after them; Scene renders the column grids last |

**Checked in the app, horizontal and vertical:**
- **Columns at 20 %:** body opacity 0.85 in #6366f1; the outline is
  0.0833 ft (1″) and scales with the zoom.
- **Column pixels at 20 %:** all 24 on-screen columns show blue pixels in
  both orientations.
  - With the old order (columns under racks), horizontal drops to 12 of
    24.
  - Vertical is unaffected by the order, because its columns sit in aisles
    and flues.
- **Per-aisle size:**
  - Large makes a0 3 ft and a1 2 ft. Default returns a0 to 2 ft.
  - The panel shows "Mixed sizes".
  - Extra large plus Apply to all puts every label at 4 ft (160 of 160
    aisles horizontal, 171 of 171 vertical).
  - Undo leaves a0 and a1 at 4 ft and returns the rest to 2 ft.
- **PDF Auto:** the smallest label prints at 2.548 mm (769 labels
  horizontal, 927 vertical).
- **Travel arrows** grow from Medium to Extra large.
- No console errors.

### LB — One label per aisle, cross-aisle labels, column labels (now the Checks layer) · `LB_labels.test.js` (8 tests)
- **One aisle label:** an aisle (one section's pair of facing rows) has ONE
  width label, centred along it. It used to repeat at up to three stations
  on long aisles. The pick area is the same single label.
- **Cross-aisle labels** (`canvas2/crossAisles.js`): per building and row
  orientation, the racks' run extents merge into sections, and each gap
  between two sections gets one width label. Its width is the clear gap
  between the facing racks, centred along the gap and across the racks, in
  the aisle-label style. It follows a drag.
- **Column labels:** the View-menu switch is gone, folded into the Checks
  layer (LY). The clearance arrows and distances draw exactly when the rest
  of the Checks do. `clearanceOps` keeps its `showLabels` argument (LB-toggle
  still covers what "off" hides); the canvas and the PDF always pass on.

| Test (1080×410; ×2 h/v) | Asserts |
|---|---|
| `LB-aisle` | every aisle has exactly one label, centred, including aisles ≥ 60 ft (which had three); every aisle is within one section and every section's aisles are labelled |
| `LB-cross` | one label per cross-aisle (sections − 1). The width is the gap between the section envelopes (≥ the truck's 9 ft), centred along the gap and across both sections, with the right orientation |
| `LB-cross-drag` | a rack moved 2 ft into a cross-aisle narrows that label by exactly 2 ft |
| `LB-toggle` | switched off: plain clearances hidden; "under travel" marks kept, red, with their text; the red shade is independent of the switch; a mixed block keeps only its short side |
| `LB-toggle-wire` | the switch is gone from the View menu and labelPrefs; the clearance labels, X marks, upright flags and oversized marks are all behind `marksOn` (the Checks layer); the shade is drawn whatever `showLabels` says |

### AR — Aisles pair only directly facing rows · `AR_aisleRebuild.test.js` (110 tests)
**The bug.** An `aisle` is only a pair of rack ids. When a row is deleted, the
aisles that pointed at it are left dangling and its neighbours get no aisle of
their own. When a row comes back, nothing re-pairs, so a stale pairing can run
straight through it (the 28′ 6″ label).

**The fix** (`utils/aisleRebuild.js`). `rebuildAisles` re-derives the pairs.
Rows are lines across the aisles (split pieces are one row), grouped by
building, run direction and overlapping run, and neighbours are consecutive
lines that share some of the run with a gap between them. Then:
- an aisle whose pair is still neighbours is kept, with its id and label;
- an aisle with a row between its rows, a duplicate, or one pointing at a
  deleted rack is removed;
- a neighbour pair without an aisle gets one.

Only managed sections are touched: those with generated racks or existing
aisles. A hand-drawn layout gets no new aisles, and lane-rack aisles are left
alone.

Where it runs:
- **Sync buttons and bay splits:** before their commit, so their undo
  snapshots are right.
- **`aisleKeeper` (installed in App.jsx):** re-runs it whenever the racks or
  aisles change or the history position moves (every commit, undo and redo),
  without a history entry. This covers the protected store's delete, paste and
  undo/redo.

| Test | Asserts (both orientations) |
|---|---|
| `AR-delete` | delete a middle row → one aisle joins its neighbours; copied to all sections → same; undo twice → the row is back, the wide aisle gone, both of its aisles present |
| `AR-handcopy` | row 4 deleted everywhere, a hand row in its place, copied to all sections → every copy has an aisle to each neighbour |
| `AR-undo` | delete, copy, then undo/undo/redo/redo/undo → right at every step |
| `AR-snapshot` | keeper off: the copy's own undo snapshot already has the right aisles |
| `AR-split` | a middle-bay split and Match bays keep every aisle between facing rows |
| `AR-matrix` ×100 | every matrix building, both orientations, both wall settings: the generator's aisles have no rack between their rows, every facing pair has one, and a rebuild changes nothing |

Every test also checks that no aisle has a rack in its gap and that every
facing pair has an aisle.

### Z2 — Sync safety · `Z2_syncSafety.test.js` (12 tests)
**What made rows disappear.**
- Deleting "rows" by clicking a row and pressing Delete removes the clicked
  bay; a middle bay splits the rack into two pieces. Pressing Delete on the
  front piece then shortens it, so the row now starts one bay later.
- Both syncs treated every piece as its own row. A section with 3 chopped
  rows read as 10 rows instead of 7, so matching and row numbers went wrong.
- Sync all sections then copied the chopped rows' later start onto
  full-length rows in every other section. Those rows were pushed along the
  run into the cross-aisle and the next section, and in the last section out
  of the building. Reproduced with real clicks: after "Sync all sections"
  from the chopped section, 3 of 31 racks were outside the building (6 with
  more rows chopped), in both orientations.

**The "Sync section" button looked missing:** the dev server was serving a
stale `RackRowPanelCore.jsx` (its file watcher missed an edit; the served
module had only one sync button while the file on disk renders both). After
a clean restart both buttons render.

**Fixes** (`utils/syncSections.js`, `utils/syncSection.js`):
- **A row is a line across the aisles** (`rowLines`): the pieces of a split
  row are one row. Sync all sections matches lines and moves every piece of
  a line by the same shift, so the gap in a split row is kept.
- **Never outside the building:** a Sync all sections shift that would take a
  rack past the inner wall is cut at the wall. The row is reported as held
  ("held at the wall: section 4 row 3 (8′ short)"). This replaces the old
  "passes the wall" warning for Sync all sections.
- **Sync section leaves split rows as they are** (`splitRowIds`), reported
  as "N pieces of split rows left as is". Copying the full pattern onto each
  piece would stack identical racks on top of each other.
- **One section definition:** Sync section now uses the same sections as
  Sync all sections (runs grouped transitively), so a split row's far piece
  belongs to its section even when the selected rack is a short piece. Its
  row count is in lines.

| Test | Asserts |
|---|---|
| `Z2-buttons` ×2 (h, v) | a single row and a double row both render "Match bays in this section" and no "Apply my changes", and so does a chopped piece |
| `Z2-delete` ×10 (h, v × row 5 moved across in sections 2/1/3 then "Copy to all sections", Match bays from 2/1) | rows 1–3 of section 2 chopped (split at bay 3, then front bay deleted). After the sync the rack count is unchanged, every rack is inside the building's inner box, nothing is stacked on another rack, and split rows keep their gap (moved as one). Sync section from the chopped section leaves the 5 split pieces as they are. One undo restores. |

Area Z updates: section 4's row 3 is now held at the wall (moved by the end
gap only) instead of passing it; `Z-sync`, `Z-warn` and `Z-gap` assert the
held report and the clamped position.

**Checked in the app, horizontal and vertical** (fresh dev server):
- Both buttons show.
- Rows 1–3 of section 2 were chopped with real clicks and Delete (28 → 31
  racks).
- "Sync all sections" from that section: 31 racks before and after, all 31
  inside the building and drawn. The panel said "Moved 9 rows · held at the
  wall: section 4 rows 1–3 (8′ short)".
- "Sync section": "Synced 4 rows · 5 pieces of split rows left as is",
  31/31 inside.
- No console errors.

### Y — Sync section · `Y_syncSection.test.js` (7 tests)
**"Sync section"** is a button in the rack panel labelled with the number of
other rows it will change. Every other row in the selected row's section
copies its **bay pattern** (beam lengths in order along the run) and its
**start position along the run**, so every upright lines up across the
aisles. It also copies the upright width, since uprights can't line up
without it. Position across the aisles, depth, levels, rotation and type
stay as they are. A double row takes the pattern for the whole rack.

A **section** is the single and double beam rows in the same building, with
the same run direction, whose run overlaps the selected row's: the rows
between the same two cross-aisles, or a wall and a cross-aisle. A row drawn
the other way round (180°/270°) gets the list reversed, so the pattern and
uprights still match on the floor. Logic: `utils/syncSection.js`.

**Warnings, never blocks.** After the sync the panel lists each row that now
overlaps another rack, passes the inner wall, or sits closer to a rack across
a cross-aisle than the selected row does ("Row 3: cross-aisle down to
12′ 9″"). Rows are numbered in stack order within the section.

**One undo:** every row but the last is written without history and the last
commits, so the one snapshot holds the whole sync. No store change.

| Test | Asserts |
|---|---|
| `Y-sync` ×2 (h, v) | a generated 240×120 layout. The selected row has 6′ and 10′ bays; other rows in its section are shifted 2′, cut 2 bays short, or re-beamed. After the sync every row in the section has the selected row's beams, run start and upright positions. Position across the aisles, height, levels and rotation are kept; the other section and the building are unchanged; one undo restores all. |
| `Y-warn` ×2 (h, v) | a lane rack in the stretch a short row regains → that row "overlaps obs". A neighbour across the cross-aisle moved 3′ closer → that row's cross-aisle = generated gap − 3′. A selected row given an extra 16′ bay at the far wall → every other row listed as past the wall by 195″ − its end gap. Rows are still synced; one undo. |
| `Y-direction` ×2 (0°/180°, 90°/270°) | a row drawn the other way round gets [144, 120, 96, 72] for [72, 96, 120, 144]; uprights aligned; one undo |
| `Y-panel` | "Sync section (N other rows)"; a row alone in its section gets a disabled button |

**Checked in the app, horizontal and vertical** (240×120):
- The rows were disturbed by hand edits first. After "Sync section (6 other
  rows)" horizontal and "(13 other rows)" vertical, all 7 / 14 rows matched
  the selected row's beams, start and uprights.
- Position across the aisles and levels were kept; the other sections were
  byte-identical; one Ctrl+Z restored every row.
- With a neighbouring rack moved 3′ into the cross-aisle, the panel showed
  "Row 1: cross-aisle down to 12′ 9″" (h) and "8′ 3″" (v), matching the
  generated gap − 3′.
- No console errors.

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

| CR | **Columns enlarged** (grown in the path) | 2: CR-path h/v | ✓ |
| CR | **Zoom passed back into the column shape** | 1: CR-wire | ✓ |
| CR | **Screen-constant outline back** | 1: CR-wire | ✓ |
| FU | **Upright minimum width back** | 2: FU-upright h/v | ✓ |
| FU | **Arrows ignore `lz`** | 1: FU-arrows | ✓ |
| FU | **PDF Auto targets 1.5 mm** | 2: FU-pdf-min h/v | ✓ |
| FU | **Aisle override ignored** | 2: FU-aisle h/v | ✓ |
| FU | **Default doesn't remove the override** | 2: FU-aisle h/v | ✓ |
| FU | **Apply to all covers only the selection** | 3: FU-aisle h/v, FU-panel | ✓ |
| FU | **Save drops `labelSizeIn`** | 2: FU-aisle h/v | ✓ |
| FU | **Columns at 0.3 opacity** | 1: FU-columns | ✓ |
| FU | **Screen-constant column outline** | 1: FU-columns | ✓ |
| FU | **Columns drawn under racks in the PDF** | 2: FU-columns-top h/v | ✓ |
| FU | **Columns drawn under racks on the canvas** | 2: FU-columns-top h/v (and in the app: horizontal 12 of 24 columns hidden) | ✓ |
| PX | **Remove the 1 px floor** | 4: PX-out h/v, PX-whole h/v (in the app: outlines at 5 % and 20 % become 0 px) | ✓ |
| PX | **Floor 2 px** (thicker than 1) | 3: PX-out h/v, PX-whole | ✓ |
| PX | **No snapping** (fractional edges) | 2: PX-whole h/v | ✓ |
| PX | **Screen-constant outline again** | 4: PX-in h/v, PX-out h/v | ✓ |
| LZ | **Labels sized by the view zoom again** | 2: LZ-zoom h/v | ✓ |
| LZ | **X marks ignore Label size** (fixed stroke) | 2: LZ-all h/v | ✓ |
| LZ | **Aisle labels a fixed size** | 6: LZ-feet, LZ-all, LZ-pdf (h/v) | ✓ |
| LZ | **PDF drops cross-aisle labels** | 2: LZ-pdf h/v | ✓ |
| LZ | **PDF switch hides the red warnings too** | 2: LZ-pdf h/v | ✓ |
| LZ | **PDF ignores Label size** | 2: LZ-pdf h/v | ✓ |
| LB | **Three labels per long aisle** | 6: LB-aisle, LZ-feet, LZ-pdf (h/v) | ✓ |
| LB | **Cross-aisle width between section centres** | 2: LB-cross h/v | ✓ |
| LB | **Skip every other cross-aisle** | 2: LB-cross h/v | ✓ |
| LB | **Switch hides the red "under travel" marks** | 3: LB-toggle, LZ-pdf h/v | ✓ |
| LB | **Switch hides the X marks** | 1: LB-toggle-wire | ✓ |
| PF | **Cache pick zones by rack id only** (ignore content / neighbours) | 3: PF-cache ×3 | ✓ |
| PF | **Filter columns by the rack's footprint, not its pick zones** | 53: PF-matrix, PF-edits, PF-cache | ✓ |
| SC | **Bay change copied to other sections** (the old Apply way: the section's current bays planned, end-bay trims applied) | 2: SC-stays-mixed h/v | ✓ |
| SC | **No question when switching sections** | 8: SC-question, SC-dont, SC-stop, SC-place (h/v) | ✓ |
| SC | **Always copy waits** | 2: SC-always h/v | ✓ |
| SC | **Match bays from the FIRST bay-changed row, not the last** | 2: SC-match h/v | ✓ |
| LY | **Generate does not stamp layerIds** | 2: LY-assign h/v | ✓ |
| LY | **Rebuilt aisles copy their rack's layer** (the bug the app showed) | 4: LY-assign, LY-hidden (h/v) | ✓ |
| LY | **Generate leaves Building and Columns unlocked** | 4: LY-generate-locked, LY-undo (h/v) | ✓ |
| LY | **Locked layers still pickable** | 6: LY-generate-locked, LY-locked, LY-select (h/v) | ✓ |
| LY | **Hidden layers still snap targets** | 2: LY-locked h/v | ✓ |
| LY | **Locked layers not snap targets** (the rule before the change) | 2: LY-locked h/v | ✓ |
| LY | **Undo does not restore layers** (store) | 2: LY-undo h/v | ✓ |
| LY | **Hidden layers still drawn / printed** | 4: LY-locked, LY-hidden (h/v) | ✓ |
| LY | **Checks hidden still prints marks** | 2: LY-checks h/v | ✓ |
| LY | **Locking leaves the object selected** | 2: LY-select h/v | ✓ |
| LY | **Layers not saved with the layout** | 2: LY-save h/v | ✓ |
| HF | **Handle sizes back to 8 / 14 / 16** (7569d59's own) | 2: HF-handles h/v | ✓ |
| LC | **An aisle too narrow to drive not an error** (aisleLevel) | 6: LC-aisle, LC-click, LC-recheck (h/v) | ✓ |
| LC | **A can't-pick aisle filed under errors** | 2: LC-aisle h/v | ✓ |
| LC | **Overlaps not reported** | 4: LC-overlap, LC-pdf (h/v) | ✓ |
| LC | **Past the wall not reported** | 2: LC-outside h/v | ✓ |
| LC | **Column on an upright not reported** | 2: LC-upright h/v | ✓ |
| LC | **Unreachable rack not reported** | 2: LC-unreachable h/v (and LC-reuse) | ✓ |
| LC | **Columns blocking pallets not reported** | 2: LC-columns h/v | ✓ |
| LC | **Oversized bay not reported** | 2: LC-oversized h/v | ✓ |
| LC | **Angled rack not reported** | 2: LC-angled h/v | ✓ |
| LC | **Clicking an issue selects its racks again** | 2: LC-click h/v | ✓ |
| LC | **Zoom to the issue alone again** (no 20 ft, up to 400 %) | 2: LC-zoom h/v | ✓ |
| LC | **Blocked pallets shade whole bays again** | 4: LC-highlight, LC-xmarks (h/v) | ✓ |
| LC | **Re-check keeps the old result** | 2: LC-recheck h/v | ✓ |
| LC | **Export does not ask when there are errors** | 2: LC-pdf h/v | ✓ |
| EX | **Undo / redo leave the result up** | 2: EX-results h/v | ✓ |
| EX | **Match bays treated as pending work again** | 4: EX-match, CF-match (h/v) | ✓ |
| EX | **Live-flue drag centred on the base depth again** (the vertical creep) | 2: EX-flue h/v | ✓ |
| EX | **Preview keyed by id only** | 2: EX-preview h/v | ✓ |
| EX | **The question's edit not finished after the answer** | 2: EX-resume h/v | ✓ |
| EX | **Snap reach back to 30 px, no 1 ft cap** | 2: EX-snap h/v | ✓ |
| EX | **No confirmation without warnings** | 2: EX-results (h), EX-minor (v) | ✓ |
| EX | **Counts per action again (not net)** | 6: EX-match, EX-minor, SC-stays (h/v) | ✓ |
| EX | **Match bays counts rows that already matched** | 2: EX-minor h/v | ✓ |
| CF | **Bar shown whether or not anything would be copied** | 8: CF-manual, CF-match, SC-stays, SC-match (h/v) | ✓ |
| CF | **Select-all Delete asks again** (multi-section edits not skipped) | 2: CF-select-all h/v | ✓ |
| CF | **A cross-aisle blocks placement again** | 4: CF-cross-aisle, SC-place (h/v) | ✓ |
| CF | **Match bays result shown before its own action settles** (wiped at once) | 4: CF-match, SC-match (h/v) | ✓ |
| RL | **Default levels back to 1** | 6: RL-placed, RL-missing, RL-load (h/v) | ✓ |
| GU | **Generate not collapsed to one step** | 8: GU-undo, GU-first, GU-regenerate, GU-batched (h/v) | ✓ |
| HF | **A building drag re-checks the aisles every frame** | 4: HF-flicker, HF-multi (h/v) — also with the "not recomputed" checks removed, the red-set comparison alone fails in both orientations | ✓ |
| AR | **Skip the rebuild** | 6: AR-recreate/handcopy/undo (h and v, before the replay redesign) | ✓ |
| AR | **Keep aisles with a row between them** | 6 | ✓ |
| AR | **Never add aisles for new neighbour pairs** | 6 | ✓ |
| AR | **Keeper off** | 6 | ✓ |
| AR | **The copy-rows sync without its own rebuild** | 2: AR-snapshot h/v | ✓ |
| Z2 | **Split pieces counted as separate rows** | 2: Z2-delete h/v | ✓ |
| Z2 | **No wall clamp** | 8: Z-sync, Z-warn, Z-gap, Z2-delete (h and v) | ✓ |
| Z2 | **Sync section copies onto split pieces** | 2: Z2-delete h/v (stacked racks) | ✓ |
| Z2 | **"Sync section" button not rendered** | 3: Y-panel, Z2-buttons h/v | ✓ |
| Z2 | **"Sync all sections" button not rendered** | 3: Z-panel, Z2-buttons h/v | ✓ |
| Z2 | **Section = rows overlapping the selected rack only** | 2: Z2-delete h/v | ✓ |
| Y | **Sync only the first row** | 4: Y-sync h/v, Y-direction ×2 | ✓ |
| Y | **Start position not copied** | 4: Y-sync h/v, Y-direction ×2 | ✓ |
| Y | **Beams copied in local order** (no reversal for reversed rows) | 2: Y-direction | ✓ |
| Y | **Every row its own undo step** | 6: Y-sync, Y-warn, Y-direction (both orientations) | ✓ |
| Y | **Cross-aisle check off** | 2: Y-warn h/v | ✓ |
| Y | **Overlap / wall check off** | 2: Y-warn h/v | ✓ |
| Y | **Section = every row** (other sections synced too) | 5: Y-sync h/v, Y-warn h/v, Y-panel | ✓ |
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

- **Plan suite: 1,921 tests, 1,921 passing** (after all breaks reverted; M_matrix rule 9 limit raised to 60 s — M13 1200×600 runs 25–31 s under load).
- **Whole project: 2,318 tests, 2,318 passing.**
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
