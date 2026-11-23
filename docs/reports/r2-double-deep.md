# r2-double-deep — the Double-deep Rack

Branch `r2-double-deep`, from master (87fcc55). Status: **ready**. Full suite on its own: **4457/4457 green**.
`constants/warehouseObjects.js`: one new entry only, as approved.

## What changed
- **The library.** The Racking flyout has a **Double-deep Rack**. It places a selective rack (`rack_row`) carrying
  `deep: 2` and `deepGapIn: 6`, so it is 42″ + 6″ + 42″ = 7′-6″ across, 3 bays. It is placed by hand only: Fill and
  Generate never make one.
- **The card.**
  - The caption is **Double-deep**.
  - Under Bays, Beam, Depth and Upright: **Levels** (its elevation's), **Number deep** (2 to 6), **Deep spacing (in)**
    (6) and **Back-to-back**.
  - Each change is one undo step, and the rack resizes across about its centre.
  - Back-to-back on turns it into a back-to-back pair (`rack_double_row`) of two double-deep faces across its flue:
    2 + 2 = **4 deep**.
- **The plan:** in each bay, between its uprights, a dashed line across the middle of each deep spacing, between the
  front and rear pallet positions, on each face. The PDF prints the same line.
- **Counts:** every pallet deep counts.
  - Positions: capacity, the bay ledger, the Tally and the summary.
  - BOM, per deep frame line: beams, safety pins, wire decks, upright frames and anchors.
  - Row spacers tie the deep frames together: "6 in deep spacing", 1 per frame up to the spacer height and 2 above.
- **Check:** a double-deep rack whose equipment (its section's, else the project's forklift) is not a deep-reach truck
  gets a warning: "Rack R1: 2 deep — needs a deep-reach truck (its equipment is Reach truck)".
- **A new forklift, Deep reach truck,** with the reach truck's aisle (10′-6″) and travel. It is in the forklift list
  everywhere (Project settings, section Equipment), so the warning can be cleared.
- **The rename asked for:** a back-to-back pair's card title is now **Back-to-back** (was Double deep).
- **A fix found on the way:** the bay ledger's cache key now includes `deep` and `deepGapIn`. Without it, changing
  Number deep kept the old position count.

## Decisions made
- **Double-deep is a property of the beam racks** (`deep`, `deepGapIn`), not a new rack type. Bays, beams, elevations,
  the Tally, the BOM, Row group and the selection bar already handle `rack_row` and `rack_double_row`, about 115 places
  in 55 files. A new type would have needed every one of them taught. The library entry, the card caption and the
  counts are what make it a Double-deep Rack.
- **Levels** come from the rack's elevation, as on every beam rack. The card shows them; they are set on the
  Elevations tab, as before.
- **Wire decks** are counted per deep line at the single frame depth (42″), the same deck as a selective bay.
- **Deep reach truck** was added because the warning needs one to exist. Its aisle, minimum aisle and travel are the
  reach truck's.

## Rule 7
No layout rule changed. Fill and Generate never set `deep`, so every existing layout counts exactly as before
(`deepOf` is 1). The full suite confirms the fixtures' counts are unchanged.

## Tests
- **REG-double-deep** (new, real clicks, all 4 fixtures). It places a Double-deep Rack from the library and checks:
  - type, deep 2, spacing 6, depth 42, 90″ across;
  - the card: Double-deep, Levels, Number deep 2, Deep spacing 6, Back-to-back off;
  - positions (capacity and ledger) ×2; beams, decks and frames ×2;
  - one dashed line per bay, and it is in the PDF;
  - Check warns with the reach truck and doesn't with a deep-reach truck;
  - Back-to-back on gives a pair 2 + 2 deep, positions ×2 the 1-deep pair, one undo step;
  - Number deep 3 typed gives positions ×3;
  - Ctrl+Z twice returns it to a 2-deep single face.
- **Updated** (the rename): RT-names (a back-to-back pair's card name) and SC-C1 (the card caption expression).

## Rule 9 basics on what changed
- The Double-deep Rack is a library item in the Racking section, so REG-basics runs it through the whole contract on
  both fixtures in the full suite: select, move, resize, copy, paste, duplicate, delete, undo, lock, snap, save and
  reload, PDF.

## Dealer walkthrough
- Racking → Double-deep Rack, clicked onto open floor: a 3-bay rack, 7′-6″ deep, with a dashed line through each bay.
- The card reads Double-deep, 48 positions (2 × 24), Levels 4, Number deep 2, Deep spacing 6.
- Back-to-back on: the pair is 15′-9″ across, with 96 positions.

## Hand-check (≤ 6)
1. Racking → **Double-deep Rack**, then click on the floor. A 3-bay rack, 7′-6″ deep, with a dashed line through each
   bay.
2. Its card says **Double-deep**, with positions twice a selective rack's. Type 3 in Number deep: it grows to 3 deep.
3. Turn **Back-to-back** on: a pair, 4 deep. Ctrl+Z undoes it.
4. Check: "needs a deep-reach truck". Project settings → Forklift: **Deep reach truck**. Check again: the warning is
   gone.
5. BOM tab: beams, decks and frames are counted for each deep line, plus the "deep spacing" row spacers.
6. Select an ordinary back-to-back pair: its card title is **Back-to-back**.
