# Trace CAD — Phase 1 epics

Approved plan (Nov 2026), built from [FEATURES.md](FEATURES.md) Phase 1 items that are not Done.
An epic is a group of features that share code and can be built and hand-checked in one go (roughly 1–3 days).

Every epic ends the same way: its REG tests by name (real clicks, CLAUDE.md Rule 6), a dealer walkthrough on the
4 fixtures, the full suite, then a push. **Rule 7 table** = the before/after impact table (4 fixtures + small building +
short row + L-shaped building, both orientations), approved before building.

**Approvals in hand:** `constants/warehouseObjects.js` may be edited across R2–R5, **new library entries only**.
Every other protected file still needs its own approval.

## Order

R1 → D1 → R2 → R3 → R4 → R5 → U1 → U2 → O1 → E1 → P1 → Z1 → D2 → S1 → UI1.
Platform (PL1–PL5) after its open questions are answered (FEATURES.md, Platform plan §5).

## Status

- **Lane rack BOMs need dealer details before they are switched on** (PP 2026-11-27): drive-in, drive-through and pallet
  flow — part names, frame spacing, ties, guides and brakes differ per dealer. Collect them, then turn on
  `LANE_BOMS_PENDING_ON` in `racks/laneBom.js` (one setting; the formulas are kept and tested) and check each part against
  the dealer's sheet. Push-back's BOM is on (lane-fixes; pushback-frames, PP option B: short frames per post line joined by
  row spacers — frames P × N by depth, row spacers P × (N − 1) × spacers per joint, beams L × V × (N + 1), anchors 2 × P × 2N).
- **The push-back frame split is a dealer setting** (pushback-config, 2026-11-27; PP is not sure, dealers differ): the card's
  Max pallets per frame (2 to 6) and Longer frame at (Front / Rear), N = ceil(deep / max). **The defaults (2, Front) are a
  guess to confirm with dealers.** Saved push-backs read 3 / Front, the split they always had.
- **Parked (PP 2026-11-27, not to build yet):** a rack-type choice in Generate, together with Generate option B — its own spec.
- **R3 / R4 (lane racks) — built, merged 2026-11-27 (holiday-run, master 7405881); PP's answers built on lane-fixes** (2026-11-26 holiday run; reports r3-drive-in, r4-push-back,
  r5-pallet-flow): one lane-rack engine (`racks/laneEngine.js`) for drive-in, drive-through, push-back and pallet flow —
  card, handles in whole lanes / stations, placement defaults, levels on the rack (the R1 levels bug fixed for new racks),
  a BOM section per type. **Not built:** Fill / Generate blocks of lanes (Generate has no rack-type choice — parked by PP with
  Generate option B), elevations of lane racks, carton flow. The holiday prompt numbered push-back R4 and pallet flow R5; in this plan both
  are R4. **R5 (cantilever + shelving)** is not started beyond rack-round3 (shelving sizes) and rack-xmarks.
- **R6–R9 — built on branch two-day-run (2026-11-27, PP away; not merged):** R6 cantilever (card, load spots, BOM),
  R7 shelving (height, back-to-back, BOM), R8 carton flow (a new type; BOM off behind LANE_BOMS_PENDING_ON), R9 mezzanine
  (card, column grid, stairs, gates, handrail, warnings; BOM off). Reports r6-cantilever … r9-mezzanine; their BOM
  formulas are questions for PP. **Not built for these types:** Fill / Generate, elevations.
- **R1 — done** (branch r1-rack-registry): `utils/rackTypes.js` replaces 31 local beam-rack lists and 4 name tables;
  REG-rack-types-same (recorded on master d9f6984) and RT_rackTypes. Audit findings carried forward: lane racks count
  lanes × deep and ignore levels (fix in R3/R4); the card calls a back-to-back pair "Double deep" (rename in R2).
- **D1 — done** (branch d1-drawing): the Draw bar and the Text bar (design/drawbar.png); Line, Polyline, Rectangle, Circle,
  Polygon, Text — select, move, resize, lock, PDF; R fixed. REG-draw-line, REG-draw-rect, REG-draw-poly, REG-text-place.
  Arc and Arrow still draw nothing (D2 or later): held out of the Line tools menu (and the A key) until they are built —
  restore their LINE_TOOLS rows in components/LeftPanel/FloatingToolbar.jsx then.
- **D1 finished** (branches d1-fixes, d1-final): the Draw flyout (no Polygon, no Blocks), one shape then Select, Tab through
  stacked objects, the Line / Polyline / Rectangle / Circle / Text cards and edits to the mockups, the dealer audit fixes;
  CLAUDE.md Rule 9 (the Basics contract) and REG-basics. Dimension and Freehand left the tool pill (they draw nothing in
  canvas2) — D2 gives them a home.

## Epics

| # | Epic | Features, in build order | Depends on | Files / rules touched | Rule 7 table | Protected files | Mockup first | Tests: REG · dealer walkthrough |
|---|---|---|---|---|---|---|---|---|
| **R1** | **Rack types: audit + type registry** | 1 Audit the 9 types against drawn / Fill / Generate / elevation / BOM / Tally / PDF / Check (table to the user first). 2 One registry, `utils/rackTypes.js`: pallet depth, deep count, face side, aisle rule, BOM parts, elevation style (the `ZONE_KINDS` precedent). 3 Selective types read from it | — | `generate/traceGenerate.js` (BEAM_TYPES), `rackFootprint.js`, `render/rackOps.js`, `bayGeom.js`, `utils/bom.js`, `capacity.js`, `layoutCheck.js` | None — no behaviour change; counts identical | none (registry kept in utils) | none | REG-rack-types-same: fixture positions, BOM and Tally unchanged · none visible |
| **D1** | **Drawing basics** | 1 One canvas2 draw handler: Line, Rectangle, Circle, Polyline, Polygon. 2 Fix R (mapped to `TOOLS.RECT`, which does not exist). 3 Text tool places text. 4 Shift-constrain, snap to grid / edges, Esc / Enter end | — | `Canvas2.jsx` (one handler like the door tool's), `canvas2/shapes.jsx`, `useKeyboardShortcuts.js`, `StudioTools.jsx` | No | `utils/canvas.js` read only | Drawing options bar (stroke, fill, close) | REG-draw-line, REG-draw-rect, REG-draw-poly, REG-text-place: real drags, one undo each · mark a walkway and a note on a fixture |
| **R2** | **Double-deep** (+ number deep / multi-deep spacing) | 1 Racking library entry. 2 Card: Number deep, spacing between deep positions. 3 Drawn: deep line inside the bay. 4 Fill / Generate: deeper rows, reach-truck aisle. 5 Elevation side view, BOM (2× beams, deep spacers), Tally, PDF, Check (aisle by reach equipment) | R1 | `fillRacking.js`, `rowAisles.js`, `faceReach.js`, `equipment.js`, `elevationDrawing.js`, `bom.js`, cards | **Yes** — row depth, aisle placement | `constants/warehouseObjects.js` (approved) | Card fields | REG-double-deep: place, Fill, Generate, card edit, one undo · quote a 2-deep job end to end: Fill, elevation, BOM xlsx, PDF |
| **R3** | **Drive-in / drive-thru** | 1 Lane rack: depth in pallets, entry face (one side or both). 2 Drawn lanes, no pick aisle between lanes. 3 Fill / Generate: a block of lanes, aisle only on the entry face(s). 4 Elevation (rails, no beams per level), BOM (rails, guide rails), Check (lane depth vs equipment, entry blocked) | R1 | as R2, plus `aisleAccess.js`, `narrowAisles.js` | **Yes** — blocks replace rows | `constants/` (approved) | Lane block card + drawing | REG-drive-in: Fill a box → lanes, entry-face aisle, Check flags a blocked entry · cold-store drive-in block, positions match a hand count |
| **R4** | **Push-back, pallet flow, carton flow** | 1 Depth-lane racks: positions deep per lane. 2 Load face / pick face (flow: both, opposite sides). 3 Fill / Generate: flow needs an aisle on both faces. 4 Elevation slope marks, BOM (carts / rollers / carton shelves), Check (no pick aisle on the pick face) | R1, R3 (lane code) | as R3 | **Yes** — flow two-face aisles | `constants/` (approved; carton flow is new) | Face markers on plan | REG-flow-faces, REG-pushback-depth · flow block between a load and a pick aisle; BOM lists rollers |
| **R5** | **Cantilever + shelving** | 1 Non-pallet racks: arms / shelves instead of beams. 2 Card: arm length, levels / shelf count. 3 Fill: single-sided cantilever along walls. 4 Elevation, BOM (arms, bases / shelf units), Tally units (not pallet positions) | R1 | `capacity.js`, `summary.js`, `tally.js`, `bom.js` | Light — wall-run cantilever | `constants/` (approved) | Card + elevation | REG-cantilever-wall, REG-shelving-bom · lumber-yard cantilever wall run; shelving pick-area BOM |
| **U1** | **Units: input** | 1 One parser: 12'6", 150 in, 3.8 m, 3800 mm. 2 Every length input routes through it. 3 Project unit setting actually read | — | `utils/typing.js`, `utils/project.js`, NumInput in `cardParts.jsx` | No | `store/useCanvasStore.js` only if the unit is not already in the saved project (check first) | Project settings: unit + precision | REG-units-typed: each card field takes the 4 forms · type metric into building, aisle, bay |
| **U2** | **Units: display everywhere** | 1 One formatter (1/16 in or 1 mm). 2 Labels, chains, Properties, BOM, Tally, PDF, xlsx / CSV | U1 | `textLayout.js`, `DimensionLabels.jsx`, `bom.js`, `xlsx.js`, PDF export, `tally.js`; CAD text model (metric strings change widths) | No — but REG-canvas-text-cad also runs in metric | — | none | REG-units-metric-plan: no overlap at real size, both units · switch a finished job to metric; PDF and xlsx in mm |
| **O1** | **Doors finish + Check on save** | 1 Door swing. 2 P&D stations. 3 Check runs on save (never blocks) | — | `doorCard.jsx`, `doorTool.js`, `DoorAnnot.jsx`, `layoutCheck.js`, save path; labels-cad | No | — | P&D station symbol | REG-door-swing, REG-pd-station, REG-check-on-save · save a job with an issue: saved, issue listed |
| **E1** | **Editing** | 1 Mirror, align, distribute. 2 Multiple copy: X / Y offset, count, auto-number. 3 Zoom to selection. 4 Duplicate notice | — | `selectionActions.js`, `SelectionBar.jsx`, `copyChange.js`, `pasteAt.js`, `rackLines.js` | **Yes** — mirror / multiple copy of racks | maybe `store/useCanvasStore.js` (batch add) — try `commitObjectUpdate` first | Multiple copy bar | REG-multicopy, REG-mirror-row, REG-dup-notice · copy a row 6× at aisle pitch, numbers continue |
| **P1** | **Print** | 1 Sheet size choice, orientation. 2 Company logo, revision table | U2 | PDF export, title block | No | — | Print dialog + title block | REG-print-sheet · A3 landscape with logo, rev B |
| **Z1** | **Areas** | 1 Section temperature (frozen / chilled / ambient) + hatching. 2 Stairs | — | `sectionCards.jsx`, `SectionShape.jsx`, `sectionLegend.js` | No | — | Hatch patterns, legend | REG-section-temp · chilled section on the PDF legend |
| **D2** | **Dimension + measure** | 1 Dimension tool (linear, chained). 2 Leader / callout. 3 Measure area, perimeter, angle | D1 | `MeasureTool.jsx`, `DimensionLabels.jsx`, `textSizes.js` (new types) | No | — | Leader style | REG-dim-chain, REG-measure-area · dimension aisle-to-wall for a customer drawing |
| **S1** | **Snap + performance** | 1 Endpoint / midpoint snap. 2 Snap marker + label. 3 Viewport culling; 50k-position benchmark | D1 helps | `inlineSnap.js`, `smartGuides.js`, `Scene.jsx`, `render/*` | No | likely `utils/geometricSnap.js`, `utils/warehouseSnap.js` | Marker + label style | REG-snap-endpoint · frame time at 50k · pan / zoom a 50k layout on a laptop |
| **UI1** | **UI polish** | 1 Empty-plan card. 2 Rail labels. 3 Hub + Sign in in Studio skin. 4 Library pinning in the flyout. 5 Dead-code cleanup | — | `StudioFrame.jsx`, `StudioTools.jsx`, `FloatingToolbar.jsx`; STUDIO.md | No | — | Hub, Sign in, empty card | REG-empty-plan, REG-rail-labels · first run, new dealer, no help |
| **PL1–5** | **Platform** | PL1 real URLs + remembered session. PL2 Supabase auth + accounts. PL3 cloud save + versions / restore. PL4 project list. PL5 Stripe, trials, plan limits. Hosting alongside PL2 | the 3 open questions | new `data/` folder only (Platform rule 1) | No | — | Login, project list, paywall | REG-refresh-stays, REG-cloud-roundtrip · sign up, make a job, reload, restore v1 |

## Removed from the first draft

- **O2** (Fill keeps door clear spaces + Check rack in a door clear space) — done (fill-doors, db3d529). Check on save moved into O1.
- Dock door numbering and door height — done; dropped from O1.

## Known state at planning time (verified in the running app)

- Line and Rectangle draw nothing in canvas2: the tool switches (`line`, `square`), a drag or a click adds no object,
  no error. R does nothing (`TOOLS.RECT` is undefined). → D1.
