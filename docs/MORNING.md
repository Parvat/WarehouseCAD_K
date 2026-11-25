# Morning — rack-round2 (2026-11-25)

Branch `rack-round2` from master 1cd4ccb. Report: `docs/reports/rack-round2.md`. **Full suite: 4558 / 4558**

## Status
| # | Item | Status |
|---|---|---|
| 1 | Face aisle check for every rack type | **done**. Red on a short ENTRY / LOAD / PICK face, the arm side or the pick side, with an aisle chip; live while dragging; Check layout; new fixture `lanes-horizontal` |
| 2 | Rack number position | **done**. Non-beam numbers try the start end, the other end, above, then below, and never touch a wall, column, rack, zone or label; beam labels unchanged |
| 3 | Letters per type | **done**. D, T, P, F, C, S and M, each with its own sequence; the mezzanine is numbered now (M1); R numbers and the BOM unchanged |
| 4 | Moving a placed rack | **done**. Nothing left behind; during the drag a red outline on both racks only; after the drop a 1.5 px X inside each covered slot; drag smoothness measured (p95 unchanged) |
| 5 | Zone over racking | **done**. Nothing removed on its own; red while placing, dragging or resizing; the bar's "Covers R…" with Remove racks / Keep; one undo |
| 6 | Text drag | **done**. Not a drag bug: last round's test pressed the text's resize handle. Every kind that can be dragged follows the mouse exactly; off the Polish list |
| 7 | Usable count | **done**. Positions covered by a zone (Keep), covered by an overlap, or behind a short face come off usable for every type |
| 8 | Aisle chip position | **done**. Centred when it fits, else just past one end of the aisle on the free side; no chip moved on the demo file or the four fixtures |

Nothing was parked. Rule 7 showed no surprise: the demo file and the four fixtures are identical in every count and
label, and no chip moved. The new fixture has one red: T1's ENTRY against the wall.

Merge, once the hand-check passes:
```
git fetch . rack-round2:master rack-round2:canvas2-clean-start
git push origin master canvas2-clean-start
```

## A note on screenshots
The before/after screenshots that docs/reports/rack-fixes.md and rack-followup.md link to were never committed. PNGs are
gitignored, and those two rounds did not force-add them. They were lost when the wt-rf worktree was removed. This round's
screenshots are force-added (docs/reports/rack-round2/), and they cover the same racks.

## Questions for PP
1. **Shelving's pick side:** is "the side not backed by a wall or a rack within 2′" right? A shelving unit open on both
   sides is not checked.
2. **A rack in a cross-aisle splits the beam line across it** (this was already so on master), so the beam numbers
   change. Should a non-beam rack in a cross-aisle leave the beam line whole?
3. **Drive-through usable:** with one end short it keeps its positions, because it still works as a drive-in. Agreed?
4. **Remove racks on a non-beam rack:** today's zone cut removes a drive-in the zone touches at all, as one piece. Should
   it lose only the covered lanes?

## Hand-check (one list, items 1–8)
**1. Face aisles**

1. Open the lanes fixture (`src/__test__/plan/handCheck/lanes-horizontal.wcad`). T1's top ENTRY, against the wall,
   is red, with a 0″ chip just past its left end. D1 is not red.
2. Drag D1 until its top sits about 4′ below T1's bottom. T1's bottom ENTRY turns red while you drag and stays red after
   the drop. Ctrl+Z.
3. Press Check: "T1: ENTRY face has 0″ in front (the wall) — needs …".

**2. Number position**

4. Place a drive-in and a pallet flow beside walls and columns. Their numbers (D1, F1) never touch a wall, column, rack,
   zone or label at 10 %, 30 % or 100 %. The beam numbers have not moved.

**3. Letters**

5. Add a pallet flow, a cantilever and a second drive-in: F1, C1, D2.
6. Delete D1: the other becomes D1. Ctrl+Z.
7. A mezzanine shows M1. The BOM still lists only the beam racks.

**4. Moving a rack**

8. Drag a drive-in onto a selective:
   - only the one rack moves, and nothing stays at its old place;
   - while dragging, a red outline shows on both racks;
   - after the drop, small X marks sit inside the covered slots.

**5. Zones**

9. Drag an office onto a selective. Nothing is removed and the rack shows red. The office's bar says "Covers R1" with
   Remove racks and Keep.
10. Keep: the rack stays red, and the card's usable drops. Drag the office away: no red.
11. Drag it back and press Remove racks: the covered bays go. Ctrl+Z brings them back.

**6. Text**

12. Drag a text up, down, left and right: it lands exactly where you let go. Ctrl+Z after each.
13. Drag a zone by its name: the zone moves exactly as far.

**7. Usable**

14. A drive-in over a selective, an office kept over racks, and a drive-in with its ENTRY against a wall all lower the
    card's usable. Positions and the BOM stay the same.

**8. Chips**

15. Zoom to 15, 30 and 100 %: no aisle chip covers a rack, a column, a zone, a rack number or another chip.
16. T1's 0″ chip sits just past the end of its face.
