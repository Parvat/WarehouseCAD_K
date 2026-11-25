# r4-push-back: push-back on the lane engine

Branch `r4-push-back`, from `r3-drive-in`. Full suite: **4,619 / 4,619**.

## What changed
Push-back now runs on the lane engine from r3 (`racks/laneEngine.js`, `LANE_ENGINE_ON`). It gets the same card, handles, placement defaults and BOM section as the drive-in.

**Properties** (defaults in brackets):
- Lanes [3]; Deep [4]; Levels [3].
- Pallet 40 × 48 in; lane clearance [3 in] (lane width 46 in); depth station = pallet depth + 4 (52 in); post [3 in].
- Level spacing [60 in]; first beam height [0 in — floor level]; overall height = first beam + levels × spacing, or typed.

**Deep stays within 2 to 6:**
- typed in the card (9 stops at 6, 1 at 2; the card says "2 to 6 deep");
- dragged with the depth handle (it stops at 2 and at 6).

**Its face:** one LOAD · PICK face, carts pushed back. The drawing, face words, arrows and face aisle check are unchanged from rack-design and rack-round2.

**Card:** "P1 · 3 lanes × 4 deep × 3 levels · 36 PAL"; Size (Lanes, Deep); Pallet (as the drive-in); Levels (Levels, First beam, Level spacing, Overall height). There is no Type switch, Flip or Floor guides: those are the drive-in's.

**A push-back saved before** keeps its size exactly, as in r3: its clearance and station are read from what it measures.

## BOM (standard names — a question for PP)
Its own section, Push-back racking, under P1, P2 …. Per rack, with L = lanes, D = deep, V = levels, P = L + 1 post lines, S = depth station, and F = frame lines (2 up to 3 deep, 3 from 4 deep: front, rear and a middle frame):

| Part | Qty | Size |
|---|---|---|
| Upright frame | P × F | overall height × D × S |
| Beam | 2 × L × V: front and rear, a level each | lane width |
| Rail set | L × V | D deep |
| Cart | (D − 1) × L × V: the front pallet sits on the rails | — |
| Entry guide | 2 × L: at the LOAD · PICK face, floor level | — |

**Example,** 3 × 4 × 3: Upright frame 15 ft × 17 ft 4 in × 12, Beam 46 in × 18, Rail set × 9, Cart × 27, Entry guide × 6.

The BOM tab now shows beam pairs only on a beam rack's line. A lane rack's "Beam" line has no pairs; it used to throw a page error.

## Rule 7 (compared with r3-drive-in)

| Case | Changed |
|---|---|
| demo, the 4 handCheck fixtures, lanes-horizontal, crossaisle-drivein, zone-lane, lane-drive | nothing |
| walls-racks | the BOM only: its push-back leaves the "not in this BOM" flag (3 → 2 racks) and gets its Push-back racking section |
| lane-push (new) | two push-backs from the engine: 72 positions; P1, P2 in one section |

## Tests
- **LN_laneEngine:** the defaults (150 × 208 in, 36 positions), deep 2 to 6 typed and by handle, the BOM formulas including the frame lines, and the section under P1, P2.
- **REG-r4-push-back (real clicks):**
  - placed from the library, back to Select;
  - the card head and First beam;
  - Deep 9 → 6 (one undo);
  - the depth handle stopping at 2;
  - a lane by the handle, the left edge kept;
  - the LOAD · PICK face;
  - the BOM section with every part and carts 54;
  - save and reload.
- **REG-basics, Racking:** strict, from r3; push-back is in it.

## Screenshots: `docs/reports/r4-push-back/`
- **Before** (rack-xmarks): the old panel; "not in this BOM".
- **After:** the card, the BOM section, and the plan at 15 % and 30 %.

## Questions for PP
1. **BOM names and formulas,** above: the frame lines (2 up to 3 deep, 3 from 4 deep), beams front and rear only, one rail set per lane per level, carts D − 1, and 2 entry guides per lane at the floor.
2. **First beam at 0 in** means the bottom level sits on the floor (its rails on the floor). Agreed?
