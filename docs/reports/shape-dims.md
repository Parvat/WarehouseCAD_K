# shape-dims — the ruler toggle on drawn shapes

Branch `shape-dims`, from master (87fcc55). Status: **ready**. Full suite on its own: 4448/4457 at first; the 9 failures were the drawn bar lists in REG-selbar-drawn and REG-elbow-arrow (they now carry Dimensions before Lock) and FU-sizes (the defaults now include Shape sizes 12″). Those expectations were updated and the tests rerun: all green. Design: `design/dimtoggle.png`
(force-added; `design/*.png` is git-ignored).

## What changed
- **A ruler toggle** (the *Measure* ruler icon, labelled *Dimensions*):
  - in the selection bar of a Line, Arrow, Elbow arrow, Polyline (open or closed), Rectangle and Circle;
  - in their card, as a *Dimensions* switch.
  - It is off by default.
  - It is saved with the shape (`showDims`), one undo step per toggle, with redo.
  - On a multi-selection it turns every shape on at once, or all off when all were on.
  - It is not a remembered "style", so a new shape always starts with it off.
- **What it shows when on** (`render/drawnShapes.js` `dimLabels`):

  | Shape | Shows |
  |---|---|
  | Line or arrow | its length above its middle, turned along it, never upside down |
  | Elbow arrow, open polyline | each segment's length |
  | Closed polyline / polygon | each side's length, outside the shape, and the area at its centroid |
  | Rectangle | width centred above its top, length to the right of its right edge, area inside (in its stroke colour) — as in the design |
  | Circle | ⌀ diameter at its centre (an ellipse shows W × H) |

  - **Display only:** the labels can't be clicked or typed into.
  - **Project units:** ft-in in Imperial, metres on the plan in Metric, and areas in sq ft or m².
- **CAD text model (Rule 8).**
  - A new label type, **Shape sizes**, 12″, appears in the Text panel with its Reset.
  - The labels are drawn in drawing units, so they look the same at every zoom, only bigger or smaller.
  - Each sits a fixed drawing offset off its own edge, so one shape's labels never overlap each other.
- **Live while dragging:** the labels are part of the shape's own drawing (`DrawnBody`), so they move and change with a
  move or resize before the release.
- **PDF:** the same labels print (`drawnSVG`, `data-dim`).

## Decisions made
- **Colours:**
  - Dimensions use the drawing's dimension blue (`#1B4FD8`), as in the design.
  - The area uses the shape's own stroke colour, like the orange "528 sq ft" in the design.
- **Text size:** a new type, *Shape sizes* (12″), rather than borrowing another type's size, so it can be set on its
  own.
- **A named rectangle with its ruler on** shows its name alone in the middle; the area sits under it. The name label's
  own "size · area" line steps aside, so nothing is shown twice or overlaps.
- **Block arrow and text** have no ruler. They weren't in the list, and a block arrow has its own size field.
- **Rule 8 across objects:** a shape's dimension labels are not moved off other objects' labels. A shape's labels sit at
  fixed offsets from that shape only.

## Rule 7
No layout rule changed.

## Tests
- **REG-shape-dims** (new, real clicks, all 4 fixtures). It draws a rectangle with R and checks:
  - the ruler is off, with no labels, and the card switch is off too;
  - one click turns it on, as one undo step;
  - width, length and area text and positions are right;
  - the world font size is 12″, the same after zooming;
  - a click on a label opens no field;
  - a side drag updates the width label before the release;
  - Ctrl+Z twice turns it off, and Ctrl+Y turns it back on.
  
  It then draws a line with L, Shift-selects both shapes, and checks that one click turns both on in one step and the
  line's length sits above its middle. Finally it checks that the PDF has all four labels and that both shapes are
  still on after a save and reload.

## Rule 9 basics on what changed
- **Select:** the labels can't be picked.
- **Edit and undo:** the toggle is one undo step, with redo.
- **Copy and paste:** a copied shape keeps `showDims`.
- **Save and reload:** kept.
- **PDF:** printed.
- **Every zoom:** the same.
- **Multi-selection:** works.

## Dealer walkthrough
- An arrow 42′-6″ long, its ruler on: **42′-6″** above its middle.
- A 32′-6″ × 16′-3″ tinted rectangle: **32′-6″** on top, **16′-3″** on the right, **528 sq ft** inside, as in the design.
- An elbow: each leg's length, the vertical one turned.
- A closed polyline: each side and its area.
- Exported to PDF: 11 dimension labels.

## Hand-check (≤ 6)
1. Draw a rectangle about 32′ × 16′. Its bar has the ruler, which is off: no dimensions.
2. Click the ruler: the width shows on top, the length on the right, and the area inside. Ctrl+Z turns them off again.
3. Draw an arrow and turn its ruler on: its length shows above its middle. Drag its end: the number follows.
4. Draw an elbow arrow and a closed polyline with the ruler on: each segment's length shows, and the polyline's area
   too.
5. Zoom in and out: the numbers stay the same size on the drawing.
6. Export the PDF: the dimensions print.
