# fill-columns — Fill must not put an upright frame on a column

Branch `fill-columns`, from master. Status: **parked**. The Rule 7 check found unexpected changes, so I stopped this branch, as instructed.

## What I tried
Generate's rule for columns along a run is `columnFaceFrame` (sizingLayout.js): a run end that lies on a column starts at the column's face. I applied it to Fill's two run ends (`generate/fillRacking.js` `areaPattern`): if the first or last frame would overlap a column across the row's span, that end moves to the column's face. The code is committed on this branch so you can see it; it is not ready to merge.

## Rule 7 table (before → after)
Each case: the fixture's building and column grid, its racks cleared, sections drawn and filled with **Fill section** (the app's own action).

| Case | Racks | Bays | Positions | Frames on columns | Racks moved |
|---|---|---|---|---|---|
| older-horizontal · whole building | 7 → 7 | 196 → 196 | 2,464 → 2,464 | **4 → 4** | 0 |
| older-horizontal · split at 100 ft | 14 → 14 | 189 → 189 | 2,376 → 2,376 | 0 → 0 | 0 |
| older-horizontal · small section | 2 → 2 | 14 → 14 | 168 → 168 | 3 → 2 | 2 |
| older-horizontal · short-row section | 7 → 7 | 28 → 28 | 352 → 352 | 2 → 1 | 7 |
| older-horizontal · L-shaped section | 3 → 3 | 36 → 36 | 480 → 480 | **3 → 4** | 3 |
| older-vertical · whole building | 14 → 14 | 196 → 196 | 2,800 → 2,800 | 0 → 0 | 0 |
| older-vertical · split at 100 ft | 28 → 28 | 182 → 182 | 2,600 → 2,600 | 0 → 0 | 0 |
| older-vertical · small section | 3 → 3 | 21 → 21 | 224 → 224 | 1 → 0 | 3 |
| older-vertical · short-row section | 14 → 14 | 56 → 56 | 800 → 800 | 0 → 0 | 0 |
| older-vertical · L-shaped section | 3 → 3 | 27 → 27 | 360 → 360 | 0 → 0 | 0 |

crowded-horizontal and crowded-vertical give exactly the same numbers as the older ones: they share the building and column grid.

The small building, short row and L-shape are **sections inside the fixture buildings**. A separate building would need its own column grid placed through the dialog.

## Why I stopped
1. **The goal is not reached.** The rule only covers a frame at a run's **end**. Frames that land on **interior** columns along the run stay: the whole-building fills keep 4.
2. **One case got worse:** the L-shaped section went from 3 to 4 frames on columns. Moving a run end slid the bay grid onto another column.
3. **The premise doesn't hold here:** the four fixtures, made by Generate, carry 15, 1, 14 and 1 frames on columns. Pressing Regenerate on them left the counts unchanged (I'm not certain the regenerate actually ran, so check this by hand). Either way, Generate does not avoid interior hits in these layouts, so "the rule Generate uses" alone cannot satisfy "never on a column".

## What would work (a decision for you)
- **A. Slide each run within its slack.** After the bay count is fixed, choose the run's start offset (0 … the leftover length) so that no frame overlaps a column. It keeps every bay and position, and moves only the rows that hit a column. When no offset works (columns closer than a bay), the row loses the hitting bay instead.
- **B. Same as A, in Generate too.** One shared function, so Fill and Generate agree and the fixtures' 15 hits go as well. A bigger impact: every generated layout's racks may shift a little.

My recommendation is B, done as A first for Fill only, with the same Rule 7 table before Generate is touched.

## Checks
Branch parked: no full suite, no push to merge.

## Hand-check (≤ 6)
1. In the demo, split a section exactly on a column line (100 ft) and Fill it: on master the first frame stands on the column; Check reports it.
2. Fill the whole building (horizontal): Check shows frames on interior columns, with or without this branch.
