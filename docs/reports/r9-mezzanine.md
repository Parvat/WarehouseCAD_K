# r9-mezzanine — the mezzanine's real object behind its drawing

Branch `r9-mezzanine`, from `r8-carton-flow`.

## What changed

**The drawing keeps its style:**
- the dashed outline, the thin cross, "MEZZANINE" and its size in the middle, its family colour, no fill, its letter (M).

**Added to the drawing:**
- **columns** as small squares (8 in) at the column grid, replacing the dots that sat along the edges only;
- **stairs**: a footprint outside an edge, with its treads (one every 11 in) and an arrow pointing up the stair, toward
  the deck;
- **pallet gates**: a short bar (5 ft) on an edge;
- **the handrail** on the open edges (every edge length not taken by a stair or a gate), a line 6 in inside the edge.

**Properties** (its own card, `studio/MezzanineCard.jsx`, engine `racks/mezzanine.js`; each one undo, lengths through the
Imperial / Metric parser, lists attached to their fields with Custom):
- **Width and Depth**: from the drawing, editable.
- **Deck height** [10 ft].
- **Column spacing** [about 20 ft each way], auto-fitted to whole bays: each way, bays = round(side ÷ spacing), at least
  1, the columns at side ÷ bays. The card shows e.g. "2 × 1 bays · columns at 15 × 20 ft".
- **Deck type**: Bar grating, B-deck with plywood, or Plywood [B-deck with plywood].
- **Stairs** [1]. Each is 4 ft wide, its run from the deck height: a 7 in rise and an 11 in going, so (risers − 1) × 11 in,
  risers = ceil(deck height ÷ 7). For 10 ft that is 17 × 11 in = 15 ft 7 in. Each stair is attached to an edge.
- **Pallet gates** [1], each attached to an edge.
- **Handrail on open edges** [on].
- **Drag to move:** with the mezzanine selected, press on a stair (or a gate's bar) and drag. It slides along the edges
  and jumps to the nearest edge, one undo. Its size and place never change otherwise.

**Checks** (warnings in Check layout and on the card, never errors):
- each stair needs a **3 ft clear landing at its foot**: no rack, column, zone, door clear space or wall on it;
- a **pallet gate needs a face aisle like a rack face**: the floor in front of it, outward, clear for the plan's truck
  aisle. It reads like a rack face's check, e.g. "its face aisle is 6′ 2″ (rack) — the truck needs 10.5 ft".
- **Racks under the mezzanine stay allowed** (the existing rule): no warning for them.

**The card shows its area:** "600 sq ft", or m² in metric. **Head:** "M1 · 30 × 20 ft · 600 sq ft · deck 10 ft" (m in
metric).

**BOM: off** (dealer setups vary). It is listed under "not in this BOM", as before.

**Placement:** a mezzanine from the library places as before (its library size, 40 × 20 ft), one stair at the middle of
its bottom edge and one gate at the middle of its top edge, then back to Select.

**Saved mezzanines keep their box exactly.** The new fields read their defaults: deck 10 ft, about 20 ft column spacing,
B-deck, handrail on, one stair (bottom, middle), one gate (top, middle). None of them changes the box. A saved mezzanine
draws its columns at the grid (was: dots on the edges), its default stair, gate and handrail.

## Rule 7 — r8-carton-flow / this branch

The same 12 cases and script: **identical in every case.** No saved layout has a mezzanine.

**New fixture:** `handCheck/mezzanine.wcad`: M1 (30 × 20 ft), a selective under its deck (allowed), and a selective on
its stair's landing (the warning). Its gate faces a building column, so it has a gate warning too.

Screenshots: `r9-mezzanine/plan-and-card.png` (M1: its card, its stair, its gate, the two warnings),
`r9-mezzanine/bom.png`.

## Tests

**`MZ_mezzanine.test.js` (15 unit tests):**
- the area and head, imperial and metric;
- width and depth typed; never pallet positions;
- the column grid (whole bays, the spacing edited, drawn as squares);
- the stair: its footprint, run, arrow and landing; dragged to another edge;
- stair and gate counts; the gate bar; the handrail on open edges only;
- the checks: a landing blocked, a gate's aisle short, racks under the deck allowed;
- a saved mezzanine's box kept.

**`REG-r9-mezzanine` (real clicks):**
1. M1's card head and grid.
2. Deck height `12 ft`: one undo.
3. The deck type from its list: one undo.
4. Stairs 2: one undo, then undone.
5. The stair pressed and dragged to the right edge: it moves there, one undo, Ctrl+Z back.
6. Check layout: the landing warning and the gate warning, none for the rack under the deck.
7. The columns are drawn as squares.
8. Save and reload.
9. A new one from the library places as before.

REG-basics (Racking) runs the mezzanine through the whole Basics contract as a hard fail, and it passes.

**Updated expectation (test kept):** `rackOpsDeck`: the mezzanine's posts are now columns at the grid (6 on 30 × 20 ft,
8 on 60 × 20 ft — the same counts here).

## Questions for PP

1. **The stair's run:** 7 in rise, 11 in going. Do your dealers use another code (e.g. 7.75 / 10)?
2. **Pallet gate width:** 5 ft. Right?
3. **The handrail:** drawn 6 in inside the edge. Should it sit on the edge itself?
4. **The gate's face aisle:** the plan's truck aisle (as a rack face). Or a smaller pick-up area?
