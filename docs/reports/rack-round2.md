# rack-round2 — face aisles, rack numbers and letters, moving, zones over racks, text drag, usable, aisle chips

Branch `rack-round2`, from master (1cd4ccb). Status: see the last line.

## 1. Face aisle check for every rack type — done
- **The check** (`generate/laneFaces.js`, new). Every face of a non-beam rack needs a clear aisle in front of it:
  - **Drive-in:** its ENTRY end.
  - **Drive-through:** both ENTRY ends.
  - **Push-back:** its LOAD · PICK face.
  - **Pallet flow:** LOAD and PICK.
  - **Cantilever:** the arm side; both sides when it is double-sided.
  - **Shelving:** its pick side, against the app's walkway minimum (Rules › zones, walkwayIn, 44″). The pick side is the
    side not backed by a wall or a rack within 2′, as for a single selective. Open on both sides, it is not checked.
- **The minimum** is the one beam faces use (`aisleLevel`): under the travel width is red, under the aisle is amber.
- **What blocks a face:** a wall, a column, another rack (never a mezzanine), a zone, or a door's clear space, anywhere
  in front of the face over its length. The lane sides and the back may touch anything.
- **When it is short:**
  - red on the face, and the aisle chip in the beam aisles' style;
  - live while dragging (from the drag preview) and after the drop, and in the PDF;
  - Check layout lists "T1: ENTRY face has 0″ in front (the wall) — needs 11′".
- **The brief's example:** a drive-through with its top ENTRY against the wall shows red, with a 0″ chip.
- **New fixture** `src/__test__/plan/handCheck/lanes-horizontal.wcad`: a drive-through against the north wall, and a
  drive-in placed where its ENTRY faces clear floor. Its reds:
  - T1's top: red (0″, the wall);
  - T1's bottom: clear;
  - D1's ENTRY: clear;
  - 0 positions lost: with one end open, a drive-through still works.

## 2. Rack number position — done
- **Order of spots** for a non-beam rack's number (`canvas2/RackLineLabels.jsx` `otherLabelPlaces`):
  1. beside the start end, centred, sliding along it, as a beam rack's;
  2. the other end;
  3. above;
  4. below.

  Each spot keeps the beam labels' gap from the rack.
- **A spot is refused** if it touches a wall band, a column, a rack, a zone or another label; each is given a margin.
  Spots inside the building come before outside.
- **Beam rack labels are placed exactly as before:** they are placed first, by the same code.
- **Found, not changed:** a rack dropped in a cross-aisle splits the beam line across that gap into two lines
  (`utils/rackLines.js acrossGap`, already so on master). The beam numbers then shift. See question 2.

## 3. Letters per rack type — done
- Selective, back-to-back and double-deep keep R.
- The other letters: drive-in D, drive-through T, push-back P, pallet flow F, cantilever C, shelving S, mezzanine M (the
  mezzanine is numbered now).
- Each letter has its own sequence (D1, D2 …) in the same order, with no gaps. They renumber on delete and duplicate,
  and Ctrl+Z restores them.
- The section mode counts each letter per section.
- The R numbers and the BOM are identical before and after (Rule 7). None of these types pairs, so a combined label
  stays the back-to-back pair's (R2–R3).

## 4. Moving a placed rack — done
- **Where the ghost was.** Nothing in a plain move uses the placement ghost (only the library, paste and Split do).
  What a moving rack left behind was its own marks and labels. During a drag those are drawn from the layout as it stood
  when the drag began (drag-perf-bar), so they stayed at the old place:
  - its number;
  - its X marks;
  - its column flags and oversized-bay marks;
  - the aisle widths beside it.
- **Now** the drag shows nothing of the moving rack at its old place. Those items wait for the drop and are measured
  again there. The moving rack's number is hidden for the drag too.
  - The number first rode the drag, but that redrew the whole numbers layer every frame (25 ms a frame on the big
    layout), so it waits for the drop instead.
  - The face widths (FaceAisleLabels) also wait for the drop.
- **Overlap while dragging:** a red outline (2 px) on both racks only, and on any rack a zone being moved covers.
- **After the drop:** an X (1.5 px) inside each covered pallet slot, inset by its stroke, never bigger than the slot.
  The old marks were grown to a 6 px minimum and drawn 2 px wide.
- **Drag smoothness** (the 50,000-position layout, CPU slowed 4×, dev build, three runs each; frame times in ms):

  | Drag | Before: mean · p95 · frames over 16.7 ms | After: mean · p95 · frames over 16.7 ms |
  |---|---|---|
  | One selective (10 bays) | 16.7 / 16.7 / 15.1 · 26.8 / 26.7 / 26.7 · 30 / 30 / 13 of ~178 | 18.6 / 18.2 / 17.3 · 26.8 / 26.7 / 26.7 · 50 / 53 / 43 of ~186 |
  | One back-to-back pair | 18.5 / 17.2 / 16.9 · 26.9 / 26.8 / 26.8 · 55 / 41 / 34 of ~190 | 17.7 / 17.8 / 16.9 · 26.8 / 27.5 / 26.7 · 51 / 46 / 39 of ~190 |

  - The p95 is unchanged, and the pair drag is unchanged.
  - The single-rack drag is about 1.5 ms slower on average. The remaining cost is the new overlap and face check on the
    previewed layout, which is needed for the live red.
  - The first version measured 43 ms mean, 130 ms p95, because every rack was checked against every other per frame.
    It now checks only the moving racks' pairs.

## 5. Zone over racking — done
- **While placing, dragging or resizing a zone,** the racks it covers only show red: an outline on them. Nothing is
  removed.
  - The keeper (`utils/rackingAreaTool.js`) no longer lands a zone change on its own.
  - A change that removes nothing and only brings bays back (a zone moved off racks it cut in an older file) is still
    landed at once, as before.
- **After the drop,** if racks are covered, the zone's selection bar shows "Covers R2, R3" (the names as drawn) with two
  buttons. There is no browser dialog.
  - **Remove racks:** the covered bays go, by the same cut as before (`zoneCut.js applyZones`). That means a pair's
    covered half, or a whole rack it covers. Only this zone is applied, with one undo.
  - **Keep:** the racks stay, red, and their covered positions come off usable. The bar stops asking until the zone is
    moved or resized.
- **Moving the zone away** clears the red. Nothing is ever removed without the button.
- The resize preview of "bays removed" is gone, because nothing is removed on release.
- **Tests of the cut itself** (RA, ZR, ZX, ZP, ZF: 75 tests) now install the keeper with `{ autoCut: true }`, the old
  landing. They test the same cut Remove racks applies, so none was deleted. The app's default is the new flow, covered
  by REG-r2-zone.

## 6. Text drag — done (it was not a drag bug)
- **What it was.** A text dragged from inside its own box follows the mouse exactly in every direction, with snap
  (Alt off) and one undo.
  - The report in rack-fixes came from my test: it pressed just outside the text's box, on its bottom-right resize
    handle, so the "drag" was a resize.
  - A resize anchors the top-left corner and moves the baseline down, which looked like "only down, less than the
    mouse".
  - Nothing in the app was changed for it, and the item is off the Polish list.
- **The kinds checked:**
  - **Free text:** drags exactly.
  - **A zone dragged by its name:** moves exactly as far.
  - **A section by its name:** moves the section, as REG-section tests already cover.
  - **A column bubble:** moves its gridline, as REG-col-bubbles already covers.
  - **Not dragged on their own:** row numbers (drawn from the racks), door badges (a door moves along its wall only)
    and dimension text (the Dimension tool is not built yet, D2). These are n/a.

## 7. Usable count — done
- **What now comes off usable** (`generate/coverLost.js`), for every rack type, with the beam racks' rule:
  - positions covered by a zone (Keep);
  - positions covered by an overlap with a non-beam rack. Two beam racks overlapping are counted by the narrow-aisle
    check, as before;
  - positions behind a short face:
    - a drive-in, push-back or shelving unit loses all of them;
    - a pallet flow loses all of them, since it loads at one face and picks at the other;
    - a drive-through loses them only when both ends are short;
    - a cantilever loses the short side's arms.
- **Where it shows:** the card's totals and the rack's own "N usable" badge.
  - Lost To files these under Zone, Narrow aisle (a face) or Other (an overlap).
  - The BOM is unchanged.

## 8. Aisle chip position — done
- **Where a chip goes** (`render/labelOps.js aisleLabelOps`, given what to keep off):
  1. centred between the arrow ends when it fits;
  2. else just past one end of the aisle, on the side with free space: past either arrow end on a short leader, or
     beyond either end of the aisle along its run, in line with it or just beside it.

  The arrows always span the full aisle.
- **A spot is refused** if it is on a rack, a column, a wall band, a zone or another chip.
- **It applies to** the rack-to-rack aisles (off their two rows and the columns), the face widths, and the new face
  chips (both off every rack, column, wall and zone). If no spot is free, the chip stays where it always went, and the
  Rule 8 cover rule hides it.
- **Rule 7:** on the demo file and the four fixtures **no chip moved**: 13 chips each, every one at the same pixel
  before and after. The only new chips are on the new fixture: T1's 0″ chip, just past the end of its face, inside the
  wall.

## Rule 7 (relaxed): before = master 1cd4ccb, after = rack-round2
| Layout | Racks | Card, BOM, picks, save→load, PDF, Regenerate | R labels | Aisle chips (moved) | Face reds | Overlap reds |
|---|---|---|---|---|---|---|
| demo-warehouse.wcad | 15 beam | identical | identical | 13 (0) | 0 | 0 |
| older-horizontal | 12 beam | identical | identical | 13 (0) | 0 | 0 |
| older-vertical | 14 beam | identical | identical | 13 (0) | 0 | 0 |
| crowded-horizontal | 12 beam | identical | identical | 13 (0) | 0 | 0 |
| crowded-vertical | 14 beam | identical | identical | 13 (0) | 0 | 0 |
| lanes-horizontal (new) | drive-through + drive-in | usable 80 of 80 (one end of T1 still open) | R → T1, D1 | 1 → 2 (+ T1's 0″) | 1 (T1 top) | 0 |

As expected, nothing changed on the beam-only layouts.

## Screenshots (`docs/reports/rack-round2/`, before- and after-)
| Shot | What changes |
|---|---|
| `scene-15` | The whole scene at 15 %: letters D/T/F/C/S/M, face reds, the zone and overlap marks |
| `scene-30-scene` | A drive-in over a selective (X inside the covered slots), an office over a selective (covered slot X, no bays removed), a cantilever between a drive-in and a shelving unit (both faces short: red and the 7′ / 6′ 8″ chips), a pallet flow F1 |
| `scene-30-wall` | T1 against the wall: red ENTRY, its 0″ chip just past the face's end |

## Tests (new, real clicks)
- **REG-r2-face-aisle** (item 1):
  - on the lanes fixture: T1's red and chip, and Check layout's item;
  - the drive-in dragged near T1: red while dragging and after;
  - one undo.
- **REG-r2-number-spot** (item 2): at 10, 30 and 100 %, D/F numbers touch no wall, column, rack, zone or label; beam
  labels unchanged.
- **REG-r2-letters** (item 3): T1, D1, then F1, C1 and D2 from the library; Delete closes them up; Ctrl+Z restores; no
  BOM line.
- **REG-r2-move** (item 4):
  - one drawing of the moving rack;
  - its number not at its old place;
  - two outlines while dragging, with no X;
  - after the drop, 1.5 px X marks inside the slots.
- **REG-r2-zone** (item 5): drag over, nothing removed, red, "Covers R1"; Keep (usable drops); dragged off (no red);
  back over it; Remove racks; one undo.
- **REG-basics-text-drag** (item 6, in REG-basics): a text up, down, left and right lands exactly, with one undo each;
  a zone by its name.
- **REG-r2-usable** (item 7): the card's usable drops after a drive-in is dragged onto a selective; positions and the
  BOM unchanged; one undo.
- **REG-r2-chips** (item 8): at 15, 30 and 100 %, no chip over a chip, a number or (face chips) a rack, on a fixture and
  on the lanes fixture; T1's chip is past its face's end.
- **Updated:**
  - REG-rack-numbers-all (letters; the mezzanine is M1);
  - ZF-face-zone (the zone's cover loss added);
  - O-wire (filtered lists built before the JSX);
  - the 75 cut tests (`autoCut`).

## Questions for PP
1. **Shelving's pick side:** is "the side not backed by a wall or rack within 2′" right? A shelving unit open on both
   sides is not checked.
2. **A rack in a cross-aisle splits the beam line across it** (rackLines.js, already so on master), so its beam numbers
   change. Should a non-beam rack in a cross-aisle leave the beam line whole?
3. **Drive-through usable:** with one end short, it keeps its positions (it works as a drive-in). Agreed?
4. **Remove racks on a non-beam rack:** the cut is today's zone cut (zoneCut.js cutRack). It treats a non-beam rack as
   one bay, so a drive-in the zone touches at all is removed whole, even when only one lane is covered. Should it lose
   only the covered lanes instead?

## Hand-check
See docs/MORNING.md (one list for items 1–8).

Status: **done**. Full suite: **4558 / 4558**.
