# basics-triage — the REG-basics harness fixed, real failures only

Branch `basics-triage`, from `d1-trim`. No app changes: the test harness only. Status: **ready**.

## What changed (the harness, `src/__test__/plan/REG_handCheck.test.js`)
- **Racks are placed inside the building.** Before each rack type, setup clears the building's racks, aisles and sections, then places the rack at the most open spot near the middle (14 ft clear of columns and walls). Its paste and duplicate also land inside. Before, all three beam racks failed "place": they were dropped outside the building.
- **A rack in a filled building** (new case, as you asked): one fixture row near the middle is removed (setup), and a Selective Rack is placed where it was, between real racks. Its snap and overlap are tested against them.
- **Columns:** the Columns layer is unlocked before a Column or a Column Grid is tested.
- **Buildings** (Floor Plans) are tested in an empty layout. Before, the fixture's own building took their clicks.
- **Exemptions by design**, recorded n/a with the reason, not as failures:
  - doors (Dock, Man, Drive-in): move, snap and Alt — "doors move along their wall only";
  - a column grid: lock — "a column grid follows the Columns layer lock";
  - Line and Elbow arrow: typed value — "drawn annotations have no typed values";
  - a building: snap and Alt — "a building is the walls others snap to" (my addition).
- **False failures removed:**
  - a rack's snap now counts the project's wall clearance line as the wall (racks stop there by design);
  - a rack's picked bay (`activeBayIdx`, set by a click) is selection, not a change;
  - an object gone after the delete/undo/redo steps is reported as a failure, not a crash.

## Real failures (both fixtures; OH = older-horizontal, CV = crowded-vertical)
90 object types × checks fail in total, down from 220.

### 1. Bugs — 23 types, roughly 2–3 days
| Area | Types | Failing |
|---|---|---|
| Lock does not hold | Selective, Rack Row, Double Row (+ the filled-building case) | a drag or Delete still changes a locked rack |
| Undo after move needs 2+ steps | Drive-Through, Pushback, Pallet Flow | Ctrl+Z after a move does not put it back in one step |
| Zone resize does nothing | Staging (OH), Washroom, Custom area | a handle drag changes nothing |
| Zone snap | Office (both), Staging (CV) | not onto the wall face; Alt changes nothing |
| Selection — click | VNA, Sprinkler Head, High-Bay Light, Bollard, Rack Protector, Aisle Sign, Column/Pillar (OH) | a click does not pick it |
| Selection — box | most Ops and Safety items, Partition Wall, Window, Man/Drive-in/Dock Door, Column/Pillar | a box round it does not include it |
| Selection — Shift / Tab | Conveyor, Charging Station, Guardrail, Safety Netting, Partition Wall, Drive-in Door (OH) | Shift+click does not add it; Tab does not pick it |
| Resize | Bollard (OH), Partition Wall (CV) | a handle drag changes nothing |
| Snap to wall (CV) | 9 Ops items, Bollard, Safety Netting, Aisle Sign, Column/Pillar | dropped 3 px from the wall face, not onto it |
| A building is lost | L-Shape, T-Shape | after Delete → Ctrl+Z → Ctrl+Y → Ctrl+Z it is gone (and resize, copy, paste, duplicate fail) |

Many selection failures are older-horizontal only, so part may depend on what lies near where the item lands. I'll confirm each one in basics-fixes before changing anything.

### 2. Missing on PDF — 20 types, roughly 1 day
All 12 Ops items, all 5 Safety items, Column / Pillar, Partition Wall, Window / Skylight. The plan's SVG is the same with and without them.

### 3. Missing typed values in cards — 29 types, roughly 1–1.5 days
- **Racking:** Cantilever, Drive-In, Drive-Through, Pushback, Pallet Flow, Mezzanine, Shelving.
- **Ops:** all 12 items.
- **Structural:** Column / Pillar, Partition Wall, Window / Skylight.
- **Safety:** all 5 items.
- **Floor Plans:** L-Shape, T-Shape.

None of these cards has a number field for the object's size. Plan: one shared size block (width, depth, length, height as the object has them).

### 4. Other — needs your decision, about half a day once decided
- **Column Grid:** not picked, boxed, moved, resized or snapped as one object, and its node does not report a size for the zoom check. Columns are picked one by one (col-grid round). Is the grid meant to be one movable object?
- **Buildings (all 7 shapes):** picked by the wall, never by box select or Shift. A drag on the wall does not move the building. These look by design: the floor is open ground and the walls are edited. Should a building be movable as a whole?
- **Filled building:** paste and duplicate onto existing racks are refused. That is the overlap rule, by design. Box, Shift and Tab fail on older-horizontal only and resize fails on crowded-vertical only; I'll check these in basics-fixes.

## Checks
- REG-basics (all groups) re-run on both fixtures. The draw tools stay green: 0 real failures.
- Full suite on its own: see below.
- No dealer walkthrough: the app is unchanged.

## Hand-check (≤ 6)
1. Place a Selective Rack in an open spot, press Ctrl+L, then drag it: it moves (bug 1).
2. Place a Drive-Through Rack, drag it, press Ctrl+Z once: it is not fully back (bug 1).
3. Place a Staging zone and drag a corner: nothing changes (bug 1).
4. Place a Forklift and export the PDF: it is not on it (group 2).
5. Select a Pushback Rack: its card has no width or depth field (group 3).
