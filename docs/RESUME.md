# Trace CAD — where to pick up

Paused 2026-11-19. Master is tagged **`demo-2026-11`**.

**2026-11-25 run:** rack-fixes and rack-followup are merged (master e5c7c4c), with the 2026-11-24 overnight rack-design work. **rack-round2** (branch, full suite 4558 / 4558) is done and waiting for PP's hand-check in [MORNING.md](MORNING.md): face aisles for every rack type, rack numbers placed clear and lettered per type (D, T, P, F, C, S, M), moving a rack leaves nothing behind, a zone no longer removes racks on its own (Remove racks / Keep), the text drag checked (it was the resize handle), usable for every type, aisle chips past the end when they do not fit.

**PP's answers to the questions in MORNING.md (2026-11-25):**
1. **Usable count:** yes. Positions covered by an overlap come off the usable count for every rack type, not only beam
   racks. This is item 7 of the next prompt.
2. **BOM:** yes. Non-beam types have an R number but no BOM line until each type is built (R3 onward).
3. **Text drag:** fix it now (a text dragged on its own moves only down, and less than the mouse). This is item 6 of the
   next prompt.
4. **Lanes:** keep real sizes (46″). The mockup showed the style only.

**PP's answers to the rack-round2 questions (2026-11-25), built in rack-round3:**
1. **Shelving pick side:** a side not backed by a wall or a rack within 2 ft. If both sides are open, both are checked.
   (Already built in rack-round2; kept.)
2. **A non-beam rack in a cross-aisle** does not split the beam line. Beam numbers never change because of a non-beam
   rack. A beam rack in a cross-aisle keeps today's behaviour. (rack-round3 item 1.)
3. **A drive-through with one short end** keeps its positions. Check layout says "works as drive-in only". (Item 2.)
4. **Remove racks on lane racks** (drive-in, drive-through, push-back, pallet flow) removes only the covered lanes, like
   covered bays on a beam rack; the whole rack only when no lane is left. One undo. (Item 3.)

**PP's answers to the holiday run's questions (2026-11-27), built on branch lane-fixes:**
1. **Lane BOM formulas:** drive-in, drive-through and pallet-flow BOMs are **off** until the dealer details are collected
   (each dealer's setup differs: part names, frame spacing, ties, guides, brakes). Push-back: beams fixed (lanes × levels
   × frame lines) and anchors added (2 per post); the rest approved.
2. **Generate rack-type choice:** later, its own spec together with Generate option B. Not built.
3. **xlsx and Tally:** yes, for every BOM section that is on (push-back today).
4. **Old drive-ins with floor guides on:** no longer relevant — the drive-in BOM is off.
5. **Push-back first level:** first beam at 8 in with rails on it — the bottom level is push-back too (new racks; a saved
   rack keeps its value).
6. **Pallet flow pitch:** 3/8 in per ft is right; card only, never printed.
7. **Shelving under a zone or a rack:** covered units come off usable.
8. **Beam numbers at a wall:** outside the wall.
9. **Zoom p95 53 ms (CPU slowed 4×):** accepted. Do not cache racks as an image.
10. **Older customer files:** PP will add some later. Nothing to do now.

**lane-fixes (2026-11-27, branch, from master 7405881):** those answers (items 0–7) and pdf-parity (item 8: the PDF prints
the rack numbers, and screen-pixel line weights at 0.25 mm a px). Report: [reports/lane-fixes.md](reports/lane-fixes.md).

**Holiday run (2026-11-26, branch holiday-run, merged 2026-11-27 — master 7405881):** rack-xmarks, r3-drive-in, r4-push-back, r5-pallet-flow (one
lane-rack engine for drive-in, drive-through, push-back, pallet flow: card, handles, BOM sections), basics-all (every
library section of REG-basics strict), old-files (every saved file stable across save and reload), text-and-overlap (an
overlap scan, the demo's R6 off a column). Reports in docs/reports/; questions for PP in each.

**rack-round3** (branch, from rack-round2 — it carries round 2 too): those three answers, a short face marked by X marks
on its lost positions and a red chip (no red line), a non-beam rack's number outside the building when it stands within
2 ft of a wall, shelving sizes (unit 36 / 42 / 48 in, depth 12 / 18 / 24 in, Custom; no shelf count drawn; the label
"S1 · 4 units · 48×24 · 5 shelves"). Report: [reports/rack-round3.md](reports/rack-round3.md).
Read this first, then [EPICS.md](EPICS.md) (the plan), [FEATURES.md](FEATURES.md) (every feature and its status),
CLAUDE.md (the rules) and STUDIO.md (the chrome spec).

## What works today

| Area | Works |
|---|---|
| Building | Rectangle, L or custom outline; typed size and wall thickness; walls; the building's dimension chain |
| Column grid | Place dialog (spacing, columns on walls yes/no, offsets, size); card edits live; gridline bubbles and chain; a building resize keeps the spacing |
| Doors | Dock, man and drive-in doors; Add door bar with live gaps and typed distances; Door row (Gap, Count, drag to fill); per-wall chain and numbered badges; clear spaces |
| Racking | Selective single and back-to-back, end to end: drawn, Fill (a box or a section), Generate (the whole building), per-bay beams, levels, flue, row groups, split, cross aisles, tunnels |
| Rack types | One registry, `utils/rackTypes.js` (R1). The other types can be placed from the library only. Every type is drawn by colour family with no fill, dashed pallet slots and face words, on the plan and the PDF (rack-design); every type gets an R number, follows the mouse from the library, and turns red where it overlaps a rack (rack-fixes, rack-followup) |
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

- **Lane-rack positions:** lanes × deep × levels since lane-positions; a lane rack placed or edited carries its own levels
  (`levelsOwn`), a rack saved before still takes its elevation type's.
- **Lane-rack BOMs:** drive-in, drive-through and pallet flow are listed under "not in this BOM" until the dealer details
  are in (`racks/laneBom.js` LANE_BOMS_PENDING_ON, off; the formulas are kept). Push-back has its section.
- **Shelving usable** is a unit count on the shelving card ("2 of 3 units usable · 1 covered"); shelving holds no pallet
  positions, so the layout's positions and usable are unchanged by it.
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
- ~~The text card's Color swatches: the dark colours are almost invisible on the dark card~~ — done (studio/Swatch.jsx: a
  very dark colour gets a ring in the colours popover and the card swatch has its border; checked in lane-fixes).
- (lane-fixes) The three below are not look-only: the Draw icon needs a design icon, the other two change what a click
  does. Left for PP.
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
