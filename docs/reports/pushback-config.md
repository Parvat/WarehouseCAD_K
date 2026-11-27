# pushback-config — the push-back frame split as dealer settings

Branch `pushback-config`, from master 5a591ec (lane-fixes + pushback-frames).

PP is not sure how a push-back's frames split, and dealers differ, so the split is now set on the card. **The defaults are
a guess to confirm with dealers** (recorded in EPICS.md and FEATURES.md).

## What changed

**Two new card fields** (Size section, push-back only, under Row spacer length and Spacers per joint):
- **Max pallets per frame**, default 2, allowed 2 to 6. A whole number of pallets, one undo. A value outside 2 to 6 is
  refused and the field goes back.
- **Longer frame at**, Front or Rear, default Front. One undo. It only matters when the depth does not split evenly.

**The rule:**
- N (frames per post line) = ceil(deep / Max pallets per frame).
- The pallets split as evenly as possible across the frames. The longer frames go to the chosen end.
- Example: 5 deep at max 3 is 3 + 2 with Front and 2 + 3 with Rear.
- The line under the fields lists the frames **front first**, e.g. "3 frames (2 deep + 2 deep + 1 deep) joined by 6 in row
  spacers". (Before this round it listed them rear first. Front first is the reading that matches the brief's example.)

**Everything follows N:**
- the depth: frames + one row spacer per joint;
- the drawing: the joint gaps sit where the frames meet, so Rear moves them;
- the aisle check and dimensions, which use the depth;
- the BOM, with the existing formulas (L lanes, V levels, P = L + 1, J spacers per joint):

  | Part | Qty |
  |---|---|
  | Upright frame | P × N, listed by frame depth |
  | Row spacer | P × (N − 1) × J, listed by length |
  | Beam | L × V × (N + 1) |
  | Rail set | L × V |
  | Cart | (D − 1) × L × V |
  | Entry guide | 2 × L |
  | Anchor | 2 × P × 2N |

**Saved push-backs are unchanged.** A push-back saved without the fields reads Max 3 and Front: exactly the split it has
had since pushback-frames. Its size, drawing and BOM don't change on load, and its card shows 3 and Front. Nothing is
written to the rack on load. An edit writes the two fields with those same values.

## Rule 7 — master 5a591ec / this branch

The same 12 cases and script as pushback-frames:
- the demo file;
- the 4 fixtures;
- lanes-horizontal, crossaisle-drivein, zone-lane, walls-racks;
- lane-drive, lane-push, lane-flow.

The result is **identical in every case**: card totals, rack counts, bays, every rack's x / y / width / height /
rotation, picks, overlap and face marks, rack numbers, beam lines, every BOM line (beam rack and push-back), flags, save and
reload, PDF and Generate. The saved push-backs (lane-push P1 and P2, walls-racks P1) read max 3.

The only change is a push-back **newly placed from the library**, now at max 2 per frame (3 × 3 levels, 6 in spacer, 2 per joint):

| New push-back | Before (max 3) | After (max 2) |
|---|---|---|
| 2 deep | 1 frame, 8 ft 8 in deep | the same |
| 3 deep | 1 frame (3), 13 ft; frames 4, no spacer, beams 18, anchors 16 | **2 frames (2 + 1)**, 13 ft 6 in; frames 4 + 4, spacers 8, beams 27, anchors 32 |
| 4 deep (the library default) | 2 frames (2 + 2), 17 ft 10 in | the same |
| 5 deep | 2 frames (3 + 2), 22 ft 2 in; frames 8, spacers 8, beams 27, anchors 32 | **3 frames (2 + 2 + 1)**, 22 ft 8 in; frames 12, spacers 16, beams 36, anchors 48 |
| 6 deep | 2 frames (3 + 3), 26 ft 6 in; frames 8, spacers 8, beams 27, anchors 32 | **3 frames (2 + 2 + 2)**, 27 ft; frames 12, spacers 16, beams 36, anchors 48 |

Generate places no push-back, so its results don't change.

## Tests

**`PC_pushbackConfig.test.js` (16 unit tests):**
- a new rack's defaults;
- max 2, max 3 and max 6 at 2 to 6 deep;
- values outside 2 to 6 held to the range;
- Front and Rear: 5 deep at max 3 and at max 2, an even split, only the order moving (same size, same BOM), the drawing's
  joint gaps;
- the depth and BOM of a new 3-deep (2 frames) and 5-deep (3 frames);
- Max changed: the depth follows with the corner held;
- saved racks: they read 3 / Front with the old split and size; an edit keeps them; their BOM is unchanged.

**`REG-pushback-config` (real clicks):**
1. Place a push-back from the library: the card shows 2 and Front.
2. Set 5 deep: "3 frames (2 deep + 2 deep + 1 deep)", 5 × 52 + 12 in deep.
3. Max 3: 3 + 2, a spacer less deep, the corner held, one undo.
4. Rear: 2 + 3, the size kept, one undo; Ctrl+Z goes back to Front.
5. Max 6: 1 frame. Typing 9 is refused.
6. The saved P1's card shows 3 and Front, with nothing written to it.

**Updated expectations (tests kept):**
- `REG-pushback-frames`: a new 3-deep is now 2 frames (2 + 1), 3 × 52 + 6 in. It was 1 frame.
- `PF_pushbackFrames`: the 1-frame 3-deep and the 5-deep cases are now set at max 3; the spacer-edit depths follow max 2.
- `LF_laneFixes`: the beam-lines check reads the rack's own max per frame.

**Full suite:** 4,707 / 4,707 passed (122 files), first run.

## Questions for PP

1. **The defaults** (Max pallets per frame 2, Longer frame at Front) are a guess. Should they be confirmed with one or two
   dealers before a customer job?
2. **The card line now lists frames front first.** Is that the reading a dealer expects, or should it say "front" and
   "rear" in words (e.g. "front 3 deep + rear 2 deep")?
