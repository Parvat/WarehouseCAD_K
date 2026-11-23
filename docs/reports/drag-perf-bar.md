# drag-perf-bar — drags under a frame, the drawn-shape bar's order, arrowGeometry gone

Branch `drag-perf-bar`, from master (38d9ffa). Status: **ready**. Full suite on its own: 4480/4481; the one failure was LV-helper's source scan, which expects RackLineLabels to call useLiveObjects() directly (it now goes through useLabelObjects()). The expectation was updated and LV passes; `vite build` passes.

## 1. Drags stay under 16 ms a frame
**What a drag paid for.** A CPU profile of dragging a back-to-back pair on the 50,240-position benchmark showed:
- the rack card re-deriving its usable positions (`RackMain` → `rackPositionsLost` → `narrowAisleBlocks` →
  `faceObstacleGaps`);
- the aisle labels and X marks re-derived from the drag preview;
- the BOM, Tally and summary cards re-reading the store, which a pair's live-flue drag writes every frame.

**What changed:**
- **Deferred to the drop** (`canvas2/settled.js` `useSettledStore`). While a drag is under way, these components read
  the store as it was when the drag began, and don't re-render on the drag's per-frame writes:
  - the aisle labels, X marks and other check marks (`Overlays.jsx`, marks part);
  - the row numbers (`RackLineLabels.jsx`, through `useLabelObjects`);
  - the cards (`cards.jsx`, `summaryCards.jsx`);
  - the BOM tab and the Tally drawer.
  
  On the drop they read the store once. Check already waited for the drop (its live re-check never runs during a drag).
  The dragged objects, their selection outline, the snap guides, and the section names and door badges still follow the
  drag as before. A drag that carries everything moves every label with it, as before.
- **Snapping looks only near the dragged objects** (`canvas2/snapIndex.js`).
  - A grid index of every snap target's drawn box is built once per drag.
  - Each frame, the smart guides and the in-line snap get only the targets within 50 ft of the dragged objects, plus the
    building (walls) and the column grids.
  - Layouts under 200 objects skip the index, exactly as before.

**Benchmark.** Chromium, dev build, 1440 × 900, on the same machine under the same load, master and this branch run
back to back. Frames were timed with `requestAnimationFrame` from the first move to the mouse-up, 60 moves (the drop's
own frame, which does the deferred work once, is not counted). The display's frame is 13.3 ms.

| Drag (50,320 positions) | Master: mean · p95 · frames over 16.7 ms | This branch: mean · p95 · frames over 16.7 ms |
|---|---|---|
| A single rack | 18.2 · 26.8 · **62 of 198** | 13.4 · 13.5 · **1 of 169** |
| A back-to-back pair | 20.5 · 40.0 · **62 of 168** | 13.6 · 13.5 · **4 of 193** |
| A rack in a Row group of 3 rows | 17.8 · 26.8 · **59 of 200** | 13.5 · 13.5 · **3 of 200** |
| A section, by its outline | 15.1 · 26.7 · **21 of 161** | 13.7 · 13.6 · **3 of 120** |
| A door, along its wall | 13.5 · 13.5 · **1 of 180** | 13.3 · 13.5 · **0 of 121** |

Every drag now runs at the display's rate (p95 13.5 ms). The few frames still over 16.7 ms are at a gesture's start
(the selection and the drag's set-up). An earlier, quieter run of the same benchmark gave 0 frames over on every drag
here, against 3 to 28 on master; the machine's own load moves the absolute numbers, not the gap.

**Nothing visible changes after the drop.** After all five drags, the benchmark hashed:
- every object's place and size: **1619495925** on master and here;
- the canvas pixels: **-1043877074** on master and here.

REG-drag-defer checks the labels against a fresh load (below).

## 2. The drawn-shape bar's order
- **Bar** (a line, arrow, elbow, polyline, rectangle or circle): stroke colour and fill colour side by side (the fill
  colour on a closed shape), then stroke width, solid, dashed, fill none / tinted / hatched (a closed shape), corners,
  end style (where it applies), the ruler, then lock, duplicate, delete, more.
- **Card**, the same order:
  - Colour (stroke and fill swatches side by side);
  - Stroke (width);
  - Line (solid or dashed);
  - Fill (none, tinted, hatched);
  - Corners (and the radius);
  - Arrowheads;
  - Dimensions.

## 3. `utils/arrowGeometry.js` removed
Nothing imports it since `_svg_reference` went (`vite build` passes).

## Decisions made
- **Deferred also means held during the drag.** The aisle labels and X marks stay where they were until the drop,
  instead of following the drag. That is the price of not re-deriving them every frame; on the drop they are exactly
  what a fresh load draws.
- **Row numbers hold during a drag too**, like the aisle labels (`useLabelObjects`). Re-placing them every frame was the
  next cost in the profile.
- **A drag that carries everything** (a building with all its racks, or Ctrl+A) still moves every label and mark with
  it. That case re-derives nothing, and REG-live-overlays checks it.
- **Section names and door badges still follow the drag.**
- **"Near" is 50 ft** around the dragged objects. A snap reaches at most 12 screen px or 1 ft, so a target farther than
  50 ft can never catch.

## Tests
- **REG-drag-defer** (new, real mouse, all 4 fixtures):
  - a rack beside an aisle is clicked, then dragged 2 ft across with Alt held;
  - mid-drag, the aisle labels and the card's text are unchanged;
  - after the drop, the labels have changed and are identical to a fresh load of the saved layout.
- **Updated** (the order the user set):
  - REG-selbar-drawn's two bar lists and REG-elbow-arrow's bar list;
  - LY-select and RG-snap's source scans of the snap line, which now goes through `nearTargets`.
- **Re-run:** REG-draw-style-card, REG-rect-extras, REG-dropdown-attached, REG-shape-dims and REG-stacking pass with
  the new card order.

## Rule 9 basics on what changed
- **Drags:** move, snap to walls, edges and columns (near), and Alt for no snap are unchanged. Undo is one step per
  drag. The cards, BOM and Tally show the dropped state.
- **The bar:** every control is the same, only the order changed; REG-basics runs it in the full suite.

## Dealer walkthrough
On the benchmark layout:
- drag a rack, a pair, a grouped row, a section and a door: each follows the mouse with no stutter, and the labels and
  card update on release;
- select a rectangle: its bar reads ink ring, fill dot | width, solid, dashed | none, tinted, hatched | square, round |
  ruler | lock, duplicate, delete, ⋯;
- its card reads Colour, Stroke, Line, Fill, Corners, Dimensions.

## Hand-check (≤ 6)
1. Open a big layout (or Generate a large building) and drag a rack, then a back-to-back pair. Both follow the mouse
   smoothly. The aisle labels and the card update when you let go.
2. Select a row with others in a Row group (G) and drag it. Smooth; the group follows on release as before.
3. Drag a section by its outline, then a door along its wall: smooth, and both land where they did before.
4. Select a rectangle. The bar starts with the stroke and fill colours side by side, then width, solid/dashed,
   fill none/tinted/hatched, corners, the ruler, lock, duplicate, delete, ⋯.
5. Select an arrow. The same, with no fill items and End style after corners. Its card follows the same order.
6. `npm run build` passes.
