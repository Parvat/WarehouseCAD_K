# Project setup — where the project's inputs are read, before and after

The project's settings (ceiling heights, pallet sizes, equipment, rules, advanced) are part of the layout. They live
on the layout's elevation table, as `elevations.project`.

That table is already saved, undone and loaded with the layout (the approved A4 store field). So the protected canvas
store needs no change.

Module: `src/utils/project.js`. Screen: `components/Project/ProjectSetup.jsx`.

## The screen (v2: one start screen)

**A new project** opens one start screen. It replaces both the separate setup popup and the Generate panel's first
step. It opens only for a new, empty layout: Draw on an empty layout with no project, or a fresh empty layout
(File → New). Nothing opens it once a layout exists, and there is no "set it up first" trigger on Generate, Fill or
placing racks.

- **Building:** length, width, clear height, sprinkler height. The clear height may stay empty (see below).
- **Pallet:** face, depth, height, weight, beam face. Pre-filled 48×40×48", 2,500 lb, beam face 4".
- **Forklift** (reach truck) and **wall clearance** (3").
- **Advanced** (folded): load clearance 6", sprinkler clearance 18", hole pitch 2", upright step 1', flue 6",
  units.
- **[Generate layout]** continues on the same screen with the column grid, row direction, columns along the wall and
  max run, then generates (`generateBrief`, the brief the Generate panel also uses). **[Draw it myself]** keeps the
  project and closes. Esc or ✕ do the same as Draw it myself, so a project always exists afterwards.
- The building values are kept on the project (`project.building`), and the Generate panel starts from them when
  opened later. That panel now starts closed: it is for regenerating, or starting over at another size.

**Project settings** reopens the same screen for an existing project. Ceiling heights and pallet sizes are lists,
each with + Add, edit, set default, and delete. Delete is disabled for an entry an elevation uses (`ceilingInUse` /
`palletInUse`: its own, or the saved default for an elevation without one), and for the last pallet. A change that
moves racks asks Regenerate racking / Keep layout, as before.

**From the Elevations tab:** the + Add elevation form's Ceiling ▾ and Pallet ▾ each end with "+ New ceiling height…" /
"+ New pallet size…". These open a small inline form that saves to the project (`addCeiling` / `addPallet`, one undo
step each) and selects the new entry.

**Anything not set** is assumed and reminded. A clear height not set (or no ceiling entry at all) is **24'**
(`ASSUMED_CLEAR_IN`) for the best fit, the drawing ("CLEAR HEIGHT 24'-0" (ASSUMED)") and the checks. Check layout
lists "Clear height not set — elevations assume 24'" and "Sprinkler height not set — sprinkler clearance not checked"
under **Reminders** (`projectReminders`), per ceiling in use. Reminders are never counted as issues, and clicking one
opens Project settings.

## Where each input is read: before → after

### Pallet size (face × depth; height, weight, beam face)

| Reader | Before | After |
|---|---|---|
| Generate (`GeneratePanel` → `generateAndPlaceBatched` brief `palletWIn/palletDIn`) | the panel's own Face / Depth fields | the project's **default pallet** (face, depth) |
| Fill racking (`fillTool.js` `rackingSettings()` → `planAreaCreate`) | `useRackingSettings` `palletWIn/palletDIn`, edited in the Fill bar | `useRackingSettings`, kept in step with the default pallet by the project sync; **no Fill bar field** |
| Racking area rebuild (`RackingAreaPanel` → `planAreaRebuild`) | the area panel's pallet fields | the area's saved settings; **no pallet field** (a pallet change asks Regenerate / Keep) |
| Regenerate (`regenerateRacking`) | Generate's brief | the default pallet |
| Rack panel, Rack section (pallet presets 40×48 / 48×40 / 47×32, Face, Depth) | per-rack `palletWIn/palletDIn` | **removed**; racks carry what Generate / Fill stamped (the default pallet) |
| Counts per bay (`capacity.js`, `bayLedger.js`, labels, column check: `positionsPerBeam(beam, rack.palletWIn)`) | the rack's `palletWIn` | unchanged in A. In B, the **elevation's pallet face** wherever the bay's elevation names a pallet; otherwise the rack's |
| Elevation pallet height / load / beam face (`type.levels[].palletHeightIn`, `beamFaceIn`) | the elevation's own fields; the Elevation workspace inputs (`table.fit`) | the **pallet entry's** height, weight and beam face (B: per elevation through its pallet) |

### Forklift (aisle widths follow it)

| Reader | Before | After |
|---|---|---|
| Generate brief `mhe`, `aisleFt` | `useColumnCheck().mheKey` (Generate's Forklift select) and the panel's Aisle field | the project's **equipment.mhe**; aisle = the rules' aisle for that forklift |
| Column check (`useColumnCheck` profile) | `mheKey` state, set by Generate's and Column check's selects | `mheKey` follows the project (synced on load and change); **no select** in Column check (shown read-only) |
| Fill (`useRackingSettings` `mhe`, `aisleFt`) | the Fill bar's Forklift and Aisle | synced from the project; **no Fill bar fields** |
| Racking area (`settings.mhe/aisleFt`) | the area panel's selects | the area's saved settings; **no fields** |
| Rules panel (aisle width per forklift) | rules table | unchanged (the rules themselves) |

### Wall clearance

| Reader | Before | After |
|---|---|---|
| Generate (`wallClearIn`) | Generate's Wall clearance field (`useRackingSettings`) | the project's **rules.wallClearIn** |
| Fill (`useRackingSettings.wallClearIn`) | the Fill bar field | synced from the project; **no field** |

### Clear height and sprinkler height

| Reader | Before | After |
|---|---|---|
| Check layout (`elevations.js elevationIssues`) | the building's `clearHeightFt` / `sprinklerFt` | the project's **ceiling entries**: A the default ceiling; B each elevation's own ceiling. A building's old fields are read only when the project has none |
| The drawing and PDF (`elevationDrawing.js buildingOf`) | the building's fields | the elevation's ceiling (`project.js ceilingFor`) |
| Properties, building (Sprinkler, Clear ht, Spr. clr fields) | edit the building | **removed** (Project setup) |
| Elevation workspace (A) / tab (B) (Clear height, Sprinklers inputs) | edit the building | **removed**; with no clear height set, a note that 24' is assumed, with a link to Project settings |
| A clear height not set | no checks, no fit | **24' assumed** (fit, drawing, checks); Check layout reminds |

### Elevation inputs (load clearance, sprinkler clearance, hole pitch, upright step, flue)

| Reader | Before | After |
|---|---|---|
| Proposals / best fit (`elevFit.js fitInputs`) | `table.fit` + `table.sprinklerClearanceIn`, edited in the workspace | the project's **advanced** settings (load clearance 6", sprinkler clearance 18", hole pitch 2", upright step 1') and the pallet entry |
| Check layout's sprinkler rule (`sprinklerClearance(table)`) | `table.sprinklerClearanceIn` (Properties "Spr. clr") | `project.advanced.sprinklerClearanceIn` |
| Flue for new rows (Generate / Fill) | the rules (`layoutSpec`) | the rules; **project.advanced.flueIn** is the project's record, applied to new racks' flue where the generator takes a flue. Per-rack flue in the rack panel stays: it is the rack's own geometry |

## Existing layouts

On load, the current values become the project's default entries, and nothing moves:
- a ceiling from the building's clear / sprinkler heights, if set;
- a pallet from the racks' most common face × depth plus the default elevation's pallet height and beam face;
- the forklift and wall clearance in use;
- the elevation advanced values.

Elevation types no bay uses are removed in the same pass. This is the one-time clean-up of leftover test elevations.
