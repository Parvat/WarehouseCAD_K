# r6-cantilever — the cantilever's real object behind its drawing

Branch `r6-cantilever`, from `pushback-config` (73b0793). The two-day run chains from pushback-config, not master, because
pushback-config was not merged yet and changes the same rack files (the lane BOM, the lane card). Merging this branch
brings pushback-config too.

## What changed

**The drawing is the one already built.** It keeps the family colour, no fill, its letter (C), the arm reach dashed, the
X marks per arm bay, the face aisle check and the number's place. Behind it, the cantilever now has its own engine
(`src/racks/cantilever.js`) and card (`src/studio/CantileverCard.jsx`).

**Properties** (defaults in brackets; each one undo, lengths through the Imperial / Metric parser, lists attached to
their fields with Custom):
- Sides: Single or Double [Single]. Double draws the reach on both sides, and both sides get the face aisle check (the
  check already followed `doubleSided`).
- Columns [4]; Column spacing [8 ft]; Arm length [4 ft]; Arm levels [3]; First arm height [12 in]; Column height [12 ft].
- Arm type: Straight or Inclined [Straight].
- Base length = arm length + 6 in, shown and editable. A typed base is kept; a "Back to arm + 6 in" button clears it.
- **Size:** length = (columns − 1) × spacing, the first and last column centres on the box's ends as drawn before.
  Depth = sides × arm length + the column line (4 in).

**Capacity:** loads, not pallets. The card shows "3 bays × 3 levels × 1 side = 9 load spots", and below it "N of M arm
bays usable", from the same red X marks the plan draws. It is never added to the layout's pallet positions.

**Card head:** "C1 · 4 columns · 3 bays · 3 levels · single-sided".

**Handles:** the end handles add or remove whole columns (one bay each, at the column spacing), the opposite end held,
one undo. The depth handles were already off for a cantilever and stay off.

**The plan's spacing label** reads the rack's own column spacing. It was always "48″ spacing"; every saved cantilever
measures 48 in, so it still reads that.

**Placement:** a cantilever placed from the library gets the new defaults (single-sided, 4 columns at 8 ft, 4 ft arms,
3 levels). It still follows the mouse as a ghost, places once, then goes back to Select.

**Saved cantilevers keep their size exactly:**
- columns = its towers;
- spacing = its width ÷ (columns − 1) (48 in on every saved one);
- arm = its towers' length;
- sides = `doubleSided` (unset reads Double, as it always drew);
- the new fields read their defaults; none of them moves the footprint.

## BOM (names agreed with PP)

Per rack. C = columns, V = arm levels, S = sides (1 or 2).

| Part | Qty | Listed by |
|---|---|---|
| Column | C | column height |
| Arm | C × V × S | arm length and type (e.g. "4 ft · Straight") |
| Base | C (one base per column) | base length; a double-sided base spans both sides: 2 × base length |
| Brace | C − 1 (one brace set per bay) | column spacing |
| Anchor | 2 × C (2 per base) | — |

A new rack (4 columns, 3 levels, single): Column 12 ft × 4, Arm 4 ft · Straight × 12, Base 4 ft 6 in × 4, Brace 8 ft × 3,
Anchor × 8.

The cantilever has its own section, "Cantilever racking", under its C numbers in the BOM tab, the Tally and the xlsx. It
is no longer listed under "not in this BOM".

## Rule 7 — pushback-config (73b0793) / this branch

The same 12 cases and script:
- the demo file;
- the 4 fixtures;
- lanes-horizontal, crossaisle-drivein, zone-lane, walls-racks;
- lane-drive, lane-push, lane-flow.

**Identical** in card totals, rack counts, bays, every rack's footprint, picks, overlap and face marks, rack numbers, beam
lines, beam-rack and push-back BOM lines, flags, save and reload, PDF and Generate. The only change is the expected one:

| Case | Line | Before | After |
|---|---|---|---|
| walls-racks (1 saved double cantilever, 4 columns, 36 in arms) | BOM sections | Push-back | Push-back + **Cantilever**: Column 12 ft × 4, Arm 3 ft · Straight × 24, Base 7 ft × 4, Brace 4 ft × 3, Anchor × 8 |
| | "not in this BOM" | 3 racks | 2 racks (the drive-in and the shelving run) |
| A new cantilever (library) | size | 1 bay of 48 in arms, double | 4 columns at 8 ft, 4 ft arms, single: 24 ft × 4 ft 4 in |

Pallet positions are unchanged everywhere: a cantilever was never counted, and still isn't.

**New fixture:** `handCheck/cantilever.wcad`, two new cantilevers in the older-horizontal building: C1 single-sided (the
defaults) and C2 double-sided with 5 columns.

Screenshots: `r6-cantilever/plan-and-card.png` (C2 selected: its card; its top side short of the reach truck's aisle, so 4
of its 8 arm bays are X'd), `r6-cantilever/bom.png`.

## Tests

**`CV_cantilever.test.js` (16 unit tests):**
- the defaults, size, head and load spots (never pallet positions);
- the card edits: Double, columns, spacing, arm length, levels, first arm, column height, arm type, a typed base;
- the end handles in whole columns (never under 2), the depth sides changing nothing;
- the drawing: one reach zone single, two double; an X box per arm bay;
- the BOM, single and double;
- a saved cantilever (walls-racks): unchanged, its drawing identical after an edit.

**`REG-r6-cantilever` (real clicks):**
1. Place a cantilever from the library: the defaults, back to Select.
2. The card head reads C3; 9 load spots.
3. Double: one undo, 18 spots.
4. Columns 6: one undo.
5. The end handle dragged a bay: 7 columns, one undo, Ctrl+Z back.
6. Arm length `5'`: the base shows 66.
7. Inclined.
8. The pallet positions are unchanged.
9. The BOM tab section.
10. Save and reload keep every field.
11. walls-racks' saved cantilever is unchanged, and its card reads double-sided.

REG-basics (Racking) runs the cantilever through the whole Basics contract as a hard fail, as it did; it passes.

**Updated expectations (tests kept):** `LF_laneFixes`: the BOM types on are push-back and cantilever; walls-racks' BOM
has a Cantilever section.

**Full suite:** see the two-day-run report (run once on the combined branch).

## Questions for PP

1. **Anchors: 2 per base?** (2 × columns.)
2. **A double-sided base: one base spanning both sides, listed at 2 × the base length?** Or two bases a column?
3. **Braces: one brace set per bay, listed by the column spacing.** Is a set one part, or should the BOM count its
   pieces (e.g. 2 diagonals)?
4. **Arm type in the arm's size** ("4 ft · Straight"): is that how the dealer orders it, or a separate part name?
