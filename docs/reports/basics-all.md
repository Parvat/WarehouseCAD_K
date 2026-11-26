# basics-all: the Rule 9 audit for everything in the library

Branch `basics-all`, from master. This is a test-only change, so it runs its related tests: the 12 REG-basics library tests (6 sections × 2 fixtures), 12 / 12.

## The audit
REG-basics runs every item in every library section through the whole Basics contract (CLAUDE.md Rule 9), with real clicks on older-horizontal and crowded-vertical. The contract covers:
- select (click, box, Shift, Tab);
- the tool flow (one use then Select, Esc, a double-click keeps it on);
- move, resize, typed values;
- copy, paste, duplicate, delete;
- one undo per action, and redo;
- lock;
- snap and Alt;
- save and reload;
- PDF;
- zoom.

| Section | Checks per fixture | Failed |
|---|---|---|
| Floor Plans (building, walls) | 168 | 0 |
| Racking | 264 | 0 |
| Ops (equipment) | 288 | 0 |
| Structural (columns and grid, partitions, windows, doors) | 160 | 0 |
| Safety | 120 | 0 |
| Zones | 96 | 0 |
| Draw tools: line, polyline, rectangle, circle, text (already strict) | 193 | 0 |

No real failure was found, so nothing in the app changed.

## The change
Each library section's REG-basics test now **fails** on any failed check. It used to only report failures for the owner. The draw tools' test was already strict.

## Not covered by REG-basics (left for a later round)
These have their own REG tests but are not run through the generic contract:
- sections (drawn areas);
- the column grid as placed from its dialog;
- annotations (dimension, arrow);
- doors as placed by the Add door bar.

## Screenshots
None: nothing on screen changed, so there is no before/after.

## Questions for PP
None.
