# units — report

Branch `units`, from master (51bc0d2). Status: **ready**. Full suite on its own: **4445/4445 green**.

## What changed

- **Project setting.** Project settings has a new **Units** group: *Units* (Imperial (ft-in) / Metric (mm, m)) and
  *Precision* (1/16, 1/8, 1/2, 1 in, or 1, 10, 100 mm). It is saved with the project (`rules.unitSystem`,
  `precisionIn`, `precisionMm`). The old Units select in Advanced is gone; an older project's `units` value
  ('meters', 'mm' …) maps onto Metric.
- **One parser** (`src/utils/units.js` `parseLength`). It reads `12'6`, `12' 6"`, `12 ft 6 in`, `12′-6″`, `150 in`,
  `150"`, `3.8 m`, `3800 mm`, `38 cm` and fractions (`6 1/2"`, `½`). A bare number is read in the project unit: feet in
  Imperial, mm in Metric. These parsers now go through it: `parseFeet` (every card that used it — doors, sections,
  cross aisles, tunnels, zones, the selection bar, building wall edits), the column grid's `feetOf`, the draw tool's
  `feetOf`, and the elevation `parseFtIn`.
- **Card length fields.** Every card number field whose label ends in "(ft)" is now a length field. It accepts all
  the forms above and shows the value in the project's units: `6096 mm` in Metric, `12′ 6 ½″` at 1/2 in. Arrow keys
  still step it. In any unit other than Imperial 1″ the visible label drops "(ft)"; the accessible name keeps it.
- **One formatter** (`fmtLength`):
  - Imperial: ft-in to the chosen precision.
  - Metric: mm in cards, the BOM, the Tally, xlsx and CSV; metres to 2 decimals on plan labels (aisle widths,
    cross aisles, dimensions, rulers, measure, PDF).
  - These formatters are routed through it: `pxToFtIn` (a wrapper in units.js — `utils/canvas.js` itself is untouched),
    `copyChange` `fmtLen`/`fmtLenDown`, the BOM `ftIn`/`inch`, the card `ftIn`, the elevation `ftIn`, `aisleMarks`
    `ftInDash`, `drawnShapes` `ftIn`, and the summary card's building size and area (m² in Metric).
- **At Imperial 1″ every formatter returns exactly the text it always did**, so no existing test expectation changed.
- **Text sizes** stay plain numbers in inches in either unit.
- **Storage** is unchanged (world px, feet, inches). Switching units refreshes the labels and nothing else; it adds no
  undo step.

## Decisions made

- **Metric bare numbers are mm** everywhere a length is typed, including the draw tool's typed rectangle size.
- **Card values use 'space' style** (`12′ 6″`), and the BOM, CSV and xlsx use 'dash' style (`12′-6″`), as before.
- **Areas** in the summary card show m² in Metric. "Positions per 1,000 sq ft" stays as it is (it is a rate, not a
  length). The building card's acre figure also stays.
- **Not converted this round, still feet/inches in either unit:**
  - the Project settings modal's own numeric fields (ceiling heights, forklift aisles);
  - the Generate panel;
  - the Fill bar and Door bar inputs;
  - the elevation sheet's beam heights, and the inch selects (upright width, pallet sizes, arm lengths).
  They are not card length fields; each one is a small follow-up through the same `parseLength`/`fmtLength`.
- **Labels refresh on a unit change.** The plan's labels are memoised per objects list. On a unit change
  `ProjectSync` hands the canvas a fresh copy of the same list, with no history step. The aisle-width items also
  subscribe to the units store directly.

## Rule 7 — identical positions and counts in both units

`src/__test__/plan/UNITS.test.js` fills each fixture in each orientation under Imperial 1″, Metric 1 mm and Imperial
1/16, and compares every rack's type, position, size and beams, the layout capacity and the BOM quantities.

| Case | Imperial 1″ | Metric | Imperial 1/16 | Changed |
|---|---|---|---|---|
| older-horizontal, fill horizontal | baseline | identical | identical | none |
| older-horizontal, fill vertical | baseline | identical | identical | none |
| older-vertical, fill horizontal | baseline | identical | identical | none |
| older-vertical, fill vertical | baseline | identical | identical | none |
| crowded-horizontal, fill horizontal | baseline | identical | identical | none |
| crowded-horizontal, fill vertical | baseline | identical | identical | none |
| crowded-vertical, fill horizontal | baseline | identical | identical | none |
| crowded-vertical, fill vertical | baseline | identical | identical | none |

There are no layout-rule changes: units only touch text, and storage never changes, so this holds by construction.
REG-units also checks that switching units in the app moves no object.

## Tests

- **UNITS.test.js (new, 25 tests):**
  - the parser forms;
  - precision fractions;
  - metric mm and m;
  - Imperial 1″ output byte-identical;
  - legacy units mapping;
  - the Rule 7 table above.
- **REG-units (click, all 4 fixtures):**
  - a card's Width field takes `12'6`, `12 ft 6 in`, `150 in`, `3.8 m`, `3800 mm` and a bare number;
  - Project settings → Metric:
    - the field shows `6096 mm` and the label drops (ft);
    - a bare `3000` is mm;
    - the PDF prints metres;
    - the xlsx sizes are all mm;
  - Imperial 1/2 in shows `12′ 6 ½″`;
  - no object moves.

## Rule 9 basics on what changed

- **Edit / typed values:** card length fields take every form. REG-units covers this, and REG-basics runs in the full
  suite.
- **PDF export:** follows the unit; REG-units checks it.
- **Save and reload:** the unit is a project rule, saved with the project like every other rule.
- **Undo:** a typed length is one undo step, as before. A unit change adds no undo step to the canvas.

## Dealer walkthrough

Crowded layout → Metric, then 1/16 in:
- aisle labels on the plan in metres (`3.20 m`, `4.72 m` cross aisle);
- the summary card shows `73152 mm × 36576 mm`, `2,676 m²`, and pick aisles in mm;
- the BOM tab and Tally show `Frame 6096 mm x 1067 mm`, `Beam 2438 mm x 102 mm face`;
- a column grid card shows its last bays in mm;
- the building card labels read Width and Length.

Back to Imperial: everything is exactly as before.

## Hand-check (≤ 6 steps)

1. Open a layout → Project settings → Units: Metric, Save. The aisle labels on the plan now read in metres.
2. Click a rectangle (or a column) → its Width shows mm. Type `12'6` and press Enter; it shows `3810 mm`.
3. Type `3000` in the same field → 3000 mm. Type `3.8 m` → 3800 mm.
4. BOM tab → Tally and xlsx: every size is in mm.
5. Project settings → Imperial, Precision 1/2 in → type `12' 6 1/2"` in a Width → it shows `12′ 6 ½″`.
6. Project settings → Imperial, 1 in → everything is exactly as before.
