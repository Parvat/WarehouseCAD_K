// XM_xmarks.test.js — (rack-xmarks) a lost shelving unit or cantilever arm bay gets its own X, inside its own box (was: one
// X over a cantilever's whole reach / a shelving run's whole overlap). The real clicks: REG-xmarks in REG_handCheck.
import { describe, it, expect } from 'vitest'
import { markBoxes } from '../../render/rackOps'
import { overlapMarks, overlapOps } from '../../render/overlapOps'
import { faceLostMarks, coverLost, slotBoxes } from '../../generate/coverLost'
import { getRackCapacity } from '../../utils/capacity'

const GS = 40
const X = 1000, Y = 1000
const shelf = { id: 's', type: 'rack_shelving', x: X, y: Y, width: 640, height: 80, unitWidthIn: 48, shelves: 5, rotation: 0 }
const cant = (x, y) => ({ id: 'c', type: 'rack_cantilever', x, y, width: 480, height: 253, towers: [36, 36, 36, 36], doubleSided: true, towerWidthIn: 10, spineDepthIn: 4, armThicknessIn: 3, rotation: 0 })
const inside = (m, b) => m.x >= b.x - 1e-6 && m.y >= b.y - 1e-6 && m.x + m.w <= b.x + b.w + 1e-6 && m.y + m.h <= b.y + b.h + 1e-6
const ownBox = (m, boxes) => boxes.filter(b => inside(m, b)).length === 1

describe('rack-xmarks — one X per lost shelving unit and cantilever arm bay', () => {
  it('the boxes: 4 units; 3 bays a side', () => {
    expect(markBoxes(shelf, GS).map(b => [b.x, b.w])).toEqual([[1000, 160], [1160, 160], [1320, 160], [1480, 160]])
    const b = markBoxes(cant(0, 0), GS)
    expect(b.length).toBe(6)
    expect(b.every(q => Math.abs(q.w - 160) < 1e-6)).toBe(true)
  })
  it('a cantilever over half a shelving run: each covered unit and bay its own mark, inside it, never bigger', () => {
    const objs = [shelf, cant(X + 330, Y - 150)]
    const marks = overlapMarks(objs, GS)
    const s = marks.filter(m => m.rackId === 's'), c = marks.filter(m => m.rackId === 'c')
    expect(s.length).toBe(2); expect(c.length).toBe(2)
    for (const m of s) expect(ownBox(m, markBoxes(shelf, GS))).toBe(true)
    for (const m of c) expect(ownBox(m, markBoxes(objs[1], GS))).toBe(true)
    // the X lines: two per mark, inset inside the box by the stroke
    const ops = overlapOps(marks, 1.5)
    expect(ops.length).toBe(8)
    for (let i = 0; i < ops.length; i += 2) {
      const m = marks[i / 2], xs = [...ops[i].points, ...ops[i + 1].points].filter((_, k) => k % 2 === 0), ys = [...ops[i].points, ...ops[i + 1].points].filter((_, k) => k % 2 === 1)
      expect(Math.min(...xs) >= m.x && Math.max(...xs) <= m.x + m.w && Math.min(...ys) >= m.y && Math.max(...ys) <= m.y + m.h).toBe(true)
    }
  })
  it('a short face: one mark per unit / per bay of the short side', () => {
    // a zone 1 ft below a single-sided cantilever's arms (its arm side): its 3 bays
    const c1 = { ...cant(X, Y), doubleSided: false, height: 133 }
    const z = { id: 'z', type: 'zone_custom', x: X - 40, y: Y + 133 + 20, width: 600, height: 200 }
    const m = faceLostMarks([c1, z], { gridSize: GS })
    expect(m.length).toBe(3)
    for (const q of m) expect(ownBox(q, markBoxes(c1, GS))).toBe(true)
  })
  it('the counts still read the drawn slots (drawing only): a cantilever 2 reach zones, a shelving run none', () => {
    const objs = [shelf, cant(X + 330, Y - 150)]
    expect([slotBoxes(shelf, GS).length, slotBoxes(objs[1], GS).length]).toEqual([0, 2])
    const total = getRackCapacity(objs[1])?.total || 0, n = coverLost(objs, { gridSize: GS }).byRack
    expect(n.get('c') || 0).toBe(Math.round(total / 2))   // its covered side's reach: half, as before
    expect(n.get('s') || 0).toBe(0)
  })
})
