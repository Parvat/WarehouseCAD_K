import { describe, it, expect } from 'vitest'
import { computeSmartGuides } from '../canvas2/smartGuides'

const GS = 40

/* A single column at world (1000,1000), 12" square (40px at GS=40).
 *
 * cg.x/cg.y is the GRID-LINE position, not an edge — expandColumnGrid
 * (columnCheck.js), the same function the actual renderer draws from,
 * centres each column's square ON its line (`{x: cx - w/2, y: cy - h/2, w,
 * h}`). So for this fixture the TRUE rendered faces are 980 (left/top) and
 * 1020 (right/bottom), not 1000/1040 — an earlier version of both
 * smartGuides.js and this test file assumed the edge-aligned convention,
 * which is exactly why the guide used to render inside the column instead
 * of on its border. */
const colGrid = {
  id: 'cg1', type: 'column_grid',
  x: 1000, y: 1000, spacingX: [], spacingY: [],
  columnW: (12 / 12) * GS, columnH: (12 / 12) * GS,
}
const FACE_NEAR = 980   // left face / top face
const FACE_FAR  = 1020  // right face / bottom face

/* Each directional fixture keeps the OTHER axis far from the column's own
 * band (y or x = 5000+) so its guide can't incidentally interfere with the
 * axis actually under test. */
describe('smartGuides — column snapping: directional faces, plus centre-to-centre', () => {
  it('approaching from the LEFT snaps the row\'s right edge to the column\'s LEFT face (980, not the grid-line 1000)', () => {
    const rack = { id: 'r1', type: 'rack_row', x: 700, y: 5000, width: 200, height: 80 }
    const objects = [colGrid, rack]
    // rack.r = x + dx + 200 -> left face (980) at dx = 80
    const dxExact = FACE_NEAR - 200 - 700
    const { snapDx, guides } = computeSmartGuides(['r1'], objects, GS, 1, dxExact - 5, 0)
    expect(snapDx).toBe(dxExact)
    expect(guides.some(g => g.axis === 'x' && g.val === FACE_NEAR && g.isWall)).toBe(true)
    expect(guides.some(g => g.axis === 'x' && g.val === FACE_FAR)).toBe(false)   // never the far face
    expect(guides.some(g => g.axis === 'x' && g.val === 1000)).toBe(false)       // never the grid line itself
  })

  it('approaching from the RIGHT snaps the row\'s left edge to the column\'s RIGHT face (1020)', () => {
    const rack = { id: 'r1', type: 'rack_row', x: 1300, y: 5000, width: 200, height: 80 }
    const objects = [colGrid, rack]
    // rack.x = x + dx -> right face (1020) at dx = -280
    const dxExact = FACE_FAR - 1300
    const { snapDx, guides } = computeSmartGuides(['r1'], objects, GS, 1, dxExact + 5, 0)
    expect(snapDx).toBe(dxExact)
    expect(guides.some(g => g.axis === 'x' && g.val === FACE_FAR && g.isWall)).toBe(true)
    expect(guides.some(g => g.axis === 'x' && g.val === FACE_NEAR)).toBe(false)
    expect(guides.some(g => g.axis === 'x' && g.val === 1000)).toBe(false)
  })

  it('approaching from ABOVE snaps the row\'s bottom edge to the column\'s TOP face (980)', () => {
    const rack = { id: 'r1', type: 'rack_row', x: 5000, y: 700, width: 200, height: 80 }
    const objects = [colGrid, rack]
    // rack.b = y + dy + 80 -> top face (980) at dy = 200
    const dyExact = FACE_NEAR - 80 - 700
    const { snapDy, guides } = computeSmartGuides(['r1'], objects, GS, 1, 0, dyExact - 5)
    expect(snapDy).toBe(dyExact)
    expect(guides.some(g => g.axis === 'y' && g.val === FACE_NEAR && g.isWall)).toBe(true)
    expect(guides.some(g => g.axis === 'y' && g.val === FACE_FAR)).toBe(false)
    expect(guides.some(g => g.axis === 'y' && g.val === 1000)).toBe(false)
  })

  it('approaching from BELOW snaps the row\'s top edge to the column\'s BOTTOM face (1020)', () => {
    const rack = { id: 'r1', type: 'rack_row', x: 5000, y: 1300, width: 200, height: 80 }
    const objects = [colGrid, rack]
    // rack.y = y + dy -> bottom face (1020) at dy = -280
    const dyExact = FACE_FAR - 1300
    const { snapDy, guides } = computeSmartGuides(['r1'], objects, GS, 1, 0, dyExact + 5)
    expect(snapDy).toBe(dyExact)
    expect(guides.some(g => g.axis === 'y' && g.val === FACE_FAR && g.isWall)).toBe(true)
    expect(guides.some(g => g.axis === 'y' && g.val === FACE_NEAR)).toBe(false)
    expect(guides.some(g => g.axis === 'y' && g.val === 1000)).toBe(false)
  })

  it('the guide line spans the column\'s own true footprint, not the un-centred grid-line box', () => {
    const rack = { id: 'r1', type: 'rack_row', x: 700, y: 5000, width: 200, height: 80 }
    const objects = [colGrid, rack]
    const dxExact = FACE_NEAR - 200 - 700
    const { guides } = computeSmartGuides(['r1'], objects, GS, 1, dxExact, 0)
    const g = guides.find(g => g.axis === 'x' && g.val === FACE_NEAR)
    // Perpendicular span covers the column's true top/bottom (980/1020) +/- margin.
    expect(g.from).toBe(FACE_NEAR - 20)
    expect(g.to).toBe(FACE_FAR + 20)
  })

  it('releases cleanly once pulled outside the snap radius — no snap, no guide, no stickiness', () => {
    const rack = { id: 'r1', type: 'rack_row', x: 700, y: 5000, width: 200, height: 80 }
    const objects = [colGrid, rack]
    const dxExact = FACE_NEAR - 200 - 700
    const justInside = computeSmartGuides(['r1'], objects, GS, 1, dxExact - 25, 0)
    const justOutside = computeSmartGuides(['r1'], objects, GS, 1, dxExact - 35, 0)
    expect(justInside.snapDx).toBe(dxExact)
    expect(justOutside.snapDx).toBeNull()
    expect(justOutside.guides.some(g => g.axis === 'x')).toBe(false)
  })

  it('snaps the row\'s own centre through the column\'s true centreline (the grid-line value, 1000) — a real, distinct placement from "edge clear of it"', () => {
    // A wide rack (500) whose CENTRE approaches the column's own centre
    // (1000, the grid-line position itself) while its edges sit 270px from
    // either true face (980/1020) — far outside WALL_THRESH — so a
    // centre-to-centre snap is the ONLY thing that can fire here.
    const rack = { id: 'r1', type: 'rack_row', x: 0, y: 980, width: 500, height: 80 }
    const objects = [colGrid, rack]
    const dxExact = 1000 - 250 - 0   // rack.cx = dx + 250 -> 1000 at dx = 750
    const { snapDx, guides } = computeSmartGuides(['r1'], objects, GS, 1, dxExact - 5, 0)
    expect(snapDx).toBe(dxExact)
    expect(guides.some(g => g.axis === 'x' && g.val === 1000 && g.isWall)).toBe(true)
  })

  it('centre-to-centre and the directional face pairs never both fire for the same drag position (a real rack\'s half-width clears WALL_THRESH)', () => {
    // At the exact position where the LEFT-approach face pair fires
    // (r1's right edge on the column's left face, 980), r1's own centre
    // is 100px short of the column's centre (1000) — well outside
    // WALL_THRESH(30) — so only the face guide shows, never both.
    const rack = { id: 'r1', type: 'rack_row', x: 700, y: 5000, width: 200, height: 80 }
    const objects = [colGrid, rack]
    const dxExact = FACE_NEAR - 200 - 700
    const { guides } = computeSmartGuides(['r1'], objects, GS, 1, dxExact, 0)
    expect(guides.some(g => g.axis === 'x' && g.val === FACE_NEAR)).toBe(true)
    expect(guides.some(g => g.axis === 'x' && g.val === 1000)).toBe(false)
  })

  it('a lone column offers the SAME centre snap a front row centred on it would have — removing the front row does not lose the alignment', () => {
    // The reported bug: two facing rows straddling the same column line
    // snap to EACH OTHER fine (rack-to-rack centre-centre), but remove one
    // and the column alone didn't catch the same position. Reproduced
    // directly: a "front row" whose own centre sits exactly on the
    // column's centre (1000) offers `[sb.cx, ob.cx]`; deleting it and
    // repeating the identical drag must still snap, now via the column's
    // own `[sb.cx, cx]`, to the exact same position.
    const frontRow = { id: 'front', type: 'rack_row', x: 850, y: 0, width: 300, height: 80 }   // cx = 1000
    const dragged   = { id: 'r1', type: 'rack_row', x: 300, y: 5000, width: 200, height: 80 }
    const dxExact = 1000 - 100 - 300   // dragged.cx = dx + 100 -> 1000 at dx = 600

    const withFrontRow = computeSmartGuides(['r1'], [frontRow, dragged], GS, 1, dxExact - 5, 0)
    expect(withFrontRow.snapDx).toBe(dxExact)

    const columnOnly = computeSmartGuides(['r1'], [colGrid, dragged], GS, 1, dxExact - 5, 0)
    expect(columnOnly.snapDx).toBe(dxExact)
    expect(columnOnly.snapDx).toBe(withFrontRow.snapDx)
  })

  it('does not snap the row\'s OWN leading-side edge to the near-side face it isn\'t actually approaching (the old "check every edge against every face" bug)', () => {
    // Dragging in from the left, a wide rack's LEFT edge can pass near the
    // column's LEFT face purely because the rack is wide — that is not an
    // approach from the right, and must not produce a right-face-style
    // match on the column's own near face either. Only the true leading
    // edge (the right one, here) may snap.
    const rack = { id: 'r1', type: 'rack_row', x: 700, y: 5000, width: 500, height: 80 }
    const objects = [colGrid, rack]
    const dx = FACE_NEAR - 700   // rack.x lands exactly on the column's left face (980)
    const { snapDx, guides } = computeSmartGuides(['r1'], objects, GS, 1, dx, 0)
    expect(snapDx).toBeNull()
    expect(guides.some(g => g.axis === 'x')).toBe(false)
  })

  it('rack-to-rack edge/centre snapping is unaffected by the column changes', () => {
    const rackA = { id: 'rA', type: 'rack_row', x: 0, y: 0, width: 200, height: 80 }
    const rackB = { id: 'rB', type: 'rack_row', x: 500, y: 0, width: 200, height: 80 }
    const objs = [rackA, rackB]
    // rackA's right edge (x+dx+200) approaching rackB's left edge (500): exact at dx=300
    const near = computeSmartGuides(['rA'], objs, GS, 1, 295, 0)
    expect(near.snapDx).toBe(300)
    expect(near.guides.some(g => g.axis === 'x' && g.val === 500 && !g.isWall)).toBe(true)

    const far = computeSmartGuides(['rA'], objs, GS, 1, 250, 0)
    expect(far.snapDx).toBeNull()
  })

  it('rack-to-rack centre snapping (unrelated to columns) still works', () => {
    const rackA = { id: 'rA', type: 'rack_row', x: 0, y: 0, width: 200, height: 80 }
    const rackB = { id: 'rB', type: 'rack_row', x: 600, y: 0, width: 200, height: 80 }
    const objs = [rackA, rackB]
    // rackA.cx = dx+100; rackB.cx = 700 -> exact align at dx=600
    const { snapDx } = computeSmartGuides(['rA'], objs, GS, 1, 598, 0)
    expect(snapDx).toBe(600)
  })
})
