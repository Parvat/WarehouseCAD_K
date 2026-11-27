# lane-fixes: PP's answers to the holiday run, and pdf-parity

Branch `lane-fixes`, from master 7405881 (holiday-run merged). Full suite: **4,671 / 4,671**.
- The last full run: 4,666 passed. One Chromium page crashed ("Target crashed", the worker exited), and the 5 tests in that
  worker failed with it.
- Those 5 (REG-r2-letters, REG-r2-chips, REG-r3-shelving, REG-lane-fixes-pushback-first) pass rerun by name on both fixtures.

PP's ten answers (2026-11-27) are recorded in docs/RESUME.md, FEATURES.md and EPICS.md.

## 0. Lane BOMs off for now: done
PP: each dealer's setup differs, so the details are needed first.

- **Off:** drive-in, drive-through and pallet flow have no section in the BOM tab, the CSV, the xlsx or the Tally.
  - They are listed under "N racks of another kind not in this BOM", as before the holiday run.
  - Their numbers, positions, usable counts, card and drawing are unchanged.
- **The setting:** one switch, `LANE_BOMS_PENDING_ON = false` in `src/racks/laneBom.js`.
  - The formulas are kept and still tested.
  - LF_laneFixes checks that the switch stays off, and that turning it on brings the three sections back.
- **Push-back** keeps its BOM.
- **EPICS.md:** lane rack BOMs need dealer details (part names, frame spacing, ties, guides, brakes) before they are switched on.

## 1, 2, 3. Push-back: done
- **Beams** = lanes × levels × frame lines (the pallet-flow rule). The old 2 × lanes × levels was short from 4 deep on.
- **Anchors:** 2 per post.
  - A post is one upright leg at the floor: one at each post line on each frame line, so P × F posts.
  - The line is named "Anchor" with no size, as the beam racks' anchor line is.
- **First level:**
  - A new push-back's first beam is at 8 in, with rails on it, so the bottom level is push-back too.
  - A saved rack keeps its value. One saved before the engine reads 0, as before.
  - Every level is counted: beams, rail sets and carts.

**Push-back formulas** (L lanes, D deep, V levels, P = L + 1 post lines, S the depth station, F frame lines = 2 up to
3 deep and 3 from 4 deep):

| Part | Qty | Size |
|---|---|---|
| Upright frame | P × F | overall height × D × S |
| Beam | **L × V × F** (was 2 × L × V) | lane width |
| Rail set | L × V | D deep |
| Cart | (D − 1) × L × V | — |
| Entry guide | 2 × L | — |
| **Anchor** (new) | **2 × P × F** | — |

**Example:** 3 lanes × 4 deep × 3 levels (a new rack, first beam 8 in) gives:
- Upright frame 15 ft 8 in × 17 ft 4 in × 12
- Beam 46 in × 27 (was 18)
- Rail set × 9
- Cart × 27
- Entry guide × 6
- Anchor × 24

## 4. xlsx and Tally: done
The push-back section shows in each of these as the BOM tab and the CSV show it: under the beam racks' table, its name and
letter lines, then Part · Size · P1 · P2 … · Total.
- the Tally drawer (By row and Summary)
- its Pop out
- the xlsx (a blank row, then the section)

The beam sections are unchanged: the same rows, widths, merges and bold rows (tested).

With only push-back racks in a layout, the Tally, xlsx and CSV buttons are now enabled. They used to stay greyed when
there were no beam lines.

## 5. Shelving usable: done, in units
**Reading taken:** shelving holds no pallet positions; its capacity is null, so it was never in positions or usable.

- A unit with a red X comes off the shelving run's usable **units**: covered by a zone or a rack, or lost to a short pick
  face (both sides short, for a run picked from both).
- The shelving card shows it, for example "2 of 3 units usable · 1 lost" (`utils/shelving.js` shelvingUsable). It counts
  the same X marks the plan and the PDF draw, with the plan's truck.
- The layout's positions and usable are unchanged. Turning shelving units into pallet positions would change every count:
  see question 1.

## 6. Beam numbers at a wall: done
A beam rack number that straddles a wall line goes just outside the wall, centred on the row.
- **The rule:** the same as the other rack types at a wall: past the outer face by max(gap, wall + 2 margins + 1), half a
  line further if that spot is taken (`canvas2/beamOffWalls.js`).
- **Not at a wall:** the number does not move.
- **Counts and the BOM:** unchanged.

**Every beam label that moves** (drawing units; gs 40, so 40 = 1 ft):

| File | Labels | Moved |
|---|---|---|
| demo | 22 | **R1–R11** (the west wall's 11): 60 left, from straddling the wall to just outside it. **R6** also goes 75 up: it had been slid off a wall column (text-and-overlap), and outside the wall it is centred on its row again |
| older-horizontal | 11 | none |
| older-vertical | 14 | none |
| crowded-horizontal | 11 | none |
| crowded-vertical | 14 | none |
| lanes-horizontal, walls-racks, crossaisle-drivein, zone-lane | 2 / 4 / 12 / 1 | none |

**Screenshots** (`lane-fixes/`), the demo's north-west corner at 100 %:
- `beam-wall-before-top.png`: R1 on the wall.
- `beam-wall-after-top.png`: R1 just outside it.

## 7. Pallet-flow pitch: done (already so; now tested)
The pitch is on the card only, never on the plan or the PDF. REG-lane-fixes-pitch reads the card ("Pitch about 0.375
in per ft"), every text on the plan and the PDF sheet.

## 8. pdf-parity: done
**How it was checked:**
- Every library item was placed by real clicks in an empty building: 37 objects; Carton flow is a disabled row; the
  Column grid is on every fixture.
- Each object was shot on screen and in the PDF over the same world box, at the print-equivalent zoom: 1 screen px =
  0.25 mm on paper, the app's own rule for drawn shapes.
- The texts were compared on the demo and 11 fixtures.

**Found and fixed:**
1. **The PDF printed no rack numbers.** R1…, R2–R3, D1, P1, S1 … were on the plan but not on the sheet, although
   STUDIO.md says the PDF follows the numbering.
   - The placement moved, unchanged, from RackLineLabels.jsx into the pure `canvas2/rowLabelPlace.js`. The PDF prints the
     same places, at their real height.
   - They are plain in the rack numbers' colour, or chips in Per section.
   - The Racking layer and the View card's Row numbers switch govern them, as on the plan.
   - The column grid's chain and bubbles step out past them, as on the plan.
   - A hidden layer still prints exactly as the layout without its objects (LY-hidden).
2. **Line weights were about a third of the screen's.**
   - The canvas draws these in screen pixels: rack edges, hairlines and slot dashes, equipment / safety / structural boxes,
     zone edges and the red X marks.
   - The PDF wrote those numbers as world units, so a 1.25 px rack edge printed about 0.1 mm wide.
   - They now print at 0.25 mm a px, as drawn shapes already did. Dashes scale with them.
   - Real-size items keep their real size: uprights, travel arrows, words, label pills and column clearances.

**Checked and the same:**
- **Colours:** every family colour; the X red #C0392B.
- **Labels:** aisle chips, the column chain and bubbles, the door chain and badges, the building size, face words (ENTRY /
  LOAD / PICK), MEZZANINE.
- **Section outlines:** already in paper mm.

**Left as is:**
- **Shelving size label:** "S1 · 4 units · 48×24 · 5 shelves" prints always. On screen it shows with the selection.
  rack-round3 6 chose that on purpose.
- **Door's clear space:** dashed on screen, never on the PDF. STUDIO.md says so.
- **Tally ticks:** these are a working mark and are not printed.
- **A door placed in the open floor** (not on a wall) draws differently on screen and on paper. Doors snap to walls, and
  this case came only from the test placement.

**Screenshots** (`lane-fixes/pdf-parity/`, screen left · PDF right, doubled):
- `<type>-before.png` / `<type>-after.png` for: selective, drive-in, push-back, pallet flow, cantilever, shelving,
  mezzanine, forklift, bollard and washroom.
- `demo-sheet-before.png` / `demo-sheet-after.png`: the demo's PDF sheet, north-west corner. After: R1–R3 outside the wall,
  the full line weights.

## 9. Polish list: see the end of this report

## Rule 7 (lane-fixes compared with master 7405881)
Positions / usable / lost; bays; beam lines (numbers and pieces); Generate; save and reload; the red overlap and face X marks:

| Case | Positions / usable / lost | Bays | Beam lines, beam BOM lines, Generate, save/load, X marks | Expected changes |
|---|---|---|---|---|
| demo | 2,038 / 1,922 / 116, same | 175 | identical | R1–R11 outside the west wall (6) |
| older-horizontal | 2,392 / 2,164 / 228, same | 191 | identical | none |
| older-vertical | 2,600 / 2,392 / 208, same | 182 | identical | none |
| crowded-horizontal | 2,392 / 2,164 / 228, same | 191 | identical | none |
| crowded-vertical | 2,600 / 2,216 / 384, same | 182 | identical | none |
| lanes-horizontal | 80 / 80 / 0, same | — | identical | BOM: drive-in and drive-through sections gone, "2 racks … not in this BOM" (0) |
| crossaisle-drivein | 2,400 / 2,172 / 228, same | 191 | identical; beam BOM identical | BOM: drive-in section gone, flagged (0) |
| zone-lane | 80 / 0 / 80, same | — | identical | BOM: drive-in section gone, flagged (0) |
| walls-racks | 80 / 80 / 0, same | — | identical | BOM: drive-in gone, flagged (0); push-back Beam 16 → 24 (1), Anchor 18 (2) |
| lane-drive | 160 / 160 / 0, same | — | identical | BOM: both sections gone, flagged (0) |
| lane-push | 72 / 72 / 0, same | — | identical | BOM: Beam 36 → 54 (1), Anchor 48 (2) |
| lane-flow | 72 / 72 / 0, same | — | identical | BOM: section gone, flagged (0) |

The PDF sheets also gain the rack numbers and the full line weights (8).

## Tests
- **LF_laneFixes (17):**
  - the setting off and its three types;
  - no lane section in the BOM, CSV or xlsx;
  - the formulas kept behind the switch;
  - push-back keeps its section;
  - beams and anchors for 2 to 6 deep;
  - the anchor line's name;
  - first beam 8 in (new) and saved values kept;
  - the xlsx push-back section, with the beam table unchanged;
  - shelving usable units, the face X marks counted too;
  - beamOffWalls;
  - the PDF's rack numbers at the plan's places;
  - screen-px strokes at 0.25 mm a px.
- **REG (real clicks):**
  - REG-lane-fixes-bom: the BOM tab and the CSV on lane-drive and crossaisle-drivein; push-back beams and anchors; the
    Tally drawer By row and Summary; the Pop out and its downloaded xlsx.
  - REG-lane-fixes-pushback-first.
  - REG-lane-fixes-shelving.
  - REG-lane-fixes-wall-numbers: no rack number touches a wall on the demo and the 4 fixtures.
  - REG-lane-fixes-pitch.
  - REG-lane-fixes-pdf-parity: the printed numbers equal the plan's, at the same place; the Row numbers switch by a real
    click; the rack-edge weight.
- **Expectations updated (tests kept):**
  - REG-r3-drive-in and REG-r5-pallet-flow: no section, flagged.
  - REG-r4-push-back: first beam 8; Anchor.
  - LN_laneEngine: drive-in / flow sections behind the switch; push-back beams, anchors and first beam.
  - PX-pdf, RD-pdf and FU-columns-top: the PDF's stroke widths and dashes at 0.25 mm a px.

## Screenshots (`lane-fixes/`)
- `bom-drive-in-off.png`: lane-drive's BOM tab — no sections, "2 racks of another kind not in this BOM".
- `bom-push-back.png`, `tally-push-back.png`: lane-push — Beam 54, Anchor 48; the Tally drawer's push-back table.
- `shelving-usable.png`: a zone over one unit — one X, "2 of 3 units usable · 1 lost".
- `beam-wall-*.png` (item 6) and `pdf-parity/` (item 8).

## Questions for PP
1. **Shelving usable:** it is shown in units on the shelving card ("2 of 3 units usable"). Should shelving units also count
   in the layout's positions and usable, which today are pallet positions only?
2. **Push-back anchors:** 2 per post, taking a post as each upright leg on each frame line (P × F posts). Is that the
   dealer's count, or are anchors per frame (2 legs a frame)?
3. **A saved push-back with its first beam at 0:** it keeps 0, and its bottom level is still counted with beams, rail sets
   and carts (as before). Should a rack at 0 drop the floor level's beams, rails and carts?

## 9. Polish list: nothing safe left
- **Text card swatches** (dark colours invisible): already done in `studio/Swatch.jsx`. A very dark colour is ringed in the
  colours popover, and the card swatch has a border. The entry is struck through in RESUME.md.
- **Not look-only, so left for PP:**
  - the Draw rail icon needs a design icon (never hand-drawn);
  - the polyline corner squares over the box handles would change which drag wins;
  - the selection bar covering a shape would change where a click lands.
