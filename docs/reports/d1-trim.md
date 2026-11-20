# d1-trim — Line, Arrow and Elbow arrow are annotations

Branch `d1-trim`, from master (51bc0d2). Status: **ready**.

## What changed
- Line, Arrow and Elbow arrow no longer show a length or angle: not while drawing, not when selected.
- Their selection bar and card have no Length or Angle fields any more.
- Typing a number while drawing one of them does nothing (also `30<45`).
- Shift (0 / 45 / 90°), snapping, end styles, corners, the elbow's bend dot and everything else are unchanged.
- Exact measurements come from the Dimension tool, later.
- Polyline, Rectangle, Circle and Block arrow keep their live lengths and typed values.
- Code removed: the canvas length-label editor (`LengthEditor`), its click handler, the bar's Length and Angle fields, and the card's Length / Angle block. The helpers `setDrawnLength` / `setDrawnAngle` stay in `utils/drawTool.js` for the Dimension tool.

## REG tests
- **Removed** (it tested only the removed feature): `REG-length-label`.
- **Trimmed to what stays:**
  - `REG-line-card`: a line under 3″ is refused, plus checks that there are no Length/Angle fields, no label, and no typed length.
  - `REG-bar-length-angle`: no fields or label on Line, Arrow and Elbow arrow; a selected arrow's end handle sits behind its head and still drags.
  - `REG-draw-line` and `REG-arrow-tool`: no live length or angle; typing types nothing.
  - `REG-selbar-drawn`: the line's bar has no fields.
- **REG-basics:** Line, Arrow and Elbow arrow are exempt from "typed value" ("drawn annotations have no typed values").

## Decisions
- `REG-line-card` and `REG-bar-length-angle` kept their names: each still tests something real (the 3″ refusal; the arrowhead handle).

## Checks
- REG-basics for draw tools: green on both fixtures.
- 146 drawing REG runs: green.
- Full suite on its own: **4,412 / 4,412 passed**.
- Dealer walkthrough on crowded-horizontal:
  - Line, Arrow and Elbow arrow show no measurement, and typing does nothing.
  - Shift keeps a line level.
  - A polyline still shows its live length and takes 20 ft typed.
  - Save and reload unchanged; no page errors.

## Hand-check (≤ 6)
1. Press L, click, move, type `25`: nothing appears; click to finish. No length or angle on the line.
2. Select the line: its bar has colour, width, solid/dashed, end style, corners — no Length or Angle; its card has none either.
3. Draw an Arrow: the head shows; the end handle sits just behind the tip.
4. Draw a Polyline: its live length shows; type `20` + Enter sets a 20 ft segment.
