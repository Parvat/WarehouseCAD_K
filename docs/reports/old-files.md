# old-files: every saved file loads, stable across save and reload

Branch `old-files`, from master. It adds one test file and changes no app code. Related tests: `OF_oldFiles.test.js`,
13 / 13.

## What is checked (`src/__test__/plan/OF_oldFiles.test.js`)
- **Every saved file in the repo** is loaded, saved, reloaded, then saved and reloaded once more: the demo file and every
  `handCheck/*.wcad` (on holiday-run, also the lane fixtures). Each round gives the same object count, positions
  (capacity with the ledger and levels), rack numbers (R1…, D1…) with their ids, beam BOM lines, and lane BOM sections.
  The objects after the second round equal those after the first.
- **Older formats deserializeScene still reads:**
  - **Version 1:** the elevation types stored as an object among the objects. They move to their own field, and the
    figures match the demo file's.
  - **A polygon:** the Polygon tool is gone, so it loads as a closed polyline and stays one after a save.
  - **A file with no textSizes, drawStyles, groups or savedAt:** loads with the same figures.
  - **A bad file:** not a WarehouseCAD file, no objects array, or invalid JSON each gives a clear error.

## Result
Every file and every older format loads, and its figures are stable. Nothing needed fixing.

## Screenshots
None: nothing on screen changed.

## Questions for PP
1. Are there older customer files (before version 2) worth adding to this test? The repo only has the demo file and the
   test fixtures.
