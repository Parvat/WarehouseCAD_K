# Trace — Future Panel Features (left + right panel)

Wishlist for later. Not urgent, not scheduled. UI details for each item to be
decided when it's picked up. Items marked **(suggestion)** came from Claude, not PP;
keep, change or drop as you like.

---

## LEFT PANEL — things you place on the canvas

### Areas / zones
- **Cross-aisle placer** — place a cross-aisle by hand (select tool, click or drag
  across rows). Racks under it are cut and re-flow around it. UI to decide.
- **Doors — all types:** dock doors, man doors, roll-up/overhead doors, fire exits.
- **Office area**
- **Washroom area**
- **Staging area**
- **Custom area** — any named zone (rectangle, or custom shape with a pen tool).

General behaviour for all areas: when an area is placed over racking, the racks under
it are removed/trimmed and pallet counts update. (See TRACE_ROADMAP "zones" notes.)

### Suggestions
- **(suggestion)** Fire egress path — a marked walkway to each exit that racking can't
  block; flagged by Check layout if blocked.
- **(suggestion)** Pedestrian walkway — striped lane, same "keep clear" behaviour.
- **(suggestion)** Battery charging / forklift parking area.
- **(suggestion)** Manual column placer — add or move a single column (buildings with
  an irregular grid).
- **(suggestion)** Sprinkler / fire zone overlay, for rack-height and flue rules later.

---

## RIGHT PANEL — edit mode for a selected object

### Row edits
- **Make single row (1 click)** — select a back-to-back row, convert to a single row.
  **(suggestion)** also the reverse: single → back-to-back where there's room.

### AGREED DESIGN (PP, build order: beam length → Sync → cascade, each tested in
### both orientations)
- **Per-bay beam length:** select bay(s), pick 4′–16′ or custom. Bays before the
  changed one stay put, bays after it slide along; pallets per bay recomputed.
- **Sync rows (within a section):** a section = rows between the same two
  cross-aisles. Select a fixed row → Sync → every other row in that section copies
  its BAY PATTERN (beam lengths) and start position, so uprights line up across
  aisles. Used for the column-on-upright fix.
- **Sync sections (whole building):** adjust ROW POSITIONS in one section (spacing,
  alignment), then Sync applies the same positions to all other sections. Positions
  only, no beam changes. E.g. 4 sections: fix 1, sync → the other 3 match.
- **Cascade move:** Alt+drag a row across the aisles → every row beyond it in that
  direction moves the same amount, keeping aisle widths. Rows on the other side don't
  move. Plain drag still moves one row. Stops at the far wall and warns if the last
  row no longer fits.

### Beam size
- **Beam length input** — default 8′ (96″); presets 4′ to 16′; plus a custom value.
  Change it and regenerate, or apply to the selected rack/bays. Pallets per beam come
  from the existing pallet formula automatically.
- **Main use case: column on an upright frame** (orange flag). Change that one bay's
  beam length so the upright clears the column, then Sync the section so every row
  in it gets the same change and stays aligned.

### Row and bay numbering
- **Row labels** — number or letter every row (A, B, C… or 1, 2, 3…), shown on the
  canvas, for visual checking and for talking about the layout with the customer.
- **Bay numbers** — count the bays along each row (1, 2, 3…) so bay counts can be
  checked by eye.
- **(suggestion)** Choose the scheme and start point (letters vs numbers, start at A/1,
  direction), and a toggle to show/hide them. These can later feed the Label app
  (location codes like A-03-2 = row A, bay 3, level 2).

### Blocked-position marker style (extra, not urgent)
- Choice of marker for non-pickable pallet positions: the current red X, plus 2–3
  alternative icons, or a text label. Dealer preference.

### Suggestions
- **(suggestion)** Bay count field — type the number of bays instead of dragging.
- **(suggestion)** Levels per rack (currently fixed at 4), per rack or per layout.
- **(suggestion)** Duplicate / array — repeat the selected row N times with the
  correct aisle between each copy.
- **(suggestion)** Per-rack capacity readout (positions, usable, lost to columns).
- **(suggestion)** Lock a rack so regenerate or cascade moves never touch it.

---

## LIVE EDIT — layout reacts to manual moves

- **Cascade move** — moving one row down pushes every row after it down by the same
  amount, using the same generator logic (aisle widths kept, column rules applied), so
  large warehouses don't need every row shifted by hand. Same in reverse for moving up.
  (PP: more live-edit behaviours to be added over time.)

### Suggestions
- **(suggestion)** Cascade stops at a cross-aisle or a locked row, so one section can
  be adjusted without disturbing the next.
- **(suggestion)** "Close gap" — after deleting a row, optionally pull the following
  rows up to the forklift aisle width.
- **(suggestion)** Regenerate keeps manual work: locked racks and placed areas survive
  a regenerate; only unlocked generated racks are rebuilt.

---

## Rules that apply to every item above
- Works and is tested in BOTH orientations (horizontal and vertical).
- One undo per action.
- Capacity, usable positions, X marks and aisle warnings update live.
- If the old SVG engine had the behaviour, port it; if it's new, agree the approach
  before building.
