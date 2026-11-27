# r7-shelving — steel boltless shelving (agreed with PP)

Branch `r7-shelving`, from `r6-cantilever`.

## What changed

**The drawing is the one already built.** It keeps the family colour, no fill, its letter (S), a line between units,
the X marks per unit, the pick check and the number's place. A back-to-back pair also draws its shared back across the
middle.

**The fields that were there stay:** Units, Shelves, Unit width 36 / 42 / 48 / Custom [48], Depth 12 / 18 / 24 / Custom
[24]. Unit width and Depth now read lengths through the Imperial / Metric parser, as every other card length does.

**Added** (each one undo):
- **Height** [7 ft]: a length field with a list (6, 7, 8, 10 ft) and Custom. It changes no size on the plan.
- **Back-to-back** [off]. When on, the object is two runs sharing the back:
  - its depth doubles (one run's depth is kept, and the card's Depth stays one run's);
  - only the two front faces get the pick check, each run's own;
  - a short front loses only its own run's units (an X each), like a double-sided cantilever's side.

**Units in a run share posts** (the BOM below).

**Card head and the plan's label:** "S1 · 4 units · 48×24 · 5 shelves · 7 ft", plus "· back-to-back" for a pair.

**Handles:** the end handles add or remove whole units, the opposite end held, one undo (before, the width stretched
freely and the units re-split). The depth handles are as before.

**Placement:** a shelving run placed from the library is 4 units of 48 × 24, 5 shelves, 7 ft (it was 10 ft of units
about 40 in wide). It still follows the mouse as a ghost, places once, then goes back to Select.

**Saved runs keep their size exactly:** height reads 7 ft, back-to-back reads off; neither changes the box.

## BOM (every formula a question for PP)

Per run. U = units, K = shelves, R = runs (2 back-to-back, else 1).

| Part | Qty | Listed by |
|---|---|---|
| Post | (U + 1) × 2 × R | height |
| Long beam | U × K × 2 × R | unit width |
| Short beam | (U + 1) × K × R | depth |
| Deck | U × K × R | width × depth |

A new run (4 units, 5 shelves): Post 7 ft × 10, Long beam 48 in × 40, Short beam 24 in × 25, Deck 48 × 24 in × 20.

Shelving has its own section, "Shelving racking", under its S numbers in the BOM tab, the Tally and the xlsx. It is no
longer listed under "not in this BOM".

## Rule 7 — r6-cantilever / this branch

The same 12 cases and script. **Identical** everywhere except the expected change:

| Case | Line | Before | After |
|---|---|---|---|
| walls-racks (1 saved run, 4 units of 48 × 24, 5 shelves) | BOM sections | Push-back, Cantilever | + **Shelving**: Post 7 ft × 10, Long beam 48 in × 40, Short beam 24 in × 25, Deck 48 × 24 in × 20 |
| | "not in this BOM" | 2 racks | 1 rack (the drive-in) |
| | its label (selected) | S1 · 4 units · 48×24 · 5 shelves | S1 · 4 units · 48×24 · 5 shelves · **7 ft** |
| A new run (library) | size | 10 ft (3 units of about 40 in) × 24 in | 4 units of 48 × 24 in |

Pallet positions are unchanged everywhere: shelving holds units, not pallets, as before.

**New fixture:** `handCheck/shelving.wcad`, two new runs: S1 single and S2 back-to-back.

Screenshots: `r7-shelving/plan-and-card.png` (S2, back-to-back, selected), `r7-shelving/bom.png`.

## Tests

**`SH_shelving.test.js` (8 unit tests):**
- the defaults and head;
- back-to-back on and off, with its X boxes per unit on each run;
- the end handles in whole units;
- the BOM, single and back-to-back;
- a saved run unchanged;
- back-to-back's pick check: a short front loses only its own run's units.

**`REG-r7-shelving` (real clicks):**
1. Place a run from the library: the defaults, back to Select.
2. Height `8 ft`: one undo, no size change.
3. Back-to-back: one undo, twice as deep, the label says back-to-back.
4. The end handle dragged a unit: one more, one undo, Ctrl+Z back.
5. The BOM tab section, doubled for the pair.
6. Save and reload.
7. walls-racks' saved run is unchanged.

**Updated expectations (tests kept):**
- `R3_rackRound3` and `REG-r3-shelving`: the label gains "· 7 ft".
- `LF_laneFixes`: the BOM types on add shelving; walls-racks gains a Shelving section.

## Questions for PP

1. **Posts: (units + 1) × 2**, a front and a back post at every frame line: right? Back-to-back is listed as two full
   runs (posts doubled). Should a pair share its back posts instead ((U + 1) × 3)?
2. **Long beams: units × shelves × 2** (front and back of every shelf).
3. **Short beams: (units + 1) × shelves** (one at each frame line, every shelf).
4. **Decks: units × shelves**, by width × depth.
5. **Back-to-back doubles long beams, short beams and decks too.** Right?
