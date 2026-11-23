# cleanup — dead code from the SVG canvas and the old panels

Branch `cleanup`, from master (87fcc55). Status: **ready**. Full suite on its own: **4453/4453 green**; `vite build` passes. Nothing visible changes: every
file removed was unreachable from the app.

## How dead code was found
An esbuild bundle of the app's entry (`src/main.jsx`) gave the module graph. 254 of the 300 source files outside
`__test__` are reachable; 46 are not. Of those 46, a file was removed only if all of these held:
- nothing reachable imports it;
- no test imports it, reads its source, or loads it in the browser (`import('/src/…')`);
- no file that stays (protected, test-used or reference) imports it;
- it is not a protected file (CLAUDE.md).

`vite build` passes afterwards.

## Removed (17 files)
| File | What it was |
|---|---|
| `components/icons/Column.jsx`, `DockDoor.jsx`, `Forklift.jsx`, `Pallet.jsx`, `Rack.jsx`, `index.js` | the old hand-drawn icon set (Studio uses `studio/iconData.js` only) |
| `components/LeftPanel/index.jsx` | the old left panel (CLAUDE.md: "exists but is not rendered") |
| `components/LeftPanel/DrawingTools.jsx`, `FloorPlanPicker.jsx`, `ForkliftPanel.jsx` | its sections, imported only by it |
| `components/LeftPanel/CustomObjects.jsx`, `FloorPlanTools.jsx`, `ObjectLibrary.jsx` | older left-panel parts, imported by nothing |
| `components/RightPanel/FloorPlanPanel.jsx` | the pre-Studio floor plan panel |
| `components/shared/Disclosure.jsx`, `components/shared/Fold.jsx` | old panel folds (Studio's card uses `cardParts` Fold) |
| `utils/cn.js` | a class-name helper nothing calls |

## Kept, and why (the other 29 unreachable files)
- **Protected (CLAUDE.md), not touched:** `utils/warehouseSnap.js`, `utils/geometricSnap.js`,
  `components/Canvas/FloorPlan.jsx`.
- **`src/_svg_reference/` (19 files): the old SVG canvas, kept for approval.** These are the SVG engine's Canvas files
  (CanvasArea, CanvasObjectCore, ShapeGeometry, KonvaStage …), moved out of `components/Canvas/`. CLAUDE.md protects
  "the Canvas/*.jsx logic files", and its open blocker still names `CanvasObjectCore.jsx` and `ShapeGeometry.jsx`.
  Deleting them could be removing protected files without approval (Rule 4), so they stay. **If you approve, the next
  step is one commit removing `src/_svg_reference/` and `utils/arrowGeometry.js` (only they import it).**
- **`utils/arrowGeometry.js`:** imported by `_svg_reference` (above).
- **Still used by tests:**
  - `canvas2/ElevationsCanvas.jsx` (EV reads its source);
  - `canvas2/SectionNames.jsx` (REG loads it in the browser; LV reads it);
  - `components/Elevations/ElevationLine.jsx` (SB reads it);
  - `components/LeftPanel/WarehouseObjectPicker.jsx` (LY reads it);
  - `components/RightPanel/panels/AisleLabelSize.jsx` (FU imports its functions);
  - `render/overlayOps.js` (overlayOps.test).
  
  Each is a candidate once its test is retired; no test was deleted here.

## Rule 7
No layout rule changed.

## Hand-check (≤ 6)
1. `npm run build`: it passes.
2. Open the app: the rail, flyouts, cards and canvas look and work as before.
