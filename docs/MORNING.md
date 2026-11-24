# Morning — the overnight rack-design run (2026-11-24)

## Branches
| Branch | Status | What |
|---|---|---|
| `rack-design` (fb413d5) | **done** | Racks by colour family with no fill: dashed pallet slots, face bars with ENTRY / LOAD / PICK, a new selection look, sharp lines at any pixel ratio, a new racking library. Report: `docs/reports/rack-design.md` |
| `rack-design-match` (e0d156d) | **done** | Compared with both mockups at 30 % and 2×. Fixed: lane line and arrow weights, post size, open arrow heads, mezzanine edge, posts and words, library spacing and tooltip. Report: `docs/reports/rack-design-match.md` (before/after) |
| `rack-basics` (f9ff901) | **done** | Every rack type through Rule 9: 264 checks per fixture, 0 failures. REG-basics now checks double-click keep for real. New REG-rack-numbers. Report: `docs/reports/rack-basics.md` |
| Polish list (Task 4) | **nothing taken** | No item at the end of FEATURES §14 is look-only without a decision (see below) |
| `overnight-rack-design` | **ready** | The three above in order, plus one follow-up: Carton flow (not built yet) as a disabled "Coming soon" row in the library. **Full suite 4518 / 4518** before the follow-up; its own tests green after |

Merge (when the hand-check passes):
```
git fetch . overnight-rack-design:master overnight-rack-design:canvas2-clean-start
git push origin master canvas2-clean-start
```

## Why nothing was taken from the Polish list
Each item at the end of FEATURES.md §14, and why it was skipped:
- **Rotate handle over a lane rack's top face word.** Added tonight. Moving the handle changes where it is grabbed, so it needs a decision: handle above the word, or the word moves.
- **Dead-code cleanup.** Not a look change.
- **Search anything, Command palette.** New features.
- **Dialog styling, Hub and Sign in.** STUDIO.md gives no values for these, and I may not invent any.
- **Empty states, Icon redesign (rail labels).** New UI that needs a design.
- **Keyboard shortcuts.** Behaviour.

## Rule 7 counts (before = master 4e7a075, after = rack-design; rack-design-match and rack-basics change paint and tests only)
| Layout | Racks (lines) | Bays | Positions | Card totals | BOM | Picks | Save→load | PDF | Regenerate |
|---|---|---|---|---|---|---|---|---|---|
| demo-warehouse.wcad | 15 (22) | 175 (283 sides) | 2,038 | same | same | same | same | same | n/a — sections |
| older-horizontal | same | same | same | same | same | same | same | same | same |
| older-vertical | same | same | same | same | same | same | same | same | same |
| crowded-horizontal | same | same | same | same | same | same | same | same | same |
| crowded-vertical | same | same | same | same | same | same | same | same | same |

"Picks" = 3,000 clicks over each building at 10 % and 100 %, every one landing on the same object.

## Questions for PP
1. **R numbers on every rack?** The mockup numbers the lane, flow, cantilever and shelving racks (R6–R11). Today only beam racks have R numbers, because they are the BOM's and Tally's lines. Numbering the others would renumber those, or need a second series. Left as today.
2. **A back-to-back pair running up and down.** Rule 8 gives it one label, "R2–R3". The mockup shows R2 and R3, which is what a pair running across already shows. Left as Rule 8 says.
3. **The drop-at-once rack types.** Drive-in, drive-through, push-back, pallet flow, cantilever, shelving and mezzanine drop at the view's centre at once. Should they follow the mouse like Selective, so Esc cancels and a double-click keeps the tool on?
4. **The rotate handle on a lane rack.** On a selected drive-through or pallet flow it sits over the top face word (Polish list). Move the handle up past the word, or leave it?
5. **Lane and arm widths.** The mockup draws lanes about 1.3–2× wider than a real 46″ lane, and cantilever columns wider apart. The app keeps real sizes (Rule 7). Fine?

## Hand-check (one list)
1. Place each rack type from the Racking library. Check:
   - the colour fits the family: pallet navy, lane green, flow amber, other purple, mezzanine grey;
   - nothing is filled;
   - the pallet dashes are easy to see.
2. Select a rack: blue outline 4 px out, white corner squares, and the lines keep their colour. Drag it onto another rack: red.
3. Zoom 30, 100 and 200 %: lines sharp. Ctrl + and Ctrl − in the browser: still sharp.
4. Open the library. Check:
   - narrow, with no gap on the right;
   - the icons in their family colours;
   - a tooltip on hover after a moment;
   - Carton flow greyed, its tooltip "Coming soon".
5. In the library, type "drive", then use Up / Down, Enter, and Esc (clears, then closes).
6. Pick a type: it places one and goes back to Select. Double-click Selective: each click places one until Esc.
7. Open an old file with a Rack Row (multi-bay): it loads, selects, and takes Add bay with one undo.
8. Export a PDF: the same colours, no fill, the ENTRY / LOAD / PICK words.
9. Undo, redo, save, reload.
10. Ctrl+D on a rack, then Delete another. The R numbers stay R1…Rn with no gaps, and Ctrl+Z puts them back.
11. A drive-in: lane lines as heavy as its outline, square posts, open arrow heads. A mezzanine: heavier dashed edge, bigger posts.
