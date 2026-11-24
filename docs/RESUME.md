# Trace CAD — where to pick up

Paused 2026-11-19. Master is tagged **`demo-2026-11`**.

**2026-11-24 overnight run:** rack-design, rack-design-match and rack-basics are done and combined on `overnight-rack-design` (full suite green). Waiting for PP's hand-check and the questions in [MORNING.md](MORNING.md).
Read this first, then [EPICS.md](EPICS.md) (the plan), [FEATURES.md](FEATURES.md) (every feature and its status),
CLAUDE.md (the rules) and STUDIO.md (the chrome spec).

## What works today

| Area | Works |
|---|---|
| Building | Rectangle, L or custom outline; typed size and wall thickness; walls; the building's dimension chain |
| Column grid | Place dialog (spacing, columns on walls yes/no, offsets, size); card edits live; gridline bubbles and chain; a building resize keeps the spacing |
| Doors | Dock, man and drive-in doors; Add door bar with live gaps and typed distances; Door row (Gap, Count, drag to fill); per-wall chain and numbered badges; clear spaces |
| Racking | Selective single and back-to-back, end to end: drawn, Fill (a box or a section), Generate (the whole building), per-bay beams, levels, flue, row groups, split, cross aisles, tunnels |
| Rack types | One registry, `utils/rackTypes.js` (R1). The other types can be placed from the library only. Every type is drawn by colour family with no fill, dashed pallet slots and face words, on the plan and the PDF (rack-design) |
| Sections and zones | Named sections with a legend, each with its own equipment, Fill section, a fence or wall boundary; zones (office, staging, washroom, custom) cut the racks under them |
| Elevations | Auto best fit from the clear height; front and side view; ceiling, sprinkler and max-load lines; types per row or bay |
| Capacity | Positions, usable and lost (narrow aisle, column, zone), positions per 1,000 sq ft, Tally |
| Check layout | Overlaps, narrow aisles, no way in, max run, clear height and sprinklers, column on a frame, unreachable racks; click an issue to zoom to it; Mark as OK; asks before a PDF export, never blocks |
| BOM | Total and by section, By row, rack numbering continuous or per section, xlsx and CSV |
| PDF | Plan, elevations, BOM, legend, title block, several sheets; visible layers only; labels at their real size at the print scale |
| Drawing (D1) | Line, Polyline, Rectangle, Circle, Polygon and Text through the Draw and Text bars; live and typed lengths, Shift, snap; select, move, resize, lock; printed on the PDF |
| Editing | Select (click, Shift, box, Ctrl+A), move, rotate, copy and paste, duplicate, group, lock per object and per layer, one undo per action, right-click menus |
| Layers and view | Standard layers filled automatically; show and lock per layer; the View, Text and Layers panels; CAD text sizes per label type |
| Save | Local .wcad Open and Save; background autosave |

## Known gaps

- **Lane-rack positions bug:** drive-in, drive-thru, push-back and pallet flow count lanes × deep and ignore levels. Fix it in R3 or R4. Found in the R1 audit.
- **Fill does not dodge columns with its frames.** In a 25′ grid, a section filled from the wall can put an upright frame on a column. Check flags it as an error and Generate does not do it. The demo's section split was moved to avoid one.
- **Drawing tools that draw nothing yet:**
  - Arc and Arrow are held out of the Line tools menu and the A key; D2 or later.
  - The Dimension tool and leaders (D2).
  - Freehand saves strokes but cannot capture new ones in canvas2.
- **Blocked on a protected file:** `Canvas/CanvasObjectCore.jsx` is missing an import of nine path helpers, so Triangle, Diamond, Star and Cross are held out of the Draw flyout (was Blocks) (CLAUDE.md, Open blocker). The fix is one line and needs approval.
- **Partial, from FEATURES.md Phase 1:**
  - The unit setting is saved but nothing reads it; there is no metric input or display (U1, U2).
  - No zoom to selection, endpoint/midpoint snap, snap marker or viewport culling (E1, S1).
  - No mirror, align, distribute or multiple copy, and Duplicate gives no notice when nothing happens (E1).
  - No double-deep or number deep (R2). Rack types other than selective are placeable only (R3–R5).
  - Doors have no swing; no P&D stations; Check does not run on save (O1).
  - Print has no sheet choice, logo or revision table (P1).
  - No section temperature or hatching, and no stairs (Z1).
  - Measure gives distance only (D2).
  - No cloud save, and a refresh starts at the sign-in screen (PL1–PL3).
  - UI: no empty-plan card, rail labels are tooltips only, Hub and Sign in use the old skin, no flyout pinning, dead code left (UI1).
- **Small bugs (FEATURES.md, Open work):** the pen edge crossing a section; the REG-tally-ticks timeout.

## Next: the epic order

R1 ✓ → D1 ✓ → **R2** → R3 → R4 → R5 → U1 → U2 → O1 → E1 → P1 → Z1 → D2 → S1 → UI1.
Platform (PL1–PL5) comes once its open questions are answered (FEATURES.md, Platform plan §5). Each epic's features,
files, tests and walkthrough are in EPICS.md.

**R2's first prompt:**

> Start R2 (double-deep, EPICS.md) on a new branch r2-double-deep from master. First, the Rule 7 impact table: double-deep
> Fill and Generate on the 4 fixtures, a small building, a short row and an L-shaped building, both orientations — racks,
> bays and positions per case before and after, and where the reach-truck aisles move. Also the card fields (Number deep,
> spacing between deep positions) as a mockup to approve, and fix the R1 finding that the card calls a back-to-back pair
> "Double deep". Nothing is built until I approve the table and the card. `constants/warehouseObjects.js` is approved for
> the new library entry only.

## The merge flow

1. One feature branch per task, from master. Never commit on master.
2. During a fix, run its tests by name: `npm run test:reg -- "<name pattern>"`. A small fix runs only its related tests, then pushes.
3. A big round runs the full suite (`npm test`, about 11 minutes, 6 Chromium workers) once before its push.
4. "Ready to merge <branch>": run the full suite on that branch, fix anything, report it green.
5. The owner fast-forwards both main branches:
   ```
   git fetch . <branch>:master <branch>:canvas2-clean-start
   git push origin master canvas2-clean-start
   ```
6. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `design/*.png` and every `*.png` are git-ignored, so add them with `git add -f`.

## The rules (in full in CLAUDE.md and STUDIO.md)

- **Protected files:**
  - Never edit `store/useCanvasStore.js`, `utils/canvas.js`, `utils/warehouseSnap.js`, `utils/geometricSnap.js`, the old `Canvas/*.jsx` or `constants/` without approval. Stop and report the file and the exact change.
  - The one approval in hand: `constants/warehouseObjects.js` in R2–R5, for new library entries only.
- **Rule 6:**
  - Every hand-check bug becomes a REG test in `REG_handCheck.test.js` that drives real clicks in Chromium, on the 4 fixtures.
  - Never delete a REG test. When a rule changes, update its expectation.
- **Rule 7, the impact check:** before any layout-rule change (placement, cutting, splitting, minimums, clearances):
  1. Run it on the 4 fixtures plus a small building, a short row and an L-shaped building, both orientations.
  2. Report a before/after table: racks, bays and positions removed or moved, per case.
  3. Build only after the table is approved.
- **Rule 8, the CAD text model:**
  - Every canvas label has a real text height in drawing units and scales with the drawing. No pixel floor, no hiding, no growing, no ranges, no leaders added on zoom.
  - The plan looks the same at every zoom, only bigger or smaller.
  - One height per label type, in inches: aisle widths 18, row numbers 18, door chain 12, door badges 12, column chain and bubbles 18, building size 24, zone and section names 24, clearances 9.
  - The Text panel sets the heights, and an object's card has its own Text size.
  - A value that does not fit sits just outside its segment, at a fixed drawing offset.
  - The PDF uses the same heights at the print scale. REG-canvas-text-cad guards it.
- **Mockups 1:1:**
  - `design/studio/*.dc.html` and the named PNGs are the source of truth; a mockup beats STUDIO.md.
  - One screen per prompt.
  - Screenshot the build at 1440×900 beside the mockup and list every difference until there are none.
  - Never invent a value. Ask.
  - Icons come only from `src/studio/iconData.js`, generated by `node scripts/studio-icons.mjs`.
- **Polish list:** label look issues go on the list below, unless a label is unreadable or overlapping. Those are fixed straight away.
- **Verify in the running app:** only pixels prove a visual change (Rule 5).

### Polish list

One line each, with where it shows. From the drawing-tools dealer audit (d1-fixes, older-horizontal and crowded-vertical, 10 %):
- The text card's Color swatches: the dark colours are almost invisible on the dark card (no ring or border).
- The Draw rail button uses the Blocks glyph — Icons.dc.html has no Draw icon yet (needs a design icon; never hand-drawn).
- A selected polyline's corner squares sit on top of the box handles where a corner is a box corner; there the corner drag wins (the other box handles still scale).
- The floating selection bar can cover a neighbouring shape; a click there lands on the bar.

## Demo project (5 minutes)

`docs/demo/demo-warehouse.wcad` holds:
- a 240′ × 120′ building with a 25′ × 30′ column grid;
- 8 dock doors and a man door on the bottom wall;
- two sections, filled with Fill section: **Fast pick** (left 100′, 3-level elevation) and **Bulk** (4 levels);
- a ceiling of 32′ clear, sprinklers at 30′;
- 22 rack lines, 2,038 positions, 1,922 usable;
- Check: no errors, two warnings (positions lost to columns).

`docs/demo/demo-plan.png` is the plan as it opens. Rebuild both with `node scripts/build-demo.mjs`, which uses the app's own functions in Chromium.

**Click path:**
1. `npm run dev`, then open the app. **Sign in**, then **Draw**.
2. Open the layout menu (top left, "Untitled layout ▾"), then **Open…**, and pick `docs/demo/demo-warehouse.wcad`.
3. **Fit** (bottom right). The Properties card shows **2,038 positions · 1,922 usable · 116 lost**, lost to columns, and the red ✕ bays on the plan.
4. Click a rack. Its card shows bays, levels and its elevation.
5. Zoom in on the bottom wall. The 8 docks and the man door have their chain and numbered badges, and their clear spaces are kept free of racks.
6. Click a column. The grid card opens, with the gridline bubbles and the spacing chain.
7. **Elevations** tab: the 4-level and 3-level types drawn under the 32′ ceiling and the sprinkler line.
8. **BOM** tab: the Total, then **Fast pick** and **Bulk**. Show **xlsx** and **CSV** downloads.
9. **Check** (top right): no errors, two warnings. Click one to zoom to it.
10. **Export**: the PDF opens in a new window, with the plan, elevations, BOM and legend.
