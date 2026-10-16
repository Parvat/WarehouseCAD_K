# Elevations — plan and current model

Branch `canvas2-elevations`. Working mode per CLAUDE.md / memory. This file describes elevations **as they work now**
(Elevation mode, v4). The "History" section at the end records what changed and why.

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

## 3. Elevation mode (v4)

**Principle:** elevations are a separate step, done after the layout. The layout editor (Properties) shows no
elevation drawing and allows no elevation editing. It keeps one read-only line, "Elevation: 5 levels · 21'" ("mixed"
for a selection with several). The canvas legend stays.

**Stop-condition check for v4:**
- **Bays and usable:** unchanged until an elevation is applied. Applying one changes the level counts, and so the
  positions, on purpose.
- **Rules reversed at your request:**
  - "no automatic custom types": an edit no longer makes a "· custom" type;
  - the elevation editor leaves Properties.
- **Kept from before:** the keeper's removal of unused "· custom" types, so older layouts still tidy themselves.
- None of this is a fork; built without waiting.

**The mode switch:**
- The top bar gets **Layout | Elevations**.
- Elevation mode is a split view:
  - the plan on the left, with rows coloured by elevation (colours forced on);
  - the elevation workspace on the right, 40% to start, with a draggable divider whose width is remembered
    (`trace.elevmode.v1`).
- Hidden in Elevation mode: the left toolbar, Generate and the right panel.
- **The plan is select-only:** click (side-aware), Shift+click and box selection work; nothing moves, resizes,
  rotates or is deleted.

**Drafts:**
- Everything done in the workspace edits the layout live, so the plan recolours at once, but without a history
  entry.
- **Apply** saves it all as ONE undo step (`commitElevations`).
- **Discard** goes back to the last applied state.
- **Back to Layout** with unapplied changes asks: Apply / Discard / Stay. With none it simply leaves; everything
  stays as applied.
- An undo while changes are pending discards them.

**Auto-fit proposals** (`utils/elevFit.js`):
- **Inputs:**
  - clear height (required; the building's. When missing, the workspace asks for it);
  - sprinkler height (optional, the building's) and sprinkler clearance (18");
  - pallet height (48"), clearance (6"), beam face (4"), hole pitch (2"), upright step (1').
  - The fit inputs are saved on the types table (`fit`) on Apply.
- **The first level is on the floor.** Level pitch = pallet + clearance + beam face, rounded up to the hole pitch.
  Beam k (to the top of the beam) sits at k × pitch.
- **A level fits** when its top load (beam + pallet) is at or under the clear height, and at or under the sprinkler
  height less the sprinkler clearance.
- **Upright** = the top beam + 12", rounded up to the next upright step, never above the clear height. It can be
  edited.
- **2–3 options:**
  - **max levels (★ best)**;
  - one fewer;
  - the next one up, flagged with how much it fails by and against which limit.
  - Each shows levels, upright, total pallet positions for the layout (as if every bay carried it), and the headroom
    left.
- **Worked example:** clear 30', sprinklers 29'-6", pallet 48":
  - pitch 58";
  - **best: 5 levels** (floor + 4'-10", 9'-8", 14'-6", 19'-4"), upright 21';
  - 6 levels flagged 2" over the sprinkler limit (top load 28'-2" against 28'-0").

**Picking and assigning:**
- **Choosing a proposal** makes it the elevation of the whole layout: it is the only type and every override is
  cleared. Most jobs end here.
- **+ Add elevation** adds another, either from a proposal or by duplicating the active one (to adjust it). The new
  one becomes active. This is a deliberate variant: there are no automatic "custom" types.
- **Assigning** works like a colour picker. Pick an elevation in the list, then select on the plan; each new
  selection takes the active elevation (`elevSelection.js` `selectionCells` → `assignCells`). Picking another
  elevation never reassigns what is already selected.
- **The list:** colour, name, bay count; click to make it active; double-click to rename; delete (its bays fall back
  to the default); set default.
- **Names come from the level count and upright:** "5 levels · 21'". A name made this way follows its elevation when
  the drawing changes it; a renamed one keeps its name. Names stay unique.

**The drawing:**
- One large view, with **Front | Side** on top (`elevationLayout` `view: 'front' | 'side' | 'both'`), and Simple /
  Detailed.
- The ceiling (clear height) and sprinkler lines are drawn.
- Small adjustments (drag a beam, type a value, the upright height) change **that elevation everywhere**, as a draft.
- The PDF prints, per elevation and beam length in use, the front and side as separate figures, as before.

**BOM:** reads the applied table and assignments (`elevationBays`, `uprightHeights`), unchanged.

**Regenerate keeps elevation choices.** Each new rack side takes the elevation of the old generated bay-sides it
overlaps most (by area). With no overlap, the layout default (`regenerate.js` `carryElevations`).

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
- **v3:**
  - the elevation moved into Properties, driven by the selection; paint mode and the tab removed;
  - an edit saves a design for the selection only, named by level count;
  - unused custom types are removed automatically;
  - the rack panel was reorganised into Summary, Bays, Elevation and Rack.
- **v4 (current):**
  - Elevation mode: the Layout | Elevations switch, a split view, and drafts applied as one step;
  - auto-fit proposals;
  - assigning like a colour picker;
  - a Front | Side drawing;
  - Properties reduced to a read-only line;
  - Regenerate keeps elevation choices.
