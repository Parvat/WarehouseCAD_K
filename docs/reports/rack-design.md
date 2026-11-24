# rack-design — racking on the plan by colour family, sharp lines, a new racking library

Branch `rack-design`, from master (4e7a075). Mockups: `design/rack-plan-colour.png`, `design/rack-library.png`
(force-added: `*.png` is in .gitignore). Status: see the last line.

## What changed

**1. Racks on the plan** (`render/rackOps.js`, `render/rackFamily.js`, painted by `canvas2/shapes.jsx`, printed by `export/pdfExport.js`)
- **No fill** on any rack type. The old #DCE8DC fill is gone from the plan and the PDF.
- **One line colour per family.** It covers the outline, frames, lane posts, face bars, arrows and face words:
  - Pallet (selective, back-to-back, double-deep): **#2B3A67**.
  - Lane (drive-in, drive-through): **#1C7A52**.
  - Flow (push-back, pallet flow): **#B26A12**.
  - Other (cantilever, shelving): **#6A4C93**.
  - Mezzanine: **#5A5F5B**.
- **Pallet slots** are dashed 4 3, 1 px, in the family tint (#8C95B5 · #86B8A0 · #D9AE78 · #B1A0C8).
  - Count: one per pallet position. A beam's slots use the same count as positions (`utils/palletFit.js`). A lane's slots are lanes × deep.
  - Double-deep: each deep position has its own slots, plus a dashed line between the positions.
- **Outline** is 1.25 px. Frames and posts are drawn at their real width.
- **Face bars** are 4″, with ENTRY / LOAD / PICK words 12″ high in the family colour:
  - drive-in: ENTRY on the front;
  - drive-through: ENTRY at both ends;
  - push-back: LOAD · PICK on the front;
  - pallet flow: LOAD at the back and PICK at the front.
- **Arrows** sit in each lane's front pallet. They point into the lane, except pallet flow, where they point toward PICK.
- **Cantilever**, seen from above: the column line, a square at each column, each arm, and the arms' reach as a dashed tint zone on each loaded side.
- **Shelving**: units about 4 ft wide, each with its shelf count inside.
- **Mezzanine** is a raised floor, not a rack. It has:
  - a dashed outline and a thin cross;
  - posts at the corners and along the edges, at most 25 ft apart;
  - MEZZANINE and its size in the middle, on a white halo.
- **Rack numbers** (R1, R2 …) are now #55605A. Their size, place and Text panel control are unchanged (Rule 8).
- **Selection**: the rack keeps its own colours.
  - It gets a 2 px #2F6FD6 outline 4 px outside it, and a 7 px white square handle edged in that blue at each corner.
  - The resize handles, bar and labels are unchanged. Hover is unchanged.
- **Problems** (overlap, clearance, column) still draw in red over the rack, from the same overlays as before.
- **A selected lane rack's dimension labels** now sit past its face words instead of on them.
- **PDF**: the same ops, so the same colours, no fill, the face words, and the mezzanine posts and words.

**2. Sharpness**
- **Pixel ratio** (`canvas2/pixelRatio.js`): every Konva layer draws at `window.devicePixelRatio`. It follows changes from browser zoom or moving to another screen, through a media-query listener plus `resize`. Layers made later (a drag's lifted layer) start at the right ratio.
- **Hairlines and slot edges** are a screen width. Each straight line sits on the half pixel at an odd device width, and on the whole pixel at an even one (`render/hairlines.js`).
- Outlines and frames were already snapped to whole pixels (`render/pixelSnap.js`). The outline now uses its screen width.
- **Checked at 30, 50, 100 and 200 %**, at pixel ratio 1 and 2: PX-hair below.
- **Slots are left out on screen when smaller than 5 px** on their short side. At the building-fit zoom their dashes would only grey the bay. This only affects what the screen draws, never the data; the PDF always prints them.

**3. The racking library** (`studio/RackLibrary.jsx`, wired in `components/LeftPanel/FloatingToolbar.jsx`)
- **Look:** a dark flyout 150 px wide (its longest name), a search box, then PALLET · LANE · FLOW · OTHER.
  - Rows are 28 px: a 20×16 top-view glyph in the family's icon colour and the name in 13 px.
- **Hover:** the row lights up, and after 300 ms the tooltip appears right of the panel, with the wording given in the task.
- **Search:**
  - filters across groups and hides empty ones;
  - Up / Down move (wrapping), Enter picks;
  - Esc clears the search, then a second Esc closes the flyout.
- **Picking** works as before: one placed, then back to Select.
  - **Double-click keeps it on** for the types that follow the mouse (Selective, Back-to-back, Double-deep). Each click places one, with one undo each, until Esc.
  - The other types drop at the view's centre at once, as before, so a double-click places one.
  - Drag from the library: the Studio flyout never had it, and nothing was removed.
- **Rack Row (multi-bay)** is gone from the flyout. It is still in the library, so a saved one loads, draws, selects and edits (REG-rack-row-file).
- **"Coming soon":** every listed type exists, so no row shows it. The mechanism is there for a row without a library item.

## Rule 7 — before / after (Chromium, real clicks; before = master 4e7a075)

What each column means:
- **Card totals:** positions, usable, lost, lines, bays, frames.
- **BOM:** the tab's totals.
- **Picks:** 3,000 clicks over the building at 10 % and 100 %.
- **Save→load:** the objects are identical after a round trip.
- **PDF:** the sheet's viewBox and its number of words.
- **Regenerate:** its objects, bays and positions.

| Layout | Racks (lines) | Bays | Positions | Card totals | BOM | Picks (hash) | Save→load | PDF | Regenerate |
|---|---|---|---|---|---|---|---|---|---|
| demo-warehouse.wcad | 15 (22 lines) | 175 (283 bay sides) | 2,038 | same | same | same | same | same | n/a — sections, Regenerate off |
| older-horizontal | same | same | same | same | same | same | same | same | same (14 racks, 184 bays) |
| older-vertical | same | same | same | same | same | same | same | same | same |
| crowded-horizontal | same | same | same | same | same | same | same | same | same |
| crowded-vertical | same | same | same | same | same | same | same | same | same |

Nothing changed: no rack, bay, position, part, pick, saved field or PDF placement. Snapping, hit areas and undo don't read the drawing, and their REG tests pass (below).

## Screenshots (docs/reports/rack-design/)
- **Side by side with the mockups:** `compare-plan.png` (gallery at 30 %) and `compare-library.png` (library with the Drive-in tooltip).
- **Every type at 30 %, normal and selected:**
  - `selective-30(-selected).png`, `back-to-back-…`, `double-deep-…`;
  - `drive-in-…`, `drive-through-…`, `push-back-…`, `pallet-flow-…`;
  - `cantilever-…`, `shelving-…`, `mezzanine-…`;
  - the whole gallery: `gallery-30.png`.
- **Library:** `library.png`, `library-search.png` (searching "flow"), `library-window.png`.

**Where the app and the mockup differ, on purpose:**
- **Lane widths.** The app draws each lane at its real width (46″ for a 40″ pallet). The mockup drew them wider.
- **R numbers.** Only beam racks have an R number (rack lines are the BOM's rows). See question 1.

## Decisions (my reading where the task left it open)
- **Hairlines are a screen width; structure is real size.** The outline (1.25 px), lane lines, slots (1 px) and arrow shafts don't grow with zoom. Frames, posts, face bars, spines, arms and words are real size, so they scale like geometry (Rule 8).
- **The mockup was read as "1 px = 1 inch at 30 %"** for the real sizes: face bar 4″, face words 12″, mezzanine words 16″ / 12″, post squares the upright width.
- **Drive-in's closed back is now a thin outline.** The old heavy back wall is gone, as in the mockup; the front face bar and ENTRY carry the cue.
- **Arrows are real size inside the front pallet.** Before, they were label size outside the rack. FU-arrows was updated.
- **Slots are hidden on screen under 5 px**, explained above.
- **The elevation colours stay.** "Show colours" in the Elevations tab still tints each bay by its elevation type when a layout has two or more types. It is an opt-in view of the elevations, not the rack's fill.

## Tests
- **New unit tests:** `RD_rackDesign.test.js` (7):
  - every rack type maps to its family colour, and each type draws only its own family colours, no fill;
  - the selection blue is never a family colour;
  - the PDF prints the colours, slots and words;
  - the library's groups, rows, tooltips, and the hidden Rack Row.
- **New REG tests** (real clicks):
  - **REG-rack-design-look** (all 4 fixtures): navy and tint pixels with none of the old fill; a click selects; outline 2 px #2F6FD6 4 px out; 4 white corner handles; navy kept when selected.
  - **REG-rack-library:** width and no gap, 28 px rows, 20×16 glyphs in family colours, groups, tooltip only after 300 ms and right of the panel, search, Up/Down, Esc twice, Enter places one, back to Select.
  - **REG-rack-library-keep:** a double-click places 3 with one undo each; Esc ends it; a single click places one.
  - **REG-rack-row-file:** a Rack Row file loads, draws, selects, gets Add bay with one undo, and saves.
  - **REG-pixel-ratio:** layers at 1, then 2 after the change, then 1 again.
- **New PX test:** PX-hair — every straight hairline and slot edge sits on the half pixel (or whole at an even width), at 30, 50, 100 and 200 %, pixel ratio 1 and 2.
- **Updated (the rule changed; the tests stay):**
  - rackOps, rackOpsDeck, rackOpsLanes (the new ops);
  - PX-layout / PX-in / PX-out / PX-whole / PX-pdf / PX-wire (the outline is a screen width; PDF in navy);
  - FU-arrows (real size);
  - REG-lane-positions, REG-double-deep, REG-basics' Selective (the library's new names).

## Rule 9 basics on what changed
- REG-basics in the full suite runs every library item, the new names included, through the contract.
- REG-rack-design-look covers select. The other new REG tests cover the library tool flow, one undo, Esc and save→load.

## Dealer walkthrough
- Opened the fixture and placed each of the ten types from the new flyout. Colours were right and nothing was filled.
- Selected each one: blue outline and corners, lines kept their colour.
- Searched "drive", used the keys, pressed Esc twice.
- Double-clicked Selective and placed three, then Esc.
- No page errors.

## Questions for PP
1. **R numbers on every rack?** The mockup shows R6–R11 on the lane, flow, cantilever and shelving racks. Today only beam racks have one, because R numbers are the BOM's and Tally's line numbers.
   - Numbering the others would change those numbers, or need a second series. Left as today.
2. **The pair's labels.** Rule 8 says a back-to-back pair running up and down keeps one label, "R2–R3". The mockup shows R2 and R3, which is what a pair running across already shows. Left as Rule 8 says.

## Polish list (added to FEATURES.md §14)
- A selected drive-through or pallet flow: its rotate handle sits over the top face word (ENTRY / LOAD).

## Hand-check (≤ 6)
1. Place each rack type from the Racking flyout. Check the colour by family, that nothing is filled, and that the pallet dashes are easy to see at 30–100 %.
2. Select a rack: blue outline 4 px out, white corner squares, and the lines keep their colour. Drag it onto another rack: red.
3. Zoom 30, 100 and 200 %: lines sharp. Ctrl + / Ctrl − in the browser: still sharp.
4. Open the library: narrow with no gap on the right, the icons in their colours, and the tooltip after a moment on hover. Type "drive", use Up/Down and Enter, and press Esc twice.
5. Double-click Selective: each click places one, until Esc.
6. Export a PDF: the same colours, no fill.

Status: **done**. Full suite on its own (21 min): 4504 passed, 10 failed — all from this change, all fixed and re-run green:
- B-line knew only the old op kinds; it now checks the slots and lines too.
- KT-scan: the library's key listener now asks textOwnsKey (keys typed in another field are that field's).
- REG-bom-rack-labels pinned the old number grey; it now expects #55605A.
- REG-rack-design-look's old-fill match was too loose under the full run's shared page; it now matches within 6 per channel and lists any colour it finds.

REG-basics: every Racking library item, 264 checks on each of its two fixtures, 0 failed. `vite build` passes.
