# filler-text-pdf — the text-overlap scan and PDF parity over every rack type

Branch `filler-text-pdf`, from `r9-mezzanine`.

## Text and overlap scan

**What was scanned:** every visible canvas text and pill at 15 %, 30 % and 100 %, tiled across the building. It looks for
text over text, and for row numbers or aisle chips over a rack or a column.
- **Fixtures:** the new ones (cantilever, shelving, carton-flow, mezzanine) and every lane-type one (walls-racks,
  lane-drive, lane-push, lane-flow).
- The demo and the 4 fixtures were already identical in Rule 7 on every branch of this run, labels included.

**Found and fixed:** one overlap. A mezzanine's "MEZZANINE" title touched its size line ("30′ × 20′") at every zoom. The
size line now sits half a line further down (`render/rackOps.js` rackMezzanineOps). The rescan is clean at 15 %, 30 %
and 100 %.

Nothing else overlaps.

## PDF parity

**What was compared:** every item in every library section, 39 of them, each placed by real clicks in an empty building.
Each one's screen and PDF were put side by side over the same world box at the print scale.

**The four new or changed types** (`filler-text-pdf/*.png`, screen on the left, PDF on the right):
- **Carton flow:** the same. Frame bars, lane lines, arrows, LOAD and PICK at the same size and place.
- **Cantilever:** the same. Columns, column line, arms, the dashed reach.
- **Mezzanine:** the same. The dashed edge, cross, title and size, column squares, the gate bar, the stair with its
  treads and arrow, the handrail.
- **Shelving:** the drawing is the same. The PDF also prints the run's size label ("S1 · 4 units · 48×24 · 5 shelves ·
  7 ft"), which the screen shows only when the run is selected.
  - That is how rack-round3 built it (the label on the PDF), not a mismatch from this run.
  - Only its text grew ("· 7 ft").
  - Question for PP: should the PDF keep printing it?

No other type changed in this run, and their parity is as lane-fixes left it.

## Tests

`rackOpsDeck` and `MZ_mezzanine` pass (the title and size positions are not pinned by a test; the x centring is).
