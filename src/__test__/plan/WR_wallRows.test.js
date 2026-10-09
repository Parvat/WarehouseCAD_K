// Area WR — Generate's wall rows follow Fill racking's rule (BUG 70): a single row flush on a wall is ONE rack
// along the whole stretch of wall, on the first section's standard-bay grid, not broken where a cross-aisle
// meets it, exempt from the max run, stamped with the section it starts in (1). Shared helper: wallRun.js.
// Four Generate layouts (both orientations), the auto orientation pick on the matrix (M13 and M25 flip to
// horizontal), and Fill racking on the same buildings.
import { describe, it, expect } from 'vitest'
import { GS, MATRIX } from './fixtures'
import { rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { usableCapacity } from '../../generate/usableCapacity'
import { generateAndPlace, pickOrientation } from '../../generate/traceGenerate'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { planAreaCreate } from '../../generate/rackingArea'
import { bayLedger } from '../../utils/bayLedger'
import { DEFAULT_RULES } from '../../rules/defaults'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

const PITCH = 8.25, UP = 0.25, MAX_RUN_FT = 150
const runOf = (o) => { const f = rackFootprint(o); return (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w]).map(v => v / GS) }
const crossOf = (o) => { const f = rackFootprint(o); return (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).map(v => v / GS) }
async function generated(spec) {
  const store = (await import('../../store/useCanvasStore')).useCanvasStore
  store.setState({ objects: [], groups: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  generateAndPlace({ gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', dockDoors: 0, ...spec })
  const objs = store.getState().objects
  const fp = objs.find(o => typeof o.type === 'string' && o.type.startsWith('fp_'))
  const vert = spec.orientation === 'vertical'
  // the building's own frame, ft: run along the rows, stack across
  const run0 = (vert ? fp.y : fp.x) / GS, stack0 = (vert ? fp.x : fp.y) / GS
  const runFt = vert ? spec.widthFt : spec.lengthFt, stackFt = vert ? spec.lengthFt : spec.widthFt
  const racks = objs.filter(o => o.type === 'rack_row' || o.type === 'rack_double_row')
  const onWall = (o) => o.type === 'rack_row' && (Math.abs(crossOf(o)[0] - stack0 - 0.5) < 1e-6 || Math.abs(stack0 + stackFt - 0.5 - crossOf(o)[1]) < 1e-6)
  return { objs, fp, racks, walls: racks.filter(onWall), interior: racks.filter(o => !onWall(o)), run0, runFt }
}
const LAYOUTS = [
  ['250x500 vertical', { lengthFt: 250, widthFt: 500, orientation: 'vertical' }, { bays: 747, positions: 10992, usable: 10228, wallBays: 60, sections: 4 }],
  ['500x250 horizontal', { lengthFt: 500, widthFt: 250, orientation: 'horizontal' }, { bays: 747, positions: 10992, usable: 10228, wallBays: 60, sections: 4 }],
  ['300x420 vertical', { lengthFt: 300, widthFt: 420, orientation: 'vertical' }, { bays: 772, positions: 11168, usable: 10388, wallBays: 50, sections: 3 }],
  ['420x300 horizontal', { lengthFt: 420, widthFt: 300, orientation: 'horizontal' }, { bays: 772, positions: 11168, usable: 10388, wallBays: 50, sections: 3 }],
]

describe('WR — Generate', () => {
  it.each(LAYOUTS)('WR-unbroken / WR-maxrun (%s): each wall row is ONE rack from the wall clearance to within a bay of the far end — through every cross-aisle, longer than the 150 ft max run; the interior rows are still in sections of at most 150 ft', async (_, spec, want) => {
    const { walls, interior, run0, runFt } = await generated(spec)
    expect(walls.length).toBe(2)
    for (const w of walls) {
      const [a, b] = runOf(w)
      expect(a - run0).toBeCloseTo(0.5, 6)
      expect(run0 + runFt - 0.5 - b).toBeGreaterThanOrEqual(-1e-6)
      expect(run0 + runFt - 0.5 - b).toBeLessThan(PITCH)
      expect(b - a).toBeGreaterThan(MAX_RUN_FT)
      expect(w.beams.length).toBe(want.wallBays)
    }
    expect(new Set(interior.map(o => o.genSection)).size).toBe(want.sections)
    for (const o of interior) expect(runOf(o)[1] - runOf(o)[0]).toBeLessThanOrEqual(MAX_RUN_FT + 1e-6)
  })
  it.each(LAYOUTS)('WR-grid (%s): a wall row\'s uprights sit on the first section\'s bay grid — every section-1 upright of an interior row is one of the wall row\'s', async (_, spec) => {
    const { walls, interior } = await generated(spec)
    const sec1 = interior.filter(o => o.genSection === 1 && o.type === 'rack_double_row')
    expect(sec1.length).toBeGreaterThan(0)
    for (const w of walls) {
      const w0 = runOf(w)[0]
      for (const o of sec1) {
        const o0 = runOf(o)[0], k = (o0 - w0) / PITCH
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6)
        for (let i = 0; i <= o.beams.length; i++) { const u = o0 + i * PITCH, kk = (u - w0) / PITCH; expect(Math.abs(kk - Math.round(kk))).toBeLessThan(1e-6) }
      }
    }
  })
  it.each(LAYOUTS)('WR-section (%s): the wall rows are stamped with the section they start in (1), their row numbers the first and last across', async (_, spec) => {
    const { walls, interior } = await generated(spec)
    const rows = interior.map(o => o.rowIndex)
    for (const w of walls) expect(w.genSection).toBe(1)
    expect(walls.map(w => w.rowIndex).sort((a, b) => a - b)).toEqual([Math.min(...rows) - 1, Math.max(...rows) + 1])
  })
  it.each(LAYOUTS)('WR-bays (%s): more bays — the cross-aisles\' ends along the walls filled (741 / 768 bays before)', async (_, spec, want) => {
    const { objs } = await generated(spec)
    const L = bayLedger(objs, GS), u = usableCapacity(objs, { profile: MHE_PROFILES.reach, gridSize: GS })
    expect([L.bays, L.positions, u.usable]).toEqual([want.bays, want.positions, want.usable])
  })
})

describe('WR-flip', () => {
  const pick = (id, columnsAlongWall) => {
    const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = MATRIX[id]
    return pickOrientation({ lengthFt, widthFt, gridXFt, gridYFt, mhe, columnsAlongWall, rackType: 'rack_double_row' }, sizingSheetLayout, DEFAULT_RULES)
  }
  it.each([
    ['M13', true, 68048, 68032], ['M13', false, 68048, 68032],
    ['M25', true, 42064, 42000], ['M25', false, 42064, 42000],
  ])('WR-flip: %s (columns along wall %s) — auto now picks horizontal (H %s / V %s usable); vertical won before (H 67,904 / V 67,968; M25: H 41,936 / V 41,968)', (id, wall, h, v) => {
    const p = pick(id, wall)
    expect([p.orientation, p.horizontalUsable, p.verticalUsable]).toEqual(['horizontal', h, v])
  })
  it('WR-flip (controls): the 250 × 500 Generate building still picks horizontal, 300 × 420 vertical', () => {
    const b = (lengthFt, widthFt) => pickOrientation({ lengthFt, widthFt, gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row' }, sizingSheetLayout, DEFAULT_RULES)
    expect([b(250, 500).orientation, b(250, 500).horizontalUsable, b(250, 500).verticalUsable]).toEqual(['horizontal', 10520, 10228])
    expect([b(300, 420).orientation, b(300, 420).horizontalUsable, b(300, 420).verticalUsable]).toEqual(['vertical', 10036, 10388])
  })
})

describe('WR-fill', () => {
  it.each(LAYOUTS)('WR-fill (%s): Fill racking the building Generate made (its area 6" inside the outline, where Generate\'s racks stop) lays the same wall rows along the run — same start, end and bays', async (_, spec) => {
    const { objs, fp, walls } = await generated(spec)
    const keep = objs.filter(o => !(typeof o.type === 'string' && o.type.startsWith('rack_')) && o.type !== 'aisle')
    const box = { x: fp.x + 0.5 * GS, y: fp.y + 0.5 * GS, w: fp.width - GS, h: fp.height - GS }
    const settings = { orientation: spec.orientation, beamIn: 96, palletWIn: 40, palletDIn: 48, mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, levels: 4 }
    const fill = planAreaCreate(keep, box, settings, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
    const along = (list) => list.map(o => `${runOf(o)[0].toFixed(4)}..${runOf(o)[1].toFixed(4)} (${o.beams.length})`).sort()
    const fillWalls = fill.filter(o => o.type === 'rack_row' && fill.filter(q => q.type === 'rack_row' && Math.abs(crossOf(q)[0] - crossOf(o)[0]) < 1e-6).length === 1 && runOf(o)[1] - runOf(o)[0] > MAX_RUN_FT)
    expect(along(fillWalls)).toEqual(along(walls))
  })
})
