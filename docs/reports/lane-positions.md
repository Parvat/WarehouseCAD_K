# lane-positions — lane racks count lanes × deep × levels

Branch `lane-positions`, from master. Status: **ready**.

## What changed
- **Drive-In, Drive-Through, Pushback and Pallet Flow** count positions as **lanes × deep × levels**. Before, levels were ignored, so a 3-lane, 4-deep rack counted 12 at any height.
- **Where the levels come from:** a lane rack's elevation type when the layout has elevation types, as for a beam rack. Without types, its own `levels`; else 1.
- **Every count agrees:**
  - the layout's totals (`getLayoutCapacity` now takes the levels resolver; the Properties card's Storage and usable capacity);
  - Tally (`summaryBase`);
  - the lane rack card's Capacity;
  - the plan label, which now reads `lanes L × deep D × levels · N PAL`.
- **Unchanged:** Selective and double rows. BOM lists beam racks only, so it is unchanged too.

## Decisions
- Lane racks take their levels from the elevation type, like beam racks. The default type has 4 levels in the fixtures, so a lane rack now counts 4× what it did. If lane racks should have their own Levels field in the card instead, that is a small follow-up.

## Rule 7 table
Each fixture, with one of each lane rack (3 lanes × 4 deep) placed below the building. Positions by type, before → after:

| Fixture | Selective (rack_row) | Double row | Drive-In | Drive-Through | Pushback | Pallet Flow | Layout total | Tally |
|---|---|---|---|---|---|---|---|---|
| older-horizontal | 664 → 664 | 1,728 → 1,728 | 12 → 48 | 12 → 48 | 12 → 48 | 12 → 48 | 2,440 → 2,584 | 2,440 → 2,584 |
| older-vertical | 312 → 312 | 2,288 → 2,288 | 12 → 48 | 12 → 48 | 12 → 48 | 12 → 48 | 2,648 → 2,792 | 2,648 → 2,792 |
| crowded-horizontal | 664 → 664 | 1,728 → 1,728 | 12 → 48 | 12 → 48 | 12 → 48 | 12 → 48 | 2,440 → 2,584 | 2,440 → 2,584 |
| crowded-vertical | 312 → 312 | 2,288 → 2,288 | 12 → 48 | 12 → 48 | 12 → 48 | 12 → 48 | 2,648 → 2,792 | 2,648 → 2,792 |
| the 4 fixtures as saved (no lane racks) | unchanged | unchanged | — | — | — | — | 2,392 / 2,600 unchanged | unchanged |

Only the lane racks' counts changed, as expected. The small-building, short-row and L-shaped cases have no lane racks, so they are unchanged by construction.

## Checks
- **REG-lane-positions** (new, real clicks, 4 fixtures): each lane type placed from the library; its count is lanes × deep × levels, shown in its card; the layout's total is the sum; a Selective rack is unchanged.
- **Dealer walkthrough:**
  - a Drive-In (2 lanes × 5 deep) reads 40 PAL in its card and "2L × 5D × 4 · 40 PAL" on the plan;
  - typed to 6 lanes, both read 120;
  - Storage shows 120; no page errors.
- Full suite on its own: **4,416 / 4,420**. The 4 failures were all on older-horizontal (REG-button-hover, REG-section-single, REG-section-group, REG-bar-labels), in areas this branch does not touch. All 4 pass when rerun alone (20 / 20 runs): flaky under the full run, not caused by this change.

## Hand-check (≤ 6)
1. Place a Drive-In Rack: its card's Capacity is lanes × deep × levels (2 × 5 × 4 = 40 with a 4-level type).
2. Type 6 in Lanes: the card and the plan label read 120.
3. The Tally tab's total includes it.
4. A Selective rack's count is as before.
