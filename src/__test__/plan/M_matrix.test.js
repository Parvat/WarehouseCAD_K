// TEST_PLAN.md §2b — building variation matrix. Every generator rule, on 24
// buildings × both orientations × both "Columns along wall" settings.
// Rules only: no captured totals anywhere in this file.
import { describe, it, expect, beforeAll } from 'vitest'
import { sizingSheetLayout, columnGridObject, axisFrame } from '../../generate/sizingLayout'
import { placementToObject, pickOrientation } from '../../generate/traceGenerate'
import { checkColumns, expandColumnGrid, groupBySegment, rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { usableCapacity, mheProfile } from '../../generate/usableCapacity'
import { DEFAULT_RULES } from '../../rules/defaults'
import { GS, rackBands, EPS, MATRIX } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }


// TEST_PLAN.md §3E table (aisle / travel / cross-aisle), and rack geometry:
// 42" frames, 9" flue, 96" beams on 3" uprights.
const TRUCK = {
  reach:          { aisleFt: 10.5, travelFt: 8, crossAisleFt: 9 },
  counterbalance: { aisleFt: 12.5, travelFt: 8, crossAisleFt: 13 },
  vna:            { aisleFt: 6,    travelFt: 6, crossAisleFt: 8.5 },
}
const SINGLE_FT = 42 / 12                 // 3.5
const PAIR_FT = (42 + 9 + 42) / 12        // 7.75
const BAY_FT = (96 + 3) / 12              // 8.25, one bay pitch along the run
const MAX_RUN_FT = 150                     // Generate panel default "Max rack run (ft)"

const briefOf = (id, orientation, columnsAlongWall) => {
  const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = MATRIX[id]
  return { lengthFt, widthFt, gridXFt, gridYFt, mhe, orientation, columnsAlongWall, rackType: 'rack_double_row' }
}

/** The generated layout exactly as buildQueue assembles it, building at the origin. */
function build(brief) {
  const placements = sizingSheetLayout(brief, DEFAULT_RULES)
  const racks = placements.map((p, i) => ({ ...placementToObject(p), id: 'r' + i }))
  const grid = columnGridObject(brief, 0, 0)
  const columns = grid ? expandColumnGrid(grid, GS) : []
  const L = brief.lengthFt * GS, W = brief.widthFt * GS
  const floor = { type: 'fp_rect', fpVerts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }] }
  return { placements, racks, grid, columns, floor }
}

/* Stack axis = the axis rows are stacked along (Y for horizontal rows). */
const stackOf = (f) => f.rotated ? { lo: f.x, hi: f.x + f.w } : { lo: f.y, hi: f.y + f.h }
const runOf = (f) => f.rotated ? { lo: f.y, hi: f.y + f.h } : { lo: f.x, hi: f.x + f.w }

/** Rows as bands: racks at the same stack position, with their run segments. */
function bandsOf(racks) {
  const m = new Map()
  for (const r of racks) {
    const f = rackFootprint(r)
    const s = stackOf(f)
    const key = Math.round(s.lo * 1000)
    if (!m.has(key)) m.set(key, { lo: s.lo / GS, hi: s.hi / GS, segs: [] })
    const run = runOf(f)
    m.get(key).segs.push([run.lo / GS, run.hi / GS])
  }
  return [...m.values()].sort((a, b) => a.lo - b.lo).map(b => ({ ...b, segs: b.segs.sort((p, q) => p[0] - q[0]) }))
}

function straddles(col, racks) {
  const hits = []
  for (const r of racks) {
    const { depthAlongY, runLo, runHi, bands } = rackBands(r)
    const dLo = depthAlongY ? col.y : col.x, dHi = depthAlongY ? col.y + col.h : col.x + col.w
    const rLo = depthAlongY ? col.x : col.y, rHi = depthAlongY ? col.x + col.w : col.y + col.h
    const touches = dHi > bands[0].lo + EPS && dLo < bands[bands.length - 1].hi - EPS && rHi > runLo + EPS && rLo < runHi - EPS
    if (!touches) continue
    const inRun = rLo >= runLo - EPS && rHi <= runHi + EPS
    const inOneBand = bands.some(b => dLo >= b.lo - EPS && dHi <= b.hi + EPS)
    if (!inRun || !inOneBand) hits.push({ rackId: r.id, col: { ...col }, inRun })
  }
  return hits
}

const drawnLines = (grid, axis) => {
  if (!grid) return []
  const v = expandColumnGrid(grid, GS).map(c => +((axis === 'x' ? c.x + c.w / 2 : c.y + c.h / 2) / GS).toFixed(6))
  return [...new Set(v)].sort((a, b) => a - b)
}
/** Exhaustive scan for a legal single row inside the gap (a, b) along the
 *  stack axis, in feet. Legal = aisle >= aisleFt on both sides, no column
 *  crossing the row's edges (one wholly inside it is fine), and every column
 *  in either remaining gap leaving >= travelFt clear on at least one side.
 *  Candidates: a 0.01' sweep plus every point where legality can change
 *  (the aisle limits and each column's edges offset by the row depth and
 *  travelFt), so a legal window narrower than the sweep is never missed.
 *  Returns the first legal start, or null. */
function legalSinglePosition(a, b, cols, t) {
  const lo = a + t.aisleFt, hi = b - t.aisleFt - SINGLE_FT
  if (hi < lo - 1e-9) return null
  const inGap = cols.filter(([cl, ch]) => ch > a && cl < b)
  const gapOk = (g0, g1) => inGap.every(([cl, ch]) => !(ch > g0 + 1e-9 && cl < g1 - 1e-9) ||
    Math.max(cl - g0, g1 - ch) >= t.travelFt - 1e-9)
  const cands = new Set([lo, hi])
  for (let s = lo; s <= hi + 1e-9; s += 0.01) cands.add(s)
  for (const [cl, ch] of inGap) {
    for (const s of [ch, cl - SINGLE_FT, ch - SINGLE_FT, cl, ch + t.travelFt, cl - t.travelFt - SINGLE_FT]) cands.add(s)
  }
  for (const s of [...cands].sort((x, y) => x - y)) {
    if (s < lo - 1e-9 || s > hi + 1e-9) continue
    const e = s + SINGLE_FT
    if (inGap.some(([cl, ch]) => (cl < s - 1e-9 && ch > s + 1e-9) || (cl < e - 1e-9 && ch > e + 1e-9))) continue
    if (gapOk(a, s) && gapOk(e, b)) return +s.toFixed(3)
  }
  return null
}

const walkLines = (offset, pitch, max) => {
  const out = []
  for (let v = offset; v <= max + 1e-9; v += pitch) out.push(+v.toFixed(6))
  return out
}

/* Rule 9 drives the real store; one instance for the whole file. */
let store, generateAndPlace
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  generateAndPlace = (await import('../../generate/traceGenerate')).generateAndPlace
})
/* Object ids are fresh per generation (nanoid), and aisles point at their rows
 * by id — so compare with every id reference replaced by the referenced
 * object's position in the list. */
const normalize = (objects) => {
  const idx = new Map(objects.map((o, i) => [o.id, i]))
  return objects.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) =>
    [k, typeof v === 'string' && idx.has(v) ? `#${idx.get(v)}` : v])))
}

const RUNS = Object.keys(MATRIX).flatMap(id =>
  ['horizontal', 'vertical'].flatMap(orientation =>
    [true, false].map(columnsAlongWall => ({ id, orientation, columnsAlongWall }))))

describe('§2b — building variation matrix, 9 rules on every run', () => {
  for (const { id, orientation, columnsAlongWall } of RUNS) {
    const label = `${id} ${MATRIX[id][0]}x${MATRIX[id][1]} ${orientation} wall=${columnsAlongWall ? 'Yes' : 'No'}`
    describe(label, () => {
      const brief = briefOf(id, orientation, columnsAlongWall)
      const t = TRUCK[brief.mhe]
      const stackFt = orientation === 'vertical' ? brief.lengthFt : brief.widthFt
      const runFt = orientation === 'vertical' ? brief.widthFt : brief.lengthFt
      let L
      const get = () => (L ??= build(brief))

      it('1 fills the building: within one row module of both walls (stack), one bay + cross-aisle of both ends (run)', () => {
        const bands = bandsOf(get().racks)
        expect(bands.length).toBeGreaterThan(0)
        const rowModule = PAIR_FT + t.aisleFt
        expect(bands[0].lo).toBeLessThanOrEqual(rowModule)
        expect(stackFt - bands[bands.length - 1].hi).toBeLessThanOrEqual(rowModule)
        for (const b of bands) {
          expect(b.segs[0][0]).toBeLessThanOrEqual(BAY_FT + t.crossAisleFt)
          expect(runFt - b.segs[b.segs.length - 1][1]).toBeLessThanOrEqual(BAY_FT + t.crossAisleFt)
        }
      })

      it(`2 no oversized gap: interior aisles = ${t.aisleFt}' unless column-forced; far-wall gap holds no legal single (< ${2 * t.aisleFt + SINGLE_FT}' passes unscanned); every section <= ${MAX_RUN_FT}'; each cross-aisle in [${t.crossAisleFt}, ${t.crossAisleFt + BAY_FT}]', column-free, aligned across rows; no other run gap > one bay`, () => {
        const { racks, columns } = get()
        const bad = []
        for (const run of groupBySegment(racks)) {
          const feet = run.map(rackFootprint).sort((a, b) => stackOf(a).lo - stackOf(b).lo)
          if (feet.length < 2) continue
          /* Far-wall leftover (TEST_PLAN.md §2b rule 2): the gap must hold no
           * legal position for another single row. Under 2 x aisle + single
           * depth that's true by width alone; above it, scan. */
          const gapLo = stackOf(feet[feet.length - 2]).hi / GS, gapHi = stackOf(feet[feet.length - 1]).lo / GS
          if (!(gapHi - gapLo < 2 * t.aisleFt + SINGLE_FT)) {
            const f0 = feet[0]
            const runLo = runOf(f0).lo, runHi = runOf(f0).hi
            const colsHere = columns
              .filter(c => { const r = runOf({ ...c, rotated: f0.rotated }); return r.hi > runLo && r.lo < runHi })
              .map(c => { const s = stackOf({ ...c, rotated: f0.rotated }); return [s.lo / GS, s.hi / GS] })
            const legal = legalSinglePosition(gapLo, gapHi, colsHere, t)
            if (legal != null) bad.push({ lastAisleFromFt: gapLo, toFt: gapHi, widthFt: gapHi - gapLo, legalSingleAtFt: legal })
          }
          for (let i = 0; i < feet.length - 2; i++) {
            const from = stackOf(feet[i]).hi / GS, to = stackOf(feet[i + 1]).hi / GS
            const gap = stackOf(feet[i + 1]).lo / GS - from
            if (Math.abs(gap - t.aisleFt) < 1e-6) continue
            const forced = columns.some(c => {
              const s = stackOf({ ...c, rotated: rackFootprint(run[0]).rotated })
              return s.hi / GS > from + 1e-9 && s.lo / GS <= to + 1e-9
            })
            if (!forced) bad.push({ aisleFromFt: from, widthFt: gap })
          }
        }
        /* Cross-aisles (multiple, PP): every section <= maxRunFt; every
         * cross-aisle in [crossAisleFt, crossAisleFt + one bay]; no column
         * footprint inside any cross-aisle; the same cross-aisles in every
         * row (aligned straight across). */
        const f0 = racks.length ? rackFootprint(racks[0]) : null
        const colRuns = f0 ? columns.map(c => { const r = runOf({ ...c, rotated: f0.rotated }); return [r.lo / GS, r.hi / GS] }) : []
        let refCross = null
        for (const b of bandsOf(racks)) {
          const gaps = [b.segs[0][0], ...b.segs.slice(1).map((s, i) => s[0] - b.segs[i][1]), runFt - b.segs[b.segs.length - 1][1]]
          for (const s of b.segs) if (s[1] - s[0] > MAX_RUN_FT + 1e-6) bad.push({ band: b.lo, sectionFt: s[1] - s[0] })
          const cross = []
          b.segs.slice(1).forEach((s, i) => {
            const lo = b.segs[i][1], hi = s[0]
            if (hi - lo > BAY_FT + 1e-6) cross.push([lo, hi])
          })
          for (const [lo, hi] of cross) {
            const g = hi - lo
            if (g < t.crossAisleFt - 1e-6 || g > t.crossAisleFt + BAY_FT + 1e-6) bad.push({ band: b.lo, crossAisleFt: g })
            const col = colRuns.find(([clo, chi]) => chi > lo + 1e-9 && clo < hi - 1e-9)
            if (col) bad.push({ band: b.lo, crossAisle: [lo, hi], columnAt: col })
          }
          const key = cross.map(([lo, hi]) => `${lo.toFixed(4)}-${hi.toFixed(4)}`).join(',')
          if (refCross == null) refCross = key
          else if (key !== refCross) bad.push({ band: b.lo, crossAislesNotAligned: key, firstRow: refCross })
          for (const g of [gaps[0], gaps[gaps.length - 1]]) if (g > BAY_FT + 1e-6) bad.push({ band: b.lo, endGapFt: g })
        }
        expect(bad, JSON.stringify(bad)).toEqual([])
      })

      it(`3 every aisle >= travel (${t.travelFt}'), no level-1 column block`, () => {
        const { racks, columns } = get()
        const narrow = []
        for (const run of groupBySegment(racks)) {
          const feet = run.map(rackFootprint).sort((a, b) => stackOf(a).lo - stackOf(b).lo)
          for (let i = 0; i < feet.length - 1; i++) {
            const gap = (stackOf(feet[i + 1]).lo - stackOf(feet[i]).hi) / GS
            if (gap < t.travelFt - 1e-9) narrow.push(gap)
          }
        }
        expect(narrow).toEqual([])
        const res = checkColumns({ racks, columns, profile: MHE_PROFILES[brief.mhe], gridSize: GS })
        expect(res.aisleBlocks.filter(a => a.level === 1)).toEqual([])
      })

      it('4 no straddling column: every column wholly in a flue, a face, or open floor', () => {
        const { racks, columns } = get()
        expect(columns.flatMap(c => straddles(c, racks))).toEqual([])
      })

      it(`5 grid rule (${columnsAlongWall ? 'Yes: line on each near wall' : 'No: first line one pitch in, none on any wall'}), drawn == avoided, both axes`, () => {
        const { grid } = get()
        const f = axisFrame(orientation, brief)
        const vertical = orientation === 'vertical'
        const avoidX = vertical ? [f.stackGridOffsetFt, f.stackGridFt, f.stackGridMaxFt] : [f.runGridOffsetFt, f.runGridFt, f.runGridMaxFt]
        const avoidY = vertical ? [f.runGridOffsetFt, f.runGridFt, f.runGridMaxFt] : [f.stackGridOffsetFt, f.stackGridFt, f.stackGridMaxFt]
        const axes = [
          { drawn: drawnLines(grid, 'x'), avoid: walkLines(...avoidX), pitch: brief.gridXFt, wall: brief.lengthFt },
          { drawn: drawnLines(grid, 'y'), avoid: walkLines(...avoidY), pitch: brief.gridYFt, wall: brief.widthFt },
        ]
        for (const { drawn, avoid, pitch, wall } of axes) {
          expect(drawn).toEqual(avoid)
          expect(drawn.length).toBeGreaterThan(0)
          if (columnsAlongWall) {
            expect(drawn[0]).toBeCloseTo(0, 6)
          } else {
            expect(drawn[0]).toBeCloseTo(pitch, 6)
            expect(drawn.some(v => Math.abs(v) < EPS || Math.abs(v - wall) < EPS)).toBe(false)
          }
        }
      })

      it('6 capacity sanity: gross > 0, usable <= gross, usable = gross - losses, no position counted twice', () => {
        const { racks, grid, floor } = get()
        const objects = [...racks, grid, floor].filter(Boolean)
        const profile = mheProfile(brief.mhe, DEFAULT_RULES)
        const cap = usableCapacity(objects, { profile, gridSize: GS, rules: DEFAULT_RULES })
        expect(cap.gross).toBeGreaterThan(0)
        expect(cap.usable).toBeLessThanOrEqual(cap.gross)
        expect(cap.usable).toBe(cap.gross - cap.inRackLost - cap.pickZoneLost)
        const res = checkColumns({ racks, columns: get().columns, profile, gridSize: GS, floors: [floor.fpVerts] })
        const keys = (list) => list.flatMap(c => c.bayIndex == null ? [] :
          (c.faces || [0]).flatMap(fc => (c.positionIndices || []).map(p => `${c.rackId}:${c.bayIndex}:${fc}:${p}`)))
        const inRack = new Set(keys(res.rackConflicts))
        const pick = keys(res.pickBlocks)
        expect(new Set(pick).size).toBe(pick.length)
        expect(pick.filter(k => inRack.has(k))).toEqual([])
      })

      it('7 auto-pick: the chosen orientation has usable >= the other (tie -> horizontal)', () => {
        const pick = pickOrientation({ ...brief, orientation: 'auto' }, sizingSheetLayout, DEFAULT_RULES)
        const [win, lose] = pick.orientation === 'vertical'
          ? [pick.verticalUsable, pick.horizontalUsable] : [pick.horizontalUsable, pick.verticalUsable]
        expect(win).toBeGreaterThanOrEqual(lose)
        if (win === lose) expect(pick.orientation).toBe('horizontal')
      })

      it('8 no overlaps: no two racks overlap, no rack outside the building', () => {
        const feet = get().racks.map(rackFootprint)
        const L = brief.lengthFt * GS, W = brief.widthFt * GS
        const outside = feet.filter(f => f.x < -EPS || f.y < -EPS || f.x + f.w > L + EPS || f.y + f.h > W + EPS)
        expect(outside).toEqual([])
        const overlaps = []
        for (let i = 0; i < feet.length; i++) for (let j = i + 1; j < feet.length; j++) {
          const a = feet[i], b = feet[j]
          if (a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS) overlaps.push([i, j])
        }
        expect(overlaps).toEqual([])
      })

      it('9 regenerate: running twice gives identical output, one layout only', () => {
        generateAndPlace(brief)
        const once = normalize(store.getState().objects)
        generateAndPlace(brief)
        const twice = store.getState().objects
        expect(twice.filter(o => o.type === 'fp_rect')).toHaveLength(1)
        expect(twice.filter(o => o.type === 'column_grid')).toHaveLength(1)
        expect(normalize(twice)).toEqual(once)
        // and the placed layout is this run's own generator output
        expect(sizingSheetLayout(brief, DEFAULT_RULES)).toEqual(get().placements)
      }, 30000)   // the real store snapshots history per object: ~300 objects x 2 runs on the largest cases
    })
  }
})

/* Scale sanity (TEST_PLAN.md §2b): gross must grow roughly with floor area.
 * M2 -> M9 -> M13 are all reach. "4x the area must have well over 2x the
 * positions" is applied as: packing density must not fall as the building
 * grows — ratio(positions) >= 0.75 x ratio(area) (so 4x area needs >= 3x
 * positions). A bigger building loses proportionally LESS to walls and the
 * cross-aisle, so density only rises; the 0.25 margin absorbs grid/wall
 * rounding. A silent cap on rows or bays shows up as density collapsing. */
describe('§2b — scale sanity: positions grow with floor area (M2 -> M9 -> M13, reach)', () => {
  const grossOf = (id, orientation, columnsAlongWall) => {
    const { racks } = build(briefOf(id, orientation, columnsAlongWall))
    return usableCapacity(racks, { rules: DEFAULT_RULES }).gross
  }
  const area = (id) => MATRIX[id][0] * MATRIX[id][1]
  for (const orientation of ['horizontal', 'vertical']) {
    for (const columnsAlongWall of [true, false]) {
      for (const [a, b] of [['M2', 'M9'], ['M9', 'M13']]) {
        it(`scale: ${a} -> ${b} ${orientation} wall=${columnsAlongWall ? 'Yes' : 'No'} — positions ratio >= 0.75 x area ratio (${(area(b) / area(a)).toFixed(1)}x area)`, () => {
          const ratio = grossOf(b, orientation, columnsAlongWall) / grossOf(a, orientation, columnsAlongWall)
          expect(ratio).toBeGreaterThanOrEqual(0.75 * area(b) / area(a))
        })
      }
    }
  }
})
