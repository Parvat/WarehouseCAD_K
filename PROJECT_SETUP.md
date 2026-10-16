# Project setup — where the project's inputs are read, before and after

The project's settings (ceiling heights, pallet sizes, equipment, rules, advanced) are part of the layout. They live
on the layout's elevation table, as `elevations.project`.

That table is already saved, undone and loaded with the layout (the approved A4 store field). So the protected canvas
store needs no change.

Module: `src/utils/project.js`. Screen: `components/Project/ProjectSetup.jsx`.

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
| Elevation workspace (A) / tab (B) (Clear height, Sprinklers inputs) | edit the building | **removed**; a link to Project setup when there is no ceiling |

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
