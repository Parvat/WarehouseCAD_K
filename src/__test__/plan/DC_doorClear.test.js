// Area DC — door clear spaces (fill-doors round; utils/doorClear.js): Fill keeps them open, Check flags a rack in one,
// a "no way in" a door splits stays one item.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { planAreaCreate } from '../../generate/rackingArea'
import { innerBox } from '../../generate/regenerate'
import { innerOutline } from '../../utils/floorGeom'
import { doorAt, doorObject, doorTypes } from '../../utils/doorTool'
import { doorClearOf, doorClearRects } from '../../utils/doorClear'
import { rackFootprint } from '../../generate/columnCheck'
import { checkLayout } from '../../utils/layoutCheck'

const GS = 40
let n = 0
const newId = () => 'dc' + (++n)
const load = (f) => { const j = JSON.parse(fs.readFileSync('src/__test__/plan/handCheck/' + f, 'utf8')); return (j.objects || j.scene.objects) }
const rect = (wFt, hFt) => ({ id: 'fp', type: 'fp_rect', x: 0, y: 0, width: wFt * GS, height: hFt * GS, wallThicknessFt: 0.25 })
const SETTINGS = { beamIn: 96, palletWIn: 40, palletDIn: 48, mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, wallClearIn: 3, levels: 4 }
const isRack = (o) => /^rack_/.test(o.type)
const hit = (f, r) => f.x < r.x + r.w - 1e-6 && f.x + f.w > r.x + 1e-6 && f.y < r.y + r.h - 1e-6 && f.y + f.h > r.y + 1e-6

/** the building's inner edges, longest and shortest */
function walls(fp) {
  const p = innerOutline(fp, GS), es = p.map((a, i) => { const b = p[(i + 1) % p.length]; return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) } })
  const s = [...es].sort((x, y) => y.len - x.len)
  return { long: s[0], short: s[s.length - 1] }
}
/** a dock door at 1/3 and a man door at 2/3 along the `where` wall */
function withDoors(objs, where) {
  const fp = objs.find(o => /^fp_/.test(o.type)), e = walls(fp)[where], T = doorTypes(), out = [...objs]
  for (const [id, t] of [['struct_loading_dock', 1 / 3], ['struct_egress', 2 / 3]]) {
    const spec = T.find(x => x.id === id), at = doorAt(out, { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t }, spec, GS, 0)
    out.push({ ...doorObject(at, spec, newId), parentId: fp.id })
  }
  return out
}
const fill = (objs, orientation) => {
  const fp = objs.find(o => /^fp_/.test(o.type)), box = innerBox(fp, GS)
  return planAreaCreate(objs, box, { ...SETTINGS, orientation }, { gridSize: GS, newId, from: { x: box.x, y: box.y } }).objects
}
const bare = (objs) => objs.filter(o => !isRack(o) && o.type !== 'aisle' && o.type !== 'racking_area')

describe('DC — door clear spaces', () => {
  it('DC-size: a dock door — its width plus 2 ft each side, the travel width deep (reach: 8 ft); a man door — plus 1 ft each side, 44 in deep; from the wall\'s inner face', () => {
    const objs = withDoors([rect(100, 60)], 'long'), fp = objs[0], top = Math.min(...innerOutline(fp, GS).map(p => p.y))
    const [dock, man] = objs.filter(o => /^struct_/.test(o.type))
    const d = doorClearOf(dock, objs, GS)[0], m = doorClearOf(man, objs, GS)[0]
    expect([d.w / GS, d.h / GS, Math.abs(Math.min(d.y, d.y + d.h) - top) < 1e-6 || Math.abs(d.y + d.h - Math.max(...innerOutline(fp, GS).map(p => p.y))) < 1e-6]).toEqual([13, 8, true])
    expect([m.w / GS, Math.round(m.h / GS * 12)]).toEqual([5, 44])
  })
  it('DC-section: a door in a section\'s Fence or Wall — a clear space on each side of the edge, each its own depth', () => {
    const fp = rect(100, 60), door = { id: 'sd', type: 'struct_loading_dock', x: 40 * GS, y: 30 * GS - 4 * GS, width: 9 * GS, height: 8 * GS, rotation: 0, parentId: 'fp', sectionId: 'sec' }
    const cs = doorClearOf(door, [fp, door], GS)
    expect(cs.map(c => [c.x / GS, c.y / GS, c.w / GS, c.h / GS])).toEqual([[38, 22, 13, 8], [38, 30, 13, 8]])
  })
  it('DC-fill: on the 4 fixtures, a dock and a man door on a long and on a short wall, both orientations — no rack in a clear space; a wall row breaks around a door and carries on past it', () => {
    for (const f of ['older-horizontal', 'older-vertical', 'crowded-horizontal', 'crowded-vertical']) {
      for (const where of ['long', 'short']) for (const orientation of ['horizontal', 'vertical']) {
        const all = fill(withDoors(bare(load(f + '.wcad')), where), orientation), clear = doorClearRects(all, GS)
        expect([f, where, orientation, all.filter(isRack).filter(r => clear.some(c => hit(rackFootprint(r), c))).length]).toEqual([f, where, orientation, 0])
      }
    }
    // the wall row along a long wall: racks on both sides of the dock door's clear space, in line
    const all = fill(withDoors([rect(100, 60)], 'long'), 'horizontal'), clear = doorClearRects(all, GS), dock = clear.find(c => c.dock)
    const inLine = all.filter(isRack).map(rackFootprint).filter(q => q.y < dock.y + dock.h && q.y + q.h > dock.y)
    expect([inLine.some(q => q.x + q.w <= dock.x + 1e-6), inLine.some(q => q.x >= dock.x + dock.w - 1e-6)]).toEqual([true, true])
  })
  it('DC-check: a rack left in a clear space (a layout filled before the door) is a Check error naming the door; Fill\'s own leave none', () => {
    const before = fill(bare(load('older-horizontal.wcad')), 'horizontal')
    const all = withDoors(before, 'long'), clear = doorClearRects(all, GS)
    const inside = all.filter(isRack).filter(r => clear.some(c => hit(rackFootprint(r), c)))
    expect(inside.length).toBeGreaterThan(0)
    const errs = checkLayout(all, { gridSize: GS }).errors.filter(e => e.kind === 'door')
    expect(new Set(errs.map(e => e.ids[0]))).toEqual(new Set(inside.map(r => r.id)))
    expect(errs.every(e => /clear space/.test(e.text))).toBe(true)
    const refilled = fill(withDoors(bare(load('older-horizontal.wcad')), 'long'), 'horizontal')
    expect(checkLayout(refilled, { gridSize: GS }).errors.filter(e => e.kind === 'door')).toEqual([])
  })
  it('DC-way-in: a "no way in" a door splits stays ONE item, listing the aisles inside it run by run', () => {
    const plain = checkLayout(fill(bare(load('older-horizontal.wcad')), 'vertical'), { gridSize: GS }).errors.filter(e => e.kind === 'no-way-in')
    const doors = checkLayout(fill(withDoors(bare(load('older-horizontal.wcad')), 'long'), 'vertical'), { gridSize: GS }).errors.filter(e => e.kind === 'no-way-in')
    expect([plain.length, doors.length]).toEqual([1, 1])
    expect(doors[0].text).toMatch(/^Aisles between R\d+–R\d+( and |, )R\d+/)
  })
})
