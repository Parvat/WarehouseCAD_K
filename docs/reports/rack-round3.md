# rack-round3: PP's answers, short-face marks, numbers by the wall, shelving sizes

Branch `rack-round3`, from `rack-round2` (a703179), **not** from master. Master (1cd4ccb) does not have rack-round2, and
items 2–5 build on it (the face check, Remove racks, the number placement). Merging rack-round3 merges rack-round2 too.

Full suite: **4,589 / 4,589**. A late change made during the run (the shelving both-sides rule, below) was re-checked
after it, with:
- every non-browser test: 3,495 / 3,495;
- the rack REG tests: 62 / 62.

## PP's answers, recorded in RESUME.md and FEATURES.md

**Shelving pick side:** a side not backed by a wall or rack within 2 ft; if both sides are open, both are checked.

- **Correction:** rack-round2 did *not* check a unit open on both sides. Its report said "Open on both sides, it is not
  checked." I took PP's stated rule as the intent and built it:
  - both open sides are now checked;
  - with one side short, the unit is still picked from the other side, so it loses no positions;
  - Check layout warns "… picked from the other side only";
  - with both sides short, it loses all its positions.
- **Impact:** none of the fixtures has such a unit, so Rule 7 is unchanged.

## 1. Non-beam rack in a cross-aisle: done
- **Change:** in `utils/rackLines.js` `acrossGap`, only a beam rack standing in the gap splits the line. Before, any
  rack did.
- **Beam racks:** a beam rack in a cross-aisle still splits the line. A unit test covers this.
- **Fixture:** `crossaisle-drivein.wcad`, a drive-in in a cross-aisle of older-horizontal.
  - Before: R1–R13, the line split by the drive-in.
  - After: R1–R11 plus D1, identical to older-horizontal without the drive-in.
  - The BOM's total line goes from "R1–R13 · 13 lines" to "R1–R11 · 11 lines". Quantities are unchanged.

## 2. Drive-through with one short end: done
- It keeps its positions (unchanged).
- Check layout now says "… ENTRY face has 0″ in front (the wall) — needs 10′ 6″; works as drive-in only".
- It is a warning now, not an error, because nothing is lost.

## 3. Remove racks on lane racks: done
- **Behaviour:**
  - On a drive-in, drive-through, push-back or pallet flow, Remove racks takes only the covered lanes.
  - Each run of lanes left stays a rack, with the same lane width, depth, uprights and turn, exactly where those lanes
    stood. The first run keeps the id.
  - When no lane is left, the rack goes.
  - It is one undo.
  - The note reads "· 1 lane removed".
- **Code:** `utils/zoneCut.js` `cutLanes`.
- **Before:** on this fixture, Remove racks changed nothing on the drive-in.
- **Fixture:** `zone-lane.wcad`, a zone over the last lane of a 4-lane drive-in.
  - After Remove racks: 3 lanes, same left edge and lane width.
  - Ctrl+Z gives 4 lanes back.

## 4. Short face: no red line: done
- **On the plan:** the red line on a short face is gone, and the face bar stays in its family colour.
- **Lost positions:** each one gets the overlap's red X, 1.5 px, inside its slot (`generate/coverLost.js`
  `faceLostMarks`). A shelving unit's units count as its slots.
- **The chip:** the short face's chip is red.
- **A face that loses nothing** (the drive-through with one end open): the red chip alone, no X marks.
- **PDF:** the same.
- **Fixtures:**
  - zone-lane: 15 X marks (the zone's lane has its own 5);
  - lanes-horizontal: 0 X marks, the T1 chip red.

## 5. Rack number by the wall: done
- **Rule:** a non-beam rack's start end, other end or side within 2 ft of a wall's inner face puts its number outside
  the building, just past that wall, centred on the rack.
  - If that spot is taken, it slides along the wall, then steps a half line further out, still clear.
  - Otherwise the number stays inside, using round 2's order.
- **Also kept clear of:** a lane rack's face words (ENTRY, LOAD, PICK). T1's number used to sit on its ENTRY word.
- **Beam labels:** do not move.
- **Fixture:** `walls-racks.wcad`. D1 is outside the north wall, P1 south, S1 west and C1 east; all four were inside
  before.
- **Also on lanes-horizontal:** T1 (its ENTRY on the north wall) moves outside the wall.

## 6. Shelving sizes and shelf count: done
- **Drawing:** no shelf count is drawn inside the units.
- **Label:** "S1 · 4 units · 48×24 · 5 shelves". It shows:
  - on the selected unit's label on the plan, under the unit;
  - in the card's head;
  - on the PDF, under each unit.
- **Card fields:**
  - Units;
  - Shelves;
  - Unit width (36 · 42 · 48 · Custom);
  - Depth (12 · 18 · 24 · Custom).

  The size lists use the app's attached size list, with a Custom row that empties the field to type any size. A size
  that is not standard is marked "Custom". Each change is one undo.
- **New units** from the library: 2 × 48 in, 24 in deep. Before: one 8′ 6″ run drawn as two 51″ units.
- **Saved units:** keep their size exactly. A 10′ run with no unit width loads at 10′ and shows "3 units · 40×24",
  split exactly as it was always drawn, marked Custom.
- **New saved field:** `unitWidthIn`, only once a width is picked.

## Rule 7 (relaxed)

| Case | Positions / usable / lost | Beam bays | Beam lines | Number labels | Short-face line → X marks | Generate | Save/load |
|---|---|---|---|---|---|---|---|
| demo | 2,038 / 1,922 / 116 → same | 175 → 175 | same | 22 → 22, same places | 0 → 0 | same | same |
| older-horizontal | 2,392 / 2,164 / 228 → same | 191 → 191 | same | 11 → 11, same | 0 → 0 | same | same |
| older-vertical | 2,600 / 2,392 / 208 → same | 182 → 182 | same | 14 → 14, same | 0 → 0 | same | same |
| crowded-horizontal | 2,392 / 2,164 / 228 → same | 191 → 191 | same | 11 → 11, same | 0 → 0 | same | same |
| crowded-vertical | 2,600 / 2,216 / 384 → same | 182 → 182 | same | 14 → 14, same | 0 → 0 | same | same |
| lanes-horizontal | 80 / 80 / 0 → same | — | — | T1 moves outside the north wall | 1 line → 0 X (chip red) | same | same |
| crossaisle-drivein (new) | 2,400 / 2,172 / 228 → same | 191 → 191 | **R1–R13 → R1–R11** | 14 → 12 | 0 → 0 | same | same |
| zone-lane (new) | 80 / 0 / 80 → same | — | — | same | 1 line → 15 X | same | same |
| zone-lane, Remove racks | — | — | — | — | — | 4 lanes → **3 lanes** (before: 4, unchanged) | — |
| walls-racks (new) | 80 / 80 / 0 → same | — | — | **4 inside → 4 outside** | 0 → 0 | same | same |

The walls-racks PDF prints 3 fewer texts: 4 shelf counts gone, 1 size label added. Nothing else changes in any count,
bay or beam label.

## Tests
- **Unit:** `src/__test__/plan/R3_rackRound3.test.js`, 21 tests covering items 1, 2, 3, 4 and 6 plus the shelving
  both-sides rule. Item 5 needs Konva, so its REG test covers it.
- **REG (real clicks), all new:**
  - REG-r3-cross-aisle;
  - REG-r3-drive-in-only;
  - REG-r3-lanes;
  - REG-r3-face-x;
  - REG-r3-wall-numbers;
  - REG-r3-shelving.
- **Updated** (the rules changed; nothing deleted):
  - REG-r2-face-aisle: no line, red chip, a warning not an error;
  - rackOpsDeck's shelving test: no shelf count.

## Screenshots: `docs/reports/rack-round3/`
`before-*` is rack-round2 (a703179); `after-*` is this branch, at 15 % and 30 % (walls at 10 % and 15 %, plus a fit):
- `cross-*`: the drive-in in the cross-aisle (before: the line split around it).
- `dt-*`: the drive-through at the wall (before: red line; after: red chip, number outside past ENTRY).
- `lanex-*`: the 4-lane drive-in behind the zone (before: red line; after: X marks, red chip).
- `lane-before` / `lane-after`: Remove racks (before: nothing removed; after: 3 lanes).
- `walls-*`: the numbers by the four walls (before: inside; after: outside).
- `shelving-*`: the shelving unit selected (before: shelf counts, Width/Depth ft; after: label, unit fields).

## Questions for PP
1. **Shelving open on both sides with one side short:** should it keep all its positions (built), or lose half?
2. **New shelving size:** it places 2 units of 48″. Is 2 the right default count?
3. **A drive-through with one end short** is now a warning, not an error. Agreed?
