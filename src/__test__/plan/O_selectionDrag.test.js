// Area O — aisle selection bounds, and overlays that follow a drag live.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { aisleRect, boundsOf } from '../../canvas2/hitTest'
import { computeGroupOutline } from '../../canvas2/groupRotate'
import { objectsInMarquee, movedIdsFor } from '../../canvas2/selection'
import { computeSmartGuides } from '../../canvas2/smartGuides'
import { previewObjects } from '../../canvas2/dragPreview'
import { clearanceMarks } from '../../canvas2/aisleMarks'
import { rackBandsWorld, columnMarkerRect } from '../../canvas2/columnMarker'
import {
  checkColumns, aisleColumnBlocks, uprightFramesLocal, localRectToWorld, MHE_PROFILES,
} from '../../generate/columnCheck'
import { layoutColumns, isRack } from '../../generate/usableCapacity'
import { sizingSheetLayout, generateFixtures } from '../../generate/sizingLayout'
import { placementToObject, aisleObjectsForRacks, parentGenerated } from '../../generate/traceGenerate'
import { uprightXs } from '../../render/rackOps'
import { positionFootprintIn } from '../../utils/capacity'
import { DEFAULT_RULES } from '../../rules/defaults'
import { R, GS } from './fixtures'

/* Two facing single rows well away from the world origin (so a zero box at
 * (0, 0) can never be mistaken for the right answer):
 *   A: x 1000..1670, y 2000..2140   B: x 1000..1670, y 2560..2700
 * Their aisle is exactly the gap: x 1000..1670, y 2140..2560. */
const row = (id, x, y) => ({ id, type: 'rack_row', x, y, width: 670, height: 140, beams: [96, 96], uprightWidth: 3, depthIn: 42 })
const A = row('A', 1000, 2000), B = row('B', 1000, 2560)
const AISLE = { id: 'ai', type: 'aisle', row1Id: 'A', row2Id: 'B' }
const OBJS = [A, B, AISLE]
const GAP = { x: 1000, y: 2140, width: 670, height: 420 }

describe('O — aisle selection covers only the aisle', () => {
  it('O-bounds: an aisle measures as its own gap (horizontal rows)', () => {
    expect(aisleRect(AISLE, OBJS)).toEqual(GAP)
    expect(boundsOf(AISLE, OBJS)).toEqual(GAP)
  })

  it('O-bounds: same for 90°-rotated rows (the gap turned 90°)', () => {
    // footprints x 1000..1140 and 1560..1700, y 2000..2670
    const rot = (id, fx) => ({ ...row(id, 0, 0), rotation: 90, x: fx + 70 - 335, y: 2000 + 335 - 70 })
    const objs = [rot('A', 1000), rot('B', 1560), AISLE]
    expect(boundsOf(AISLE, objs)).toEqual({ x: 1140, y: 2000, width: 420, height: 670 })
  })

  it('O-group: a multi-selection holding an aisle outlines just the racks + aisle, never out to (0, 0)', () => {
    const g = computeGroupOutline([A, AISLE], 1, OBJS)
    expect([g.minX, g.minY, g.maxX, g.maxY]).toEqual([1000, 2000, 1670, 2560])
  })

  it('O-marquee: a marquee around the world origin catches no aisle, and neither does one inside the aisle (area R: aisles are picked by their labels)', () => {
    expect(objectsInMarquee(OBJS, { x: -50, y: -50, width: 100, height: 100 })).toEqual([])
    expect(objectsInMarquee(OBJS, { x: 1200, y: 2300, width: 50, height: 50 })).toEqual([])
  })

  it('O-guides: an aisle offers no phantom smart-guide snap at x = 0 / y = 0', () => {
    // a lone rack dragged so its left edge sits 2 px from x = 0; the only other objects are far away
    const C = row('C', 2, 5000)
    const { guides } = computeSmartGuides(['C'], [...OBJS, C], GS, 1, 0, 0)
    expect(guides.filter(g => Math.abs(g.val) < 1e-9)).toEqual([])
  })
})

/* ── Overlays follow a drag live ──────────────────────────────────────────── */

/* A real generated layout inside a building, as buildQueue assembles it
 * (every child parented to the floor plan), at a building origin far from
 * (0, 0). R1 horizontal, "Columns along wall" = Yes: it has aisles, aisle
 * columns, in-rack conflicts, pick-zone blocks and columns on uprights. */
function building() {
  const brief = { ...R.R1, orientation: 'horizontal', columnsAlongWall: true, rackType: 'rack_double_row' }
  const ox = 4000, oy = 3000
  const L = brief.lengthFt * GS, W = brief.widthFt * GS
  const fp = { id: 'fp', type: 'fp_rect', x: ox, y: oy, width: L, height: W,
    fpVerts: [{ x: ox, y: oy }, { x: ox + L, y: oy }, { x: ox + L, y: oy + W }, { x: ox, y: oy + W }] }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => {
    const o = placementToObject(p); o.id = 'r' + i; o.x += ox; o.y += oy; return o
  })
  const aisles = aisleObjectsForRacks(racks).map((a, i) => ({ ...a, id: 'a' + i }))
  const fixtures = generateFixtures(brief, ox, oy).map((f, i) => ({ ...f, id: 'g' + i }))
  return [fp, ...parentGenerated([...racks, ...aisles, ...fixtures], 'fp')]
}

const shift = (r, dx, dy) => ({ ...r, x: r.x + dx, y: r.y + dy })
const near = (a, b) => expect(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, +(+v).toFixed(6)])))
  .toEqual(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, +(+v).toFixed(6)])))

/* World geometry each overlay draws — the same functions the painters use. */
const G = {
  aisleLabel: (objs, aisle) => aisleRect(aisle, objs),
  clearance: (objs) => {
    const racks = objs.filter(isRack), cols = layoutColumns(objs, GS)
    const b = aisleColumnBlocks({ racks, columns: cols, profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks[0]
    const m = clearanceMarks(b, cols[b.columnIndex])[0]
    return { x: m.shaft[0].x, y: m.shaft[0].y }
  },
  // a pallet-position X: the position's rect in the rack's local frame, carried to world
  xMark: (objs, c) => {
    const r = objs.find(o => o.id === c.rackId)
    const { xs, upW, beams } = uprightXs(r, GS)
    const fp = positionFootprintIn(beams[c.bayIndex], r.palletWIn || 40, c.positionIndices[0])
    const flueH = ((r.flueSpaceIn || 9) / 12) * GS, rowH = (r.height - flueH) / 2
    const y = c.faces[0] === 0 ? r.y : r.y + rowH + flueH
    return localRectToWorld(r, { x: xs[c.bayIndex] + upW + (fp.startIn / 12) * GS, y, w: ((fp.endIn - fp.startIn) / 12) * GS, h: rowH })
  },
  upright: (objs, h) => {
    const r = objs.find(o => o.id === h.rackId)
    const f = uprightFramesLocal(r, GS).find(q => q.upright === h.upright && q.face === h.faces[0])
    return localRectToWorld(r, f)
  },
  columnMarker: (objs) => {
    const c = layoutColumns(objs, GS)[5]
    const g = columnMarkerRect(c, rackBandsWorld(objs.filter(isRack), GS), 0.1, 6)
    return { x: g.x, y: g.y, w: g.width, h: g.height }
  },
}

describe('O — every overlay moves live with a floor-plan drag', () => {
  const objs = building()
  const dx = 120, dy = -80
  const moved = previewObjects(objs, { ids: movedIdsFor(objs, ['fp']), dx, dy })
  const racks = objs.filter(isRack), cols = layoutColumns(objs, GS)
  const res = checkColumns({ racks, columns: cols, profile: MHE_PROFILES.reach, gridSize: GS })

  it('O-fp-set: the drag moves the building, every rack, aisle and the column grid', () => {
    const ids = movedIdsFor(objs, ['fp'])
    expect(objs.every(o => ids.has(o.id))).toBe(true)
  })

  it('O-fp: the fixture really has every overlay type to check', () => {
    expect(objs.filter(o => o.type === 'aisle').length).toBeGreaterThan(0)
    expect(res.aisleBlocks.length).toBeGreaterThan(0)
    expect(res.rackConflicts.filter(c => c.positionIndices.length).length).toBeGreaterThan(0)
    expect(res.pickBlocks.length).toBeGreaterThan(0)
    expect(res.uprightHits.length).toBeGreaterThan(0)
  })

  it('O-fp aisle label: at the dragged position mid-drag', () => {
    const a = objs.find(o => o.type === 'aisle')
    near(G.aisleLabel(moved, a), shift(G.aisleLabel(objs, a), dx, dy))
  })
  it('O-fp clearance label: at the dragged position mid-drag', () => {
    near(G.clearance(moved), shift(G.clearance(objs), dx, dy))
  })
  it('O-fp in-rack X: at the dragged position mid-drag', () => {
    const c = res.rackConflicts.find(k => k.positionIndices.length)
    near(G.xMark(moved, c), shift(G.xMark(objs, c), dx, dy))
  })
  it('O-fp pick-zone X: at the dragged position mid-drag', () => {
    const c = res.pickBlocks[0]
    near(G.xMark(moved, c), shift(G.xMark(objs, c), dx, dy))
  })
  it('O-fp upright mark: at the dragged position mid-drag', () => {
    const h = res.uprightHits[0]
    near(G.upright(moved, h), shift(G.upright(objs, h), dx, dy))
  })
  it('O-fp column marker: at the dragged position mid-drag', () => {
    near(G.columnMarker(moved), shift(G.columnMarker(objs), dx, dy))
  })
})

describe('O — a multi-select drag moves the overlays of what it moves', () => {
  const objs = building()
  const racks = objs.filter(isRack)
  const cols = layoutColumns(objs, GS)
  const res = checkColumns({ racks, columns: cols, profile: MHE_PROFILES.reach, gridSize: GS })
  // the two rows of the first aisle, plus that aisle
  const aisle = objs.find(o => o.type === 'aisle')
  const ids = new Set([aisle.row1Id, aisle.row2Id])
  const dx = -60, dy = 40
  const moved = previewObjects(objs, { ids, dx, dy })

  it('O-multi aisle label: the aisle between the two dragged rows moves with them', () => {
    near(G.aisleLabel(moved, aisle), shift(G.aisleLabel(objs, aisle), dx, dy))
  })
  it('O-multi X and upright marks: a dragged rack\'s marks move with it; an undragged rack\'s stay put', () => {
    const mine = res.rackConflicts.find(c => ids.has(c.rackId) && c.positionIndices.length) || res.pickBlocks.find(c => ids.has(c.rackId))
    expect(mine).toBeTruthy()
    near(G.xMark(moved, mine), shift(G.xMark(objs, mine), dx, dy))
    const other = res.pickBlocks.find(c => !ids.has(c.rackId))
    near(G.xMark(moved, other), G.xMark(objs, other))
  })
  it('O-multi column markers: the grid was not dragged, so its markers stay put', () => {
    near(G.columnMarker(moved), G.columnMarker(objs))
  })
})

/* Wiring: the geometry above only reaches the screen if each overlay is FED
 * the previewed objects. Konva can't load under node (no native canvas), so
 * this reads the overlay layer's source, the way H-single-reader does. */
describe('O — every derived overlay is drawn from the previewed objects', () => {
  const src = readFileSync(new URL('../../canvas2/Overlays.jsx', import.meta.url), 'utf8')
  const dim = readFileSync(new URL('../../canvas2/DimensionLabels.jsx', import.meta.url), 'utf8')
  const scene = readFileSync(new URL('../../canvas2/useCanvasInteraction.js', import.meta.url), 'utf8')
  const fed = (comp) => new RegExp(`<${comp}\\b[^>]*\\bobjects=\\{pObjects\\}`).test(src)

  it('O-wire: pObjects is the store objects with the live drag offset applied', () => {
    expect(src).toMatch(/const preview = useDragPreview\(\)/)
    expect(src).toMatch(/const pObjects = useMemo\(\(\) => previewObjects\(objects, preview\)/)
  })
  for (const comp of ['AisleLabel', 'BlockedFaceMarks', 'UprightConflictMarks', 'OversizedBayMarks']) {
    it(`O-wire: ${comp} is drawn from pObjects`, () => expect(fed(comp)).toBe(true))
  }
  it('O-wire: the clearance labels re-run the aisle check on the previewed layout', () => {
    expect(dim).toMatch(/const objs = previewObjects\(objects \|\| \[\], preview\)/)
  })
  it('O-wire: column markers ride the drag directly (their obj: node is moved) and the drag publishes the preview', () => {
    expect(scene).toMatch(/CHROME_NODE_PREFIXES = \[[^\]]*'obj:'/)
    expect(scene).toMatch(/setDragPreview\(d\.movedIds, dx, dy\)/)
  })
})
