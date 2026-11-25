# rack-xmarks: one X per lost shelving unit and cantilever arm bay

Branch `rack-xmarks`, from master (01cfbeb). Full suite: **4,597 / 4,597**.

## The change
**The fault:** a lost cantilever or shelving position used to get one big X.
- A cantilever's only drawn "slots" are its two arm-reach zones, one a side, each across the whole rack.
- A shelving run draws no slots at all, so its overlap mark fell back to the whole overlap area.

**New box set** — `render/rackOps.js` `markBoxes(obj)`, the boxes an X is drawn in:
- **Shelving:** each unit's outline (its unit width, the run's depth).
- **Cantilever:** each arm bay, between two columns and across the arm reach, on each loaded side.
- **Every other rack:** its pallet slots, as before.

**Where it is used:** for overlaps and zones (`render/overlapOps.js` `coveredPositions`) and for short faces (`generate/coverLost.js` `faceLostMarks`).

**Marks:** the same red, 1.5 px stroke and inset as the pallet-slot X (`overlapOps`), so a mark is never bigger than its unit or bay. Only the covered units or bays get one: a box is marked when the other rack, the zone or the short face meets it, the same rule as pallet slots. The PDF draws the same marks.

**Counts unchanged:** usable and lost still read the drawn slots (`slotBoxes`). The drawing changed; the numbers did not.

## Rule 7
Rule 7 matches rack-round3's final run in every field on all of these:
- the demo file;
- the 4 handCheck fixtures (older and crowded, both orientations);
- lanes-horizontal, crossaisle-drivein, zone-lane and walls-racks.

The fields compared are positions, usable, lost, bays, beam lines, numbers, chips, the BOM, the PDF, Generate and save/load.

## Tests
- **`src/__test__/plan/XM_xmarks.test.js`:**
  - shelving has 4 units and a cantilever 3 bays a side;
  - a cantilever over half a shelving run gives 2 marks on each rack, each inside its own unit or bay, with each X's lines inside its box;
  - a short-faced single-sided cantilever gives 3 bay marks;
  - the counts still read the slots.
- **REG-xmarks (real drag):** a cantilever is dragged over half a shelving run.
  - Each covered unit and bay gets its own X: 4 X, 1.5 px, none bigger than a unit or bay.
  - The PDF draws the marks.
  - It is one undo.
- **R3 test updated:** a double-sided cantilever with one side short now marks its 3 short-side bays (it was "fewer marks than the 2 reach zones").

## Screenshots: `docs/reports/rack-xmarks/`
- **Before:** one big X over the cantilever's whole reach (C2), and one X over the shelving–cantilever overlap.
- **After:** one X per bay, one per unit.

Both are taken at 15 % and 30 %.

## Questions for PP
1. **A shelving run covered by a zone or another rack loses 0 positions.** A shelving run has no pallet slots, so the counting rule finds nothing to take off, though its units now get an X. Counts were to stay unchanged, so this was not changed. Should a covered unit come off usable?
