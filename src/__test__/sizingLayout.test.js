import { describe, it, expect } from 'vitest'
import {
  sizingSheetLayout, rowBands, rowSegments, baysInRun, axisFrame, layoutSpec,
  columnGridObject, dockDoorObjects, stagingObjects, generateFixtures,
} from '../generate/sizingLayout'
import { placementToObject, aisleObjectsForRacks } from '../generate/traceGenerate'
import { checkColumns, expandColumnGrid, MHE_PROFILES, rackFootprint } from '../generate/columnCheck'
import { DEFAULT_RULES } from '../rules/defaults'

const GS = 40

/* The reference sizing sheet: 240 × 120, 12.5' aisles, 60' staging. */
const brief = {
  lengthFt: 240, widthFt: 120,
  rackType: 'rack_double_row',
  beamIn: 96, depthIn: 42, levels: 4,
  aisleFt: 12.5, speedBayFt: 60,
  gridXFt: 50, gridYFt: 54, dockDoors: 3,
}

describe('sizingLayout — rows down the depth', () => {
  const bands = rowBands(brief.widthFt, brief)

  it('puts a single row hard against the top and bottom walls', () => {
    expect(bands[0].type).toBe('rack_row')
    expect(bands[0].yFt).toBe(0)
    const last = bands[bands.length - 1]
    expect(last.type).toBe('rack_row')
    expect(last.yFt + last.depthFt).toBeCloseTo(brief.widthFt, 6)
  })

  it('fills the middle with the requested rack type', () => {
    const middle = bands.slice(1, -1)
    expect(middle.length).toBeGreaterThan(0)
    middle.forEach((b, i) => {
      // BUG 59 — the wider 9" default flue leaves the far-most pair, in
      // THIS exact widthFt/aisleFt/depthIn fixture, without room before the
      // wall-hit cleanup's own pre-existing single-row conversion kicks in
      // (rowBands' "swap for a single row first" step, unrelated to BUG 59
      // itself — just newly triggered by the deeper standard pair). Only
      // the LAST middle band may legitimately be that converted single.
      if (i === middle.length - 1 && b.type === 'rack_row') return
      expect(b.type).toBe('rack_double_row')
    })
  })

  it('leaves a full aisle between every row', () => {
    for (let i = 0; i < bands.length - 1; i++) {
      const gap = bands[i + 1].yFt - (bands[i].yFt + bands[i].depthFt)
      expect(gap).toBeGreaterThanOrEqual(brief.aisleFt - 1e-6)
    }
  })

  it('never runs past the back wall', () => {
    for (const b of bands) expect(b.yFt + b.depthFt).toBeLessThanOrEqual(brief.widthFt + 1e-6)
  })

  it('single-row briefs keep single rows all the way down', () => {
    const single = rowBands(brief.widthFt, { ...brief, rackType: 'rack_row' })
    for (const b of single) expect(b.type).toBe('rack_row')
  })
})

describe('sizingLayout — segments across the length', () => {
  const endClearFt = 4
  const { segments, bays, crossAisle } = rowSegments(brief.lengthFt, {
    ...brief, crossAisleFt: brief.aisleFt, endClearFt,
  })

  it('splits each row in two around one centre cross-aisle', () => {
    expect(segments).toHaveLength(2)
    expect(crossAisle).not.toBeNull()
  })

  it('starts racking at the wall clearance, not after a staging strip (BUG 44)', () => {
    expect(segments[0].xFt).toBe(endClearFt)
  })

  it('BUG 54: both segments run flush to their own wall — the far one included', () => {
    const seg2LenFt = (segments[1].bays * (96 + 3) + 3) / 12
    expect(segments[1].xFt + seg2LenFt).toBeCloseTo(brief.lengthFt - endClearFt, 6)
  })

  it('leaves at least the requested cross-aisle width clear between the two segments', () => {
    const seg1LenFt = (segments[0].bays * (96 + 3) + 3) / 12
    const gap = segments[1].xFt - (segments[0].xFt + seg1LenFt)
    expect(gap).toBeGreaterThanOrEqual(brief.aisleFt - 1e-6)
    expect(crossAisle.widthFt).toBeGreaterThanOrEqual(brief.aisleFt - 1e-6)
  })

  it('splitting around a cross-aisle costs bays versus one undivided run', () => {
    const whole = baysInRun(brief.lengthFt - 2 * endClearFt, brief.beamIn)
    expect(bays).toBeLessThan(whole)
  })
})

describe('sizingLayout — BUG 46: axisFrame is the ONLY orientation-aware code', () => {
  const params = { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30 }

  it('horizontal: stacks across width, runs along length, no grid offset, place() is a pure passthrough', () => {
    const f = axisFrame('horizontal', params)
    expect(f.vertical).toBe(false)
    expect(f.stackFt).toBe(params.widthFt)
    expect(f.runFt).toBe(params.lengthFt)
    expect(f.stackGridFt).toBe(params.gridYFt)
    expect(f.stackGridOffsetFt).toBe(0)
    // BUG 54: the run axis (length, X) needs its own pitch/offset too, so
    // rowSegments can steer the cross-aisle clear of a column — flush to the
    // wall like Y ("Columns along wall" defaults to Yes; both axes share one
    // rule, see axisGridLines).
    expect(f.runGridFt).toBe(params.gridXFt)
    expect(f.runGridOffsetFt).toBe(0)
    const band = { yFt: 14, depthFt: 7.5 }
    expect(f.place(band, 33.2, 999)).toEqual({ xFt: 33.2, yFt: 14, angle: 0 })
  })

  it('vertical: stacks across length (driven by gridXFt), runs along width, grid flush like columnGridObject, place() rotates around the true centre', () => {
    const f = axisFrame('vertical', params)
    expect(f.vertical).toBe(true)
    expect(f.stackFt).toBe(params.lengthFt)
    expect(f.runFt).toBe(params.widthFt)
    expect(f.stackGridFt).toBe(params.gridXFt)
    expect(f.stackGridOffsetFt).toBe(0)
    // BUG 54: the run axis (width, Y) needs its own pitch/offset too —
    // flush from the origin, same rule columnGridObject uses for both axes.
    expect(f.runGridFt).toBe(params.gridYFt)
    expect(f.runGridOffsetFt).toBe(0)

    const band = { yFt: 14, depthFt: 7.5 }
    const runPos = 0.25, runLenFt = 49.75
    const p = f.place(band, runPos, runLenFt)
    expect(p.angle).toBe(90)
    // The TRUE (post-rotation) centre must land at (band.yFt + depthFt/2, runPos + runLenFt/2)
    // — xFt/yFt are the pre-rotation top-left traceGenerate spins around it.
    expect(p.xFt + runLenFt / 2).toBeCloseTo(band.yFt + band.depthFt / 2, 6)
    expect(p.yFt + band.depthFt / 2).toBeCloseTo(runPos + runLenFt / 2, 6)
  })

  it('sizingSheetLayout has no orientation branch of its own left — only axisFrame does', () => {
    // A textual guard, not just a behavioural one: the walk (rowBands/
    // rowSegments) and the placement loop must never re-acquire a second
    // "if (vertical)"-shaped fork now that BUG 46 collapsed the one that
    // used to live inline here into axisFrame.
    const src = sizingSheetLayout.toString()
    expect(src).not.toMatch(/orientation\s*===\s*['"]vertical['"]/)
    expect(src).toContain('axisFrame(')
  })
})

describe('sizingLayout — BUG 44: no baked-in staging/dock carve-out', () => {
  it('rowSegments fills the full run axis even when it is the (short) WIDTH — the vertical case', () => {
    const endClearFt = 0.25
    const { segments, bays } = rowSegments(brief.widthFt, {
      crossAisleFt: brief.aisleFt, endClearFt, beamIn: brief.beamIn, upIn: 3,
    })
    expect(bays).toBeGreaterThan(0)
    expect(segments[0].xFt).toBeCloseTo(endClearFt, 6)   // not 60 (the old speedBayFt carve-out)
  })

  it('vertical sizingSheetLayout is not starved by the old extent bug', () => {
    const placements = sizingSheetLayout({ ...brief, orientation: 'vertical' })
    expect(placements.length).toBeGreaterThan(0)
  })

  it('generateFixtures no longer bakes in the staging boundary or dock doors', () => {
    const fx = generateFixtures(brief, 0, 0)
    expect(fx.some(o => o.type === 'struct_loading_dock')).toBe(false)
    expect(fx.some(o => o.text === 'STAGING')).toBe(false)
    expect(fx.some(o => o.type === 'column_grid')).toBe(true)   // structural grid still generated
  })
})

describe('sizingLayout — placements', () => {
  const placements = sizingSheetLayout(brief)

  it('emits one placement per row per segment', () => {
    // BUG 64 — sizingSheetLayout now threads the resolved wall clearance
    // into rowBands too (wallClearFt, matching rowSegments' own endClearFt);
    // this reference `bands` call needs the SAME resolved value or it's
    // comparing against a flush-to-the-wall geometry sizingSheetLayout no
    // longer produces.
    const { endClearFt } = layoutSpec(brief, DEFAULT_RULES)
    const bands = rowBands(brief.widthFt, { ...brief, wallClearFt: endClearFt })
    expect(placements).toHaveLength(bands.length * 2)
  })

  it('fills the full building — racks start at the wall clearance, not a staging strip (BUG 44)', () => {
    const endClearFt = (DEFAULT_RULES.selective.wallClearanceIn ?? 36) / 12
    for (const p of placements) expect(p.xFt).toBeGreaterThanOrEqual(endClearFt - 1e-6)
    expect(Math.min(...placements.map(p => p.xFt))).toBeLessThan(brief.speedBayFt)
  })

  it('every placement survives the object factory as a renderable rack', () => {
    for (const p of placements) {
      const o = placementToObject(p)
      expect(o.type).toMatch(/^rack_/)
      expect(Array.isArray(o.beams)).toBe(true)
      expect(o.beams.length).toBeGreaterThan(0)
      expect(o.width).toBeGreaterThan(0)
    }
  })

  it('returns nothing rather than overflowing a building too small to fill', () => {
    // widthFt narrower than a single row's own depth (42in = 3.5ft) — rowBands
    // can't place even the mandatory wall row, regardless of the run axis.
    // (Post-BUG 44, a merely-short length/width alone no longer disqualifies a
    // building — racking fills the full run axis now, no staging deduction.)
    expect(sizingSheetLayout({ ...brief, lengthFt: 40, widthFt: 2 })).toEqual([])
  })
})

describe('sizingLayout — fixtures', () => {
  it('builds a column grid on the requested spacing, flush to both near walls by default ("Columns along wall" = Yes)', () => {
    const g = columnGridObject(brief, 0, 0)
    expect(g.type).toBe('column_grid')
    expect(g.spacingX.every(s => s === brief.gridXFt * GS)).toBe(true)
    expect(g.spacingY.every(s => s === brief.gridYFt * GS)).toBe(true)
    // line #0 on the left wall and on the top wall
    expect(g.x).toBe(0)
    expect(g.y).toBe(0)
  })

  it('places the requested number of dock doors, spread along the wall', () => {
    const doors = dockDoorObjects(brief, 0, 0)
    expect(doors).toHaveLength(3)
    const ys = doors.map(d => d.y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)          // in order
    for (const d of doors) {
      expect(d.type).toBe('struct_loading_dock')
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.y + d.height).toBeLessThanOrEqual(brief.widthFt * GS)
    }
  })

  it('draws the staging boundary dashed, and labels the strip', () => {
    const [rule, label] = stagingObjects(brief, 0, 0)
    expect(rule.type).toBe('line')
    expect(rule.strokeDasharray).toBeTruthy()
    expect(rule.x1).toBe(brief.speedBayFt * GS)
    expect(rule.x1).toBe(rule.x2)                               // vertical
    expect(label.text).toBe('STAGING')
    expect(label.rotation).toBe(-90)
  })

  it('omits the grid when spacing is zero rather than emitting a degenerate one', () => {
    expect(columnGridObject({ ...brief, gridXFt: 0 }, 0, 0)).toBeNull()
  })
})

describe('sizingLayout — feeds the column check', () => {
  it('produces a layout whose columns the check can actually evaluate', () => {
    const racks = sizingSheetLayout(brief).map(placementToObject)
    const columns = expandColumnGrid(columnGridObject(brief, 0, 0), GS)
    expect(columns.length).toBeGreaterThan(0)

    const res = checkColumns({ racks, columns, profile: MHE_PROFILES.counterbalance, gridSize: GS })
    expect(res.summary.profile).toBe('Counterbalance')
    // every red mark must be a real rect the overlay can draw
    for (const m of res.redMarks) {
      expect(m.w).toBeGreaterThan(0)
      expect(m.h).toBeGreaterThan(0)
      expect(['rack-column', 'aisle-blocked']).toContain(m.kind)
    }
  })
})

/* BUG 53 — a pinched aisle (a column closer than travelFt to the row
 * behind it) can't be fixed by widening alone: widening only ever grows
 * the FAR side, and checkColumns' own accessibility read is already
 * max(near, far) >= travelFt (BUG 52 proved the interior walk's widen
 * formula is sufficient there, by construction). The one place that stayed
 * completely column-blind was the transition into the locked far-wall row
 * — placed by SPACE alone, with no column check at all — which is where
 * BUG 52's own "6.8ft clear" blocked aisles actually lived. Resolved by
 * shifting the pinching row forward to absorb the column (kept, costs
 * pick positions where it can't flue-seat) — never leave an aisle blocked.
 *
 * BUG 60 — the allowColumnInRack customer toggle this used to gate on
 * (drop the row vs. absorb the column) is gone entirely: there is only
 * one behaviour now — the row is always kept and the column always
 * absorbed (flue-seated where it fits, a bay-column where it doesn't). No
 * preference, no row-dropping; the dealer moves rows on the canvas
 * afterward if they want something different. */
describe('sizingLayout — BUG 53/60: the far-wall transition is column-aware, always absorbs, never blocks or drops', () => {
  const spec240 = {
    lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
    aisleFt: 10.5, gridXFt: 25, gridYFt: 30, dockDoors: 3, levels: 4, mhe: 'reach',
    orientation: 'vertical',
  }

  it('rows kept, zero blocked aisles, the pinching column resolves via flue-seating (S1 always runs now)', () => {
    const racks = sizingSheetLayout(spec240, DEFAULT_RULES).map(placementToObject)
    const columns = expandColumnGrid(columnGridObject(spec240, 0, 0), GS)
    const res = checkColumns({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS })
    expect(res.aisleBlocks.filter(a => a.level === 1)).toHaveLength(0)
    // BUG 60 — S1's flue-slide is no longer gated behind a toggle, so it
    // always gets first crack at every column. It resolves for free: zero
    // rack conflicts AND every row kept — "kept" checked structurally (each
    // band still has both segments, and every run reaches both wall rows)
    // rather than as a pinned row count, which follows every generator fix.
    expect(res.summary.rackConflicts).toBe(0)
    expect(res.flueSeated.length).toBeGreaterThan(0)
    expect(racks.length % 2).toBe(0)
    const stack = racks.map(r => rackFootprint(r)).map(f => f.x / GS)
    expect(Math.min(...stack)).toBeCloseTo(0.5, 6)                          // near-wall row present
    expect(Math.max(...racks.map(r => { const f = rackFootprint(r); return (f.x + f.w) / GS }))).toBeCloseTo(240 - 0.5, 6)   // far-wall row present
  })

  it('keeps every generated aisle at or above travelFt', () => {
    const racks = sizingSheetLayout(spec240, DEFAULT_RULES).map(placementToObject)
    const byId = new Map(racks.map(r => [r.id, r]))
    const aisles = aisleObjectsForRacks(racks)
    for (const a of aisles) {
      const row1 = byId.get(a.row1Id), row2 = byId.get(a.row2Id)
      const f1 = rackFootprint(row1), f2 = rackFootprint(row2)
      const r1 = { x: f1.x, y: f1.y, r: f1.x + f1.w, b: f1.y + f1.h }
      const r2 = { x: f2.x, y: f2.y, r: f2.x + f2.w, b: f2.y + f2.h }
      const yGap = Math.max(r2.x - r1.r, r1.x - r2.r)
      const xGap = Math.max(r2.y - r1.b, r1.y - r2.b)
      const w = (xGap >= yGap
        ? (r1.b < r2.y ? r2.y - r1.b : r1.y - r2.b)
        : (r1.r < r2.x ? r2.x - r1.r : r1.x - r2.r)) / GS
      expect(w).toBeGreaterThanOrEqual(8 - 1e-6)   // travelFt for reach
    }
  })

  it('horizontal is unaffected — the interior widen formula was already sufficient, no unnecessary row drop', () => {
    const brief = { ...spec240, orientation: 'horizontal' }
    const racks = sizingSheetLayout(brief, DEFAULT_RULES).map(placementToObject)
    const columns = expandColumnGrid(columnGridObject(brief, 0, 0), GS)
    const res = checkColumns({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS })
    expect(res.aisleBlocks.filter(a => a.level === 1)).toHaveLength(0)
    expect(racks.length).toBe(14)   // full capacity, unchanged from BUG 52
  })
})

/* BUG 54 — the cross-aisle (the ONE perpendicular through-aisle splitting a
 * run in two) had three independent bugs: (1) a symmetric floored half-split
 * left a gap between the last rack and the far wall — racks never actually
 * reached it; (2) the split position was chosen with zero column-awareness,
 * so a column could sit inside the cross-aisle itself; (3) its width reused
 * aisleFt (the pick aisle) instead of a per-forklift figure. Fixed together
 * because they share one root cause: `runLenFt(n)` is linear in bay count,
 * so `runLenFt(n1) + runLenFt(n2)` depends only on `n1 + n2` — both segments
 * can be wall-flush (fixing #1) AND the split (n1 vs n2) can be chosen for
 * free, at zero capacity cost, purely to steer the aisle off a column
 * (fixing #2, "PP's method") — while `crossAisleFt` itself now comes from
 * `rules.mhe[...].crossAisleFt` (fixing #3). Verified on both orientations —
 * axisFrame is the only orientation-aware code, but this bug lived in
 * rowSegments/sizingSheetLayout's consumption of it, so each axis's own
 * grid pitch/offset needs checking independently, not assumed shared. */
describe('sizingLayout — BUG 54: cross-aisle reaches the far wall, clears every column, matches the forklift', () => {
  const base = {
    lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
    gridXFt: 25, gridYFt: 30, levels: 4,
  }
  const endClearFt = (DEFAULT_RULES.selective.wallClearanceIn ?? 36) / 12

  for (const orientation of ['horizontal', 'vertical']) {
    for (const mhe of ['reach', 'counterbalance']) {
      it(`${orientation}/${mhe}: fills to the far wall, cross-aisle clear of every column, width >= the forklift's crossAisleFt`, () => {
        const brief = { ...base, orientation, mhe }
        const placements = sizingSheetLayout(brief, DEFAULT_RULES)
        expect(placements.length).toBeGreaterThan(0)
        const racks = placements.map(placementToObject)

        const runFt        = orientation === 'vertical' ? base.widthFt : base.lengthFt
        const farWallFt     = runFt - endClearFt
        const crossAisleFt  = DEFAULT_RULES.mhe[mhe].crossAisleFt

        // racks fill flush to both walls — no gap at the near OR far end
        const edgesFt = racks.map(r => {
          const f = rackFootprint(r)
          return orientation === 'vertical' ? [f.y / GS, (f.y + f.h) / GS] : [f.x / GS, (f.x + f.w) / GS]
        })
        expect(Math.min(...edgesFt.map(e => e[0]))).toBeCloseTo(endClearFt, 1)
        expect(Math.max(...edgesFt.map(e => e[1]))).toBeCloseTo(farWallFt, 1)

        // exactly one cross-aisle, wide enough for the selected forklift, clear of every column
        const frame = axisFrame(orientation, { lengthFt: base.lengthFt, widthFt: base.widthFt, gridXFt: base.gridXFt, gridYFt: base.gridYFt })
        const { segments, crossAisle } = rowSegments(runFt, {
          crossAisleFt, endClearFt, beamIn: 96, upIn: 3,
          runGridFt: frame.runGridFt, runGridOffsetFt: frame.runGridOffsetFt,
        })
        expect(segments).toHaveLength(2)
        expect(crossAisle).not.toBeNull()
        expect(crossAisle.widthFt).toBeGreaterThanOrEqual(crossAisleFt - 1e-6)

        const columns = expandColumnGrid(columnGridObject(base, 0, 0), GS)
        for (const col of columns) {
          const colRunFt = orientation === 'vertical' ? (col.y + col.h / 2) / GS : (col.x + col.w / 2) / GS
          const clearOfAisle = colRunFt + 0.5 <= crossAisle.xFt || colRunFt - 0.5 >= crossAisle.xFt + crossAisle.widthFt
          expect(clearOfAisle).toBe(true)
        }
      })
    }
  }

  it('reach and counterbalance are configured with genuinely different cross-aisle widths, not a flat number', () => {
    // Per-forklift, not reused from aisleFt — reach/narrow-aisle trucks need
    // less room to drive straight through than counterbalance needs to turn.
    expect(DEFAULT_RULES.mhe.reach.crossAisleFt).toBeLessThan(DEFAULT_RULES.mhe.counterbalance.crossAisleFt)

    const runFt = base.lengthFt
    const frame = axisFrame('horizontal', { lengthFt: base.lengthFt, widthFt: base.widthFt, gridXFt: base.gridXFt, gridYFt: base.gridYFt })
    for (const mhe of ['reach', 'counterbalance']) {
      const { crossAisle } = rowSegments(runFt, {
        crossAisleFt: DEFAULT_RULES.mhe[mhe].crossAisleFt, endClearFt, beamIn: 96, upIn: 3,
        runGridFt: frame.runGridFt, runGridOffsetFt: frame.runGridOffsetFt,
      })
      // built width can absorb integer-bay rounding slack, so it's a floor,
      // never a hardcoded exact match — the per-forklift figure is honoured
      // as a MINIMUM, which is what actually matters physically.
      expect(crossAisle.widthFt).toBeGreaterThanOrEqual(DEFAULT_RULES.mhe[mhe].crossAisleFt - 1e-6)
    }
  })
})

/* BUG 55 — a back-to-back pair's flue is the physical gap between its two
 * faces; a column standing in it has to actually FIT there. The generator
 * previously used one fixed flueIn (6") for every pair regardless of
 * whether a column sat in its flue — a 12" column jammed into a 9" or 6"
 * flue is not free, it overlaps both rack faces. Fixed by sizing each
 * PAIR's own flue to `max(standard flue, columnWidth)` whenever a column
 * ends up seated in it — a pair with no column in its flue is untouched,
 * still the standard flue. (BUG 60 removed the old S1/S2 distinction —
 * the flue-slide attempt below always runs now, no customer toggle gates
 * it.)
 *
 * BUG 59 — the added clearance (+4.8", `COLUMN_FLUE_CLEARANCE_IN`) this
 * used to bump the widened flue by is gone: a column seated in the flue
 * gets EXACTLY its own width of flue, a flush fit, no slack either side.
 * That is the dealer's choice now, via the flue-spacing property panel,
 * not baked into the generator. The standard (un-widened) flue also moved,
 * 6" → 9". */
describe('sizingLayout — BUG 55/59: flue sizing is column-aware, no added clearance', () => {
  const base = { rackType: 'rack_double_row', depthIn: 42, aisleFt: 12, flueIn: 9, colSizeIn: 12 }

  it('a pair that slides its flue onto a 12" column widens to EXACTLY 12" and the column flush-fits', () => {
    const bands = rowBands(50, { ...base, gridYFt: 1000, gridOffsetFt: 20 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair).toBeTruthy()
    expect(pair.flueIn).toBeCloseTo(12, 6)   // exactly the column's own width — no clearance added

    // total depth reflects the wider flue, not the standard one
    expect(pair.depthFt).toBeCloseTo((2 * base.depthIn + pair.flueIn) / 12, 6)

    // the column (centred at yFt=20, 12" wide) must sit ENTIRELY inside
    // the flue band — not spilling into either face.
    const singleFt  = base.depthIn / 12
    const flueLoFt  = pair.yFt + singleFt
    const flueHiFt  = flueLoFt + pair.flueIn / 12
    const colLoFt   = 20 - 0.5, colHiFt = 20 + 0.5
    expect(colLoFt).toBeGreaterThanOrEqual(flueLoFt - 1e-9)
    expect(colHiFt).toBeLessThanOrEqual(flueHiFt + 1e-9)
  })

  it('a pair with no column anywhere near its flue keeps the standard 9" flue', () => {
    const bands = rowBands(50, { ...base, gridYFt: 0 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair.flueIn).toBe(9)
    expect(pair.depthFt).toBeCloseTo((2 * base.depthIn + 9) / 12, 6)
  })

  it('a column that coincidentally lands in a pair\'s CURRENT (un-slid) flue still widens it', () => {
    // Under the new (no-clearance) rule a 12" column widens the standard
    // 9" flue to exactly 12" — a much narrower target than BUG 55's old
    // 16.8", so a coincidental hit against the pair's CURRENT (un-slid)
    // 9" flue exists at the default flueIn with no override needed.
    const bands = rowBands(50, { ...base, gridYFt: 1000, gridOffsetFt: 19.5 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair.flueIn).toBeCloseTo(12, 6)
    expect(pair.depthFt).toBeCloseTo((2 * base.depthIn + 12) / 12, 6)

    // and it must be FULLY contained — the whole point of BUG 56
    const singleFt = base.depthIn / 12
    const flueLoFt = pair.yFt + singleFt, flueHiFt = flueLoFt + pair.flueIn / 12
    expect(19.5 - 0.5).toBeGreaterThanOrEqual(flueLoFt - 1e-9)
    expect(19.5 + 0.5).toBeLessThanOrEqual(flueHiFt + 1e-9)
  })

  it('does not widen for a column that lands in a FACE, not the flue — still absorbed as a bay-column, not a flue-fit problem', () => {
    const bands = rowBands(50, { ...base, gridYFt: 1000, gridOffsetFt: 17 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair.flueIn).toBe(9)   // untouched — this column is a rack conflict, not a flue-sizing question
  })

  it('full stack: the widened flue makes it to the rendered object and checkColumns independently agrees the column is flue-seated (free), not a rack conflict', () => {
    // BUG 64 — gridXFt moved 20 -> 15: with the new (bigger) default wall
    // clearance shifting the run-axis usable length slightly, a gridXFt=20
    // column line landed exactly in the cross-aisle gap between the two
    // segments instead of inside either one — a real, coincidental
    // consequence of the wall-clearance default change, not a flue-sizing
    // regression (flueIn is still exactly 12, confirmed below either way).
    const brief = {
      lengthFt: 40, widthFt: 50, rackType: 'rack_double_row',
      aisleFt: 12, gridXFt: 15, gridYFt: 20, levels: 4,
    }
    const placements = sizingSheetLayout(brief, DEFAULT_RULES)
    const pairPlacement = placements.find(p => p.type === 'rack_double_row')
    expect(pairPlacement.flueIn).toBeCloseTo(12, 6)

    const racks = placements.map(placementToObject)
    const pairRack = racks.find(r => r.type === 'rack_double_row')
    // the OBJECT's own height must reflect the widened flue, not the standard one
    expect(pairRack.flueSpaceIn).toBeCloseTo(12, 6)
    expect(pairRack.height).toBeCloseTo(((2 * 42 + 12) / 12) * GS, 3)

    const columns = expandColumnGrid(columnGridObject(brief, 0, 0), GS)
    const res = checkColumns({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS })

    // every rack conflict must belong to a SINGLE row (the wall rows, which
    // have no flue to seat a column in) — the double-row pair itself must
    // contribute zero conflicts, since its column is properly flue-seated.
    const pairIds = new Set(racks.filter(r => r.type === 'rack_double_row').map(r => r.id))
    expect(res.rackConflicts.some(c => pairIds.has(c.rackId))).toBe(false)
    expect(res.flueSeated.some(fs => pairIds.has(fs.rackId))).toBe(true)
  })
})

/* BUG 56 — BUG 55's own "applies in any strategy" fallback widened a
 * pair's flue in place without ever moving `start`, so a column whose
 * ideal centred position fell before the aisle boundary got a flue that
 * was wide enough on paper but positioned wrong — the column's footprint
 * only partially landed inside it, the rest still inside the rack face
 * the whole exercise was supposed to clear it from. Fixed by clamping
 * `start` to the CLOSEST reachable point to the ideal centred position
 * the aisle boundary (and the far wall) allow, then verifying — never
 * assuming — that the column's full footprint actually lands inside the
 * resulting flue before accepting it. A column is either FULLY seated or
 * not seated at all; there is no partial credit.
 *
 * BUG 59 — removing the +4.8" clearance changes what "clamped" can even
 * mean here: a widened flue is now sized to EXACTLY the column's own
 * width (`flueInForColumn` = `max(flueIn, colSizeIn)`, no slack added), so
 * whenever widening actually happens, `neededFlueFt` and `colWidthFt` are
 * numerically equal — zero room either side. There is no longer a middle
 * ground where the ideal centred position is unreachable but a nearby
 * clamped one still fully contains the column (BUG 56's original
 * behaviour, when the old +4.8" gave the clamp some slack to work with):
 * either the exact ideal start is reachable and the column seats dead
 * centred, or it isn't and the column falls straight through to BUG 57's
 * face-seat fallback. Confirmed live by sweeping the boundary in
 * `gridOffsetFt` steps of 0.01 around this exact base/aisle geometry —
 * seating flips from "seats, dead-centred" to "declines, face-shifts" at
 * a single knife-edge point (19.5ft), with no intermediate clamped case
 * on either side. The CLAMP mechanism itself isn't dead, though — it still
 * fires whenever a column is genuinely SMALLER than the flue it lands in
 * (see the small-column case below), which still leaves slack to clamp
 * into. */
describe('sizingLayout — BUG 56/59: flue-seating never leaves a column half in the rack — exact fit or none at all', () => {
  const base = { rackType: 'rack_double_row', depthIn: 42, aisleFt: 12, flueIn: 9, colSizeIn: 12 }
  // afterAisle = singleFt(3.5) + aisleFt(12) = 15.5 for every case below —
  // the boundary `start` may never cross.

  it('ideal centring exactly reachable — seats the column dead-centred in its exact-fit flue', () => {
    // idealStart = colY - 3.5 - 0.5 = 15.6, comfortably past the 15.5 aisle
    // boundary — reachable with no clamp at all.
    const bands = rowBands(50, { ...base, gridYFt: 1000, gridOffsetFt: 19.6 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair.flueIn).toBeCloseTo(12, 6)     // widened to exactly the column's width
    expect(pair.yFt).toBeCloseTo(15.6, 6)      // the true ideal, unclamped

    const singleFt = base.depthIn / 12
    const flueLoFt = pair.yFt + singleFt, flueHiFt = flueLoFt + pair.flueIn / 12
    const colLoFt = 19.6 - 0.5, colHiFt = 19.6 + 0.5
    expect(colLoFt).toBeGreaterThanOrEqual(flueLoFt - 1e-9)   // fully contained
    expect(colHiFt).toBeLessThanOrEqual(flueHiFt + 1e-9)
    // and it's dead centred — zero slack means no other position could seat it
    const flueCenterFt = (flueLoFt + flueHiFt) / 2
    expect(Math.abs(19.6 - flueCenterFt)).toBeLessThan(1e-6)
  })

  it('one hundredth of a foot short of the boundary — zero slack means the flue does not widen at all, and (BUG 57) the pair shifts so the column is fully in a face instead of straddling', () => {
    // idealStart = colY - 4 = 15.49, 0.01ft short of the 15.5 aisle
    // boundary. Under the OLD +4.8" clearance rule this still had 2.4" of
    // slack to clamp into; under BUG 59's exact-fit rule it has none — the
    // clamped position's near edge falls outside the resulting flue, so
    // BUG 56 correctly declines to widen, and BUG 57 shifts the
    // still-standard-flue pair so this column lands fully inside face 1
    // instead of straddling the face/flue boundary.
    const bands = rowBands(50, { ...base, gridYFt: 1000, gridOffsetFt: 19.49 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair.flueIn).toBe(9)   // NOT widened — a half-fit flue is worse than none

    const singleFt = base.depthIn / 12
    const face1LoFt = pair.yFt, face1HiFt = face1LoFt + singleFt
    const flueLoFt = face1HiFt, flueHiFt = flueLoFt + pair.flueIn / 12
    const colLoFt = 19.49 - 0.5, colHiFt = 19.49 + 0.5
    // fully inside face 1 — not the flue, not straddling either boundary
    expect(colLoFt).toBeGreaterThanOrEqual(face1LoFt - 1e-9)
    expect(colHiFt).toBeLessThanOrEqual(face1HiFt + 1e-9)
    // and genuinely clear of the flue zone, not just touching its edge
    expect(colHiFt).toBeLessThanOrEqual(flueLoFt + 1e-9)
  })

  it('a column SMALLER than the standard flue still uses the clamp — genuinely off-centre, still fully contained, no widening needed', () => {
    // colSizeIn=6 leaves real slack against the 9" standard flue
    // (neededFlueFt=0.75 vs colWidthFt=0.25) even though no widening ever
    // happens here (max(9,6)=9) — this is the clamp mechanism surviving
    // BUG 59 for the case it was always meant for: a column that actually
    // has room to be off-centre within a flue no bigger than it needs to be.
    const smallCol = { ...base, colSizeIn: 6 }
    const bands = rowBands(50, { ...smallCol, gridYFt: 1000, gridOffsetFt: 19.3 })
    const pair = bands.find(b => b.type === 'rack_double_row')
    expect(pair.flueIn).toBe(9)           // standard flue already covers a 6" column — no widening
    expect(pair.yFt).toBeCloseTo(15.5, 6) // clamped to the aisle boundary (ideal start would be 15.425)

    const singleFt = smallCol.depthIn / 12
    const flueLoFt = pair.yFt + singleFt, flueHiFt = flueLoFt + pair.flueIn / 12
    const colLoFt = 19.3 - 0.25, colHiFt = 19.3 + 0.25
    expect(colLoFt).toBeGreaterThanOrEqual(flueLoFt - 1e-9)   // fully contained
    expect(colHiFt).toBeLessThanOrEqual(flueHiFt + 1e-9)
    const flueCenterFt = (flueLoFt + flueHiFt) / 2
    expect(Math.abs(19.3 - flueCenterFt)).toBeGreaterThan(1e-6)   // genuinely off-centre
  })

  it('the standard-flue fallback never leaves a column straddling a face/flue boundary, across a full column pitch', () => {
    // BUG 57 — same sweep as the widened-flue invariant above, but for
    // pairs that stayed at the STANDARD flue (widening was declined):
    // every column whose FULL footprint lies within the pair's own total
    // span (front face through back face) — not one that partly pokes
    // into the aisle before or after the pair, which is a different,
    // pre-existing, already-correct case governed by STEP 2's own
    // travelFt accessibility check, not face/flue containment — must end
    // up fully inside face 1, the flue, or face 2, never straddling a
    // boundary between them. A column whose footprint isn't even fully
    // inside the pair to begin with is an aisle-domain question, not
    // this invariant's — testing it here would flag STEP 2's own,
    // already-correct "one-side pick, plenty of clearance" cases as
    // failures they were never meant to satisfy.
    const singleFt = base.depthIn / 12
    for (let off = 0; off < 30; off += 0.1) {
      const bands = rowBands(80, { ...base, gridYFt: 30, gridOffsetFt: off })
      for (const pair of bands.filter(b => b.type === 'rack_double_row' && b.flueIn <= base.flueIn)) {
        const face1Lo = pair.yFt, face1Hi = face1Lo + singleFt
        const flueLo = face1Hi, flueHi = flueLo + pair.flueIn / 12
        const face2Lo = flueHi, face2Hi = face2Lo + singleFt
        for (let k = 0; k < 5; k++) {
          const colY = off + k * 30
          const colLo = colY - 0.5, colHi = colY + 0.5
          const fullyWithinPair = colLo >= face1Lo - 1e-9 && colHi <= face2Hi + 1e-9
          if (!fullyWithinPair) continue
          const fullyInFace1 = colHi <= face1Hi + 1e-9
          const fullyInFlue  = colLo >= flueLo - 1e-9  && colHi <= flueHi + 1e-9
          const fullyInFace2 = colLo >= face2Lo - 1e-9
          expect(fullyInFace1 || fullyInFlue || fullyInFace2).toBe(true)
        }
      }
    }
  })

  it('never ships a partial overlap: for every gridOffsetFt across a full 30ft column pitch, a widened pair either fully contains its column or does not widen at all', () => {
    const singleFt = base.depthIn / 12
    for (let off = 0; off < 30; off += 0.1) {
      const bands = rowBands(80, { ...base, gridYFt: 30, gridOffsetFt: off })
      for (const pair of bands.filter(b => b.type === 'rack_double_row')) {
        if (pair.flueIn <= base.flueIn) continue   // untouched — nothing to check
        const flueLoFt = pair.yFt + singleFt, flueHiFt = flueLoFt + pair.flueIn / 12
        // find the column(s) that could plausibly be the one this pair widened for
        for (let k = 0; k < 4; k++) {
          const colY = off + k * 30
          const colLoFt = colY - 0.5, colHiFt = colY + 0.5
          const touchesFlue = colHiFt > flueLoFt && colLoFt < flueHiFt
          if (!touchesFlue) continue
          // if it touches the flue at all, it must be FULLY inside it — no straddling
          expect(colLoFt).toBeGreaterThanOrEqual(flueLoFt - 1e-9)
          expect(colHiFt).toBeLessThanOrEqual(flueHiFt + 1e-9)
        }
      }
    }
  })

  it('240x120/25x30/reach, both orientations: every widened pair fully contains its column, widens to exactly 12", zero straddles', () => {
    // Horizontal's every would-be-widened pair in THIS exact geometry hits
    // the "aisle boundary makes full containment impossible" case (BUG 56's
    // own reproduction — see the buglog) — that's not a gap in this test,
    // it IS this test: the fix means those columns correctly fall through
    // to the standard flue / bay-column path instead of a broken widen, so
    // horizontal legitimately produces zero widened pairs here while
    // vertical (more slack before its aisle, in this same building) still
    // does. BUG 59 only changes the WIDTH each widened pair widens to (12"
    // flush fit, not 16.8" with clearance) — confirmed live that the
    // WALK's own decisions are unchanged: still 0 widened pairs/horizontal,
    // still 6 widened pairs/vertical, same row counts and positions as the
    // pre-BUG-59 known-good run.
    let totalWidened = 0
    for (const orientation of ['horizontal', 'vertical']) {
      const brief = {
        lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
        aisleFt: 10.5, gridXFt: 25, gridYFt: 30, levels: 4, mhe: 'reach', orientation,
      }
      const placements = sizingSheetLayout(brief, DEFAULT_RULES)
      const racks = placements.map(placementToObject)
      const widened = racks.filter(r => r.type === 'rack_double_row' && r.flueSpaceIn > 9)
      totalWidened += widened.length
      // Per-orientation widened-pair counts are not pinned: they follow the
      // grid origin (BUG 69 / both-axes fix) and every walk fix. What must
      // hold is the invariant below, plus totalWidened > 0 so it isn't vacuous.
      // every widened pair widens to EXACTLY the 12" column, per BUG 59 — no clearance
      for (const p of widened) expect(p.flueSpaceIn).toBeCloseTo(12, 6)

      const columns = expandColumnGrid(columnGridObject(brief, 0, 0), GS)
      for (const p of widened) {
        const f = rackFootprint(p)
        const depthAxisIsY = !f.rotated
        const depthPx = (p.depthIn / 12) * GS, fluePx = (p.flueSpaceIn / 12) * GS
        const depthStart = depthAxisIsY ? f.y : f.x
        const flueLo = depthStart + depthPx, flueHi = flueLo + fluePx
        for (const col of columns) {
          const colCenter = depthAxisIsY ? (col.y + col.h / 2) : (col.x + col.w / 2)
          const colHalf = (depthAxisIsY ? col.h : col.w) / 2
          const runAxisOverlap = depthAxisIsY
            ? (col.x + col.w > f.x && col.x < f.x + f.w)
            : (col.y + col.h > f.y && col.y < f.y + f.h)
          if (!runAxisOverlap) continue
          const touchesFlue = colCenter + colHalf > flueLo && colCenter - colHalf < flueHi
          if (!touchesFlue) continue
          // fully inside, never straddling — the core invariant
          expect(colCenter - colHalf).toBeGreaterThanOrEqual(flueLo - 1e-6)
          expect(colCenter + colHalf).toBeLessThanOrEqual(flueHi + 1e-6)
        }
      }

      // and independently, via checkColumns: zero rack conflicts belonging
      // to a widened pair. BUG 64 — the flue-seated TOTAL (not just the
      // widened-pair subset) also depends on the wall-clearance default,
      // since it shifts every row's exact position — so it is not pinned,
      // only required to be consistent: every widened pair's column must be
      // read by checkColumns as flue-seated, never as a rack conflict.
      const res = checkColumns({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS })
      const widenedIds = new Set(widened.map(r => r.id))
      expect(res.rackConflicts.some(c => widenedIds.has(c.rackId))).toBe(false)
      for (const id of widenedIds) expect(res.flueSeated.some(s => s.rackId === id)).toBe(true)
    }
    expect(totalWidened).toBeGreaterThan(0)   // the invariant above was exercised, not vacuous
  })
})

/* BUG 64 — the Generate panel's new BUILDING section: wall clearance (the
 * gap between every wall and where racking actually starts, one number for
 * both axes — rowBands' new wallClearFt on the depth axis, rowSegments'
 * existing endClearFt on the run axis, both fed the SAME resolved value).
 * Default wall clearance moved 3" -> 6" (DEFAULT_RULES.selective.wallClearanceIn).
 *
 * "Columns along wall" itself is covered separately below (BUG 69) — BUG
 * 64's own first cut at that toggle (a `wallColumnGridObjects` mechanism
 * layered on top of the interior grid) is gone; see that describe block for
 * why and what replaced it. */
describe('sizingLayout — BUG 64: wall clearance', () => {
  const base = { rackType: 'rack_double_row', depthIn: 42, aisleFt: 12, flueIn: 9, colSizeIn: 12 }

  it('rowBands: wallClearFt offsets BOTH the near and far wall rows off their own wall, symmetrically', () => {
    const noWall = rowBands(50, { ...base, gridYFt: 0 })
    const withWall = rowBands(50, { ...base, gridYFt: 0, wallClearFt: 1 })
    expect(noWall[0].yFt).toBe(0)
    expect(withWall[0].yFt).toBe(1)   // near wall row starts 1ft off the wall
    const noWallLast = noWall[noWall.length - 1]
    const withWallLast = withWall[withWall.length - 1]
    expect(noWallLast.yFt + noWallLast.depthFt).toBeCloseTo(50, 6)          // flush to the far wall
    expect(withWallLast.yFt + withWallLast.depthFt).toBeCloseTo(50 - 1, 6)  // 1ft short of it
  })

  it('rowBands: wallClearFt=0 (the default) reproduces the old flush-to-the-wall behaviour exactly — no silent change for a caller that predates the field', () => {
    const bands = rowBands(50, { ...base, gridYFt: 0 })
    expect(bands[0].yFt).toBe(0)
  })

  it('sizingSheetLayout threads a custom wallClearanceIn (inches) end to end: racks start offset from the walls by exactly that much', () => {
    const brief = { lengthFt: 80, widthFt: 50, rackType: 'rack_double_row', aisleFt: 12, wallClearanceIn: 12 }
    const placements = sizingSheetLayout(brief, DEFAULT_RULES)
    const nearWall = placements.find(p => p.type === 'rack_row')
    expect(nearWall.yFt).toBeCloseTo(1, 6)   // 12in = 1ft
  })

  it('sizingSheetLayout with no wallClearanceIn override uses the shipped 6" default', () => {
    const brief = { lengthFt: 80, widthFt: 50, rackType: 'rack_double_row', aisleFt: 12 }
    const placements = sizingSheetLayout(brief, DEFAULT_RULES)
    const nearWall = placements.find(p => p.type === 'rack_row')
    expect(nearWall.yFt).toBeCloseTo(0.5, 6)   // 6in = 0.5ft
  })
})

/* BUG 69 — "columns along wall" redesigned. BUG 64's own version modelled
 * this as a SEPARATE `wallColumnGridObjects` mechanism (four extra
 * column_grid objects) layered on top of the always-flush interior grid —
 * wrong, because the interior grid's own Y=0 line already sits ON the near
 * wall regardless of that toggle, so "No" never actually removed the
 * column a customer could see there. That mechanism is gone entirely.
 *
 * The correct model: the toggle IS the interior grid's own origin. Yes (the
 * default for any caller that predates the toggle, so nothing else in this
 * file that doesn't set it shifts underfoot) keeps Y flush at 0 — a line on
 * the wall. No insets Y by one full gridYFt pitch, dropping the line that
 * leaves outside the building, so no line ever sits on the wall.
 *
 * CRITICAL: the SAME shift has to reach whichever avoidance walk actually
 * consumes gridYFt's axis — rowBands' gridOffsetFt for horizontal (that
 * axis is the STACK axis there), rowSegments' runGridOffsetFt for vertical
 * (gridYFt is the RUN axis there instead) — via axisFrame, or the drawn
 * grid and the rack-avoidance math would disagree about where line #0 is. */
describe('sizingLayout — BUG 69: "columns along wall" moves the interior grid\'s own origin', () => {
  const gbrief = { lengthFt: 100, widthFt: 65, gridXFt: 25, gridYFt: 30 }

  // expandColumnGrid returns the full X×Y cartesian product of column boxes,
  // top-left corner (c.y = lineY - columnH/2), not just the distinct Y grid
  // lines — de-duped and shifted back to the line position itself.
  const lineYsFt = (g) => [...new Set(expandColumnGrid(g, GS).map(c => (c.y + g.columnH / 2) / GS))]
    .sort((a, b) => a - b)

  it('columnGridObject: Yes (default) keeps the grid flush — a line at y=0', () => {
    const grid = columnGridObject(gbrief, 0, 0)
    expect(grid.y).toBe(0)
    expect(Math.min(...lineYsFt(grid))).toBeCloseTo(0, 6)
  })

  it('columnGridObject: No insets the grid one full gridYFt pitch — no line at y=0, one fewer line than Yes, otherwise the same lines', () => {
    const yes = columnGridObject({ ...gbrief, columnsAlongWall: true }, 0, 0)
    const no  = columnGridObject({ ...gbrief, columnsAlongWall: false }, 0, 0)
    expect(no.y).toBeCloseTo(gbrief.gridYFt * GS, 6)
    const yesLines = lineYsFt(yes)
    const noLines  = lineYsFt(no)
    expect(noLines).toHaveLength(yesLines.length - 1)
    expect(noLines.some(y => Math.abs(y) < 1e-6)).toBe(false)
    expect(noLines).toEqual(yesLines.slice(1))   // same lines, minus the wall one
  })

  it('generateFixtures always returns exactly one column_grid, regardless of the toggle — the separate wall-grid mechanism is gone', () => {
    const fxYes = generateFixtures({ ...gbrief, columnsAlongWall: true }, 0, 0)
    const fxNo  = generateFixtures({ ...gbrief, columnsAlongWall: false }, 0, 0)
    expect(fxYes.filter(o => o.type === 'column_grid')).toHaveLength(1)
    expect(fxNo.filter(o => o.type === 'column_grid')).toHaveLength(1)
  })

  it('CRITICAL — horizontal: axisFrame feeds rowBands the SAME origin columnGridObject draws with, both toggle states', () => {
    for (const columnsAlongWall of [true, false]) {
      const frame = axisFrame('horizontal', { ...gbrief, columnsAlongWall })
      const grid  = columnGridObject({ ...gbrief, columnsAlongWall }, 0, 0)
      expect(frame.stackGridOffsetFt).toBeCloseTo(grid.y / GS, 6)
    }
  })

  it('CRITICAL — vertical: axisFrame feeds rowSegments the SAME origin columnGridObject draws with, on the run axis, both toggle states', () => {
    for (const columnsAlongWall of [true, false]) {
      const frame = axisFrame('vertical', { ...gbrief, columnsAlongWall })
      const grid  = columnGridObject({ ...gbrief, columnsAlongWall }, 0, 0)
      expect(frame.runGridOffsetFt).toBeCloseTo(grid.y / GS, 6)
    }
  })

  it('end to end: columnsAlongWall=false never disagrees with the interior grid it drew — same rack/column outcome as Yes, just shifted, no new blocked aisles or rack conflicts introduced by the redesign, both orientations', () => {
    for (const orientation of ['horizontal', 'vertical']) {
      const runFor = (columnsAlongWall) => {
        const brief2 = {
          lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
          aisleFt: 12.5, gridXFt: 50, gridYFt: 54, mhe: 'reach',
          orientation, columnsAlongWall,
        }
        const racks = sizingSheetLayout(brief2, DEFAULT_RULES).map(placementToObject)
        const columns = expandColumnGrid(columnGridObject(brief2, 0, 0), GS)
        return checkColumns({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS })
      }
      const yes = runFor(true)
      const no  = runFor(false)
      // Whatever level-1 blocks / rack conflicts Yes already has (there is
      // none for this geometry) is an existing generator characteristic
      // this redesign doesn't touch — the bar here is "No doesn't make it
      // worse," not "zero," since that's a stronger claim than the toggle
      // itself makes.
      expect(no.aisleBlocks.filter(a => a.level === 1)).toHaveLength(yes.aisleBlocks.filter(a => a.level === 1).length)
      expect(no.summary.rackConflicts).toBe(yes.summary.rackConflicts)
    }
  })
})

/* Generated racks weren't shrinking their flue back down when dragged, the
 * way a manually-placed rack does — canvas2's live-flue drag (see
 * useCanvasInteraction.js's beginDrag) reads flueBaseIn as the genuine base
 * to revert to away from any column, but the generator was never setting
 * it: a band widened by seatColumnInFlue (BUG 55/56/60) only ever carried
 * ITS OWN (possibly widened) flueIn, so beginDrag's own flueBaseIn-first
 * fallback (`grabbed.flueBaseIn ?? grabbed.flueSpaceIn ?? 9`) fell through
 * to the widened flueSpaceIn — for a rack the generator had already seated
 * a column in, that widened value became the "base" forever. */
describe('sizingLayout — flueBaseIn threads the UN-widened base flue through generation, distinct from a seated column\'s widened flueIn', () => {
  const spec240 = {
    lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
    aisleFt: 10.5, gridXFt: 25, gridYFt: 30, dockDoors: 3, levels: 4, mhe: 'reach',
    orientation: 'vertical',
  }

  it('sizingSheetLayout stamps every placement\'s own flueBaseIn with the spec\'s base flue (9"), even a band widened to seat a column', () => {
    const placements = sizingSheetLayout(spec240, DEFAULT_RULES)
    const doubleRows = placements.filter(p => p.type === 'rack_double_row')
    expect(doubleRows.length).toBeGreaterThan(0)
    const widened = doubleRows.filter(p => p.flueIn > p.flueBaseIn)
    expect(widened.length).toBeGreaterThan(0)   // this fixture is known to flue-seat a column (BUG 53/60)
    for (const p of doubleRows) expect(p.flueBaseIn).toBe(9)
  })

  it('placementToObject carries flueBaseIn through to the stored object, distinct from a widened flueSpaceIn', () => {
    const racks = sizingSheetLayout(spec240, DEFAULT_RULES).map(placementToObject)
    const doubleRows = racks.filter(o => o.type === 'rack_double_row')
    const widened = doubleRows.filter(o => o.flueSpaceIn > o.flueBaseIn)
    expect(widened.length).toBeGreaterThan(0)
    for (const o of doubleRows) expect(o.flueBaseIn).toBe(9)
  })
})
