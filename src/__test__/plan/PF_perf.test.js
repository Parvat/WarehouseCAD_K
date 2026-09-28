// Area PF — performance work must not change a single result.
// The optimised column check (generate/columnCheck.js) is compared with a
// frozen copy of the check as it was before (reference/columnCheck.v1.js) on
// every matrix building, both orientations, both "columns along wall"
// states and both pick-both-sides settings, and on seeded random edits:
// racks nudged over columns, turned, re-levelled, stripped of depthIn,
// single rows dropped into aisles, one at 45°, extra loose columns.
import { describe, it, expect } from 'vitest'
import { sizingSheetLayout, columnGridObject } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { checkColumns, aisleColumnBlocks, expandColumnGrid, MHE_PROFILES } from '../../generate/columnCheck'
import * as REF from './reference/columnCheck.v1.js'
import { DEFAULT_RULES } from '../../rules/defaults'
import { GS, MATRIX } from './fixtures'

function build(id, orientation, columnsAlongWall) {
  const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = MATRIX[id]
  const brief = { lengthFt, widthFt, gridXFt, gridYFt, mhe, orientation, columnsAlongWall, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i }))
  const grid = columnGridObject(brief, 0, 0)
  const columns = grid ? expandColumnGrid(grid, GS) : []
  const L = lengthFt * GS, W = widthFt * GS
  return { racks, columns, floors: [[{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }]], profile: MHE_PROFILES[mhe] || MHE_PROFILES.reach }
}
const same = (args) => expect(checkColumns(args)).toEqual(REF.checkColumns(args))

describe('PF — the optimised column check equals the frozen reference', () => {
  for (const id of Object.keys(MATRIX)) {
    for (const orientation of ['horizontal', 'vertical']) {
      it(`PF-matrix ${id} ${orientation}: both wall settings, both pick-both-sides settings`, () => {
        for (const wall of [true, false]) {
          const b = build(id, orientation, wall)
          for (const pickBothSides of [false, true]) same({ ...b, gridSize: GS, pickBothSides })
        }
      }, 120000)
    }
  }

  // a small seeded PRNG, so a failure is reproducible
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
  for (const [id, orientation] of [['M3', 'horizontal'], ['M3', 'vertical'], ['M11', 'horizontal'], ['M11', 'vertical'], ['M24', 'horizontal'], ['M6', 'vertical']]) {
    it(`PF-edits ${id} ${orientation}: 12 seeded random edit sets`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const R = rng(seed * 7919 + id.length)
        const b = build(id, orientation, seed % 2 === 0)
        const racks = b.racks.map(r => {
          const q = R()
          if (q < 0.25) return { ...r, x: r.x + (R() - 0.5) * 6 * GS, y: r.y + (R() - 0.5) * 6 * GS }          // nudged (over columns, into aisles)
          if (q < 0.30) return { ...r, rotation: ((r.rotation || 0) + 180) % 360 }                            // turned round
          if (q < 0.33) return { ...r, rotation: ((r.rotation || 0) + 90) % 360 }                             // turned across
          if (q < 0.38) return { ...r, levels: 1 + Math.floor(R() * 6) }
          if (q < 0.41) { const { depthIn, ...rest } = r; return rest }                                     // legacy rack, no depth split
          if (q < 0.42) return { ...r, rotation: 45 }                                                        // skipped by the pick / upright checks
          return r
        })
        // single rows dropped into the middle of random aisles
        for (let k = 0; k < 4; k++) {
          const src = b.racks[Math.floor(R() * b.racks.length)]
          racks.push({ ...src, id: 'drop' + k, type: 'rack_row', height: src.height / 2 - 4, x: src.x + (R() - 0.5) * 4 * GS, y: src.y + (R() - 0.5) * 20 * GS })
        }
        // loose columns anywhere
        const columns = [...b.columns]
        for (let k = 0; k < 6; k++) columns.push({ x: R() * 1000 * GS * 0.3, y: R() * 400 * GS * 0.3, w: 0.8 * GS, h: 0.8 * GS })
        for (const pickBothSides of [false, true]) same({ ...b, racks, columns, gridSize: GS, pickBothSides })
      }
    }, 120000)
  }

  /* The pick-zone results are cached per rack between calls (same columns /
     floors / profile objects, as the app passes them). A sequence of edits —
     racks replaced by moved copies, racks changed IN PLACE, racks removed and
     added, levels, pick-both-sides toggled — must still equal the reference on
     every call: a stale per-rack answer would show up here. */
  for (const [id, orientation] of [['M11', 'horizontal'], ['M11', 'vertical'], ['M3', 'vertical']]) {
    it(`PF-cache ${id} ${orientation}: 40 incremental edits with shared inputs, every call equals the reference`, () => {
      const b = build(id, orientation, true)
      const R = rng(4242 + id.length + orientation.length)
      let racks = b.racks.map(r => ({ ...r }))
      for (let step = 0; step < 40; step++) {
        const k = Math.floor(R() * racks.length), q = R()
        if (q < 0.3) racks = racks.map((r, i) => (i === k ? { ...r, x: r.x + (R() - 0.5) * 8 * GS, y: r.y + (R() - 0.5) * 8 * GS } : r))
        else if (q < 0.5) { racks[k].x += (R() - 0.5) * 6 * GS; racks[k].levels = 1 + Math.floor(R() * 5) }           // mutated in place
        else if (q < 0.6) racks = racks.filter((_, i) => i !== k)
        else if (q < 0.7) racks = [...racks, { ...racks[k], id: 'n' + step, type: 'rack_row', height: racks[k].height / 2 - 4, y: racks[k].y + (R() - 0.5) * 16 * GS }]
        else if (q < 0.8) racks = racks.map((r, i) => (i === k ? { ...r, rotation: ((r.rotation || 0) + 180) % 360 } : r))
        const args = { racks, columns: b.columns, floors: b.floors, profile: b.profile, gridSize: GS, pickBothSides: step % 7 === 0 }
        expect(checkColumns(args), `step ${step}`).toEqual(REF.checkColumns(args))
      }
    }, 120000)
  }

  it('PF-aisle: the per-frame aisle check is untouched (same as the reference) on the edited layouts', () => {
    const b = build('M11', 'vertical', true)
    const racks = b.racks.map((r, i) => (i % 5 === 0 ? { ...r, x: r.x + 2 * GS, y: r.y + 3 * GS } : r))
    const args = { racks, columns: b.columns, profile: b.profile, gridSize: GS, pickBothSides: true }
    expect(aisleColumnBlocks(args)).toEqual(REF.aisleColumnBlocks(args))
  })
})
