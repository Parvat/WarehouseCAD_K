# r3-drive-in: drive-in and drive-through on one lane-rack engine

Branch `r3-drive-in`, from `rack-xmarks` (87e3262; rack-xmarks is not merged yet). Full suite: **4,613 / 4,613**. The one earlier failure, REG-lane-positions, came from PP's rule change: a new lane rack now carries its own 4 levels and the card shows the count in its head. Its expectation was updated; the test was kept.

## The engine (`src/racks/laneEngine.js`)
One engine for every lane rack: drive-in and drive-through here, push-back (R4) and pallet flow (R5) next. Each type is switched on in `LANE_ENGINE_ON`.

**Properties** (each type's defaults in `LANE_DEFAULTS`; drive-in and drive-through defaults in brackets):
- Lanes [4]; Deep, in pallets [5]; Levels [4].
- Pallet width [40 in], pallet depth [48 in].
- Lane clearance, each side of the pallet [3 in].
- Post size [3 in].
- First rail height [8 in]; level spacing [60 in]; overall height [first + levels × spacing], which can be typed.
- Floor guides [on].

**Size:**
- lane width = pallet width + 2 × clearance (46 in);
- width = lanes × lane width + (lanes + 1) × post;
- depth station = pallet depth + 4 (52 in);
- depth = deep × station.

**A rack saved before** keeps its size exactly. A field it doesn't carry is read from what it measures: its clearance from its width, its station from its depth (old racks are pallet depth deep, with no + 4), and its post from `uprightWidth`. Nothing is resized on load; the fixtures' saved drive-ins are tested for this.

**Edits:**
- `laneChange` handles lanes, deep, the pallet, the clearance, the post, levels, heights, floor guides and the type.
- Each edit resizes from the anchored corner (`utils/bayAnchor.js`), including a turned rack, and is one undo.
- A changed pallet depth sets the station to pallet depth + 4.

**Handles** (`laneResize`, used by `canvas2/useCanvasInteraction.js` for engine types):
- the lane sides (ml, mr) add or remove whole lanes;
- the depth sides (tc, bc) add or remove whole depth stations;
- a corner does both;
- the opposite side is held.

The old `utils/canvas.js` `applyResize` branch is protected and untouched; engine types simply don't reach it.

**Levels** (`utils/capacity.js` `laneLevels`): a rack's own levels now win over its elevation type when it carries `levelsOwn`. That flag is set by the card and on a new rack. A rack saved before still takes its elevation type's levels, so positions are unchanged. Positions = lanes × deep × levels, the existing rule.

## Type, entry face, back
- **Type:** Drive-in or Drive-through, a switch in the card. Switching keeps the size and is one undo.
- **Entry face:** a drive-in has one ENTRY face. Flip moves it to the other end by turning the rack 180°, so the footprint stays exactly where it was and the drawing, arrows, face check and number all follow.
- **Ends:** a drive-through has an ENTRY face at both ends. A drive-in's back needs no aisle (the face check from rack-round2).

## The card (`src/studio/LaneCard.jsx`)
- **Head:** "D1 · 4 lanes × 5 deep × 4 levels · 80 PAL".
- **Size:** Type, Lanes, Deep (pallets), Entry face (Flip).
- **Pallet:**
  - Pallet width (40 · 42 · 48 · Custom);
  - Pallet depth (40 · 48 · Custom);
  - Lane clearance (2 · 3 · 4 · Custom);
  - Post size (3 · 4 · Custom);
  - the lane width and depth station shown under them.
- **Levels:** Levels; First rail; Level spacing (48 · 54 · 60 · 66 · 72 · Custom); Overall height (typed, with "Back to first + levels × spacing").
- **Options:** Floor guides.

Each list opens attached to its field (the app's size list — `SizeInput`, which now takes `parse` and `format`). A length is typed in any form the project's units read (Imperial or Metric) and shown in them. Every edit is one undo.

**New racks** from the library get the engine's defaults (`laneNew`). The selected rack's width label now reads its real width, not the old fixed lane formula.

## BOM (`src/racks/laneBom.js`)
- Each type has its own section, Drive-in racking and Drive-through racking, under its letter lines (D1, T1 …), shown in the BOM tab and the CSV.
- Lane racks the engine runs are no longer flagged "not in this BOM".
- Beam rack BOM lines are unchanged: identical on the demo file and every fixture.

**Formulas** (per rack; L = lanes, D = deep, V = levels, P = L + 1 post lines, S = depth station):

| Part | Qty | Size |
|---|---|---|
| Upright | P × (D + 1): a post at each station boundary on each post line | overall height |
| Rail arm | 2 × L × (D + 1) × V: one per rail per post per level | — |
| Rail | 2 × L × V | D × S long |
| Top tie | L × (D + 1): across each lane at every post, at the top | lane width |
| Back tie | L × V: drive-in only, across each lane at the back, one per level | lane width |
| Floor guide | 2 × L: when Floor guides is on | D × S long |

**Example,** 4 × 5 × 4 at the defaults: Upright 20 ft 8 in × 30, Rail arm × 192, Rail 21 ft 8 in × 32, Top tie 46 in × 24, Back tie 46 in × 16, Floor guide 21 ft 8 in × 8.

## Generate
Generate has no rack-type choice, so drive-in is not added to it. See the questions below.

## Rule 7 (compared with rack-xmarks)

| Case | Changed |
|---|---|
| demo, older-horizontal, older-vertical, crowded-horizontal, crowded-vertical | nothing: every count, beam number and BOM line identical |
| lanes-horizontal, zone-lane, walls-racks, crossaisle-drivein | the BOM only. The "N racks of another kind not in this BOM" flag drops these racks and their own sections appear. crossaisle-drivein's beam BOM (R1–R11, every line) is identical. |
| lane-drive (new) | a drive-in and a drive-through made by the engine: 160 positions; D1 and T1 sections in the BOM |

## Tests
- **`src/__test__/plan/LN_laneEngine.test.js`:**
  - the sizes;
  - every saved drive-in on the fixtures kept exactly;
  - each edit;
  - a turned rack's held corner;
  - the type switch;
  - levels, own and typed height;
  - every handle;
  - the BOM formulas;
  - the BOM's sections, with beam fixtures unchanged.
- **REG-r3-drive-in (real clicks):**
  - placed from the library with its defaults, then back to Select;
  - the card head;
  - Lanes typed (one undo);
  - Pallet width from its attached list;
  - Type switched (size kept, one undo);
  - Flip;
  - the lane-side and depth-side handles;
  - Levels;
  - Floor guides off, out of the BOM;
  - the BOM sections;
  - save and reload;
  - the PDF.
- **REG-basics, Racking library:** every rack type through the whole Basics contract is now a hard fail; it used to be reported only. It passed 264 / 264 checks on both fixtures before the switch.

## Screenshots: `docs/reports/r3-drive-in/`
- **Before** (rack-xmarks): the old drive-in panel; the BOM says "2 racks of another kind not in this BOM".
- **After:** the new card, the BOM sections, and the plan at 15 % and 30 %.

## Questions for PP
1. **BOM formulas:** please check each line above. Uprights are counted as a post at every station boundary, and top ties as one per lane at every post.
2. **Generate** has no rack-type choice, so drive-in and drive-through are not in it. Should Generate offer a rack type?
3. **The xlsx and the Tally** don't list the lane sections yet; the tab and the CSV do. Should they?
4. **A drive-in saved before** has no Floor guides setting. It now counts floor guides (the default is on). Agreed?
