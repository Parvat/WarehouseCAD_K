# text-and-overlap: labels overlapping anything

Branch `text-and-overlap`, from master. Related tests:
- REG-text-overlap: 2 / 2;
- every label-placement REG test (rack numbers, number spots, wall numbers, CAD text, rack depth labels, chips, chains):
  64 / 64;
- every non-browser test: 3,495 / 3,495.

## The scan
The demo file and the four fixtures are each viewed tile by tile across the whole building at 15, 30 and 100 %. Two
things are checked:
- **Every visible canvas text against every other:** row numbers, aisle, face and cross-aisle chips, zone and section
  names, building and column chains, gridline bubbles, door badges, face words, sizes.
- **Every row number and aisle chip against every rack and column.**

**Before:** one finding, on the demo file at every zoom. **R6** (a beam row's number at the west wall) sat on a wall
column. Beam numbers kept clear of the aisle labels but not of columns. No text overlapped another anywhere.

## The fix
A beam line's number now keeps clear of the columns too (`canvas2/RackLineLabels.jsx` `placeRowLabels`). It uses the
existing placement rule: the number slides along its line's end until clear. With no column near, nothing moves.

**After:** no finding anywhere.

## Rule 8 audit
REG-canvas-text-cad already checks every label's real size and place at 10, 50 and 200 % on the four fixtures. Each
label is identical in drawing units, and none overlaps at real size. It passes, so no label needed changing.

## Rule 7 (compared with master)
- **The demo file:** R6 moves along its end, about 8 screen px at Fit (y 447 → 455). Every count, beam number and BOM
  line is identical.
- **The four fixtures and the other handCheck fixtures:** identical in every field, including every number's position.

## Tests
REG-text-overlap (new) runs the scan above as a test. It fails on any overlap, naming the file, the zoom and the two
labels.

## Screenshots: `docs/reports/text-and-overlap/`
At 100 %, R6 before (on the wall column) and after.

## Questions for PP
1. **Beam row numbers at a wall** (the demo's R1–R11 at the west wall) straddle the wall line, as they always have. You
   took that placement as the reference for the non-beam numbers in rack-round3, so I left it. Should a beam number
   clear the wall too, outside it as the non-beam ones now do?
