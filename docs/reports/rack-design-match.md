# rack-design-match — the app beside the two mockups at the same zoom, every mismatch fixed

Branch `rack-design-match`, from `rack-design` (fb413d5). Status: see the last line.

**How it was compared:**
- Each rack type was compared at 30 % and the same pixel density as the mockups (2×), the mockup's crop beside the app's.
- The library was compared at 1:1.
- Before: `before-a…d.png`, `before-compare-*.png`. After: `after-a…d.png`, `after-compare-*.png`, and `after-*-30(-selected).png` for every type. All in `docs/reports/rack-design-match/`.

## Mismatches found and fixed
| Where | Mockup | Before | After |
|---|---|---|---|
| Drive-in / drive-through lane lines | as heavy as the outline | 1 px | 1.5 px (`RACK_LINE.lane`) |
| Drive-in / drive-through posts | squares that read at 30 % | the 4″ upright, a dot | at least 6″ square, centred on the lane line |
| Travel arrows (all lane and flow racks) | open chevron head, 2 px, ~70 % of the slot | filled triangle, 1.5 px, 62 % | open head (round joins), 2 px, 70 % — the PDF the same |
| Mezzanine edge | heavier dashes, longer | 2.5 px, dash 7 4 | 3 px, dash 9 5 |
| Mezzanine posts | ~10″ dots | 7″ | 10″ (r 5″) |
| Mezzanine words | MEZZANINE ~14″, size ~11″ | 16″ / 12″ | 14″ / 11″ |
| Library group headers | tighter, ~10 px caps | 11 px, 10 + 4 px padding | 10.5 px, 8 + 2 px padding — the panel is 416 px tall (mockup ~413, was 432) |
| Library tooltip | close to the panel, ~12 px text | 8 px off, 13 px | 4 px off, 12 px |

## Checked and already matching
- **Colours:** every line, tint and icon colour.
- **Weights:** the 1.25 px outline (2.5 device px at 2×, as the mockup), the 3″ frames, the 4″ face bars, the cantilever's spine and arms.
- **Slot dashes and spacing:** the 4 3 dashes, the 3″ inset, two slots per 96″ bay, the deep line.
- **Words:** ENTRY / LOAD / PICK size and place.
- **Shelving:** units and counts.
- **Selection:** the 2 px blue outline 4 px out, with corner handles.
- **Library:** width (150 px against the mockup's ~149), 28 px rows, 20×16 glyphs, the glyph shapes.

## Left as they are (not a drawing mismatch)
- **The mockup's lanes are wider.** Its push-back and pallet-flow lanes are about twice a real 46″ lane, and drive-in about 1.3×. The cantilever's columns are also wider apart. The app draws each rack at its real size (Rule 7: nothing about geometry changes).
- **The mockup numbers every rack (R6–R11)** — question 1 in `rack-design.md`.
- **Tooltip wording.** The mockup says "One entry · last in, first out"; the task's wording ("One entry, last in first out") is used.

## Tests
- **Updated:**
  - PX-hair takes each line's own width, since a lane line is 1.5 px.
  - rackOpsLanes / FU-arrows still pass: the head is still at the tip, and the shaft now runs to it.
- **Run green:**
  - rack unit tests, RD, PX, FU, B, KT: 129;
  - REG-rack-*, REG-pixel-ratio, REG-lane-positions, REG-drag-lift, REG-canvas-text-cad and REG-bom-rack-labels on all 4 fixtures: 36.
- The full suite runs on the combined branch (overnight-rack-design), as the run asks.

**Rule 7:** only paint changed (stroke widths, post size, the head drawn open, word sizes). No rack, bay, position, hit area or saved field changed.

## Hand-check (≤ 6)
1. Place a drive-in: its lane lines as heavy as its outline, square posts at each pallet, open arrow heads.
2. Place a mezzanine: heavier dashed edge, bigger posts, smaller words.
3. Open the Racking library: compact group headings, and the tooltip just right of the panel.

Status: **done**. Related tests green (165). Full suite on the combined branch.
