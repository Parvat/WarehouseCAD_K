# fill-columns-a — option A for Fill only

Branch `fill-columns-a`, from master (87fcc55). Status: **parked**. Rule 7 itself showed only the expected changes, but a
feature outside it broke: Row group (Apply to the other rows) stops lining up rows. So I stopped this branch, as
instructed. The code on the branch is the second version below, with REG-fill-columns. It is for review, not for merge.

## What option A was asked to do
When Fill makes a run, slide the run within its leftover length so that no upright frame stands on a column. Drop a bay
only when no offset works. Never move racks that already exist.

## Two ways I built it, and what each broke

**1. Each rack slides on its own** (within its own leftover):

| Case (crowded-* identical to older-*) | Racks | Bays | Positions | Frames on columns | Racks moved |
|---|---|---|---|---|---|
| older-horizontal · whole building | 7 → 7 | 196 → 196 | 2,464 → 2,464 | 4 → **0** | 1 |
| older-horizontal · split at 100 ft | 14 → 14 | 189 → 189 | 2,376 → 2,376 | 0 → 0 | 0 |
| older-horizontal · small section | 2 → 2 | 14 → 14 | 168 → 168 | 3 → **0** | 1 |
| older-horizontal · short-row section | 7 → 7 | 28 → 28 | 352 → 352 | 2 → **0** | 1 |
| older-horizontal · L-shaped section | 3 → 3 | 36 → 35 | 480 → 464 | 3 → **0** | 1 |
| older-vertical · whole building | 14 → 14 | 196 → 196 | 2,800 → 2,800 | 0 → 0 | 0 |
| older-vertical · split at 100 ft | 28 → 28 | 182 → 182 | 2,600 → 2,600 | 0 → 0 | 0 |
| older-vertical · small section | 3 → 3 | 21 → 21 | 224 → 224 | 1 → **0** | 1 |
| older-vertical · short-row section | 14 → 14 | 56 → 56 | 800 → 800 | 0 → 0 | 0 |
| older-vertical · L-shaped section | 3 → 3 | 27 → 27 | 360 → 360 | 0 → 0 | 0 |

This is exactly the expected impact, and every frame on a column is gone. **But a slid row's uprights no longer line
up with its neighbours'.** 55 unit tests fail:
- Row group, 30 tests: "Apply to the other 11 rows? 2 skipped" becomes "… 6 skipped (uprights don't line up)".
- The real-layout tests, 17 tests: rows and uprights no longer line up across.
- The cross-aisle / access width tests, 4 tests.
- The column-aisle tests, 3 tests.
- The pairing test, 1 test.

**2. The whole run grid of one Fill slides together** (every row of that Fill by the same amount; the offsets tried
are the few that put a frame face just past a column face; most bays first, then the smallest slide):

| Case (crowded-* identical to older-*) | Racks | Bays | Positions | Frames on columns | Racks moved |
|---|---|---|---|---|---|
| older-horizontal · whole building | 7 → 7 | 196 → 196 | 2,464 → 2,464 | 4 → **0** | 7 |
| older-horizontal · split at 100 ft | 14 → 14 | 189 → 189 | 2,376 → 2,376 | 0 → 0 | 0 |
| older-horizontal · small section | 2 → 2 | 14 → 14 | 168 → 168 | 3 → **0** | 2 |
| older-horizontal · short-row section | 7 → 7 | 28 → 28 | 352 → 352 | 2 → **0** | 7 |
| older-horizontal · L-shaped section | 3 → 3 | 36 → 33 | 480 → 440 | 3 → **0** | 3 |
| older-vertical · whole building | 14 → 14 | 196 → 196 | 2,800 → 2,800 | 0 → 0 | 0 |
| older-vertical · split at 100 ft | 28 → 28 | 182 → 182 | 2,600 → 2,600 | 0 → 0 | 0 |
| older-vertical · small section | 3 → 3 | 21 → 21 | 224 → 224 | 1 → **0** | 3 |
| older-vertical · short-row section | 14 → 14 | 56 → 56 | 800 → 800 | 0 → 0 | 0 |
| older-vertical · L-shaped section | 3 → 3 | 27 → 27 | 360 → 360 | 0 → 0 | 0 |

The rows of one Fill stay lined up. **But each section picks its own slide, so row 7 of section 3 no longer lines up
with row 7 of section 4.** Row group spans sections, so 52 unit tests still fail, the same families as above.
For example: "Apply to the other 11 rows? 2 skipped" becomes "Apply to the other 7 rows? 6 skipped". The L-shape also
gives up 3 bays (480 → 440 positions), where version 1 gave up 1.

## Why I stopped
Today every Fill in a building lays its uprights on one grid, the building's. Row group, the Cross aisle tool and the
access checks rely on that. Any per-row or per-Fill slide breaks the shared grid wherever it acts. That is outside the
expected impact ("only Fill-created rows that hit a column shift"), so per your rule this branch is parked.

## What would work (a decision for you)
- **C. One slide for the whole building.** Choose a single grid offset per building from its column grid alone, the same
  for every Fill and section in it. Every row keeps lining up with every other row. Frames clear the columns wherever
  the column spacing allows. It moves every Fill-made rack in a building with columns by the same few inches, so the
  Rule 7 table would show "moved" on every horizontal case, with positions unchanged except where a section end now
  cuts a bay.
- **D. Keep version 1 or 2, and teach Row group to accept a slid row.** It would treat "same bay count and beams, offset
  by less than a bay" as lined up, and apply the change by bay index instead of by upright position. This is a bigger
  change to Row group.
- **E. Leave Fill as it is.** Make Check's "frame on a column" item offer a one-click "slide this row off the column"
  fix, which the user chooses knowingly.

I'd recommend C. It keeps the one-grid rule everything else depends on.

## Checks
- REG-fill-columns (new, on the branch): fails on master, passes on the branch, on all 4 fixtures.
- The branch is parked, so I did not run the full suite. The non-browser suite shows the 52 failures described above.

## Hand-check (≤ 6)
1. On master, fill the whole crowded-horizontal building. Check lists 4 frames on columns.
2. On this branch, do the same. Check lists none, and the rows sit a few inches along.
3. On this branch, select row 7 of two sections as a Row group, then change a bay. The apply now skips rows that used
   to line up.
