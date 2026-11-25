// R3_rackRound3.test.js — rack-round3 (docs/reports/rack-round3.md), the pure parts; the real clicks are REG-r3-* in
// REG_handCheck.test.js. Fixtures: handCheck/crossaisle-drivein, zone-lane, walls-racks, lanes-horizontal.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rackLinesNow, rackNumbersNow } from '../../utils/rackLines'
import { checkLayout } from '../../utils/layoutCheck'
import { cutRack } from '../../utils/zoneCut'
import { laneGeom, rackDrawOps, shelvingUnits, markBoxes } from '../../render/rackOps'
import { faceLostMarks, coverLost } from '../../generate/coverLost'
import { laneFaceGaps } from '../../generate/laneFaces'
import { shelvingLabel, unitWidthChange, unitCountChange, depthChange, isStandard, SHELF_UNIT_IN } from '../../utils/shelving'

const GS = 40
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8')).objects
const lines = (objs) => rackLinesNow(objs, GS).map(l => l.no + ':' + l.ids.join(',') + ':' + l.ws)
let n = 0
const newId = () => 'n' + ++n

describe('rack-round3 1 — a non-beam rack in a cross-aisle', () => {
  it('a drive-in in the gap does not split the beam line: the beam numbers are those of the layout without it', () => {
    const objs = load('crossaisle-drivein')
    const without = objs.filter(o => o.id !== 'di-cross')
    expect(lines(objs)).toEqual(lines(without))
    expect(lines(objs).length).toBe(11)
    expect(rackNumbersNow(objs, GS).find(l => l.ids.includes('di-cross')).tag).toBe('D1')
  })
  it('a beam rack standing in the gap still splits it (today\'s behaviour)', () => {
    const objs = load('crossaisle-drivein')
    const di = objs.find(o => o.id === 'di-cross')
    const beam = objs.find(o => o.type === 'rack_double_row' && o.genSection != null)
    // a selective row in the gap, in place of the drive-in
    const row = { ...beam, id: 'beam-in-gap', type: 'rack_row', x: di.x, y: di.y, width: di.width, height: di.height / 2, beams: [96], genSection: undefined }
    const withRow = [...objs.filter(o => o.id !== 'di-cross'), row]
    expect(lines(withRow).length).toBeGreaterThan(11)
  })
})

describe('rack-round3 2 — a drive-through with one short end', () => {
  it('keeps its positions; Check layout warns "works as drive-in only" (not an error)', () => {
    const objs = load('lanes-horizontal')
    expect(coverLost(objs, { gridSize: GS }).byRack.get('dt-wall') || 0).toBe(0)
    const r = checkLayout(objs, { gridSize: GS })
    expect(r.errors.filter(e => e.kind === 'aisle-face')).toEqual([])
    const w = r.warnings.filter(e => e.kind === 'aisle-face')
    expect(w.length).toBe(1)
    expect(w[0].text).toMatch(/ENTRY face has 0.*works as drive-in only$/)
  })
  it('both ends short: an error, no "drive-in only", all its positions lost', () => {
    const objs = load('lanes-horizontal')
    const dt = objs.find(o => o.id === 'dt-wall')
    // a column-sized block right under its bottom face
    const block = { id: 'blk', type: 'zone_custom', x: dt.x, y: dt.y + dt.height, width: dt.width, height: 40 }
    const all = [...objs, block]
    const r = checkLayout(all, { gridSize: GS })
    expect(r.errors.filter(e => e.kind === 'aisle-face' && e.ids.includes('dt-wall')).length).toBe(2)
    expect([...r.errors, ...r.warnings].some(e => /drive-in only/.test(e.text))).toBe(false)
  })
})

describe('rack-round3 3 — Remove racks on lane racks', () => {
  const base = (type) => ({ id: 'L', type, x: 0, y: 0, width: 5 * (4 / 12) * GS + 4 * 4 * GS, height: 800, lanes: 4, palletDeep: 5, uprightWidth: 4, rotation: 0 })
  for (const type of ['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow']) {
    it(`${type}: a zone over one lane removes that lane only, the rest where they stood`, () => {
      const r = base(type), g = laneGeom(r, GS)
      const zone = { x: g.postXs[3] + g.upW + 5, y: -50, w: 40, h: 900 }
      const out = cutRack(r, [zone], { gridSize: GS, newId })
      expect(out.length).toBe(1)
      expect([out[0].id, out[0].lanes, Math.round(out[0].x) + 0, Math.round(laneGeom(out[0], GS).laneW * 1e6)]).toEqual(['L', 3, 0, Math.round(g.laneW * 1e6)])
    })
  }
  it('a middle lane: two racks, each where its lanes stood; the first keeps the id', () => {
    const r = base('rack_drive_in'), g = laneGeom(r, GS)
    const out = cutRack(r, [{ x: g.postXs[1] + g.upW + 5, y: 0, w: 20, h: 100 }], { gridSize: GS, newId })
    expect(out.map(o => [o.lanes, Math.round(o.x) + 0])).toEqual([[1, 0], [2, Math.round(g.postXs[2])]])
    expect(out[0].id).toBe('L')
    for (const o of out) expect(laneGeom(o, GS).laneW).toBeCloseTo(g.laneW, 6)
  })
  it('no lane left: the rack goes', () => {
    expect(cutRack(base('rack_pushback'), [{ x: -10, y: -10, w: 2000, h: 900 }], { gridSize: GS, newId })).toEqual([])
  })
  it('turned 90°: the lanes it covers in its own frame, pieces placed where they stood', () => {
    const r = { ...base('rack_drive_in'), rotation: 90, x: 1000, y: 1000 }
    const T = (lx) => { const cx = r.x + r.width / 2, cy = r.y + r.height / 2; return { x: cx - (cy - cy), y: cy + (lx - cx) } }
    const g = laneGeom(r, GS), mid = T(g.laneCx[3])
    const out = cutRack(r, [{ x: mid.x - 5, y: mid.y - 5, w: 10, h: 10 }], { gridSize: GS, newId })
    expect(out.length).toBe(1); expect(out[0].lanes).toBe(3)
    // its three lanes still cover the same world spots as before
    for (const k of [0, 1, 2]) { const p = T(g.laneCx[k]), q = out[0], cx = q.x + q.width / 2, cy = q.y + q.height / 2; const lx = cx + (p.y - cy); expect(lx > q.x && lx < q.x + q.width).toBe(true) }
  })
  it('the zone-lane fixture: Remove racks leaves 3 lanes', () => {
    const objs = load('zone-lane'), r = objs.find(o => o.id === 'di-4'), z = objs.find(o => o.id === 'zone-lane')
    const out = cutRack(r, [{ x: z.x, y: z.y, w: z.width, h: z.height }], { gridSize: GS, newId })
    expect(out.map(o => o.lanes)).toEqual([3])
  })
})

describe('rack-round3 4 — a short face: X marks on the lost slots, no line', () => {
  it('a drive-in behind a zone: every slot not covered by the zone gets a mark', () => {
    const objs = load('zone-lane')
    const marks = faceLostMarks(objs, { gridSize: GS })
    expect(marks.length).toBe(15)
    expect(marks.every(m => m.rackId === 'di-4' && m.w > 0 && m.h > 0)).toBe(true)
  })
  it('a drive-through with one end open: no marks (it loses nothing)', () => {
    expect(faceLostMarks(load('lanes-horizontal'), { gridSize: GS })).toEqual([])
    expect(laneFaceGaps(load('lanes-horizontal'), { gridSize: GS }).length).toBe(1)
  })
  it('a double-sided cantilever with one side short: the short side\'s slots only', () => {
    const c = { id: 'c', type: 'rack_cantilever', x: 0, y: 0, width: 480, height: 253, towers: [36, 36, 36, 36], doubleSided: true, towerWidthIn: 10, spineDepthIn: 4, armThicknessIn: 3, rotation: 0 }
    const wall = { id: 'z', type: 'zone_custom', x: -40, y: 253, width: 600, height: 40 }
    const all = [c, wall]
    // (rack-xmarks) per arm bay: 3 bays a side, 6 in all — was: the drawn reach zones (2)
    const slots = markBoxes(c, GS)
    expect(slots.length).toBe(6)
    const marks = faceLostMarks(all, { gridSize: GS })
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.length).toBe(3)
    expect(marks.every(m => m.y + m.h / 2 > c.y + c.height / 2)).toBe(true)
  })
})

// rack-round3 5 (a number by a wall, outside): canvas2/RackLineLabels.jsx needs Konva — REG-r3-wall-numbers, real clicks

describe('rack-round3 6 — shelving sizes and shelf count', () => {
  const unit = (over = {}) => ({ id: 's', type: 'rack_shelving', x: 0, y: 0, width: 4 * 160, height: 80, unitWidthIn: 48, shelves: 5, ...over })
  it('no shelf count drawn inside the units', () => {
    expect(rackDrawOps(unit(), { gridSize: GS }).filter(o => o.op === 'text')).toEqual([])
  })
  it('the label: "S1 · 4 units · 48×24 · 5 shelves"', () => {
    expect(shelvingLabel(unit(), GS, 'S1')).toBe('S1 · 4 units · 48×24 · 5 shelves')
    expect(shelvingLabel(unit({ shelves: 1, width: 120, unitWidthIn: 36, height: 40 }), GS, 'S2')).toBe('S2 · 1 unit · 36×12 · 1 shelf')
  })
  it('unit width keeps the count; count keeps the width; depth', () => {
    expect(unitWidthChange(unit(), 36, GS)).toEqual({ unitWidthIn: 36, width: 4 * 120 })
    expect(unitCountChange(unit(), 6, GS)).toEqual({ unitWidthIn: 48, width: 6 * 160 })
    expect(depthChange(18, GS)).toEqual({ height: 60, shelfDepth: 18 })
  })
  it('a run saved before (no unit width): its size exactly, split as it was drawn, Custom', () => {
    const old = { id: 'o', type: 'rack_shelving', x: 0, y: 0, width: 400, height: 80 }
    const u = shelvingUnits(old, GS)
    expect([u.n, u.unitIn, u.depthIn, old.width]).toEqual([3, 40, 24, 400])
    expect(isStandard(u.unitIn, SHELF_UNIT_IN)).toBe(false)
  })
})

describe('rack-round3 — PP: a shelving unit open on both sides has both checked', () => {
  const fp = load('walls-racks').find(o => /^fp_/.test(o.type))
  const s = { id: 's', type: 'rack_shelving', parentId: fp.id, x: fp.x + 2000, y: fp.y + 2000, width: 640, height: 80, unitWidthIn: 48, shelves: 5, rotation: 0 }
  it('open floor both sides: nothing short', () => {
    expect(laneFaceGaps([fp, s], { gridSize: GS })).toEqual([])
  })
  it('one side blocked (a zone 1 ft off its top): that side short; still picked from the other — no positions lost, a warning', () => {
    const z = { id: 'z', type: 'zone_custom', x: s.x, y: s.y - 40 - 400, width: s.width, height: 400 }
    const g = laneFaceGaps([fp, s, z], { gridSize: GS })
    expect(g.map(q => [q.side, q.nSides])).toEqual([['top', 2]])
    expect(coverLost([fp, s, z], { gridSize: GS }).total).toBe(0)
    expect(faceLostMarks([fp, s, z], { gridSize: GS })).toEqual([])
    const r = checkLayout([fp, s, z], { gridSize: GS })
    expect(r.warnings.filter(e => e.kind === 'aisle-face').map(e => /other side only/.test(e.text))).toEqual([true])
  })
})
