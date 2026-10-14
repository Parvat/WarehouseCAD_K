# Elevations — plan and current model

Branch `canvas2-elevations`. Working mode per CLAUDE.md / memory. This file describes elevations **as they work now**
(the selection model). The "History" section at the end records what changed and why.

**Rule:** the elevation editor changes only the vertical design (levels, spacing, upright height, pallet, clearance,
beam face, hole pitch). Nothing in it changes the floor plan. Frame depth, beam length, upright width, pallet size and
flue are the rack's own; they are edited in the rack panel's Bays and Rack sections.

## Stop-condition check (done before building)

- **Bays and usable on the fixture and the Generate layouts.** On load, existing racks' `levels` become types, and every
  count reads each bay's type levels. Those equal the rack's old `levels`, so positions and usable are identical.
  Verified by test on the 12 fills (horizontal and vertical) and the 4 Generate layouts.
- **Rules already set.** None changes. The Row group "levels" replay still works. One-side delete, takeover, splits
  and joins keep their behaviour and now also carry the type.
- **Product forks decided:**
  - The legend counts each side of a back-to-back as one bay.
  - A building without a clear height or sprinkler height isn't checked against it.

## 1. Data

**The types table** is part of the layout: the canvas store's `elevations` (approved store diff, A4). It is saved
(file format 2), undone and loaded with the layout. Older files with an `elevation_types` object among their objects
are migrated on load.

```
elevations: { version: 1, defaultId, sprinklerClearanceIn?,
  types: [{ id, name, color, uprightHeightIn, clearanceIn, beamFaceIn, holePitchIn,
            levels: [{ beamIn, palletHeightIn, loadLb }] }] }   // beamIn to the TOP of the beam; 0 = on the floor
```

**Names are always unique.** Duplicates (an old file) are renamed "name 2", "name 3" on load and after each action. A
rename to a name already in use gets the next free suffix.

**Assignment.** Each beam rack stores overrides only where they differ:

- `elevType`: the rack's type (absent = the layout default)
- `elevSides: [t0, t1]`: one per side of a back-to-back (side 0 = the local top band, the same convention as
  `activeBaySide`). Null = the rack's.
- `elevBays: [[side 0 per bay], [side 1]]`: per bay on a side. Null = the side's.

A bay-side's type is bay ?? side ?? rack ?? default. After every write the overrides are **compressed** back to the
minimum.

`rack.levels` mirrors the rack-level type's level count. Every count that can see a single bay (bay ledger, rack
capacity, column pick blocks, narrow aisles, usable) reads the **bay-side's type** through `levelsAt`.

## 2. Load, keeper, existing tools

- **The keeper** (`reconcileElevations`) runs after each action and folds its fixes into that action's own history
  entry:
  - A layout with no table gets one type per distinct `levels` value ("4 levels": a beam every 60", pallet 48",
    clearance 6", 2,000 lb, upright = top beam + 60"). The most common becomes the default.
  - Overrides naming a type that no longer exists are dropped.
  - Duplicate names are fixed.
  - **A custom type no bay uses any more is removed**, in the same undo step as the edit that emptied it. A custom
    type is one named "N levels · custom" or "custom N". Standard types, and a custom type that is the default, stay
    until deleted.
- **A levels edit** (the rack panel's Levels field, the Row group levels replay): the rack gets the type with that
  many levels. An existing type is reused; otherwise a copy is made with levels added or removed at the same spacing,
  under a unique name.
- **New racks** (placed, Generate, Fill, Regenerate) get the layout default.
- **The type is carried** through bay-delete splits, one-side deletes and the face rule, Row group bay replays,
  joins, the takeover, and paste.
- **A deleted type**: every override naming it goes, so those bays fall back.

## 3. Selection model (Properties)

There is no Elevations tab and no paint mode. The elevation lives in Properties and follows the selection.

- **Selection → bay-sides** (`utils/elevSelection.js` `selectionCells`):
  - a rack selected whole counts every bay on every side;
  - a clicked bay counts that bay on the side clicked (both sides when picked between them);
  - bays picked across racks (Shift+click, bay box) count theirs.
- **The Elevation section** (`components/Elevations/ElevationSection.jsx`):
  - a **type dropdown**: choosing a type sets it on every selected bay-side, one undo step;
  - **tabs**, one per type with its bay count, when the selection carries several types;
  - the **drawing** of the type shown, at the selected bay's beam length (else the most common in the selection);
  - a read-only line: Beam · Depth · Pallet · Clearance;
  - **Details** (collapsed): pallet height, clearance, beam face, hole pitch;
  - Simple / Detailed, remembered per browser; the PDF prints whichever is chosen.
- **Editing the drawing** (drag a beam, type a dimension, add or remove a level, drag the upright top) or a Details
  field saves the new design **for the selected bay-sides only** (the current tab's), one undo step
  (`findOrMakeType`):
  - an existing type of that very design is reused;
  - otherwise a new type named by level count: "N levels" when the spacing is standard (a beam every 60") and the
    name is free, else "N levels · custom", then "custom 2"…;
  - a hint line says which.
- **Nothing selected**: the layout summary and the types list (rename, delete, set default, bay counts, colour,
  Show colours).
- **Sprinkler clearance** (18" by default) is the layout's setting. It sits in the building's properties next to the
  sprinkler height and clear height.
- **Row group**: a type change is the edit kind `elev`. It is replayed per bay-side at the same uprights and on the
  same world side.
- **Width**: the right panel widens while a rack (or bays of one) is selected (480 px to start; drag its edge, width
  remembered). Otherwise it uses the normal width.

## 4. Plan view

- Each bay band is filled with its type's colour, each side of a pair separately.
- The legend sits at the canvas's bottom left: swatch, name, bay count, for the types in use.
- "Show colours" (types list and legend; per browser) controls both. The PDF follows it.

## 5. The drawing

`utils/elevationDrawing.js` builds one pure layout. The editor, the PDF and the tests all read that same layout.

- **Front view:**
  - the beams to the top of each beam, the loads, and level tags L1–Ln;
  - the frame height, the pitch, and the beam with its pallets per level;
  - the side clearance;
  - the clear-height line and the clearance band under the sprinklers.
- **Side view:** frames, bracing, flue spacers, depth and flue.
- **Detailed** adds:
  - beam elevations;
  - per level, the pallet height and the actual gap (red under the clearance);
  - the red sprinkler line with its height.
- **Colours:** in the app they come from theme tokens (`--elev-frame`, `--elev-ink`, `--elev-dim`, `--elev-clr`). The
  PDF prints the reference sheet's colours on white.
- **On screen:** the drawing snaps to the device-pixel grid and draws crisp edges. Focusing it never scrolls the
  panel.

## 6. Rules (Check layout errors)

- A pallet plus its clearance must fit from the top of its beam (or the floor) to the underside of the next beam.
  The top level has no beam above, so it isn't checked this way.
- The top of the upright must be at or under the building's clear height.
- The top of the top load must be at or under the clear height, and at least the sprinkler clearance under the
  sprinkler heads.
- Different types side by side, or on the two sides of a pair: no warning. A shared upright takes the taller type's
  height (BOM data).

## 7. For the BOM (exposed, not built)

- `elevationBays(objects, T)`: per rack, bay and side → type, levels, upright height, beam, frame depth.
- `uprightHeights(objects, T)`: per upright position, the taller neighbour's height.

## 8. Tests (`EV_elevations.test.js`)

Both orientations for the layout tests. Coverage:

- migration;
- resolution and the six assignment cases;
- positions per bay;
- the selection's bay-sides, choosing a type, saving a design for the selection;
- naming, unique names, removing unused custom types;
- carrying the type through edits, and the Row group;
- Check layout;
- legend, PDF and BOM;
- the drawing in both modes;
- the Properties wiring.

There is one break-it per behaviour.

## History

- **v1:** types and layered assignment, migration, the keeper, paint mode (Row / Side / Bay), legend, side view,
  checks, BOM data.
- **v2:**
  - beam face and levels to the top of the beam;
  - frame depth from the rack;
  - the types moved into the store (A4);
  - the editor docked under (later beside) the canvas;
  - drag, type and add/remove gestures;
  - the reference-style drawing;
  - beam length per bay;
  - the PDF elevation sheets.
- **v2.x:**
  - sprinkler clearance and the top-load check;
  - Simple / Detailed;
  - theme tokens;
  - the Properties | Elevations tabs, then the editor moved into the Elevations tab.
- **v3 (current):**
  - the elevation moved into Properties, driven by the selection; paint mode and the tab removed;
  - an edit saves a design for the selection only, named by level count;
  - unused custom types are removed automatically;
  - the rack panel was reorganised into Summary, Bays, Elevation and Rack.
