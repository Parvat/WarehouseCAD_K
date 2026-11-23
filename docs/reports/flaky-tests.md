# flaky-tests — REG-door-types stable under the full suite

Branch `flaky-tests`, from master (87fcc55). Status: **ready**. Full suite on its own: **4453/4453 green**, with
REG-door-types passing on all 4 fixtures inside it.

## What changed (test only, no app code)
REG-door-types used to hit its 120 s timeout under full-suite load. Its fixed sleeps (150 to 200 ms) left it racing the
app: a click on the wall before the building was selected, or a click to place before the hover reached the wall.

It now waits for the state each step needs, using `expect.poll` (15 s, every 100 ms), the same approach as
REG-tally-ticks:
- the building selected after the wall click;
- the tool on ('door') after Add door;
- the door type's width shown in the bar;
- the door tool's hover on the wall, before the click that places;
- the objects count up by one after the click.

The test's own timeout is now T × 3, as REG-tally-ticks has. What it checks has not changed: three door types, in
order, each placed at its own width and type, and on the wall's inner face.

## Decisions made
- **Only REG-door-types was changed.** Neither full-suite run in this round failed anything else.

## Rule 7
No layout rule changed.

## Hand-check (≤ 6)
1. `npm test`: the full suite is green, with REG-door-types in it.
2. Click a wall → Add door: Man door, Dock door and Drive-in door each place at 3 ft, 9 ft and 12 ft, as before.
