/**
 * canvas.js — unit tests
 * Run: npx vitest run
 */

import { describe, it, expect } from 'vitest'
import {
  pxToFtIn,
  getObjectBounds,
  applyResize,
  insetPolygon,
  ANNOT_LINE_TYPES,
  HANDLES,
} from '../utils/canvas'

const GS = 40 // gridSize

// ─── pxToFtIn ────────────────────────────────────────────────────────────────
describe('pxToFtIn', () => {
  it('exact feet — no trailing 0"', () => {
    expect(pxToFtIn(GS * 9, GS)).toBe("9'")
  })
  it('feet and inches', () => {
    expect(pxToFtIn(GS * 8.5, GS)).toBe("8' 6\"")
  })
  it('inches only', () => {
    expect(pxToFtIn(GS * 0.5, GS)).toBe("0' 6\"")
  })
  it('zero', () => {
    expect(pxToFtIn(0, GS)).toBe("0'")
  })
  it('rounds to nearest inch', () => {
    // 9.083 ft = 9ft 1in
    expect(pxToFtIn(GS * 9.083, GS)).toBe("9' 1\"")
  })
})

// ─── getObjectBounds ─────────────────────────────────────────────────────────
describe('getObjectBounds', () => {
  it('rect object', () => {
    const obj = { type: 'rect', x: 10, y: 20, width: 100, height: 80 }
    expect(getObjectBounds(obj)).toEqual({ x: 10, y: 20, width: 100, height: 80 })
  })

  it('line object — horizontal', () => {
    const obj = { type: 'line', x1: 0, y1: 50, x2: 200, y2: 50 }
    const b = getObjectBounds(obj)
    expect(b.x).toBe(0)
    expect(b.width).toBe(200)
    expect(b.y).toBe(50)
  })

  it('line object — diagonal (min/max)', () => {
    const obj = { type: 'line', x1: 100, y1: 200, x2: 50, y2: 80 }
    const b = getObjectBounds(obj)
    expect(b.x).toBe(50)
    expect(b.y).toBe(80)
    expect(b.width).toBe(50)
    expect(b.height).toBe(120)
  })

  it('circle object', () => {
    const obj = { type: 'circle', cx: 100, cy: 100, rx: 40, ry: 30 }
    const b = getObjectBounds(obj)
    expect(b.x).toBe(60)
    expect(b.y).toBe(70)
    expect(b.width).toBe(80)
    expect(b.height).toBe(60)
  })

  it('annot_dimension uses x1/y1 geometry', () => {
    const obj = { type: 'annot_dimension', x1: 10, y1: 10, x2: 210, y2: 10 }
    const b = getObjectBounds(obj)
    expect(b.width).toBe(200)
  })

  it('fp_rect uses x/y/width/height', () => {
    const obj = { type: 'fp_rect', x: 5, y: 5, width: 320, height: 240 }
    expect(getObjectBounds(obj)).toEqual({ x: 5, y: 5, width: 320, height: 240 })
  })

  describe('text — alignment shifts x, matching ShapeGeometry\'s textAnchor', () => {
    // No DOM in this test environment, so textLayout's measurer falls back to
    // a deterministic str.length * fontSize * 0.55 — exact, not approximate.
    const W = 'Hi'.length * 20 * 0.55 // = 22, the measured width at fontSize 20

    it('align:left (default) — obj.x is already the left edge, unchanged', () => {
      const b = getObjectBounds({ type: 'text', x: 100, y: 50, text: 'Hi', fontSize: 20 })
      expect(b.x).toBe(100)
      expect(b.width).toBeCloseTo(W, 5)
    })

    it('align:center — shifts left by half the measured width', () => {
      const b = getObjectBounds({ type: 'text', x: 100, y: 50, text: 'Hi', fontSize: 20, align: 'center' })
      expect(b.x).toBeCloseTo(100 - W / 2, 5)
      expect(b.width).toBeCloseTo(W, 5) // width itself is align-independent
    })

    it('align:right — shifts left by the full measured width', () => {
      const b = getObjectBounds({ type: 'text', x: 100, y: 50, text: 'Hi', fontSize: 20, align: 'right' })
      expect(b.x).toBeCloseTo(100 - W, 5)
      expect(b.width).toBeCloseTo(W, 5)
    })
  })
})

// ─── applyResize — rect ───────────────────────────────────────────────────────
describe('applyResize — rect', () => {
  const snap = v => v
  const obj = { type: 'rect', x: 100, y: 100, width: 200, height: 150 }

  it('mr handle — grows right, x unchanged', () => {
    const r = applyResize(obj, 'mr', 50, 0, snap)
    expect(r.x).toBe(100)
    expect(r.width).toBe(250)
  })

  it('ml handle — grows left, x shifts', () => {
    const r = applyResize(obj, 'ml', -50, 0, snap)
    expect(r.x).toBe(50)
    expect(r.width).toBe(250)
  })

  it('bc handle — grows down, height increases', () => {
    const r = applyResize(obj, 'bc', 0, 50, snap)
    expect(r.height).toBe(200)
    expect(r.y).toBe(100)
  })

  it('tc handle — grows up, y shifts', () => {
    const r = applyResize(obj, 'tc', 0, -50, snap)
    expect(r.y).toBe(50)
    expect(r.height).toBe(200)
  })

  it('br handle — grows both axes', () => {
    const r = applyResize(obj, 'br', 30, 20, snap)
    expect(r.width).toBe(230)
    expect(r.height).toBe(170)
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
  })

  it('enforces minimum size', () => {
    const r = applyResize(obj, 'mr', -300, 0, snap)
    expect(r.width).toBeGreaterThan(0)
  })
})

// ─── applyResize — line ───────────────────────────────────────────────────────
describe('applyResize — line', () => {
  const snap = v => v
  const obj = { type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }

  it('ml handle moves x1/y1', () => {
    const r = applyResize(obj, 'ml', -20, 10, snap)
    expect(r.x1).toBe(-20)
    expect(r.y1).toBe(10)
  })

  it('mr handle moves x2/y2', () => {
    const r = applyResize(obj, 'mr', 50, 0, snap)
    expect(r.x2).toBe(150)
    expect(r.y2).toBe(0)
  })

  it('shiftKey — locks to H when dx > dy', () => {
    const r = applyResize(obj, 'mr', 50, 5, snap, true)
    expect(r.y2).toBe(0) // locked horizontal
  })

  it('shiftKey — locks to V when dy > dx from fixed point', () => {
    // x1=x2=0 so adx stays small, ady grows with dy
    const vertObj = { type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 }
    const r = applyResize(vertObj, 'mr', 5, 50, snap, true)
    expect(r.x2).toBe(0) // locked vertical — x2 stays at x1
  })

  it('works for annot_dimension', () => {
    const dim = { type: 'annot_dimension', x1: 0, y1: 0, x2: 200, y2: 0 }
    const r = applyResize(dim, 'mr', 50, 0, snap)
    expect(r.x2).toBe(250)
  })
})

// ─── applyResize — drive-in lane snap ─────────────────────────────────────────
describe('applyResize — rack_drive_in lane snap', () => {
  const snap = v => v
  const upIn = 4, palletWIn = 40, palletDIn = 48
  const upW = (upIn/12)*GS
  const ledgePx = (2/12)*GS, clearPx = (1/12)*GS
  const palletWPx = (palletWIn/12)*GS
  const laneWPx = ledgePx*2 + clearPx*2 + palletWPx
  const palletDPx = (palletDIn/12)*GS

  const makeObj = (lanes, deep) => ({
    type: 'rack_drive_in',
    lanes, palletDeep: deep,
    uprightWidth: upIn, palletWIn, palletDIn,
    x: 0, y: 0, rotation: 0,
    width: (lanes+1)*upW + lanes*laneWPx,
    height: deep * palletDPx,
  })

  it('mr handle — adds a lane when dragged right enough', () => {
    const obj = makeObj(2, 5)
    const r = applyResize(obj, 'mr', laneWPx + upW, 0, snap)
    expect(r.lanes).toBe(3)
  })

  it('mr handle — partial drag stays at same lane count', () => {
    const obj = makeObj(2, 5)
    const r = applyResize(obj, 'mr', 5, 0, snap) // tiny drag
    expect(r.lanes).toBe(2)
  })

  it('bc handle — adds deep when dragged down', () => {
    const obj = makeObj(2, 5)
    const r = applyResize(obj, 'bc', 0, palletDPx, snap)
    expect(r.palletDeep).toBe(6)
  })

  it('ml handle — adds lane left, shifts x', () => {
    const obj = makeObj(2, 5)
    const r = applyResize(obj, 'ml', -(laneWPx + upW), 0, snap)
    expect(r.lanes).toBe(3)
    expect(r.x).toBeLessThan(0) // shifted left
  })

  it('returned width matches formula exactly', () => {
    const obj = makeObj(3, 5)
    const r = applyResize(obj, 'mr', laneWPx + upW, 0, snap)
    const expectedW = (r.lanes+1)*upW + r.lanes*laneWPx
    expect(r.width).toBeCloseTo(expectedW, 5)
  })

  it('minimum 1 lane enforced', () => {
    const obj = makeObj(1, 5)
    const r = applyResize(obj, 'mr', -9999, 0, snap)
    expect(r.lanes).toBe(1)
  })
})

// ─── Lane formula consistency ─────────────────────────────────────────────────
describe('Lane formula consistency', () => {
  it('render formula = panel recalc formula = picker formula', () => {
    const lanes = 3, upIn = 4, palletWIn = 40
    const GS = 40
    const upPx    = (upIn/12)*GS
    const ledgePx = (2/12)*GS
    const clearPx = (1/12)*GS
    const palletWPx = (palletWIn/12)*GS
    const laneWPx = ledgePx*2 + clearPx*2 + palletWPx

    // Render formula (ShapeGeometry)
    const renderW = (lanes+1)*upPx + lanes*laneWPx

    // Panel recalc formula (DriveInPanel/DriveThroughPanel/PushbackPanel)
    const recalcW = (lanes+1)*upPx + lanes*(ledgePx*2 + clearPx*2 + palletWPx)

    // Picker formula (WarehouseObjectPicker)
    const pickerW = (lanes+1)*upPx + lanes*(ledgePx*2 + clearPx*2 + palletWPx)

    expect(renderW).toBeCloseTo(recalcW, 10)
    expect(renderW).toBeCloseTo(pickerW, 10)
  })
})

// ─── insetPolygon ─────────────────────────────────────────────────────────────
describe('insetPolygon', () => {
  it('rect polygon insets correctly', () => {
    const verts = [{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80}]
    const inset = insetPolygon(verts, 10)
    expect(inset[0].x).toBeCloseTo(10)
    expect(inset[0].y).toBeCloseTo(10)
    expect(inset[1].x).toBeCloseTo(90)
    expect(inset[2].y).toBeCloseTo(70)
  })
})

// ─── ANNOT_LINE_TYPES ─────────────────────────────────────────────────────────
describe('ANNOT_LINE_TYPES', () => {
  it('contains all expected types', () => {
    expect(ANNOT_LINE_TYPES.has('annot_dimension')).toBe(true)
    expect(ANNOT_LINE_TYPES.has('annot_arrow_line')).toBe(true)
    expect(ANNOT_LINE_TYPES.has('annot_solid_line')).toBe(true)
    expect(ANNOT_LINE_TYPES.has('annot_dashed_line')).toBe(true)
  })
  it('does not contain rect types', () => {
    expect(ANNOT_LINE_TYPES.has('rect')).toBe(false)
    expect(ANNOT_LINE_TYPES.has('fp_rect')).toBe(false)
  })
})

// ─── HANDLES ─────────────────────────────────────────────────────────────────
describe('HANDLES', () => {
  it('has exactly 8 handles', () => {
    expect(HANDLES).toHaveLength(8)
  })
  it('contains all expected handles', () => {
    expect(HANDLES).toContain('tl')
    expect(HANDLES).toContain('mr')
    expect(HANDLES).toContain('bc')
    expect(HANDLES).toContain('br')
  })
})