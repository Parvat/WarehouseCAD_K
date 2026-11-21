# basics-fixes — every library type through the Basics contract (Rule 9)

Branch `basics-fixes`, from `basics-triage`. Status: **ready**.

## Result
REG-basics, both fixtures: **0 failures** for the 8 draw tools and every library type (Racking, Ops, Structural, Safety, Zones, Floor Plans). The only n/a results are the exemptions below, each with its reason.

## What changed in the app
- **PDF (20 types):** objects with no symbol of their own (all 12 Ops items, all 5 Safety items, Column / Pillar, Partition Wall, Window / Skylight) now print as their box and name, turned with them, as the canvas draws them (`export/pdfExport.js` `otherSVG`). They also count in the sheet's extent, so one outside the building is not cut off.
- **Typed sizes:**
  - **Width and Depth (ft)** in the card of every Ops and Safety item, Column / Pillar, Window, Mezzanine and Shelving Unit. A Partition Wall gets **Length and Thickness** instead. One undo each.
  - **Cantilever:** a typed **Towers** count, which sets its length. A new tower copies the last tower's arm.
  - **Lane racks** (Drive-In, Drive-Through, Pushback, Pallet Flow) already had typed **Lanes** and **Deep**. They now carry their names, so screen readers and tests can find them.

## What turned out not to be bugs (the triage's "bugs" group)
Each was reproduced on its own first:
- **Rack lock "not holding":** a locked rack neither moves nor deletes. The only change was the picked bay side (`activeBaySide`), which a click sets. That is selection, not the object.
- **Lane-rack undo "2+ steps":** one Ctrl+Z puts it back. It was the same `activeBaySide` difference.
- **Zone resize "does nothing":** zones resize when tested alone. In the harness, Ctrl+Z could step back past its own setup.
- **Selection (click, box, Shift, Tab) and snap for Ops / Safety / Partition / Window:** the harness placed items on top of racks (older-horizontal) or below the end of the wall line (crowded-vertical).
- **L-Shape / T-Shape "lost":** Ctrl+Z stepped back past the harness's own setup.
- **Doors' box select:** the box corners landed on racks or walls, so the press dragged them.

## The harness — what changed and why
- Library items (except doors and the column grid) are placed **inside the building on floor cleared of racks**. That is where they are used, with the wall alongside for the snap test.
- **The setup becomes the start of undo history**, so Ctrl+Z never reaches the fixture as it was.
- A rack's picked bay and bay side are ignored when comparing the object (selection state).
- **Box select:** tried at 3, 8 and 15 ft round the object, from each corner, so it starts on open floor.
- **A building:**
  - gripped 30 % along a wall, away from its squares (its middle is the side square, a resize);
  - its move must keep its size;
  - resized by a side square;
  - grips are never under the islands (on an L or U, the top wall's grip point sat under the top-left island);
  - the view settles after the building is placed.
- **Snap** also counts the project's wall-clearance line and column edges as edges.

### Exemptions (n/a, with the reason)
| Type | Checks | Reason |
|---|---|---|
| Dock, Man, Drive-in Door | move, undo/redo of it, snap, Alt | doors move along their wall only |
| Column Grid | the one-object checks (select, move, resize, snap, zoom, typed, copy, paste, duplicate, delete), lock | a column grid is edited by its columns and grid lines (col-grid round); it follows the Columns layer lock |
| Buildings (all shapes) | box select, Shift adds, snap, Alt | a box never selects the building (`isMarqueeExcluded`); a building is selected on its own; a building is the walls others snap to |
| Line, Elbow arrow | typed value | drawn annotations have no typed values |
| Polyline | typed value | edited by its points |
| Selective Rack in a filled building | copy, paste, duplicate, resize | no room between real racks: a copy or a resize never overlaps a rack |

## Decisions
- Buildings' box/Shift/move behaviour is treated as by design. A drag on a wall moves the building across that wall (REG-7a-wall). If a building should also move freely, that is a separate change.
- **Found, not fixed:** on an L-Shape, dragging either inner (notch) wall does nothing, while its outer walls resize. Not a Basics failure (the outer walls pass); it is noted for the Polish list.

## Checks
- REG-basics, every group, both fixtures: 0 failures.
- Dealer walkthrough on crowded-horizontal:
  - a Charging Station typed to 12 × 6 ft;
  - a Guardrail typed to 30 ft;
  - the Charging Station, Bollard and Guardrail are on the PDF;
  - a Cantilever set from 2 to 8 towers;
  - save and reload unchanged; no page errors.
- Full suite on its own: **4,412 / 4,412 passed**.

## Hand-check (≤ 6)
1. Place a Forklift, select it: its card has Width and Depth; type 12 → 12 ft wide.
2. Export the PDF: the Forklift, a Bollard and a Guardrail are on it as labelled boxes.
3. Select a Cantilever Rack: type 8 in Towers → 8 towers.
4. Select a Drive-In Rack: Lanes and Deep take typed numbers.
