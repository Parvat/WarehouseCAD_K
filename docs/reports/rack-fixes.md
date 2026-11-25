# rack-fixes — overlap red on every rack, lane arrows, Tab then drag, lighter pallet slots

Branch `rack-fixes`, from `overnight-rack-design` (03e0e51). Status: see the last line.

## Step 0
The full suite on `overnight-rack-design` before anything else: **4518 / 4518 passed** (115 files). Nothing to fix.

## 1. Overlap red for every rack type
- **What "today's beam overlap red" is.** Two beam racks overlapping get a red X on each pallet position the other covers.
  The X comes from the pick-width check, `generate/narrowAisles.js`: a face with no room in front of it.
  Check layout then lists "R1 overlaps R2 by …", using `rackIssues` in `utils/bayBeam.js`.
  A drive-in on a beam rack had neither mark: the pick-width check only looks at beam racks.
- **Now** (`render/overlapOps.js`, new): any pair where one rack is not a beam rack gets the same red X, in the same red
  (#C0392B) at the same width, on each position of either rack the other covers. "Positions" means the pallet slots the
  rack draws; a rack drawn without slots gets one X over the overlap area.
  - Which racks overlap is `rackIssues`' rule, unchanged: the boxes overlap, and a shared end frame is not an overlap.
  - The words are Check layout's, unchanged: "R1 overlaps …".
  - Two beam racks keep exactly today's marks. They are left out here, so a beam-only layout draws exactly as before.
- **While dragging and after the drop.** The marks are drawn from the drag preview (`canvas2/Overlays.jsx`). The other
  marks wait for the drop on purpose, for speed (drag-perf-bar); these do not. They go the moment the overlap does. A
  move is still one undo. The PDF prints them too.
- **Mezzanine.** `rackIssues` no longer counts a mezzanine either way. There is no red under or over one, and nothing in
  Check layout.
  - Also: a selective placed under a mezzanine used to be refused, because placement uses the same rule. It is allowed now.
- **Not changed:** a non-beam rack's positions lost to an overlap are not taken off the usable count (that would change
  capacity, a rule change). Only the drawing and Check layout show it.

## 2. Lane arrows
- **Drive-through:** a pair of arrows per lane. The bottom end's, in the front pallet, point up into the lane; the top
  end's, in the back pallet, point down into it.
- **Every lane and flow rack** (drive-in, drive-through, push-back, pallet flow): the arrow's stroke is a real **2″**,
  `ARROW_STROKE_IN`; it was 2 screen px. Length, head and stroke all scale with the drawing like the face bars. There is
  no minimum, so the arrows never get thicker as you zoom out: about 6.7 px at 100 %, 2 px at 30 %, 1 px at 15 %.
  - 2″ was chosen because it matches the mockup's 2 px at 30 %.

## 3. Tab then drag
- **Before:** Tab selected the object under the top one, but a drag from there moved the top one.
- **Now** (`canvas2/useCanvasInteraction.js`, on the press): if the selected object is in the stack under the pointer
  (`hitTest.stackAt`) and the top one is not selected, a drag moves the selected one. A click without a drag still
  selects the top one, on the release (Rule 9). This works for every object type.
  - Never the building or a section: those are the floor. With a building selected, a press on a rack still moves
    the rack.
- **Seen, left as it is:**
  - A drawn shape that is selected keeps a press inside its box (the polyline rule from an earlier dealer audit). So
    with a text Tabbed to under a rectangle, a click there keeps the text.
  - A text dragged on its own moves only down, by less than the mouse did. In the test, a drag of (120, 80) px at
    50 % moved it (0, 142) instead of (240, 160). That happens with no Tab and no stack, and it was already so before
    this branch. I've added it to the Polish list as a bug to look at; it was not fixed here.

## 4. Pallet positions
- **Selective, back-to-back, double-deep:** their pallet slots are lighter: **0.75 px, dash 2 3, the family tint at 55 %**
  (`BEAM_SLOT`). The PDF prints the same (`stroke-width="0.75" stroke-dasharray="2,3" opacity="0.55"`).
  - On screen a 0.75 px line at pixel ratio 1 is drawn as that fraction, not rounded up to 1 (`render/hairlines.js`).
- **Every other rack:** unchanged (1 px, dash 4 3, full tint).
- Counts, badges, the BOM and positions: unchanged (see Rule 7).

## Rule 7 (relaxed): before = overnight-rack-design 03e0e51, after = rack-fixes
| Layout | Racks | Card, BOM, picks, save→load, PDF, Regenerate | New reds | Check layout overlaps |
|---|---|---|---|---|
| demo-warehouse.wcad | 15 (7 rows, 8 pairs) | identical | 0 | 0 → 0 |
| older-horizontal | 12 | identical | 0 | 0 → 0 |
| older-vertical | 14 | identical | 0 | 0 → 0 |
| crowded-horizontal | 12 | identical | 0 | 0 → 0 |
| crowded-vertical | 14 | identical | 0 | 0 → 0 |

No surprise: none of these layouts has a non-beam rack or a mezzanine, so the new red has nothing to mark there.

## Screenshots (`docs/reports/rack-fixes/`, before- and after-)
Each shot is the same scene: every rack type on open floor, a drive-in over a selective (R6), and a selective under a
mezzanine.

| Shot | What changes |
|---|---|
| `scene-15`, `scene-30-left`, `scene-30-right` | The red X on the drive-in over R6. The drive-through's top arrows. The lighter beam slots. The arrows at 15 %, thinner than at 30 %. |
| `selected-drive-through-15/-30`, `selected-pallet-flow-15/-30` | The same, selected (the rotate handle is Task 2's item 7, rack-followup). |

## Tests (new, real clicks)
- **REG-overlap-all-types:**
  - a drive-in, pallet flow, cantilever and shelving each dragged onto a selective: red during the drag and after the
    drop, Check layout's overlap with both, one undo, red gone when dragged off;
  - a mezzanine: no red.
- **REG-lane-arrows:** a drive-through from the library has a pair per lane, pointing into the lane at both ends; the
  shaft measured on screen at 100, 30 and 15 % thins with the zoom.
- **REG-beam-slots-light:** the three beam types light, the drive-in unchanged, on the plan and in the PDF.
- **REG-basics-tab-drag** (in REG-basics, both of its fixtures): rack + forklift, forklift + rectangle, rectangle + text.
  For each:
  - a click takes the top object, and Tab takes the one under it;
  - a drag moves only the lower one, with one undo;
  - a click still takes the top one.
- **Updated unit tests:** rackOps (slot style), rackOpsLanes (the drive-through's 8 arrows), PX-hair (a fraction of a
  device px).

## Hand-check
1. Drag a drive-in onto a selective: red X marks on both while dragging, and after the drop. Drag it off: gone. Ctrl+Z.
2. Drag a mezzanine over a rack: no red.
3. A drive-through: arrows at both ends pointing into the lanes. Zoom out from 100 % to 15 %: the arrows get thinner,
   never thicker.
4. Put a forklift on a rack, click it, press Tab (the rack is selected), and drag: only the rack moves. Ctrl+Z.
5. Selective, back-to-back and double-deep slots are fainter; a drive-in's are as before. Check the PDF too.

Status: **done**. The new REG tests and the related unit tests are green. The full suite runs once, on rack-followup (end of run).
