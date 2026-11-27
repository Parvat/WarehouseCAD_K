// LN_laneEngine.test.js — (r3-drive-in) the lane engine (racks/laneEngine.js) and the lane racks' BOM (racks/laneBom.js):
// sizes, a saved rack kept exactly, edits from the anchored corner, handles in whole lanes / stations, levels, the BOM
// formulas. The real clicks: REG-r3-drive-in in REG_handCheck.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { laneSpec, laneNew, laneChange, laneResize, laneSizeIn } from '../../racks/laneEngine'
const laneChange0 = (type, deep) => { const o = { id: 'r', type, x: 0, y: 0, rotation: 0, ...laneNew(type, 40) }; return { ...o, ...laneChange(o, { deep }, 40) } }
import { laneParts, laneBom, laneBomTypes } from '../../racks/laneBom'
import { getRackCapacity, laneLevels } from '../../utils/capacity'
import { computeBom } from '../../utils/bom'

const GS = 40, px = (inch) => (inch / 12) * GS, inch = (p) => Math.round((p / GS) * 12 * 1000) / 1000
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8'))
const mk = (type, over = {}) => ({ id: 'r', type, x: 1000, y: 1000, rotation: 0, ...laneNew(type, GS), ...over })

export const ENGINE_TYPES_R3 = ['rack_drive_in', 'rack_drive_through']

describe('lane engine — sizes', () => {
  it('a new drive-in: 4 lanes × 5 deep × 4 levels; lane 46 in (40 + 2 × 3), 3 in posts, station 52 in', () => {
    const o = mk('rack_drive_in'), s = laneSpec(o, GS)
    expect([s.lanes, s.deep, s.levels, s.laneWIn, s.postIn, s.stationIn, s.firstIn, s.spacingIn, s.heightIn, s.floorGuides]).toEqual([4, 5, 4, 46, 3, 52, 8, 60, 248, true])
    expect([inch(o.width), inch(o.height)]).toEqual([4 * 46 + 5 * 3, 5 * 52])
    expect(getRackCapacity(o).total).toBe(80)
  })
  it('a drive-through: the same defaults', () => {
    expect(laneSpec(mk('rack_drive_through'), GS).lanes).toBe(4)
  })
  it('a rack saved before keeps its size exactly: its clearance and station read from what it measures', () => {
    for (const name of ['lanes-horizontal', 'zone-lane', 'walls-racks', 'crossaisle-drivein']) {
      for (const o of load(name).objects.filter(q => q.type === 'rack_drive_in' || q.type === 'rack_drive_through')) {
        const s = laneSpec(o, GS), { w, h } = laneSizeIn(s)
        expect([name, Math.abs(px(w) - o.width) < 1e-6, Math.abs(px(h) - o.height) < 1e-6]).toEqual([name, true, true])
        const u = laneChange(o, {}, GS)
        expect([u.width, u.height, u.x, u.y]).toEqual([o.width, o.height, undefined, undefined])
      }
    }
  })
})

describe('lane engine — edits', () => {
  it('lanes, deep, the pallet and the clearance resize from the anchored corner', () => {
    const o = mk('rack_drive_in')
    const a = laneChange(o, { lanes: 6 }, GS)
    expect([a.lanes, inch(a.width), a.x ?? o.x, a.y ?? o.y]).toEqual([6, 6 * 46 + 7 * 3, o.x, o.y])
    const b = laneChange(o, { palletWIn: 48 }, GS)
    expect(inch(b.width)).toBe(4 * 54 + 5 * 3)
    const c = laneChange(o, { palletDIn: 40 }, GS)
    expect([c.stationIn, inch(c.height)]).toEqual([44, 5 * 44])
    const d = laneChange(o, { clearIn: 4 }, GS)
    expect(inch(d.width)).toBe(4 * 48 + 5 * 3)
    const e = laneChange(o, { deep: 7 }, GS)
    expect(inch(e.height)).toBe(7 * 52)
  })
  it('turned 90°: the start corner stays where it is drawn', () => {
    const o = mk('rack_drive_in', { rotation: 90 })
    const corner = (q) => { const cx = q.x + q.width / 2, cy = q.y + q.height / 2, t = Math.PI / 2; const lx = q.x - cx, ly = q.y - cy; return [Math.round(cx + lx * Math.cos(t) - ly * Math.sin(t)), Math.round(cy + lx * Math.sin(t) + ly * Math.cos(t))] }
    const u = { ...o, ...laneChange(o, { lanes: 6 }, GS) }
    expect(corner(u)).toEqual(corner(o))
  })
  it('the type switched: the size kept', () => {
    const o = mk('rack_drive_in'), u = laneChange(o, { type: 'rack_drive_through' }, GS)
    expect([u.type, u.width, u.height, u.x, u.y]).toEqual(['rack_drive_through', o.width, o.height, undefined, undefined])
  })
  it('levels: its own levels win over its elevation type (levelsOwn); overall height first + levels × spacing, or typed', () => {
    const o = mk('rack_drive_in'), u = { ...o, ...laneChange(o, { levels: 5 }, GS) }
    expect([u.levels, u.levelsOwn, laneLevels(u, () => 2), getRackCapacity(u, undefined, () => 2).total]).toEqual([5, true, 5, 100])
    expect(laneSpec(u, GS).heightIn).toBe(8 + 5 * 60)
    const t = { ...u, ...laneChange(u, { heightIn: 330 }, GS) }
    expect([laneSpec(t, GS).heightIn, laneSpec(t, GS).heightTyped]).toEqual([330, true])
    const back = { ...t, ...laneChange(t, { heightIn: null }, GS) }
    expect(laneSpec(back, GS).heightTyped).toBe(false)
    // a rack saved before (no levelsOwn): its elevation type's levels, as before
    expect(laneLevels({ type: 'rack_drive_in', levels: 4 }, () => 2)).toBe(2)
  })
})

describe('lane engine — handles: whole lanes and whole stations', () => {
  const o = mk('rack_drive_in')
  const lane = px(46 + 3), st = px(52)
  it('the right side: + / − lanes, the left edge kept', () => {
    expect(laneResize(o, 'mr', lane * 1.1, 0, GS)).toMatchObject({ lanes: 5, x: o.x })
    expect(laneResize(o, 'mr', -lane * 0.9, 0, GS)).toMatchObject({ lanes: 3, x: o.x })
    expect(laneResize(o, 'mr', lane * 0.3, 0, GS).lanes).toBe(4)
  })
  it('the left side: the right edge kept', () => {
    const u = laneResize(o, 'ml', -lane, 0, GS)
    expect([u.lanes, Math.round(u.x + u.width), Math.round(o.x + o.width)]).toEqual([5, Math.round(o.x + o.width), Math.round(o.x + o.width)])
  })
  it('the depth sides: + / − stations; top keeps the bottom', () => {
    expect(laneResize(o, 'bc', 0, st * 2, GS)).toMatchObject({ palletDeep: 7, y: o.y })
    const u = laneResize(o, 'tc', 0, st, GS)
    expect([u.palletDeep, Math.round(u.y + u.height)]).toEqual([4, Math.round(o.y + o.height)])
  })
  it('a corner: both; never under 1', () => {
    expect(laneResize(o, 'br', lane, st, GS)).toMatchObject({ lanes: 5, palletDeep: 6 })
    expect(laneResize(o, 'mr', -lane * 20, 0, GS).lanes).toBe(1)
  })
})

describe('lane BOM — the formulas (L 4, D 5, V 4)', () => {
  it('drive-in', () => {
    const o = mk('rack_drive_in')
    expect(laneParts(o, 4, GS).map(p => [p.part, p.size, p.qty])).toEqual([
      ['Upright', '20 ft 8 in', 5 * 6],          // P × (D + 1)
      ['Rail arm', '', 2 * 4 * 6 * 4],           // 2 L (D + 1) V
      ['Rail', '21 ft 8 in', 2 * 4 * 4],         // 2 L V, length D × S
      ['Top tie', '46 in', 4 * 6],               // L (D + 1)
      ['Back tie', '46 in', 4 * 4],              // L V
      ['Floor guide', '21 ft 8 in', 2 * 4],      // 2 L
    ])
  })
  it('drive-through: no back tie; floor guides off: none', () => {
    const o = mk('rack_drive_through', { floorGuides: false })
    const parts = laneParts(o, 4, GS).map(p => p.part)
    expect(parts).toEqual(['Upright', 'Rail arm', 'Rail', 'Top tie'])
  })
  it('the BOM: its own section under its letters; the beam racks\' BOM untouched', () => {
    const f = load('lane-drive')
    const b = computeBom(f.objects, f.elevations, { gridSize: GS })
    // (lane-fixes 0, PP) the drive-in and drive-through BOMs are off until the dealer details are in: no section, listed
    // under "not in this BOM" as before; the sections are still there behind the one setting
    expect(b.types).toEqual([])
    expect(b.flags.find(x => x.key === 'other').ids.sort()).toEqual(f.objects.filter(o => /^rack_drive/.test(o.type)).map(o => o.id).sort())
    expect(laneBom(f.objects, f.elevations, { gridSize: GS, types: laneBomTypes(true) }).map(t => [t.id, t.name, t.rows.map(r => r.tag)])).toEqual([['rack_drive_in', 'Drive-in racking', ['D1']], ['rack_drive_through', 'Drive-through racking', ['T1']]])
    for (const name of ['older-horizontal', 'crowded-vertical']) {
      const g = load(name), bb = computeBom(g.objects, g.elevations, { gridSize: GS })
      expect([name, bb.types]).toEqual([name, []])
    }
    expect(laneBom(f.objects, f.elevations, { gridSize: GS, types: new Set(['rack_drive_in']) }).length).toBe(1)
  })
})

describe('(r4-push-back) push-back on the lane engine', () => {
  it('a new push-back: 3 lanes × 4 deep × 3 levels, first beam at 8 in (lane-fixes 3, PP: rails on it, the bottom level push-back too); 36 positions', () => {
    const o = mk('rack_pushback'), s = laneSpec(o, GS)
    expect([s.lanes, s.deep, s.levels, s.firstIn, s.laneWIn, s.stationIn, inch(o.width), inch(o.height)]).toEqual([3, 4, 3, 8, 46, 52, 3 * 46 + 4 * 3, 4 * 52 + 6])   // (pushback-frames) 2 frames of 2 deep + a 6 in row spacer
    expect(getRackCapacity(o).total).toBe(36)
  })
  it('deep kept within 2 to 6 — typed and by the handle', () => {
    const o = mk('rack_pushback')
    expect([laneChange(o, { deep: 9 }, GS).palletDeep, laneChange(o, { deep: 1 }, GS).palletDeep]).toEqual([6, 2])
    expect(laneResize(o, 'bc', 0, px(52) * 5, GS).palletDeep).toBe(6)
    expect(laneResize(o, 'bc', 0, -px(52) * 5, GS).palletDeep).toBe(2)
  })
  it('the BOM formulas (L 3, D 4, V 3; pushback-frames: 2 short frames a post line, row spacers at the joint)', () => {
    const o = mk('rack_pushback')
    expect(laneParts(o, 3, GS).map(p => [p.part, p.size, p.qty])).toEqual([
      ['Upright frame', '15 ft 8 in × 8 ft 8 in', 4 * 2],    // P × N, each frame its own depth (2 × 52) — was P × F full depth
      ['Row spacer', '6 in', 4 * 1 * 2],                 // P × (N − 1) × spacers per joint
      ['Beam', '46 in', 3 * 3 * 3],                      // L V (N + 1): front, joint, rear
      ['Rail set', '4 deep', 3 * 3],                     // L V
      ['Cart', '', 3 * 3 * 3],                           // (D − 1) L V
      ['Entry guide', '', 2 * 3],                        // 2 L
      ['Anchor', '', 2 * 4 * 2 * 2],                     // 2 per post, 2 posts a frame: 2 × P × 2N
    ])
    expect(laneParts(laneChange0('rack_pushback', 3), 3, GS)[0].qty).toBe(4)   // 3 deep: one frame a post line
  })
  it('the BOM: a Push-back racking section under P1, P2', () => {
    const f = load('lane-push'), b = computeBom(f.objects, f.elevations, { gridSize: GS })
    expect(b.types.map(t => [t.name, t.rows.map(r => r.tag)])).toEqual([['Push-back racking', ['P1', 'P2']]])
    expect(b.types[0].lines.find(l => l.part === 'Cart').qty).toBe(2 * 27)
  })
})

describe('(r5-pallet-flow) pallet flow on the lane engine', () => {
  it('a new pallet flow: 3 lanes × 4 deep × 3 levels; pitch about 3/8 in per ft; 36 positions', () => {
    const o = mk('rack_pallet_flow'), s = laneSpec(o, GS)
    expect([s.lanes, s.deep, s.levels, s.firstIn, s.pitchInPerFt, inch(o.width), inch(o.height)]).toEqual([3, 4, 3, 0, 0.375, 3 * 46 + 4 * 3, 4 * 52])
    expect(getRackCapacity(o).total).toBe(36)
  })
  it('the BOM formulas (L 3, D 4, V 3; frame lines ceil(D / 2) + 1 = 3)', () => {
    const o = mk('rack_pallet_flow')
    expect(laneParts(o, 3, GS).map(p => [p.part, p.size, p.qty])).toEqual([
      ['Upright frame', '15 ft × 17 ft 4 in', 4 * 3],   // P × F
      ['Beam', '46 in', 3 * 3 * 3],                      // L V F
      ['Roller track', '17 ft 4 in', 2 * 3 * 3],         // 2 L V, length D × S
      ['Speed controller', '', 2 * 3 * 3 * 2],           // 2 L V × ceil(D / 2)
      ['Pallet stop', '', 3 * 3],                        // L V, the PICK end
      ['Entry guide', '', 2 * 3 * 3],                    // 2 L V, the LOAD end
    ])
  })
  it('the BOM: a Pallet flow racking section under F1, F2', () => {
    const f = load('lane-flow'), b = computeBom(f.objects, f.elevations, { gridSize: GS })
    // (lane-fixes 0) off until the dealer details are in: flagged as before; behind the setting, its section
    expect(b.types).toEqual([])
    expect(b.flags.find(x => x.key === 'other').ids.length).toBe(2)
    expect(laneBom(f.objects, f.elevations, { gridSize: GS, types: laneBomTypes(true) }).map(t => [t.name, t.rows.map(r => r.tag)])).toEqual([['Pallet flow racking', ['F1', 'F2']]])
  })
})
