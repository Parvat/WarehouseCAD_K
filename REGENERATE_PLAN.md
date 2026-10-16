# Regenerate — plan

> **Built.** Where the build differs from the plan below:
>
> - Generate records what it placed on its **building** (`genPlaced`: rack id → signature), instead of creating a
>   racking area. The plan's step 1 would have added an object to every Generate layout and its tests.
> - Regenerate (`generate/regenerate.js` `planRegenerate`, `traceGenerate.js` `regenerateRacking`) replaces **every**
>   generated rack, the hand-edited ones included. Their edits are counted in the warning as lost, not kept.
> - The new racks go into one racking area over the building, so the next Regenerate counts that area's hand edits.
> - When the building already has a layout, Generate asks "Regenerate racking" (with counts) or "Start over" (the old
>   Generate).
> - Elevation choices are carried: each new rack side takes the elevation of the old generated bay-sides it overlaps
>   most, else the default (`carryElevations`). Aisle labels are not carried over.

**Goal:** re-run racking on a finished layout and replace only the racks that Generate or Fill made. Everything else
stays as the user left it:

- building shape, walls, columns
- zones
- doors (later)
- text, dimensions, layers
- elevation types

Hand-placed racks stay where they are and act as obstacles. Before anything changes, the user sees how many rows and
hand edits will be lost.

## 1. What exists today

**Generate** (`components/Generate/GeneratePanel.jsx` `run()` → `generate/traceGenerate.js` `generateAndPlaceBatched`)
**can't do this as it stands.**

- Every run starts with `store.clearGeneratedLayout()`. That deletes the generated building **and every object
  parented to it**: zones, text and library objects placed by hand all carry that `parentId`.
- It then draws a fresh `fp_rect` centred at the origin, a new `column_grid`, racks, aisles and the default layers.
- Its inputs (length, width, aisle, grid, MHE, orientation…) live in GeneratePanel's own state and aren't saved in
  the scene. A few are mirrored to `useRackingSettings` (localStorage `trace.racking.v1`).
- Its racks carry `rowIndex`, `genSection`, `genRunFt` and `genCrossFt`, but **no "generated" or "edited" marker**.

**Fill** (`generate/rackingArea.js` `planAreaCreate` / `planAreaResize` / `planAreaRebuild`) **already does most of
it.**

- It works inside the building's real outline (any rectilinear shape) and treats zones as holes whose edges count as
  walls.
- It reads the existing `column_grid`.
- It keeps **every rack already there**, hand-placed or not, as an obstacle (each one grown by the aisle width).
- It stamps its own racks with `areaId`.
- Its area records what it placed (`placed: { rackId: rackSig }`), so on a refill it can tell its clean racks apart
  from hand-edited ones:
  - clean racks are replaced;
  - edited racks stay, trimmed to whole bays;
  - racks the user deleted leave their spot empty.
- `areaEdits(objects, area)` already counts what a refill would change, and the Fill tool asks before acting
  (`EDIT_WARNING`).

## 2. Recommendation: Regenerate = one Fill over the whole building, with Generate's settings

**Yes, Regenerate can be "Fill over the whole building".** Call `planAreaCreate(objects, innerBox(building), settings,
{ from, elevations })` with Generate's settings mapped onto Fill's. Hand-placed racks and zones stay in `objects`, so
Fill keeps clear of them.

To get there, Generate itself should **create a racking area covering the building**. Then every generated rack has an
owner and a `placed` signature, just like Fill's. That gives three things:

- Regenerate becomes `planAreaRebuild` on that area: the code path that already exists, is tested and asks first.
- "Hand edits lost" is counted exactly by `areaEdits`. Today generated racks have no record of their original shape,
  so their edits can't be counted at all.
- One way of placing racks instead of two.

**What a Regenerate keeps and replaces:**

| Kept | Replaced |
|---|---|
| building, walls, `fpVerts`, wall thickness | racks with that area's `areaId` that are unedited (`sigMatch`) |
| `column_grid`, zones, text, dimensions, layers | the aisles between them (`rebuildAisles`) |
| elevation types (`store.elevations`) | |
| hand-placed racks (no stamps): obstacles | |
| racks edited by hand: kept, trimmed to whole bays | |
| other racking areas and their racks: obstacles | |

**Elevation types survive:**

- The table isn't touched.
- New racks take the layout default.
- A replaced rack in the same place and shape keeps its id, and so its `elevType`/`elevSides`/`elevBays` (Fill's
  `shapeKey` reuse).
- Where shapes change, carry types over by position with `carryElev`.

## 3. Differences to close (Generate settings → Fill)

| Generate | Fill today | Plan |
|---|---|---|
| orientation `'auto'` (`pickOrientation`, best usable) | horizontal or vertical only | run both, keep the better usable count, as Generate does |
| creates the column grid from gridX/gridY | reads the existing grid | fine: regenerating keeps the grid |
| building from length × width (`fp_rect`) | the real outline (L/T/U/cross) | better: works on edited buildings |
| run-end clearance from `layoutSpec` (outline + wall) | `wallClearIn` from the inner face, `ends: true` | align on one rule (inner face + clearance); expect a few inches' difference |
| first row from the wall (`rowBands`) | pattern anchored at a corner (`from`) | pass `from` = the corner Generate starts from, so rows land where they did |
| depth / upright from the brief | from rules (`layoutSpec`) | read them from rules in both |
| levels 4 | the default elevation type's | use the default type (already the source of truth) |

## 4. The warning

Before anything is written, one dialog:

> Regenerate racking? **N rows** will be replaced (**M racks**). **K racks edited by hand** will be kept and trimmed;
> **D deleted spots** stay empty. Hand-placed racks, zones, text, dimensions and elevation types are kept.
> [Regenerate] [Cancel]

- The counts come from `areaEdits` (changed / removed) and the area's own racks.
- Old layouts whose racks have Generate stamps but no area: offer "Regenerate" as **replace all generated racks**.
  There's no record of what was edited, so the dialog says so: "hand edits to these racks can't be detected and will
  be lost".

## 5. Undo, keepers

- **One step:** `beginOneStep()` / `endOneStep()` (traceGenerate.js), or the Fill tool's `skipNextAction()` →
  `setState` → `commitObjectUpdate(anchor, {})`.
- **Never use** `clearGeneratedLayout` (it wipes children) or `addObject` per object (one entry each).
- **Afterwards:** `rebuildAisles`. Aisle labels (`labelSizeIn`, text) are lost where their aisle is replaced; carry
  them over by matching row pairs.
- The Row group is cleared (`clearGroup`).
- The elevations keeper and the aisle keeper run as usual.
- Column check and narrow aisles are derived, so nothing to store.

## 6. Steps

1. Generate also creates a racking area over the building (settings saved on it). Its racks get `areaId`. Tests: the
   12 fills and 4 Generate layouts are unchanged rack for rack.
2. Map Generate's settings onto Fill's (`orientation: 'auto'` scored both ways; `from` corner; clearance rule). Tests:
   Fill over a Generate building reproduces Generate's racks.
3. A "Regenerate racking" action (Generate panel and the area's panel), with the warning above. One undo step.
4. Old layouts (stamps, no area): "replace generated racks" with the can't-detect-edits warning.
5. Carry over aisle labels and elevation types by position.

**Open question for you:** should step 1 (Generate makes an area) also change the **first** Generate? Today it
replaces the whole building every click (BUG 65/68 behaviour). With an area, a second Generate click could be the
Regenerate instead, keeping hand work.
