# stacking — what is drawn on top is what a click takes

Branch `stacking`, from master (87fcc55). Status: **ready**. Full suite on its own: 4445/4457 at first; the 12 failures were the drawn bar's button lists in REG-selbar-drawn, REG-block-arrow and REG-elbow-arrow (all 4 fixtures), which now end with More. Those expectations were updated and the three tests rerun: 12/12 green.

## What changed
- **One stacking rule** (`src/utils/stacking.js`):
  - The **top tier** is equipment (`mhe_`), safety items (`safety_`), ops items (`ops_`) and drawn annotations
    (lines, arrows, shapes, text). It draws above the racks, zones, aisles, sections and the floor.
  - Within each tier, the later object in the list is on top.
  - The plan (`canvas2/Scene.jsx`), the PDF (`export/pdfExport.js`) and the click (`canvas2/hitTest.js` `pickAt`) all
    read this one rule.
- **The click takes what is on top.**
  - A Forklift on a Drive-In rack is picked, which was the reported bug. Before, a rack and a Forklift tied, and
    whichever came first in the list won, usually the rack.
  - A rack is picked only where nothing sits on it.
  - Of two top-tier objects that overlap, the later wins.
- **A filled closed shape** (rectangle, circle, polygon) now holds a click inside it, over a rack under it, because it
  covers what is under it. An unfilled shape is still see-through: its inside comes after everything else, as before.
- **Bring to front / Send to back**:
  - The ⋯ More menu and the right-click menu now say *Send to back* and *Bring to front*; they were *To back* and
    *To front*.
  - The drawn shapes' selection bar gets the same ⋯ More menu, which only the rack bar had before.
  - Each change is one undo step (the store's own actions). The order is saved, because it is the objects' order in
    the file.
- **The stack hint.** A click where 2 or more objects truly hold the point (not counting the building) shows a small
  dark hint next to the pointer: **Tab for the next one under here**. It goes when the pointer moves 12 px, after
  3 s, or on Tab or Esc. It is screen UI, so its size never follows the zoom.

## Decisions made
- **Tiers never swap.** Bring to front moves an object within its own tier only, so a rack can never cover a
  Forklift, whatever the menu does.
- **Equipment, safety and ops items have no selection bar** (unchanged, `barFor`). Their order is set from the
  right-click menu, or from the card's More → Arrange.
- **The hint counts only objects whose own shape holds the point.** Pick padding doesn't count, so a click on a rack
  beside a Forklift shows no hint.
- **On the PDF**, equipment, safety and ops boxes now print after the racks, as on the plan. Before, they printed under
  them.

## Rule 7
No layout rule changed. Nothing is placed, cut or moved.

## Tests
- **REG-stacking** (new, real clicks, all 4 fixtures). It places a Drive-In rack, then a Forklift on it, from the
  library, and checks:
  - a click on the Forklift picks the Forklift and shows the hint;
  - Tab takes the rack;
  - a click on the free part of the rack picks the rack, with no hint;
  - a second Forklift overlapping the first wins where they overlap;
  - Send to back (right-click) swaps them, one undo step;
  - Bring to front (right-click) swaps them back;
  - one Ctrl+Z undoes that, and the order is kept in the saved file;
  - a drawn rectangle's ⋯ menu carries both items.
- **Updated** (only the item names): the More-menu lists in REG (2) and SBR-object-menu.

## Rule 9 basics on what changed
- **Select:** the most specific object, now the one on top, wins; Tab cycles the stack. REG-basics is in the full suite.
- **Arrange:** one undo per action, plus redo; saved in the file.
- **PDF:** prints in the same order as the plan.

## Dealer walkthrough
Place a Drive-In rack, then a Forklift on it. A click on the Forklift selects it and shows *Tab for the next one under
here*; Tab selects the rack. Right-click the Forklift → Send to back: it stays drawn over the rack (tiers never swap),
but under a second Forklift. Draw a filled rectangle over a rack: a click inside it takes the rectangle. An unfilled
one still lets you click the rack inside it.

## Hand-check (≤ 6)
1. Place a Drive-In rack, then a Forklift on top of it. Click the Forklift: the Forklift is selected, and the hint
   *Tab for the next one under here* shows by the pointer.
2. Press Tab: the rack is selected.
3. Click the rack where the Forklift isn't: the rack, and no hint.
4. Place a second Forklift overlapping the first. Right-click it → Send to back, then click the overlap: the first
   Forklift is selected. Press Ctrl+Z: the second is on top again.
5. Draw a filled rectangle over a rack and click inside it: the rectangle is selected. Its ⋯ menu has Send to back and
   Bring to front.
6. Export the PDF: the Forklift prints over the rack.
