# r8-carton-flow — carton flow, a new type

Branch `r8-carton-flow`, from `r7-shelving`.

## What changed

**Carton flow replaces the "Coming soon" row** in the Racking library (Flow group). Its library entry is new in
`constants/warehouseObjects.js`; that file is approved for R2–R5 new entries, and carton flow is R4. It is:
- in the flow family (amber), with its own letter K (K1, K2 …);
- typed `rack_carton_flow`, family `carton` in `utils/rackTypes.js`: carton lanes, never pallet positions.

**Faces:** LOAD at the back (top), PICK at the front (bottom), with the face aisle check on both (as pallet flow). A
short face loses its bays (an X per bay).

**Drawing:** like pallet flow, but with lane lines and no pallet slots:
- a frame bar at each bay line;
- in each bay, its lanes as thin lines (lanes per level − 1). Every level's lanes sit over one another in plan, so they
  are drawn once;
- an arrow per bay toward PICK;
- the LOAD and PICK face bars and words, at real size like every face word.

**Library icon:** Pallet flow's glyph (the frame, the two face bars, the arrow) with two thin lane lines.

**Properties** (defaults in brackets; each one undo, lengths through the Imperial / Metric parser, lists attached to
their fields with Custom):
- Bays [3]; Bay width [8 ft]; Depth [8 ft]; Levels [4]; Lanes per level per bay [6]; Frame height [7 ft].
- Pitch [about 1/2 in per ft]: on the card only, never on the plan or the PDF (as pallet flow's).

**Capacity:** carton lanes = bays × levels × lanes per level, on the card; never pallet positions. The card also shows how
many are usable: the bays without a red X, times levels × lanes.

**Card head:** "K1 · 3 bays · 4 levels · 72 carton lanes".

**Handles:** the end handles add or remove whole bays, the opposite end held, one undo. The depth handles are off: depth
is typed on the card.

**BOM: off** (PP: dealer setups vary). Carton flow sits behind the same one setting as the lane BOMs
(`LANE_BOMS_PENDING_ON` in `racks/laneBom.js`) and is listed under "not in this BOM". A draft is kept behind the setting
for when the dealer details are in (B bays, V levels, N lanes per level):
- Upright frame (B + 1), by frame height × depth;
- Carton lane B × V × N, by depth;
- Shelf beam B × V × 2, by bay width.

## Rule 7 — r7-shelving / this branch

The same 12 cases and script: **identical in every case.** No saved layout has a carton flow; the library row is the only
change outside a new carton flow.

**New fixture:** `handCheck/carton-flow.wcad`: K1 (the defaults) and K2 (2 bays, 5 levels).

Screenshots: `r8-carton-flow/plan-and-card.png` (K1 selected). Its LOAD face is 9′9″ from the column line, short for the
reach truck, so all its bays are X'd. `r8-carton-flow/bom.png`.

## Tests

**`CF_cartonFlow.test.js` (9 unit tests):**
- the family, letter and faces;
- the defaults and head;
- carton lanes, not pallets;
- the drawing: lane lines, frames, arrows, LOAD and PICK, no slots;
- an X box per bay;
- the edits and end handles;
- the BOM: pending, off.

**`REG-r8-carton-flow` (real clicks):**
1. Place carton flow from the library: the defaults, back to Select.
2. Its card reads K3 … 72 carton lanes, with the pitch on the card.
3. LOAD and PICK are drawn; the pitch is not on the plan.
4. Lanes per level 8: one undo, 96 lanes.
5. The end handle dragged a bay: one more, one undo, Ctrl+Z back.
6. The pallet positions are unchanged.
7. The BOM: no section, listed under "not in this BOM".
8. Save and reload.

REG-basics (Racking) now runs carton flow through the whole Basics contract as a hard fail, and it passes.

**Updated expectations (tests kept):**
- `REG-rack-library`: Carton flow is enabled, with its own tooltip.
- `RD_rackDesign`: its family, its tooltip; every row is a library item.
- `LF_laneFixes`: the pending set holds carton flow too.

## Questions for PP

1. The BOM draft (frames, carton lanes, shelf beams): fine as a start for when dealers send their setups?
2. **Lanes per level** is per bay (6 lanes in each bay at each level). Right?
