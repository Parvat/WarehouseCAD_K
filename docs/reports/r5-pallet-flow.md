# r5-pallet-flow: pallet flow on the lane engine

Branch `r5-pallet-flow`, from `r4-push-back`. Full suite: **4,624 / 4,624**.

## What changed
Pallet flow now runs on the lane engine (`racks/laneEngine.js`, `LANE_ENGINE_ON`). It gets the card, handles, placement defaults and BOM section that drive-in and push-back have. All four lane racks now share one engine.

**Properties** (defaults in brackets):
- Lanes [3]; Deep [4]; Levels [3].
- Pallet 40 × 48 in; lane clearance [3 in]; depth station = pallet depth + 4 (52 in); post [3 in].
- Level spacing [60 in]; first beam [0 in]; overall height = first + levels × spacing, or typed.
- **Pitch** [about 3/8 in per ft]: shown only in the card ("Pitch about 0.375 in per ft"), never on the plan. It is saved (`pitchInPerFt`).

**Faces:** LOAD at the back (top) and PICK at the front (bottom), gravity flow. The drawing, face words and face aisle check (both faces) are unchanged.

**Card:** "F1 · 3 lanes × 4 deep × 3 levels · 36 PAL"; Size, Pallet, Levels. Lists open attached to their fields; units go through the project's parser; every edit is one undo.

**A pallet flow saved before** keeps its size exactly. It used to be drawn with the drive-through's old panel.

## BOM (standard names — a question for PP)
Its own section, Pallet flow racking, under F1, F2 …. Per rack, with L = lanes, D = deep, V = levels, P = L + 1 post lines, S = depth station, and F = ceil(D / 2) + 1 frame lines:

| Part | Qty | Size |
|---|---|---|
| Upright frame | P × F | overall height × D × S |
| Beam | L × V × F: one at each frame line under each lane, a level each | lane width |
| Roller track | 2 × L × V | D × S long |
| Speed controller (brake) | 2 × L × V × ceil(D / 2): a brake every two pallets on each track | — |
| Pallet stop | L × V: at the PICK end | — |
| Entry guide | 2 × L × V: at the LOAD end | — |

**Example,** 3 × 4 × 3: Upright frame 15 ft × 17 ft 4 in × 12, Beam 46 in × 27, Roller track 17 ft 4 in × 18, Speed controller × 36, Pallet stop × 9, Entry guide × 18.

## Rule 7 (compared with r4-push-back)
- **Identical:** the demo, the 4 handCheck fixtures, lanes-horizontal, crossaisle-drivein, zone-lane, walls-racks, lane-drive and lane-push.
- **lane-flow (new):** two pallet flows from the engine, 72 positions; F1 and F2 in one section.

## Tests
- **LN_laneEngine:** the defaults and pitch, the BOM formulas, and the section under F1, F2 (no "not in this BOM" flag).
- **REG-r5-pallet-flow (real clicks):**
  - placed from the library, back to Select;
  - the card head and the pitch in the card only (no pitch text on the plan);
  - LOAD and PICK faces;
  - Deep typed (one undo);
  - a lane by the handle;
  - Level spacing from its attached list sets the overall height (216);
  - the BOM section with every part;
  - save and reload.

## Screenshots: `docs/reports/r5-pallet-flow/`
- **Before** (rack-xmarks): the drive-through's old panel; "not in this BOM".
- **After:** the card, the BOM section, and the plan at 15 % and 30 %.

## Questions for PP
1. **BOM names and formulas,** above: the frame lines ceil(D / 2) + 1, a beam at every frame line under each lane, a brake every two pallets per track, one stop per lane per level, and 2 entry guides per lane per level.
2. **Pitch:** is 3/8 in per ft the right default, and should it ever print, for example in the BOM?
