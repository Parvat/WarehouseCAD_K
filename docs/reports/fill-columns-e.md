# fill-columns-e — Check's Slide off column

Branch `fill-columns-e`, from master (87fcc55). Status: **ready**. Full suite on its own: 4352 passed; X_bayBeam's setup hook timed out under load (20 s), so its 105 tests were skipped. Run on its own it passes 105/105, giving 4457/4457. `fill-columns-a` stays
parked.

## What changed
- **Fill and Generate are unchanged.**
- **The button:** every Check layout item for a column on an upright frame (kind `upright`) gets a **Slide off
  column** button, on its own line under the item.
- **What it moves:**
  - the rack's whole row (every piece of that section's rack line);
  - or, when the row is in the **Row group**, every row of the group by the same amount, so their uprights stay lined
    up.
- **How far:** the smallest amount along the run, an inch at a time, either way, up to **half a bay** (the rack's
  widest beam plus its upright, halved).
- **When a slide is taken:**
  - the clicked row has no frame on any column;
  - no rack it moves gains a frame-on-column hit it didn't already have;
  - nothing it moves overlaps a rack or zone it doesn't move;
  - every moved rack stays on its building's floor.
- **Undo:** one step (the store's `moveObjects`), so Ctrl+Z puts it all back. The open Check list re-checks and drops
  the fixed item by itself.
- **No slide within half a bay:** nothing moves, and the button says why ("No slide within half a bay (49.5″) clears
  it"; the tooltip has it too).

New: `src/utils/slideOffColumn.js` (`planSlideOff`, `slideOffColumn`). The button is in `studio/cards.jsx`
`CheckCard`.

## Decisions made
- **"Row"** is Row group's own row (`utils/rowGroup.js` `rowsOf`): one section's rack line, all its pieces. Its
  neighbours across the aisle don't move. Moving along the run keeps every aisle width.
- **The Row group is the live one on the canvas** (`useRowGroup.keys`), so the slide uses the group exactly as you
  formed it.
- **Existing hits on other moved racks are allowed to stay;** only new ones block a slide. The rule is "without new
  hits".
- **A row that only partly clears** is not slid: the clicked rack must come off every column.

## Rule 7 — nothing changes unless clicked
Fill, Generate and every layout rule are untouched; the only change is a button on a Check item. REG-slide-off-column
checks that opening Check moves nothing. A dry run of the planner on the fixtures (the plan only, nothing moved) gave:

| Fixture | Frame-on-column items | One row slid by | With the same row of another section (Row group) |
|---|---|---|---|
| older-horizontal | 3 | 27″, 12″, 27″ | 27″ (2 rows), **none** (3 rows), 27″ (2 rows) |
| older-vertical | 1 | 9″ | 9″ (2 rows) |
| crowded-horizontal | 3 | 30″, 12″, 27″ | 30″, **none** (3 rows), 27″ |
| crowded-vertical | 1 | 9″ | 9″ |

"None": no common slide within half a bay clears all three rows, so the button says so.

## Tests
- **REG-slide-off-column** (new, real clicks, all 4 fixtures):
  - Check layout lists the frame-on-column items, and nothing has moved;
  - a rack's row is put in the Row group with the same row of another section, and Slide off column is clicked;
  - the frame is off the column, one undo step, and the item leaves the list;
  - both rows moved by exactly the same amount (still lined up), and nothing else moved;
  - one Ctrl+Z restores every rack;
  - where a 3-row group can't slide (the horizontal fixtures), the button reads "No slide within half a bay…", with
    nothing moved and no undo step added.

## Rule 9 basics on what changed
- **Undo:** one undo step, with redo (the store's history).
- **Save and reload:** a slide is an ordinary move, so it is saved like one.
- **PDF:** prints the slid rows where they are.

## Dealer walkthrough
- older-horizontal → Check: three red "columns stand on upright frames" items, each with **Slide off column** under
  it.
- Click the first: Row 1 slides 27″ and the item goes, leaving two. Ctrl+Z brings it back.

## Hand-check (≤ 6)
1. Open a layout with racks on columns, then click **Check**. Each "column stands on an upright frame" item has
   **Slide off column**, and nothing has moved yet.
2. Click it: that row slides a little along its run, the orange frame mark goes, and the item leaves the list.
3. Ctrl+Z: the row is back.
4. Select that row and the same row in the next section as a Row group (G), then Slide off column: both slide
   together and still line up.
5. Where it can't be done (try a 3-row group in older-horizontal), the button says "No slide within half a bay", and
   nothing moves.
6. Fill and Generate a new area: the layout is exactly as before (Fill unchanged).
