# small-bugs — Duplicate notice, overlapping sections in Check, a stable REG-tally-ticks

Branch `small-bugs`, from master. Status: **ready**.

## What changed
1. **Duplicate says when nothing can be duplicated.** Ctrl+D and the bars' Duplicate now run the same code. With nothing selected, or nothing a copy can be made of (or no room for one), a notice reads **"Nothing to duplicate"**. A rack's copy that follows the pointer to be placed counts as a duplicate, so it gets no notice.
2. **Overlapping sections are flagged.** A section whose edge crosses another's (a custom shape drawn with the pen, or a point dragged across) is now a **Check layout warning**, "Section 1 and Section 2: their edges cross — the sections overlap", with both sections lit. Sections side by side (sharing an edge) are not flagged.
3. **REG-tally-ticks is stable.** Every check waits for the Tally drawer and the plan to settle (polls) instead of fixed pauses. The test has room for its own reload and sign-in under load (3× the usual timeout).

## Decisions
- **Item 2: Check, not snapping.** You asked for the simpler of the two. The pen already snaps onto edges near the pointer, but a deliberate crossing stays possible (a section can be redrawn), so Check is the honest place to say it.
- **"Polyline or pen edge"** I read as a section's edges: a custom section drawn with the pen, or its points edited. Drawn annotation polylines are not sections and are not checked.

## Checks
- **New REG tests**, real clicks, 4 fixtures: REG-duplicate-notice, REG-section-overlap-check. REG-tally-ticks passes on 4 fixtures.
- **Walkthrough:**
  - Ctrl+D with nothing selected shows "Nothing to duplicate";
  - a pen section across a rectangle's edge is flagged by Check, naming both;
  - no page errors.
- Full suite on its own: **4,422 / 4,424**. The 2 failures were one source-scan test (SBR-actions, both orientations) that pinned the old two lines of Duplicate; its expectation now allows the kept result. Rerun: SBR_studioBars 14 / 14.

## Hand-check (≤ 6)
1. Click empty floor, press Ctrl+D: "Nothing to duplicate".
2. Select a rack, press Ctrl+D: the copy follows the pointer, no such notice.
3. Draw a rectangle section, then a custom shape whose edge crosses it; press Check layout: the warning names both.
4. Two sections side by side: no warning.
