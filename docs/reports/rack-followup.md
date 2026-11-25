# rack-followup — R numbers on every rack, every library type follows the mouse, the rotate handle

Branch `rack-followup`, from `rack-fixes` (c1e56df). Status: see the last line.

## 5. R numbers for every rack
- **Who gets one.** Every rack type now has an R number: beam, lane, flow, cantilever and shelving. A mezzanine is a
  platform and gets none.
  - The new helper is `utils/rackLines.js` `rackNumbersNow`.
- **Order.** The beam racks come first, numbered exactly as today: `numberLines`, unchanged, the BOM's and the Tally's
  lines. Every other rack comes after them, Rn+1 …, in the same order: section, building, the up-and-down ones first,
  then across, then along.
  - Each one is its own line: none of these types stands in a line or pairs, so the R2–R3 pair label (Rule 8) stays the
    back-to-back pair's only.
  - Nothing is stored. The numbers are recomputed on every add, delete, duplicate and undo, as the beam lines are, so
    they stay R1…Rn with no gaps.
- **Per-section numbering.** The others continue each section's own count after its beam lines (`utils/lineNames.js`),
  so the beam names do not change.
- **No BOM line.** The BOM, the Tally and Check layout still read the beam lines only, so these types get a number but
  no BOM line. The beam BOM is identical before and after (Rule 7).
- **Where the number goes.** At the rack's start end, beside it, as the mockup draws it (R6–R11 in
  design/rack-plan-colour.png).
  - They are placed in a second pass, after the beam numbers, which are placed exactly as before.
  - They keep clear of:
    - the beam numbers;
    - the aisle and cross-aisle width labels, their arrows included;
    - the face widths between racks and walls;
    - the column clearance warnings, and the columns;
    - every rack.

    Each slides along its end to find room, else it is left out (Rule 8).
  - `canvas2/RackLineLabels.jsx` `placeRowLabels`. The column chain and the section names keep clear of them through the
    same function.

## 6. Every library type follows the mouse
- **The flow.** Drive-in, drive-through, push-back, pallet flow, cantilever, shelving and mezzanine now place the way
  Selective does (`components/LeftPanel/FloatingToolbar.jsx`):
  - picked, a ghost follows the mouse;
  - a click places one and goes back to Select, one undo;
  - Esc cancels with nothing placed;
  - a double-click on the library row keeps the tool on until Esc.
- **Snap** (`utils/placement.js`):
  - the box snaps onto a wall's inner face, or a rack's edge, within 12 screen px, and stays inside the walls, as a zone does;
  - Alt held: no snap, centred on the mouse.
- **Blocked:** where it overlaps a rack, the ghost turns red and the click does nothing, the same as a row. A mezzanine
  is never blocked.
  - These types are not blocked outside a building. They could always be placed anywhere.
- **Not changed:** Selective, Back-to-back and Double-deep place, snap and block as before. Alt is read only for the new
  types.

## 7. The rotate handle
- **Where it sits now.** On every rack it sits outside the outline, past any top face word, and past the selected rack's
  own size label above it. It keeps the same fixed screen gap beyond them as before (`canvas2/handleGeometry.js`
  `rotateHandlePos`).
  - The top face words are ENTRY and LOAD.
  - The size label is a lane rack's "2L × 5D × 4 · 40 PAL" or a cantilever's spacing.
  - The face words and the size label are drawn at real size, so the lift scales with the drawing, and the handle never
    covers either at any zoom.
- **The size label too.** The first try cleared the words but put the handle on the size label, so that label is
  allowed for as well.
- **Rotating** works exactly as today, and the hit area moves with the handle.

## Rule 7 (relaxed): before = rack-fixes c1e56df, after = rack-followup
| Layout | Beam numbers (lines, ids, sides) | R labels drawn | Racks, bays, card, BOM, picks, save→load, PDF, Regenerate |
|---|---|---|---|
| demo-warehouse.wcad | identical | 22 → 22 | identical |
| older-horizontal | identical | 11 → 11 | identical |
| older-vertical | identical | 14 → 14 | identical |
| crowded-horizontal | identical | 11 → 11 | identical |
| crowded-vertical | identical | 14 → 14 | identical |

No beam number changed anywhere, so item 5 was not parked. These five layouts hold beam racks only. On a layout with
other types (the screenshot scene), the beam racks keep R1–R6 and the others follow as R7….

## Screenshots (`docs/reports/rack-followup/`, before = rack-fixes, after = this branch)
| Shot | What changes |
|---|---|
| `scene-15`, `scene-30-left`, `scene-30-right` | R numbers on the lane, flow, cantilever and shelving racks after the beam ones; none on the mezzanine. |
| `selected-drive-through-15/-30`, `selected-pallet-flow-15/-30` | The rotate handle above ENTRY / LOAD and above the size label (before: on the word). |

## Tests (new, real clicks)
- **REG-rack-numbers-all** (4 fixtures):
  - on the saved fixture, the drawn numbers are the beam lines' exactly;
  - on a building of every type: R1–R2 are the beam racks, R3–R6 the others, the mezzanine has none, and no number
    overlaps a label or a rack;
  - Delete on the drive-in closes them up, and Ctrl+D on the pallet flow adds R7; each undo restores them;
  - the BOM has the beam lines only.
- **REG-library-ghost:** each of the 7 types: the ghost follows the mouse, snaps onto a wall, Alt turns that off, Esc
  places nothing, a click places one and returns to Select with one undo, and a double-click keeps it on until Esc.
- **REG-rotate-handle** (4 fixtures): drive-in, drive-through, push-back, pallet flow and selective at 15, 30 and 100 %.
  The handle and its stem stay above the outline, its words and its size label. Dragging it still turns the rack 90°,
  with one undo.
- **REG-basics Racking:** the tool-flow checks (Esc cancels, back to Select, a double-click keeps it on) must pass for
  every rack type. These were n/a for 7 types; they are a hard fail now.
- **REG-basics, a finding: double-click keep.** On last night's branch, the check failed for Selective, Back-to-back,
  Double-deep and the filled-building Selective: 4 failures per fixture, confirmed by rerunning it on 03e0e51.
  rack-basics.md said 0 failed; that was wrong.
  - The fault was the test, not the app. Its two clicks landed below the building, where a row is refused as outside
    the building, so nothing was placed.
  - The check now moves the mouse until the ghost has room, then clicks. All 11 pass, and the filled building, with no
    room left, is n/a.
  - REG-rack-library-keep, which clicks inside the building, always passed.
- **REG-stacking:** the setup centres the view on the drive-in before the forklift drops. The drive-in follows the mouse
  now, so the two no longer stacked. The stacking checks themselves are unchanged.

## Hand-check
1. Open an old file: the R numbers are as before. Add a drive-in: it gets the next number. Delete it: the numbers close
   up. Ctrl+Z.
2. Add a mezzanine: no number.
3. Pick each lane, flow and other type in the library:
   - a ghost follows the mouse and snaps to a wall; hold Alt and it doesn't;
   - Esc places nothing;
   - a click places one, then the tool is back to Select;
   - a double-click on the row keeps it on until Esc.
4. Select a drive-through and a pallet flow at 15 % and 30 %: the rotate handle sits above the word and the size label,
   and turning it still works.

Status: see docs/MORNING.md.
