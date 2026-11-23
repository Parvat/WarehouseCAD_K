# Monday — unattended runs

## Round 2 (2026-11-23)

One line per branch, each from master (87fcc55). Reports are in each branch's `docs/reports/`, and all are merged into
`monday2-all`. All branches are pushed.

| # | Branch | Status | Report | Note |
|---|---|---|---|---|
| 1 | fill-columns-a | **parked** | docs/reports/fill-columns-a.md | option A broke Row group alignment; options C/D/E there |
| 1′ | fill-columns-e | ready | docs/reports/fill-columns-e.md | option E (asked for after): Check's Slide off column; Fill unchanged |
| 2 | stacking | ready | docs/reports/stacking.md | equipment/safety/ops/annotations on top; the click takes the top one; Send to back / Bring to front; Tab hint |
| 3 | shape-dims | ready | docs/reports/shape-dims.md | the ruler toggle on Line, Arrow, Elbow, Polyline, Rectangle, Circle |
| 4 | units-2 | ready | docs/reports/units-2.md | Project settings, Generate, Fill and Door bars, elevation: every length in the project's units |
| 5 | flaky-tests | ready | docs/reports/flaky-tests.md | REG-door-types waits on state; stable in the full suite |
| 6 | r2-double-deep | ready | docs/reports/r2-double-deep.md | Double-deep Rack; Deep reach truck; a pair's card title is now Back-to-back |
| 7 | perf | ready | docs/reports/perf.md | drag 62 → 20 ms, zoomed pan 65 → 18 ms at 50,240 positions; culling pixel-checked |
| 8 | cleanup | ready | docs/reports/cleanup.md | 17 unreachable files removed; on monday2-all, `src/_svg_reference` deleted too (approved) |
| 9 | polish | ready | docs/reports/polish.md | dark colour swatches ringed; the other Polish items change behaviour or need a design icon |
| — | **monday2-all** | see below | this file | flaky-tests → cleanup → polish → perf → units-2 → stacking → shape-dims → r2-double-deep → fill-columns-e, then the `_svg_reference` deletion (735ee26) and the REG-units-2 fix (380497d) |

**Conflicts while merging, all resolved:**
- REG_handCheck: three tests (perf-cull, stacking, double-deep) were added at the same place. All three are kept, each
  checked identical to its own branch.
- The drawn-shape bar lists in three REG tests: the combined bar is Dimensions (shape-dims) before Lock, and More
  (stacking) after Delete.
- Import lines in Scene.jsx, drawnBar.jsx and cards.jsx: both sides kept.

**Full suite on monday2-all:** **4477/4477 green** (the second run, after one test fix). The first run, which shared the machine with a stopped earlier run, had 11 failures: 4 were real, REG-units-2 finding Reach truck's field by a name that 'Deep reach truck' (r2-double-deep) also contains, fixed with an exact match (380497d); 7 were load timeouts (5 page loads, 2 unit tests at 20 s), and each of them passes on its own. `vite build` passes.

`utils/arrowGeometry.js` is now unreachable: only `_svg_reference` imported it. It is the next cleanup line, if you
want it.

### Merge

```
git fetch . monday2-all:master monday2-all:canvas2-clean-start
git push origin master canvas2-clean-start
```

fill-columns-a is not in it. It stays parked: option E replaces it.

### Combined hand-check (15 steps, in this order)
Use older-horizontal (or any layout with racks on columns), Imperial 1″.

**Check and columns**
1. **Check**: each "column stands on an upright frame" item has **Slide off column**, and nothing has moved yet. Click
   one: that row slides a few inches and the item goes. Ctrl+Z brings it back.
2. Put that row and the same row of the next section in a Row group (G), then Slide off column: both rows slide
   together and still line up.

**Stacking**
3. Racking → **Drive-In Rack**, then Ops → **Forklift** dropped on top of it. Click the Forklift: it is selected, and
   "Tab for the next one under here" shows by the pointer. Press Tab: the rack.
4. Right-click the Forklift → **Send to back** / **Bring to front** (one undo each). Draw a filled rectangle over a rack
   and click inside it: the rectangle.

**Double-deep**
5. Racking → **Double-deep Rack** on open floor: 7′-6″ deep, with a dashed line through each bay. The card reads
   **Double-deep**, positions twice a selective rack's, with Number deep, Deep spacing and Back-to-back.
6. Turn on **Back-to-back**: 4 deep (Ctrl+Z undoes it). **Check** says "needs a deep-reach truck". Project settings →
   Forklift: **Deep reach truck** → Check again: the warning is gone. An ordinary pair's card title is **Back-to-back**.

**Drawn shapes**
7. Draw a rectangle and an arrow. Each bar has the **ruler** (off). Turn it on: width on top, length on the right, area
   inside; the arrow's length above it. Drag a side: the numbers follow. Their ⋯ menu has Send to back / Bring to
   front.
8. Zoom in and out: the dimensions stay the same size on the drawing. Export the PDF: the dimensions and the
   Forklift-over-rack order print.

**Units**
9. Project settings → Units: **Metric** → Save. Reopen: forklift aisles, heights and pallets read mm. Type `3.5 m` in
   Reach truck's aisle → Save.
10. Press F: the Fill bar's Aisle reads 3500 mm. Click a wall → Add door → Width `1200`: the door placed is 1200 mm.
    Project settings → Imperial 1″: everything reads as before, and nothing moved.

**Speed and look**
11. Open a big layout (or Generate a large building). Drag a rack: it follows smoothly. Zoom in a lot and pan: racks are
    there as they come into view; nothing pops in.
12. Select a rack, zoom far away, then pan back: still selected and drawn. Face-aisle labels and red ✕ marks look as
    before.
13. A text's card → Text colour: the dark ink swatch (top left) has a ring and is visible.

**Housekeeping**
14. Click a wall → Add door: Man, Dock and Drive-in doors place at 3, 9 and 12 ft as before.
15. `npm run build` passes. The rail, flyouts, cards and canvas look as before (old panels and the SVG canvas are gone
    from the code, not from the app).

## Round 1 (2026-11-20)

Merged to master as `monday-all` (87fcc55): d1-trim, basics-triage, basics-fixes, lane-positions, small-bugs, units.
fill-columns parked (now fill-columns-a, and option E: fill-columns-e above).
