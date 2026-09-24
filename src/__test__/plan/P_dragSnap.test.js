// Area P — a drag never snaps to anything that is moving with it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeSmartGuides } from '../../canvas2/smartGuides'
import { GS } from './fixtures'

/* Snap radius at zoom 1: 8 px (objects), 32 px (walls). Everything below is
 * placed so the ONLY candidate within those radii is the one under test. */
const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1000, height: 600,
  fpVerts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }] }
const rack = (id, x, y, extra = {}) => ({ id, type: 'rack_row', x, y, width: 300, height: 140, beams: [96, 96], ...extra })

describe('P — dragging never snaps to what moves with it', () => {
  /* The building's own rack sits 3 px in from its left wall. Dragging the
   * building 5 px right puts the wall 2 px from where that rack USED to be:
   * a ghost of its own contents, well inside the 8 px snap radius. */
  it('P-fp: dragging a floor plan never snaps to its own children', () => {
    const child = rack('c', 3, 200, { parentId: 'fp' })
    const res = computeSmartGuides(['fp'], [fp, child], GS, 1, 5, 0)
    expect(res.snapDx).toBeNull()
    expect(res.guides).toEqual([])
  })

  it('P-fp: ...but it still snaps to an object that is NOT moving', () => {
    // a free-standing rack outside the building, its right edge at x = -2
    const outside = rack('o', -302, 800)
    const res = computeSmartGuides(['fp'], [fp, outside], GS, 1, 3, 0)
    expect(res.snapDx).toBe(-2)          // left wall pulled onto the rack's right edge at x = -2
  })

  /* Two selected racks, A at x 100 and B at x 400 (a row apart). Dragging the
   * pair 297 px right puts A's left edge 3 px from B's old left edge (400). */
  it('P-multi: dragging a multi-selection never snaps to its own members', () => {
    const A = rack('A', 100, 1000), B = rack('B', 400, 1400)
    const res = computeSmartGuides(['A', 'B'], [A, B], GS, 1, 297, 0)
    expect(res.snapDx).toBeNull()
    expect(res.guides).toEqual([])
  })

  it('P-multi: ...but it still snaps to a rack left behind', () => {
    const A = rack('A', 100, 1000), B = rack('B', 400, 1400), C = rack('C', 400, 2000)
    const res = computeSmartGuides(['A', 'B'], [A, B, C], GS, 1, 297, 0)
    expect(res.snapDx).toBe(300)         // A's left edge onto C's left edge (400)
  })
})

/* The rotate icons follow a drag too (they sat behind as ghosts). Konva
 * can't load under node, so this reads the wiring, as O-wire does. */
describe('P — rotate handles ride the drag', () => {
  const inter = readFileSync(new URL('../../canvas2/useCanvasInteraction.js', import.meta.url), 'utf8')
  const fpr = readFileSync(new URL('../../canvas2/FpRotateHandleOverlay.jsx', import.meta.url), 'utf8')
  const gro = readFileSync(new URL('../../canvas2/GroupRotateOverlay.jsx', import.meta.url), 'utf8')
  it('P-wire: the floor-plan rotate handle is a node the drag moves', () => {
    expect(fpr).toMatch(/<Group name=\{'fprotate:' \+ obj\.id\}/)
    expect(inter).toMatch(/CHROME_NODE_PREFIXES = \[[^\]]*'fprotate:'/)
  })
  it('P-wire: the group rotate outline moves with a multi-selection drag', () => {
    expect(gro).toMatch(/<Group name="grouprotate"/)
    expect(inter).toMatch(/if \(nm === 'grouprotate'\) \{ if \(ids\.length >= 2\) nodes\.push/)
  })
})
