# filler-perf — the perf check after the two-day run

No code changed, so this report sits on `two-day-run` itself, not on a branch of its own.

**Setup:** the biggest layout (50,000 positions, bench3's layout50k), the dev server, CPU slowed 4×, 3 runs each. The
same script as the holiday run (`perf-week.mjs`).

**Warm runs** (run 1 includes the first load):

| | holiday run | master 5a591ec (2 sets) | two-day-run (2 sets) |
|---|---|---|---|
| Load, ms | 1,036 – 1,049 | 1,028 – 1,055 | 1,036 – 1,045 |
| Zoom p95, ms | 40 – 53 | 40 – 53 | 40 – 53 |
| Zoom mean, ms | 18.4 – 18.9 | 18.3 – 19.7 | 18.3 – 19.8 |
| Drag p95, ms | 13.5 | 13.5 | 13.5 – 13.7 |
| PDF, ms | 74 – 78 | 84 – 97 | 86 – 94 |
| Generate, ms | 195 – 263 | 197 – 242 | 194 – 255 |

**No regression from this run.**
- Every number on two-day-run is inside master's own spread.
- Zoom p95 flips between 40 and 53 ms on both, run to run: the frame timing at 4× slowdown, the known value PP accepted.
- The PDF is about 10 ms slower than the holiday run on master too. That comes from lane-fixes' pdf-parity (the PDF prints
  the rack numbers), not from this run.

Nothing to fix.
