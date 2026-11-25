# Morning — rack-fixes and rack-followup (2026-11-25)

## Branches
| Branch | Status | What |
|---|---|---|
| Step 0: `overnight-rack-design` (03e0e51) | **green** | The full suite before anything else: 4518 / 4518. Nothing to fix. |
| `rack-fixes` (c1e56df) | **done** | 1. Overlap red for every rack type. 2. Drive-through arrows at both ends, every lane arrow at real size. 3. Tab then drag. 4. Lighter beam pallet slots. Report: `docs/reports/rack-fixes.md` |
| `rack-followup` (from rack-fixes) | **done** | 5. R numbers on every rack. 6. Every library type follows the mouse. 7. The rotate handle clear of the face words and the size label. Report: `docs/reports/rack-followup.md`. **Full suite: 4536 / 4536** |

Nothing was parked. Rule 7 showed no surprise: before and after are identical on the demo file and all 4 fixtures, for
both branches.

Merge, once the hand-check passes. `rack-followup` holds everything: last night's run, then rack-fixes, then itself.
```
git fetch . rack-followup:master rack-followup:canvas2-clean-start
git push origin master canvas2-clean-start
```

## Rule 7
| Layout | rack-fixes: card, BOM, picks, save→load, PDF, Regenerate | New reds | rack-followup: beam R numbers, counts, BOM | R labels drawn |
|---|---|---|---|---|
| demo-warehouse.wcad | identical | 0 | identical | 22 → 22 |
| older-horizontal | identical | 0 | identical | 11 → 11 |
| older-vertical | identical | 0 | identical | 14 → 14 |
| crowded-horizontal | identical | 0 | identical | 11 → 11 |
| crowded-vertical | identical | 0 | identical | 14 → 14 |

All five layouts hold beam racks only, so the new red and the new numbers have nothing there to mark. On a layout with
other types (the screenshot scene), the beam racks keep R1–R6 and the others follow as R7….

## A correction to last night
`docs/reports/rack-basics.md` said REG-basics Racking had 0 failures. That was wrong. Rerunning it on 03e0e51 shows 4
failures per fixture: the double-click keep check for Selective, Back-to-back, Double-deep and the filled-building
Selective.
- The fault was the test: its two clicks landed below the building, where a row is refused. The feature itself works,
  as REG-rack-library-keep shows.
- The check now clicks where the ghost has room, and it is a hard fail for every rack type now (rack-followup).

## What I decided without asking (each also in its report)
1. **Overlap red** for a pair with a non-beam rack is a red X on each position the other rack covers, the same mark
   two beam racks get. Two beam racks keep exactly today's marks.
   - The usable count is not reduced for a non-beam overlap: that would be a capacity rule change.
   - A selective can now be placed under a mezzanine; it used to be refused.
2. **Arrow stroke** is 2″ real, which is the mockup's 2 px at 30 %.
3. **Tab then drag** never applies to the building or a section: a press on a rack in a selected building still moves
   the rack.
4. **The new placement** for drive-in … mezzanine snaps like a zone: onto wall faces and rack edges, and inside the
   walls. Alt turns snap off for these types only; Selective is unchanged.
   - It is blocked over a rack (a mezzanine never), but not outside a building, since these could always go anywhere.
5. **The new R numbers** sit where the mockup puts them, at the start end beside the rack. They are placed after the
   beam numbers, so no beam label moves.
6. **The rotate handle** also clears the selected rack's own size label (2L × 5D …), which is a label too.

## Questions for PP
1. **Usable count:** should a non-beam rack's positions covered by an overlap come off the usable count, as two beam racks'
   do? It is drawn red today but not counted.
2. **BOM lines for the other types:** these now have R numbers but no BOM line. Is that the plan, so that each type gets
   its BOM when built?
3. **A text drag:** a text dragged on its own moves only down, and less than the mouse did. This was found by the
   Tab-drag test and was there before this work. It is on the Polish list; fix it next?
4. **Still open from last night:** the mockup's lanes are wider than real 46″ lanes. Is keeping real sizes right?

## Hand-check (one list)
**From last night**
1. Place each rack type from the Racking library. Check that the colours match the families (pallet navy, lane green,
   flow amber, other purple, mezzanine grey), that nothing is filled, and that the pallet dashes show.
2. Select a rack: a blue outline 4 px out, white corner squares, and the rack's lines keep their colour.
3. Zoom to 30, 100 and 200 %: the lines stay sharp. Ctrl + and Ctrl − in the browser: still sharp.
4. Open the library. Check that it is narrow, that the icons are in family colours, that a tooltip shows after a moment,
   and that Carton flow is greyed with the tooltip "Coming soon".
5. In the library, type "drive", then try Up, Down and Enter. Esc clears the search, and Esc again closes the library.
6. Open an old file with a Rack Row (multi-bay): it loads and selects, and Add bay takes one undo.
7. Export a PDF: the same colours, no fill, and the ENTRY / LOAD / PICK words.
8. Undo, redo, save and reload.
9. A drive-in: the lane lines are as heavy as its outline, the posts are square, and the arrow heads are open. A
   mezzanine: a heavier dashed edge and bigger posts.

**Overlap red**

10. Drag a drive-in onto a selective: red X marks show on both while you drag and after you drop. Drag it off: the red
    goes. Ctrl+Z undoes the move in one step.
11. Drag a mezzanine over a rack: no red.

**Lane arrows**

12. A drive-through has arrows at both ends: the bottom ones point up into the lanes, the top ones point down.
13. Zoom out from 100 % to 15 %: the arrows get thinner, never thicker.

**Tab then drag**

14. Put a forklift on a rack and click the forklift. Press Tab: the rack is selected. Drag: only the rack moves. Ctrl+Z.
15. A click without a drag still selects the forklift.

**Pallet slots**

16. Selective, back-to-back and double-deep slots are fainter. Drive-in, push-back, flow, cantilever and shelving look
    as before. Check the PDF too.

**R numbers**

17. Open an old file: the R numbers are as before.
18. In a new layout, add two selectives, a drive-in, a pallet flow, a cantilever, a shelving unit and a mezzanine. The
    selectives are R1 and R2, the others R3 to R6, and the mezzanine has none.
19. Delete the drive-in: the numbers close up. Ctrl+Z. Ctrl+D on the pallet flow: R7. Ctrl+Z.
20. The BOM lists only the beam racks.

**Placement**

21. For each of Drive-in, Drive-through, Push-back, Pallet flow, Cantilever, Shelving and Mezzanine, in the library:
    - pick it: a ghost follows the mouse;
    - move near a wall: it snaps; hold Alt: it doesn't;
    - Esc: nothing placed;
    - pick it again and click: one placed, back to Select;
    - double-click the row: each click places one until Esc.
22. Selective, Back-to-back and Double-deep behave as before.

**Rotate handle**

23. Select a drive-through and a pallet flow at 15 %, 30 % and 100 %: the rotate handle sits above ENTRY / LOAD and
    above the size label. Turn it: it still rotates, and one Ctrl+Z undoes it.
