# Elevations — plan and current model

Branch `canvas2-elevations`. Working mode per CLAUDE.md / memory. This file describes elevations **as they work now**
(the Elevations tab, v5). The "History" section at the end records what changed and why.

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

**Names are always unique.** Auto names tell elevations apart by what differs (" · X in beam", then the upright, the top
beam; an exact twin reads "· copy"), with no number suffixes, and an old file is renamed on load (§3, Names). A rename
by hand to a name already in use gets the next free suffix.

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

## 3. The Elevations tab (v5)

**Principle:** elevations come from the project (Project setup, `PROJECT_SETUP.md`). Each elevation references
**one ceiling entry and one pallet size** (`ceilingId`, `palletId` on the type). Its levels, its positions per beam
(from that pallet's face) and its checks use that pair. Check layout tests each elevation against its own ceiling
(`elevations.js` `ceilingOf`). Properties keeps one read-only line ("Elevation: 5 levels · 48×40 · Main", or
"mixed"). The canvas legend stays.

**Stop-condition check for v5:**
- **Bays and usable:** unchanged by the tab. An elevation's pallet face sets that side's positions per beam (a 48"
  face on an 8' beam gives 1 per beam, a 40" face gives 2), exactly as the rack's own pallet did before.
- **Rules reversed at your request:** Elevation mode (the Layout | Elevations switch, the split view, Apply / Discard
  drafts, proposals) is removed.
- Not a fork; built without waiting.

**Where it lives:**
- A tab next to Properties in the right panel (`utils/rightPanel.js` `tab`).
- The panel widens on that tab: 480 px to start. Its edge drags, and the width is remembered (`elevW`,
  `trace.rightpanel.v1`). Properties keeps its own width.
- The left toolbar, Generate and the canvas all stay as they are. Rows are selected on the canvas as usual.

**The tab** (`components/Elevations/ElevationsTab.jsx`) has a fixed top and a bottom section, "02", that swaps in place.

**1. The top never moves or resizes between states.**
- The toolbar: Front | Side, Simple | Detailed (also in full screen), "BEAM 8'-0" · 2 PALLETS" (mono; the beam length is read-only — the selected row's most
  common bay, else the most common length among the elevation's bays), Fit and ⤢ full screen. Fit and ⤢ drive the
  drawing through signals (`fitSignal`, `fullSignal`). The beam label truncates with an ellipsis when the panel is narrow.
- The drawing on a plain white sheet (`ElevationDrawing` `controls={false} paper`), taking 65% of the panel below the
  toolbar; section 02 has the rest. A handle between them (grip dots, row-resize) drags the split between 30% and 80%;
  a double-click resets it to 65%. The split is the user's own (localStorage `trace.elevsplit.v1`, `elevTab.js`
  `useElevSplit`), never the layout's, and the same in both states; the drawing refits to it. In the list it is
  **read-only**. Beams drag only in the editor, into its draft, so an elevation used by 325 bays changes only through
  Save.

**2A. The list is for choosing and assigning** — "02 ELEVATIONS IN THIS LAYOUT".
- One row per elevation: colour square · name · "325 bays" · DEFAULT (the default) · ✎ · ⋯.
- A click on a row picks it for the drawing. ✎ opens the editor on it.
- ⋯ opens colour, duplicate, set default and delete. The menu is portalled to the themed root at the top z-index,
  below the row, and flips above it near the bottom of the window.
- [Apply to N selected rows] (primary) assigns the picked elevation to the selected rows' whole sides, one undo step.
  [+ New elevation] (secondary) opens the editor on the best fit for the default ceiling and pallet. "Remove unused"
  is a small link in the header.
- A blue note: "Select rows on the plan, pick an elevation above, then apply." After a Save it starts with "Created /
  Saved / Already exists: <name>."

**2B. The editor is for making and changing one elevation** — "02 NEW ELEVATION", or "02 EDIT ELEVATION · 325 bays use
it", with "Drag a beam to move it" on the right (`elevTab.js` `useElevTab.editing`: `{ id, draft, touched, newCeiling,
newPallet }`).
- **Name:** auto (shown as the placeholder; it follows the ceiling, pallet and beam live), editable. A draft is never
  called "· copy": when it matches an existing elevation exactly, a blue note says "Same as <name> — use that one
  instead?", and the link picks that one and returns to the list.
- **Ceiling box:** a select of the project's ceilings plus "+ New ceiling height". That opens Name · Clear height ·
  Sprinkler inside the box, in one row. The "clear height not set" note sits here too — blue: a reminder, not an error.
- **Pallet box:** a select of the project's pallets plus "+ New pallet size". That opens Face · Depth · Height · Weight
  inside the box, in one row. Under it, the amber pallet-depth note (below).
- **Beam face:** 3 · 4 · 5 · 6 in.
- A new ceiling or pallet stays in the **draft** (`draftTable`; ids `NEW_CEILING` / `NEW_PALLET`). The fit, the
  drawing and the name follow it, and nothing is written. A new pair refits the draft; a new beam face, or the new
  entry's values, refit it until the drawing has changed its levels.
- Only the form scrolls. The footer is pinned: Cancel and **Save elevation**, the editor's ONE save (`saveEdit`). It
  adds the new ceiling or pallet to the project and adds the elevation (or writes the changed one everywhere it is
  used) in one undo step. A new elevation identical to an existing one is not added; that one is picked, and the note
  says "Already exists". Cancel (or Esc) discards the draft, new entries included. Both return to the list.

**Names** (`project.js` `autoNames`, `nameOf`, `previewName`, `refreshNames`). An elevation is called by its own name
when renamed, otherwise automatically: "N levels · FACE×DEPTH · CEILING", e.g. "5 levels · 40×48 · Main" (the pallet's
face across the beam × its depth). Only where two would read the same is " · X in beam" added; if the beam does not
tell them apart either, the upright and then the top beam are tried, and an exact twin (a duplicate) reads "… · copy".
There are no number suffixes ("Main 2"). The keeper renames an existing layout on load, folded into that history
entry.

**No proposals.** When the project has a ceiling entry (its clear height set, or 24' assumed) and no elevation yet, the
keeper creates the best fit for the default ceiling and pallet silently (`project.js` `firstElevations` → `elevFit.js` `bestFitFor`).

**Best fit** (`bestFitFor(project, ceiling, pallet, { beamFaceIn })` — the face: the elevation's own, else the project's
default):
- The first level is on the floor.
- Pitch = pallet height + load clearance + beam face, rounded up to the hole pitch.
- Levels are added while the top load is at or under min(clear height, sprinkler − sprinkler clearance).
- Upright = the top beam + 12", rounded up to the upright step, never above the clear height.
- Worked example (clear 30', sprinklers 29'-6", 48" pallet): pitch 58", 5 levels, upright 21'.

**Assigning:** select rows on the canvas, then click an elevation chip or **Apply to selected rows**. Whole row
sides take it (`rowSideCells`). Each assignment is one undo step. An elevation changes only through the editor's Save
(one `commitElevations`); colour, duplicate, default and delete from the chip menu are one step each.

**The drawing:**
- `elevationLayout` takes `view` (front / side / both) plus `zoom` and `pan`.
- **Zoom:** the wheel or a pinch zooms around the cursor. Dragging empty space pans; dragging a beam or the upright
  top still edits it. **Fit** or a double-click on empty space resets the view. Labels keep their screen size.
- **⤢** opens it full screen (a portal to the themed root); Esc closes it.
- Ceiling and sprinkler lines come from the elevation's ceiling (`ceilingForDrawing`), and pallets from its pallet's
  face.
- The PDF prints, per elevation and beam length in use, the front and side as separate figures, with the
  elevation's own ceiling and pallet face.

**Pallet depth against frame depth.** A frame should be about the pallet's depth less 6" (a 3" overhang front and
back: `elevations.js` `frameNeededFor`, `frameDepthNote`). When an elevation's pallet needs deeper frames than the rows
it would go on, three places say so:
- an amber note in the editor's pallet box: "60 in deep pallet needs about 54 in frames. Selected rows are 42 in." (the
  selected rows, else the rows using it);
- amber under the drawing (a warning);
- a Check layout warning per frame depth (`elev-frame-depth`): "Elevation …: 60 in deep pallet needs about 54 in
  frames. These rows are 42 in."

The rows change only when the user asks: a button under the panel note and under the drawing's note, "Set these
rows to 54 in" (the pallet less 6", rounded up to the rules' frame depths `selective.frameDepthsIn`, else to the inch —
`elevTab.js` `frameDepthFor`). Its click deepens only the target rows that are too shallow — the selected rows, else
the rows using the elevation — each about its centre (`utils/rackDepth.js`, the rack panel's own), in one undo step
(`deepenRows`). The note then goes.

**The side view draws the pallets** on each level at their real depth, centred on each frame (both frames of a
back-to-back). Past the frame depth + 6" (3" a side), the overhang parts are amber.

**BOM:** reads the table and assignments (`elevationBays`, `uprightHeights`); unchanged.

**Regenerate keeps elevation choices.** Each new rack side takes the elevation of the old generated bay-sides it
overlaps most (by area). With no overlap it takes the layout default (`regenerate.js` `carryElevations`).

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
- the drawing in both modes, zoom and pan;
- the Elevations tab (pairing, names, add, assign, remove unused) and its wiring;
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
- **v3:**
  - the elevation moved into Properties, driven by the selection; paint mode and the tab removed;
  - an edit saves a design for the selection only, named by level count;
  - unused custom types are removed automatically;
  - the rack panel was reorganised into Summary, Bays, Elevation and Rack.
- **v4:**
  - Elevation mode: the Layout | Elevations switch, a split view, and drafts applied as one step;
  - auto-fit proposals;
  - assigning like a colour picker;
  - a Front | Side drawing;
  - Properties reduced to a read-only line;
  - Regenerate keeps elevation choices.
- **v5 (current):**
  - Project setup: ceiling heights and pallet sizes as lists, the forklift, rules and Advanced, all held on the
    elevation table (`project`);
  - Elevation mode removed, and elevations moved to a tab next to Properties that widens and remembers its width;
  - each elevation pairs one ceiling with one pallet, names show the pairing, and checks run against that ceiling;
  - proposals removed, and the best fit is created silently;
  - chips with a menu, + Add (ceiling + pallet), Apply to selected rows and Remove unused;
  - drawing zoom, pan, Fit and full screen.
