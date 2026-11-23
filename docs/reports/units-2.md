# units-2 — the rest of the length fields in the project's units

Branch `units-2`, from master (87fcc55). Status: **ready**. Full suite on its own: **4457/4457 green**. This finishes the follow-ups listed
in `docs/reports/units.md`.

## What changed
- **One field behaviour for every remaining length input** (`src/studio/lengthField.js` `useLengthField`, with
  `parseLengthAs`, `showLengthAs` and `unitLabel` in `utils/units.js`).
  - **Input:** every form the card fields take — `12'6`, `12 ft 6 in`, `150 in`, `3.8 m`, `3800 mm`, or a bare number
    in the project unit (feet, or inches in an inches field, in Imperial; mm in Metric).
  - **Display:**
    - Metric shows mm.
    - Imperial at a finer precision shows ft-in.
    - Imperial 1″ shows the plain number it always did.
  - While you type, your words stay as typed.
- **Where:**
  - **Project settings:**
    - Every "… (ft)" and "… (in)" field: building size, clear and sprinkler heights, column grid, max run, wall
      clearance, pallet sizes, the forklifts' aisle to pick and space to move, upright step, the row-spacer break.
    - Their headers and unit marks read mm in Metric.
  - **The Generate panel:** building width and length, column grid, max run, wall clearance. Their ′ / ″ marks show
    only where the value is a plain number of that unit.
  - **The Fill bar:** Aisle, Max run, Aisle to pick, Space to move.
  - **The Door bar:** Width and Row gap. The "ft" word goes when the value carries its own unit.
  - **The elevation:** the heights shown with `ftInDash` (mm in Metric, ft-in at a finer precision). The inch fields
    (beam heights, pallet height) show mm in Metric and take any form.

## Decisions made
- **Two inch fields stay plain inches:** *Deck beam length (in)* and *Hole pitch (in)*. They are catalogue keys: a
  metric round trip would turn 96″ into 95.98″, and the deck table would stop matching the 96″ beams.
- **The Fill and Door bar fields keep their textbox role**, as their existing tests find them. The Project settings and
  Generate fields are spinbuttons, as before.
- **Project settings' labels and values follow the saved units.** A unit change shows once it is saved, so a value is
  never shown in one unit under a header in another.

## Rule 7 — identical geometry in both units
Storage is unchanged: every field writes the same feet or inches. REG-units-2 checks that switching Imperial ↔ Metric
in Project settings moves no object; it compares every object's place and size before and after, both ways. The units
round's UNITS.test.js Rule 7 table (Fill on the 4 fixtures, both orientations, identical racks, positions and BOM in
Imperial 1″, Metric and Imperial 1/16) still passes.

## Tests
- **REG-units-2** (new, real clicks, all 4 fixtures). In Metric:
  - Project settings' *Reach truck aisle to pick* shows mm, takes `3.5 m`, and saves 3.5 m;
  - the Fill bar's Aisle shows `3500 mm`, and a bare `3300` is mm;
  - the Door bar's Width takes `1200`, and the door placed is 1200 mm wide;
  - back in Imperial, the Fill bar's Aisle takes `12'6` and shows `12′ 6″`;
  - neither switch moves anything.
- **Updated** (source scans whose text changed): SB-pallet-fields (the elevation's inch value shows mm in Metric) and
  SG-pallet-text (the headers go through `unitLabel`).

## Rule 9 basics on what changed
- **Typed values:** every length field takes every form.
- **Undo:** unchanged; each field writes as it did.
- **Save and reload:** the unit is a project rule.
- **PDF:** the elevation labels follow the unit through `ftInDash`.

## Dealer walkthrough
Crowded layout switched to Metric:
- Project settings: pallets 1219 × 1016 × 1219 mm; wall clearance 76 mm; Reach truck aisle 3200 mm and space to move
  2438 mm (every forklift row in mm).
- Fill bar: Aisle 3200 mm, Max run 45720 mm.
- Add door → Man door: Width reads 914 mm. Typing 900 placed a door 900 mm wide.

**Not walked through in the app:** the Generate panel's fields and the Elevations tab's inch fields. They use the same
helpers and pass the full suite, but no click test covers them yet. Hand-check step 5 covers the elevation.

## Hand-check (≤ 6)
1. Project settings → Units: Metric, Save. Reopen it: forklift aisles, heights and pallet sizes read mm.
2. Type `3.5 m` in Reach truck's aisle to pick, then Save. Reopen: it reads 3500 mm.
3. Press F: the Fill bar's Aisle reads 3500 mm. Type `3300`: it reads 3300 mm, for this fill only.
4. Click a wall → Add door: type `1200` in Width and place a door. It is 1200 mm wide.
5. Elevations tab: the beam heights read mm. Type `1.5 m` in one: it reads 1500 mm.
6. Project settings → Imperial, 1 in: everything reads exactly as before, and nothing on the plan moved.
