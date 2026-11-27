// CF_cartonFlow.test.js — (r8-carton-flow, docs/reports/r8-carton-flow.md) carton flow: the flow family, letter K, LOAD at
// the back and PICK at the front (the face check on both), lane lines per level and no pallet slots, end handles in whole
// bays, carton lanes (not pallet positions), its BOM off behind the lane BOMs' setting.
import { describe, it, expect } from 'vitest'
import { cartonSpec, cartonNew, cartonChange, cartonResize, cartonLanes, cartonHeadline } from '../../racks/cartonFlow'
import { rackDrawOps, markBoxes } from '../../render/rackOps'
import { rackFamilyOf } from '../../render/rackFamily'
import { RACK_LETTERS } from '../../utils/rackLines'
import { facesOf, FACE_WORD } from '../../generate/laneFaces'
import { getRackCapacity, getLayoutCapacity } from '../../utils/capacity'
import { laneBomTypes, LANE_BOM_PENDING, LANE_BOMS_PENDING_ON } from '../../racks/laneBom'

const GS = 40, inch = (v) => Math.round((v / GS) * 12 * 100) / 100
const mk = (over = {}) => ({ id: 'k', type: 'rack_carton_flow', x: 1000, y: 1000, rotation: 0, ...cartonNew(GS), ...over })

describe('(r8-carton-flow) the type', () => {
  it('the flow family (amber), letter K, LOAD at the back and PICK at the front', () => {
    expect(rackFamilyOf('rack_carton_flow')).toBe('flow')
    expect(RACK_LETTERS.rack_carton_flow).toBe('K')
    expect(facesOf({ type: 'rack_carton_flow' })).toEqual(['top', 'bottom'])
    expect(FACE_WORD.rack_carton_flow).toEqual({ top: 'LOAD', bottom: 'PICK' })
  })
  it('a new one: 3 bays of 8 ft, 8 ft deep, 4 levels, 6 lanes a level, pitch 1/2 in per ft, frame 7 ft; K1 · 3 bays · 4 levels · 72 carton lanes', () => {
    const o = mk(), s = cartonSpec(o, GS)
    expect([s.bays, s.bayWidthIn, s.depthIn, s.levels, s.lanesPerLevel, s.pitchInPerFt, s.frameHeightIn]).toEqual([3, 96, 96, 4, 6, 0.5, 84])
    expect([inch(o.width), inch(o.height)]).toEqual([288, 96])
    expect(cartonHeadline(o, 'K1', GS)).toBe('K1 · 3 bays · 4 levels · 72 carton lanes')
  })
  it('carton lanes, never pallet positions', () => {
    const o = mk()
    expect(cartonLanes(cartonSpec(o, GS))).toBe(72)
    expect(getRackCapacity(o)).toBeNull()
    expect(getLayoutCapacity([o]).total).toBe(0)
  })
})

describe('(r8-carton-flow) the drawing', () => {
  it('lane lines in each bay, the bay frames, arrows toward PICK, LOAD and PICK face bars — no pallet slots', () => {
    const ops = rackDrawOps(mk(), { gridSize: GS })
    expect(ops.some(op => op.op === 'slots')).toBe(false)
    expect(ops.find(op => op.name === 'carton-lanes').segs.length / 4).toBe(3 * 5)
    expect(ops.find(op => op.name === 'lane-posts').rects.length).toBe(4)
    expect(ops.find(op => op.op === 'arrows').items.length).toBe(3)
    expect(ops.filter(op => op.op === 'text').map(op => op.text).sort()).toEqual(['LOAD', 'PICK'])
  })
  it('an X box per bay', () => {
    expect(markBoxes(mk(), GS).length).toBe(3)
  })
})

describe('(r8-carton-flow) edits and handles', () => {
  it('bays, bay width, depth: the size follows, the corner held; levels and lanes: the size kept', () => {
    const o = mk()
    expect(inch(({ ...o, ...cartonChange(o, { bays: 5 }, GS) }).width)).toBe(5 * 96)
    expect(inch(({ ...o, ...cartonChange(o, { bayWidthIn: 120 }, GS) }).width)).toBe(3 * 120)
    const d = { ...o, ...cartonChange(o, { depthIn: 120 }, GS) }
    expect([inch(d.height), d.x, d.y]).toEqual([120, o.x, o.y])
    for (const p of [{ levels: 6 }, { lanesPerLevel: 8 }, { frameHeightIn: 96 }]) expect(cartonChange(o, p, GS).width).toBe(o.width)
    expect(cartonLanes(cartonSpec({ ...o, ...cartonChange(o, { lanesPerLevel: 8 }, GS) }, GS))).toBe(96)
  })
  it('the end handles add or remove whole bays; the depth sides change nothing', () => {
    const o = mk(), step = (96 / 12) * GS
    const r = cartonResize(o, 'mr', step * 1.2, 0, GS)
    expect([r.bays, r.x]).toEqual([4, o.x])
    const l = cartonResize(o, 'ml', step, 0, GS)
    expect([l.bays, l.x + l.width]).toEqual([2, o.x + o.width])
    expect(cartonResize(o, 'bc', 0, 300, GS)).toEqual({ width: o.width, height: o.height, x: o.x, y: o.y })
  })
})

describe('(r8-carton-flow) the BOM: off, behind the lane BOMs\' setting', () => {
  it('pending with drive-in, drive-through and pallet flow; not in the BOM while the setting is off', () => {
    expect(LANE_BOM_PENDING.has('rack_carton_flow')).toBe(true)
    expect(LANE_BOMS_PENDING_ON).toBe(false)
    expect(laneBomTypes().has('rack_carton_flow')).toBe(false)
  })
})
