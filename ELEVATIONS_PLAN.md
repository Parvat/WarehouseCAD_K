# Elevations v1 — plan

Branch `canvas2-elevations` off master (3f7c258). Working mode per CLAUDE.md / memory.

## Stop-condition check (done before building)

- **Bays / usable on the fixture and the Generate layouts.** Existing racks' `levels` become types on load and every
  count reads the bay's type levels, which equal the rack's old `levels` — so positions and usable are identical.
  Verified by test on the 12 fills (H and V) and the 4 Generate layouts.
- **Rules already set.** None changes. The Row group "levels" replay still works: a levels edit becomes a type
  assignment with that many levels, and the replay gives the other rows the same. One-side delete, takeover, splits
  and joins keep their behaviour and now also carry the type.
- **Product forks decided here** (listed in the report):
  - Bay counts in the legend count each side of a back-to-back as one bay, because the two sides can carry
    different types.
  - The building's **clear height** is a new field on the building (Properties). A building without one is not
    checked.
  - Frame depth is an attribute of the type (drawn, exposed to the BOM). It does not resize racks — "nothing moves".

## 1. Data

**Types table** — one object in the layout's `objects` (so undo, save/load and paste-exclusion come free; the canvas
store is protected and has no other place):

```
{ id: 'elevation-types', type: 'elevation_types', version: 1, defaultId,
  types: [{ id, name, color, uprightHeightIn, frameDepthIn, clearanceIn,
            levels: [{ beamIn, palletHeightIn, loadLb }] }] }   // levels from the floor up; beamIn 0 = on the floor
```

`version` is the elevation schema version inside the `.trace`/`.wcad` file (bumped on breaking changes).
The object is never drawn, picked, selected, deleted by Delete / Select all, copied or exported as geometry.

**Assignment** — on each beam rack, overrides only where they differ:

- `elevType` — the rack's type (absent = the layout default)
- `elevSides: [t0, t1]` — per side of a back-to-back (side 0 = local top band, the same convention as
  `activeBaySide` / `faceIndex`); null = the rack's
- `elevBays: [[...side 0 per bay], [...side 1]]` — per bay on a side; null = the side's

A bay-side's type = bay ?? side ?? rack ?? default. After every write the overrides are **compressed** (minimal
storage, same resolution): the majority type of each side becomes the side type, the common side type the rack type,
and the rack type is dropped when it is the default.

`rack.levels` stays as a mirror of the rack-level type's level count, so every existing reader keeps working. Every
count that can see a single bay (bay ledger, rack capacity, column pick blocks, narrow aisles, usable) reads the
**bay-side's type** through `levelsAt(rack, bay, side)`.

## 2. Load, keeper, existing tools

- **Migration** (`reconcileElevations`, run by a keeper on load and after each action, folded into that action's
  history entry like the pair keeper): with no table, one type per distinct `levels` value ("4 levels": floor + a
  beam every 60", pallet 48", clearance 6", 2,000 lb, upright = top beam + 60", frame depth = the most common rack
  depth). The most common becomes the default. Racks with other levels get `elevType`. Nothing moves.
- **A levels edit** (rack panel, Row group levels replay, anything that sets `levels`): the rack gets the type with
  that many levels (an existing one, or a copy of its type with levels added or removed at the same spacing).
- **New racks** (placed, Generate, Fill): the layout default. Fill and racking areas plan with the default's level
  count.
- **Carry the type**: bay-delete splits (`splitRackForBayDelete`), one-side delete and the face rule
  (`piecesFromStates`: a half that becomes a single takes its side's types), Row group bay replays (`withRun`, bays
  prepended shift the indices), joins (`joinRacks`), takeover (the pair's taken bays get the single's type on that
  side), paste (the fields copy with the rack).
- **Type deleted**: every override naming it goes, so those bays fall back to the default (or their side's/rack's
  type, which is what "reassigns to the default" means for a bay under an override).

## 3. Paint mode

- **Elevations** panel (right panel): types with a colour swatch and a bay count; create, edit (name, colour,
  upright height, frame depth, clearance, levels: beam height, pallet height, load; add or remove a level),
  duplicate, delete, set as default; "Show colours" toggle; the side view.
- **Paint** on a type: the paint tool (`elevation_paint`). A bar at the top of the canvas: type, **Row / Side / Bay**
  (Row by default), **Reset to default**, Done.
- **Hover** shows exactly what a click changes: Row = every rack of the row (`rowsOf`); Side = the half under the
  cursor (`bayHalfAt`; the flue = both sides; a single = its one side); Bay = that bay on that half (flue = both
  halves).
- **Click** applies. **Drag**: Bay / Side stay on the row and the world side where the drag started (the run between
  the first and the current bay); Row paints every row it crosses. One history entry per click or drag.
- **Reset** removes the overrides on the target: Row → all of the rack's; Side → that side's and its bays'; Bay →
  that bay's.
- Esc, Done or the Select tool leave paint mode.
- **Row group**: a type change is a new edit kind `elev`. It is replayed per bay-side at the same uprights (within ½")
  and on the same world side, then compressed. A row with nothing lined up is skipped.

## 4. Plan view

- Each bay band is filled with its type colour; each side of a pair is filled separately.
- Legend at the canvas's bottom left: swatch, name, bay count, for the types in use.
- "Show colours" toggle (panel and legend; presentation state, localStorage `trace.elev.v1`). The PDF follows it:
  fills plus a legend block next to the title.

## 5. Side view

An SVG elevation per type: two uprights, the beams at their heights, pallets on each level, the clearance band,
dimensions (each beam height, pallet height, upright height, frame depth). Drawn in the panel under the selected
type and edited through its fields. The PDF gets a second sheet with every type in use.

## 6. Rules

- Different types side by side, or on the two sides of a pair: no warning.
- A shared upright takes the taller type's height (BOM data).
- Check layout **errors**:
  - "Elevation X: top of upright 22' is above the building's clear height 20'" (racks using X inside that building).
  - "Elevation X: level 2 pallet 48" + 6" clearance doesn't fit between the beams at 60" and 100"" — for the top
    level, measured against the top of the upright.
- Pallet positions per bay = positions on the beam × the bay-side type's level count.

## 7. For the BOM (exposed, not built)

`elevationBays(objects)` → per rack, per bay, per side: `{ rackId, bay, side, typeId, levels (beam heights),
uprightHeightIn, beamIn }`. `uprightHeights(objects)` → per rack, per upright position, per side: the taller
neighbour's height.

## 8. Tests (`EV_elevations.test.js`), both orientations

- Migration: types from levels; usable unchanged on the fixture fills and the Generate layouts; nothing moves.
- Resolution and the six assignment cases; compression; reset; type delete.
- Positions per bay from the type's levels (ledger, usable, narrow aisles, column check).
- Paint targets and strokes (Row / Side / Bay, flue, drag constraints); one history entry.
- Carry through split, one-side delete, takeover, join, paste, Row group bays.
- Row group `elev` replay on the same world side.
- Check layout errors.
- Legend counts; PDF fills / legend / side-view sheet.
- BOM data.
- One break-it per behaviour.

Real-mouse check: create two types, paint a row, one side, three bays by drag, reset, undo, toggle colours,
legend counts.
