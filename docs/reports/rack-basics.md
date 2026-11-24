# rack-basics — the Rule 9 basics on every rack type

Branch `rack-basics`, from `rack-design-match` (e0d156d). Status: see the last line.

## Result: no Rule 9 failure on any rack type
REG-basics runs every Racking library item through the Basics contract with real clicks, on older-horizontal and crowded-vertical:
- the 10 types: Selective, Back-to-back, Double-deep, Drive-in, Drive-through, Push-back, Pallet flow, Cantilever, Shelving, Mezzanine;
- plus a Selective in a filled building.

That is **264 checks on each fixture, 0 failed.** Each was asked for in Task 3, and each passes for all 11:

| Check | Pass | n/a |
|---|---|---|
| select by click inside · box · Shift adds · Tab | 11 · 11 · 11 · 11 | — |
| move · one undo · redo | 11 · 11 · 11 | — |
| resize · its undo | 10 · 10 | 1 — the filled building has no room |
| typed value | 11 | — |
| copy + paste · duplicate | 10 · 10 | 1 — the filled building has no room |
| delete · its undo · its redo | 11 · 11 · 11 | — |
| lock | 11 | — |
| snap to a wall · Alt turns snap off | 11 · 11 | — |
| save + reload | 11 | — |
| PDF | 11 | — |
| zoom (scales) | 11 | — |
| tool: back to Select | 11 | — |
| tool: Esc cancels | 4 | 7 — they drop at the view's centre at once, with nothing to cancel |
| tool: double-click keeps it on | 3 (new — was n/a) | 8 — they drop at once |

## What this branch adds (tests only — nothing in the app changed)
- **REG-basics — double-click keeps it on**, now checked for real on Selective, Back-to-back and Double-deep (rack-design made it work). Was: n/a for every library item.
  - The check: two clicks place two, the type is still on, Esc ends it, back to Select; both are then undone.
  - The 8 types that drop at once still report n/a, with the reason.
- **REG-rack-numbers** (new, all 4 fixtures, real clicks). The R numbers stay R1…Rn: every drawn number belongs to a line, none appears twice, and none is past the line count. Checked:
  - after Ctrl+D on a rack (the copy placed with a click);
  - after undoing it and redoing it;
  - after Delete on a rack, and after undoing that.
  - One undo brings back exactly the numbers drawn before.
  - A duplicate or delete can add or remove a line, or leave the count as it is when the rack runs on in an existing line or was one piece of a cut line. The numbers are right either way.

## Questions for PP (not fixed — they need a decision)
1. **Double-click on the drop-at-once types.** Drive-in, drive-through, push-back, pallet flow, cantilever, shelving and mezzanine drop at the view's centre at once, so a double-click places one, then a second on top. Should they follow the mouse until a click, like Selective, so Esc cancels and a double-click keeps them on? That changes how they place today.
2. **R numbers on the non-beam racks** (repeated from rack-design): today only beam racks are numbered, because the numbers are the BOM's lines.

## Dealer walkthrough
- Placed each of the ten types. For each, selected it by a click inside, then:
  - Tab;
  - moved it;
  - Ctrl+C, Ctrl+V, Ctrl+D;
  - Delete, Ctrl+Z, Ctrl+Y;
  - Lock;
  - a drag to a wall (it snapped), and with Alt (no snap);
  - a reload;
  - PDF.
- The R numbers ran on through a duplicate and closed up after a delete.
- All of this is what REG-basics and REG-rack-numbers drive.

## Hand-check (≤ 6)
1. Double-click Selective in the Racking library and click the plan twice: two racks, still on. Esc: back to Select.
2. Ctrl+D on a rack, then Delete another. The R numbers stay R1…Rn with no gaps, and Ctrl+Z puts them back.

Status: **done**. REG-basics Racking (2 fixtures) and REG-rack-numbers (4 fixtures) green. Full suite on the combined branch.
