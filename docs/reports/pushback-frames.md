# pushback-frames — push-back short frames tied with row spacers (PP option B)

Branch `pushback-frames`, from `lane-fixes` (0f8f5f9). Master (7405881) did not have lane-fixes yet, and this round
replaces lane-fixes' push-back frame and anchor lines, so it is built on top of it; merging it brings lane-fixes too.

## What changed

**The rule (PP, option B).** A push-back 4 deep or more is two short frames per post line, joined by row spacers, not one
frame the full depth.

- **Frames per post line:** N = 1 for 2–3 deep, N = 2 for 4–6 deep.
  - That is N = ceil(deep / 3): a frame carries up to 3 pallets (`PUSHBACK_PER_FRAME` in `racks/laneEngine.js`).
  - The pallets split as evenly as they can, with the odd one on the front (LOAD) frame: 4 → 2 + 2, 5 → 2 + 3, 6 → 3 + 3.
- **Depth:** frame depths (pallets × depth station) plus one row spacer length at each joint.
  - A new 3 × 4 × 3 push-back is 4 × 52 + 6 = 214 in deep (it was 208).
  - The drawing leaves the spacer's gap between the frames' slots, and the selection box, aisle check and dimensions all
    use the new depth.

**The card** (Size section, push-back only):
- **Row spacer length (in)**, default 6. It is a length field: it reads the project's units (`1'` = 12 in) and is one undo.
  Changing it changes the rack's depth, with the anchored corner held.
- **Spacers per joint**, default 2. A whole number, at least 1, one undo. It changes only the BOM.
- A hint under them: "2 frames (2 deep + 2 deep) joined by 6 in row spacers", or "1 frame, no row spacer".

**Saved push-backs keep their outer size exactly.** Their spacer is set to whatever fits: the depth minus the stations,
split over the joints.
- On every push-back saved so far that is **0 in**: lane-push P1 and P2, and walls-racks P1.
- So they draw exactly as before, and their BOM lists the row spacers at 0 in (question 2).
- Editing such a rack keeps its 0 in spacer until a length is typed.

## Push-back BOM formulas

Symbols:
- L: lanes
- D: pallets deep
- V: levels
- P = L + 1: post lines
- N: frames per post line (1 up to 3 deep, 2 from 4 deep)
- J: spacers per joint
- S: depth station

| Part | Qty | Size | Before (lane-fixes) |
|---|---|---|---|
| Upright frame | P × N | listed by frame depth: overall height × (the frame's pallets × S) | P × F, full depth |
| Row spacer | P × (N − 1) × J | listed by length (the card's Row spacer length) | — |
| Beam | L × V × (N + 1): front, each joint, rear | lane width | L × V × F, the same count |
| Rail set | L × V | D deep | unchanged |
| Cart | (D − 1) × L × V | | unchanged |
| Entry guide | 2 × L | | unchanged |
| Anchor | 2 × P × 2N: 2 per post, 2 posts a frame | | 2 × P × F |

(F was the frame-line count: 2 up to 3 deep, 3 from 4 deep, which equals N + 1, so beams don't change.)

**PP's example, 3 lanes × 4 deep × 3 levels:**
- 8 frames, 15 ft 8 in × 8 ft 8 in
- 8 row spacers, 6 in
- 27 beams
- 9 rail sets
- 27 carts
- 6 entry guides
- 32 anchors

In the BOM tab, Tally and xlsx, each part's sizes are listed together (frames by depth, then spacers by length), in the
order the parts first appear.

## Rule 7 — before (lane-fixes 0f8f5f9) / after

The same 12 cases as lane-fixes:
- the demo file;
- the 4 fixtures (older and crowded, both orientations);
- lanes-horizontal, crossaisle-drivein, zone-lane, walls-racks;
- lane-drive, lane-push, lane-flow.

They were checked by the same script on both branches: the card totals, rack counts, bays, every rack's x / y / width /
height / rotation, picks, overlap and face marks, rack numbers and their places, beam lines, the beam-rack BOM lines,
flags, save and reload, PDF sheet, and Generate.

**Identical in every case** except the push-back lines below:
- positions, usable and lost (demo 2,038 / 1,922 / 116; older-horizontal 2,392 / 2,164 / 228; crowded-vertical
  2,600 / 2,216 / 384; lane-push 72 / 72 / 0);
- bays, every rack's footprint (the saved push-backs included), the beam-rack BOM, Generate's result and the PDF;
- every other rack type.

| Case | Line | Before | After |
|---|---|---|---|
| lane-push (2 saved racks, 3 × 4 × 3) | Upright frame | 15 ft × 17 ft 4 in × 24 | 15 ft × 8 ft 8 in × 16 |
| | Row spacer | — | 0 in × 16 (what fits: the saved size kept) |
| | Beam | 54 | 54 |
| | Rail set / Cart / Entry guide | 18 / 54 / 12 | 18 / 54 / 12 |
| | Anchor | 48 | 64 |
| | xlsx rows | 13 | 14 |
| walls-racks (1 saved rack, 2 × 5, 4 levels) | Upright frame | 5 ft × 20 ft × 9 | 5 ft × 8 ft × 3 and 5 ft × 12 ft × 3 |
| | Row spacer | — | 0 in × 6 |
| | Beam | 24 | 24 |
| | Rail set / Cart / Entry guide | 8 / 32 / 4 | 8 / 32 / 4 |
| | Anchor | 18 | 24 |
| | xlsx rows | 13 | 15 |
| A new push-back (library, 3 × 4 × 3) | depth | 17 ft 4 in | 17 ft 10 in (+ the 6 in spacer) |
| | BOM | Frame × 12, Beam 27, Anchor 24 | Frame × 8, Row spacer 6 in × 8, Beam 27, Anchor 32 |

Generate places no push-back (the rack-type choice is parked), so its results don't change in any case.

Screenshots (lane-push with a new push-back, P3, beside the saved ones):
- before: `pushback-frames/before-plan-and-card.png`, `pushback-frames/before-bom.png`
- after: `pushback-frames/after-plan-and-card.png`, `pushback-frames/after-bom.png`

## Tests

**`PF_pushbackFrames.test.js` (16 unit tests):**
- the frame split: 2–6 deep; 3 frames at 2 a frame;
- the BOM at 1 frame (3 deep), 2 frames (PP's example; 5 deep with two frame depths) and 3 frames (the formulas at N = 3);
- spacers per joint;
- the size: new, spacer edit, 3 and 6 deep, the depth handle;
- the drawing's joint gap;
- saved racks: spacer 0, size, drawing and edits kept, their BOM;
- the section's line order.

**`REG-pushback-frames` (real clicks, both REG fixtures):**
1. Place a Push-back from the library: 4 deep, spacer 6, 2 per joint, 4 × 52 + 6 in.
2. The card fields and the hint show.
3. Type `1'` in Row spacer length: 12 in, 6 in deeper, corner held, one undo, and Ctrl+Z goes back.
4. Spacers per joint 3: the size is unchanged, one undo.
5. The BOM tab: Frame 15 ft 8 in × 8 ft 8 in × 8, Row spacer 6 in × 12.
6. Deep 3: 3 × 52 in, "1 frame, no row spacer".
7. The saved racks are still 4 × 52 in.

**Updated expectations (kept tests):**
- `LN_laneEngine`: the new push-back size, the BOM formulas.
- `LF_laneFixes`: anchors 2 × P × 2N; the xlsx row list gains Row spacer.
- `REG-lane-fixes-bom`: lane-push Anchor 48 → 64 in the BOM tab, Tally and xlsx.

**Full suite:** see the final reply.

## Questions for PP

1. **Frames per post line.** The brief gives both "N = ceil(deep / 2)" and "2 to 3 deep = 1 frame, 4 to 6 deep = 2
   frames". These disagree at 3, 5 and 6 deep. I built the ranges: up to 3 pallets a frame, so a 6-deep is 2 frames of 3.
   - ceil(deep / 2) would make a 3-deep 2 frames (2 + 1) and a 5- or 6-deep 3 frames.
   - Switching is one constant (`PUSHBACK_PER_FRAME` 3 → 2), and the formulas are already tested at 3 frames.
   - Which is right?
2. **Saved push-backs list their row spacers at 0 in**, because that is what fits their saved size. Is that acceptable
   until someone types a length, or should a saved rack get 6 in spacers and grow 6 in deeper per joint?
3. **5 deep: which frame carries 3?** I put the odd pallet on the front (LOAD) frame, so a 5-deep is 2 + 3 from the rear.
   Should the 3 be at the rear instead?
