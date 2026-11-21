# Monday — unattended run (2026-11-20)

One line per branch. Reports are in each branch's `docs/reports/`. All branches are pushed.

| # | Branch | Status | Report | Note |
|---|---|---|---|---|
| 1 | d1-trim | ready | docs/reports/d1-trim.md | full suite 4412/4412 |
| 1 | basics-triage | ready | docs/reports/basics-triage.md | from d1-trim; harness only |
| 2 | basics-fixes | ready | docs/reports/basics-fixes.md | from basics-triage; REG-basics 0 failures on both fixtures |
| 3 | fill-columns | **parked** | docs/reports/fill-columns.md | Rule 7 showed unexpected changes; options A/B in the report |
| 4 | lane-positions | ready | docs/reports/lane-positions.md | lane types 12 → 48 positions; nothing else moved |
| 5 | small-bugs | ready | docs/reports/small-bugs.md | Duplicate notice, section-overlap Check, REG-tally-ticks stable |
| 6 | units | ready | docs/reports/units.md | full suite 4445/4445; Rule 7 identical in both units |
| 7 | r2-double-deep | not started | — | the condition "only if 1–6 are done" is not met: fill-columns is parked |
| — | **monday-all** | ready | this file | basics-fixes + lane-positions + small-bugs + units merged, in that order |

## Merge order

d1-trim → basics-triage → basics-fixes → lane-positions → small-bugs → units.

All of these are already merged on **`monday-all`**. Its one conflict was in `REG_handCheck.test.js`: lane-positions
and small-bugs added tests at the same place. Both sides were kept, and each test was checked to be identical to its
own branch. So the whole merge is one fast-forward:

```
git fetch . monday-all:master monday-all:canvas2-clean-start
git push origin master canvas2-clean-start
```

**Full suite on monday-all: 4452/4453.** The one failure was REG-door-types (older-horizontal), which hit the 120 s
timeout under full-suite load. Run on its own, it passes on all 4 fixtures (4/4). No app code is involved; it is the
same flaky-under-load pattern seen in earlier rounds.

fill-columns is not in monday-all. Merge it only after you choose option A or B in its report.
