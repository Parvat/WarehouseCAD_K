# perf-check: this week's speed on the biggest layout

Branch `perf-check`, from master. It is a report only; no code changed.

**How it was measured:** the 50,000-position layout (bench3's `layout50k.json`), CPU slowed 4×, the dev server. Each number is
3 runs, repeated a second time with 4 runs to confirm. holiday-run (everything this week, plus the holiday run) is compared
with **87fcc55**, the last commit before this week (2026-11-20). Frame times are in ms. Script:
`scratchpad/perf-week.mjs`, written for this check.

| What | Week start (87fcc55) | holiday-run | |
|---|---|---|---|
| Load (open the layout, to the first idle frame; warm runs) | 1,120 · 1,123 ms | 1,036 · 1,049 ms | same or better |
| Drag one selective, 40 steps: mean / p95 frame | 64.7–68.5 / 226.7 | 16.3–17.5 / 13.5 | about 4× better (drag-perf-bar, Monday) |
| Zoom, 24 wheel steps: mean / p95 frame | 19.5–22.0 / **40.0** | 18.4–20.2 / **53.3** (one run 66.6) | mean better, **p95 worse** |
| PDF, the plan sheet's SVG | 209–251 ms | 72–78 ms | about 3× better |
| Generate, older-horizontal (to the end of its lock) | 267–297 ms | 195–263 ms | better |

## The one regression: zoom p95, 40 → 53 ms
- **Where it came from:** bisected to **rack-design** (fb413d5, 2026-11-24, the colour-family drawing).
  - 4e7a075, the commit just before it, has p95 40 ms.
  - fb413d5 has 53 ms in every run.
  - Every later commit is the same.
- **What the profile shows:** the extra time is in the browser's canvas drawing ("(program)", 972 ms of the zoom), not in
  the app's code; every JS function is under 70 ms. Rack-design draws each rack's pallet slots as dashed lines, and on
  50,000 positions that is a lot of dashed strokes for every zoomed frame.
- **Not fixed — parked.** The drawing style is PP's and is to be kept. The safe fixes change how racks are drawn while
  zooming, so I did not do either unattended:
  - cache the racks layer as an image during a wheel zoom and redraw it sharp on the last step; or
  - draw the slots solid below a pixel size.

  It affects about 5 % of frames, at 53 ms instead of 40. The mean frame is faster than at the start of the week.

## Questions for PP
1. **The zoom p95 on a 50,000-position layout** (53 ms instead of 40, from the dashed pallet slots): should the racks be
   cached as an image while zooming (sharp again when the zoom stops)? Or is it acceptable as it is?
