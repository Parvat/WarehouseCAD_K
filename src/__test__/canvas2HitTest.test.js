import { describe, it, expect } from 'vitest'
import { hitTest, hitTestBay } from '../canvas2/hitTest'

const GS = 40
const LAYERS = [{ id: 'l1', visible: true, locked: false }]

const row = {
  id: 'r1', type: 'rack_row', layerId: 'l1',
  x: 0, y: 0, width: 3310, height: 140,
  beams: Array(10).fill(96), uprightWidth: 3,
}
const dbl = {
  id: 'r2', type: 'rack_double_row', layerId: 'l1',
  x: 0, y: 300, width: 3310, height: 300,
  beams: Array(10).fill(96), uprightWidth: 3, flueSpaceIn: 6,
}

describe('canvas2 hitTest — object picking, ported from the SVG', () => {
  it('finds a rack_row and a rack_double_row identically — type-agnostic', () => {
    expect(hitTest([row], LAYERS, 1500, 70, 1, GS)).toBe('r1')
    expect(hitTest([dbl], LAYERS, 1500, 450, 1, GS)).toBe('r2')
  })

  it('returns null for empty space', () => {
    expect(hitTest([row, dbl], LAYERS, 1500, 5000, 1, GS)).toBeNull()
  })

  it('never picks an object on a hidden or locked layer, or a locked object', () => {
    const hidden = [{ id: 'l1', visible: false, locked: false }]
    const locked = [{ id: 'l1', visible: true, locked: true }]
    expect(hitTest([row], hidden, 1500, 70, 1, GS)).toBeNull()
    expect(hitTest([row], locked, 1500, 70, 1, GS)).toBeNull()
    expect(hitTest([{ ...row, locked: true }], LAYERS, 1500, 70, 1, GS)).toBeNull()
  })

  it('checks annotations/text before plain shapes when they overlap', () => {
    const text = { id: 't1', type: 'text', layerId: 'l1', x: 100, y: 40, width: 40, height: 20 }
    expect(hitTest([row, text], LAYERS, 110, 50, 1, GS)).toBe('t1')
  })

  it('hits a column ONLY on its square, not the grid bounding box', () => {
    const grid = {
      id: 'g1', type: 'column_grid', layerId: 'l1',
      x: 0, y: 0, spacingX: [2000], spacingY: [2000],
      columnW: 40, columnH: 40,
    }
    expect(hitTest([grid], LAYERS, 20, 20, 1, GS)).toBe('g1')     // on the column
    expect(hitTest([grid], LAYERS, 1000, 1000, 1, GS)).toBeNull() // inside the grid's span, off any column
  })

  it('checks the floor plan LAST — contents standing on it win first', () => {
    const fp = { id: 'fp1', type: 'fp_rect', layerId: 'l1', x: 0, y: 0, width: 5000, height: 5000 }
    expect(hitTest([fp, row], LAYERS, 1500, 70, 1, GS)).toBe('r1')
    expect(hitTest([fp, row], LAYERS, 4500, 4500, 1, GS)).toBe('fp1')
  })
})

describe('canvas2 hitTestBay — bay/lane/tower picking, ported from the SVG', () => {
  it('finds the bay a beam rack was clicked in', () => {
    // bay 0 centre: x, upW..upW+96in
    const upW = (3 / 12) * GS
    const beamPx = (96 / 12) * GS
    const bay0CenterX = upW + beamPx / 2
    expect(hitTestBay(row, bay0CenterX, 70, GS)).toBe(0)
    const bay1CenterX = upW + beamPx + upW + beamPx / 2
    expect(hitTestBay(row, bay1CenterX, 70, GS)).toBe(1)
  })

  it('returns null for a click on an upright, not the nearest bay', () => {
    expect(hitTestBay(row, 0, 70, GS)).toBeNull()   // x=0 is the first upright's own span start
  })

  it('answers for the broader RACK_BAY_TYPES set, not just row/double-row', () => {
    const pushback = { ...row, type: 'rack_pushback' }
    const palletFlow = { ...row, type: 'rack_pallet_flow' }
    const driveThrough = { ...row, type: 'rack_drive_through' }
    const upW = (3 / 12) * GS, beamPx = (96 / 12) * GS
    const bay0 = upW + beamPx / 2
    expect(hitTestBay(pushback, bay0, 70, GS)).toBe(0)
    expect(hitTestBay(palletFlow, bay0, 70, GS)).toBe(0)
    expect(hitTestBay(driveThrough, bay0, 70, GS)).toBe(0)
  })

  it('deliberately excludes drive-in — no per-lane pick means anything there', () => {
    expect(hitTestBay({ ...row, type: 'rack_drive_in' }, 70, 70, GS)).toBeNull()
  })

  it('picks a cantilever TOWER by towers[], not a bay', () => {
    const cant = { id: 'c1', type: 'rack_cantilever', x: 0, y: 0, width: 400, height: 200, towers: [36, 36, 36, 36], armThicknessIn: 3 }
    expect(hitTestBay(cant, 0, 100, GS)).toBe(0)
    const spacePx = 400 / 3
    expect(hitTestBay(cant, spacePx, 100, GS)).toBe(1)
  })

  it('returns null for a type with no bay concept at all', () => {
    expect(hitTestBay({ ...row, type: 'rack_mezzanine' }, 200, 70, GS)).toBeNull()
  })

  it('un-rotates the click so a rotated rack still resolves the right bay', () => {
    // a 90-degree rack: what was the x-axis is now the y-axis on screen
    const rotated = { ...row, rotation: 90 }
    const upW = (3 / 12) * GS, beamPx = (96 / 12) * GS
    const cx = row.x + row.width / 2, cy = row.y + row.height / 2
    // bay 0's centre in LOCAL space, rotated +90 degrees around the centre
    const localBay0 = { x: upW + beamPx / 2, y: row.height / 2 }
    const dx = localBay0.x - cx, dy = localBay0.y - cy
    const rad = (90 * Math.PI) / 180
    const worldX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
    const worldY = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    expect(hitTestBay(rotated, worldX, worldY, GS)).toBe(0)
  })
})
