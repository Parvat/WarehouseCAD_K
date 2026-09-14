import { describe, it, expect } from 'vitest'
import {
  visibleHandles, usesEndpointHandles, showsRotateHandle, handleLayout,
  arcControlPoint, wallDims, aisleDim, conflictMarkStyle, splitMarks, OVERLAY,
} from '../render/overlayOps'
import { HANDLES } from '../utils/canvas'

const GS = 40
const box = { id: 'b1', type: 'rect', x: 100, y: 200, width: 160, height: 80 }
const rack = { ...box, id: 'r1', type: 'rack_row', beams: [96, 96], uprightWidth: 3 }

describe('overlayOps — which handles a type offers', () => {
  it('gives an ordinary rect all eight', () => {
    expect(visibleHandles(box).sort()).toEqual([...HANDLES].sort())
  })

  /* A beam rack's width is a function of its bay list, so dragging a corner
     would silently do nothing — only the two ends mean anything. */
  it('gives a beam rack only its two ends', () => {
    for (const t of ['rack_row', 'rack_double_row', 'rack_cantilever']) {
      expect(visibleHandles({ ...box, type: t })).toEqual(['ml', 'mr'])
    }
  })

  it('drops the top-centre handle on lane racks', () => {
    for (const t of ['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow']) {
      const hs = visibleHandles({ ...box, type: t })
      expect(hs).not.toContain('tc')
      expect(hs).toHaveLength(HANDLES.length - 1)
    }
  })

  it('gives an aisle none at all', () => {
    expect(visibleHandles({ ...box, type: 'aisle' })).toEqual([])
  })

  it('never invents a handle name the resize code does not know', () => {
    for (const t of ['rect', 'rack_row', 'rack_drive_in', 'circle']) {
      for (const h of visibleHandles({ ...box, type: t })) expect(HANDLES).toContain(h)
    }
  })
})

describe('overlayOps — endpoint vs box families', () => {
  it('treats line geometry as endpoints, not a bounding box', () => {
    for (const t of ['line', 'arc', 'annot_dimension', 'annot_dashed_line']) {
      expect(usesEndpointHandles({ type: t })).toBe(true)
    }
    expect(usesEndpointHandles(box)).toBe(false)
  })

  it('hides the rotate handle wherever the SVG hides it', () => {
    for (const t of ['aisle', 'annot_scale_bar', 'annot_dimension', 'annot_draw_line']) {
      expect(showsRotateHandle({ ...box, type: t })).toBe(false)
    }
    expect(showsRotateHandle({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 })).toBe(false)
    expect(showsRotateHandle(box)).toBe(true)
  })
})

describe('overlayOps — handle layout', () => {
  it('leaves text to the SVG editing frame', () => {
    expect(handleLayout({ ...box, type: 'text' }, 1).kind).toBe('text')
  })

  it('gives a floor plan the rotate handle and nothing else', () => {
    const L = handleLayout({ ...box, type: 'fp_rect' }, 1)
    expect(L.kind).toBe('fp')
    expect(L.rotate).toBeTruthy()
    expect(L.handles).toBeUndefined()
  })

  it('pads the dotted frame 6 world px on every side, matching the handles', () => {
    const L = handleLayout(box, 1)
    expect(L.kind).toBe('box')
    expect(L.box).toMatchObject({ x: box.x - 6, y: box.y - 6,
                                  w: box.width + 12, h: box.height + 12 })
    // corner handle centres sit on the frame's corners
    const tl = L.handles.find(h => h.key === 'tl')
    expect([tl.x, tl.y]).toEqual([L.box.x, L.box.y])
  })

  it('sizes handles in SCREEN px — twice the zoom, half the world size', () => {
    expect(handleLayout(box, 1).hs).toBeCloseTo(6, 6)
    expect(handleLayout(box, 2).hs).toBeCloseTo(3, 6)
    expect(handleLayout(box, 0.5).hs).toBeCloseTo(12, 6)
  })

  it('keeps the rotate handle a constant distance above the object on screen', () => {
    const at = z => {
      const L = handleLayout(box, z)
      return (box.y - L.rotate.y) * z          // world gap x zoom = screen gap
    }
    expect(at(1)).toBeCloseTo(70, 6)
    expect(at(0.25)).toBeCloseTo(70, 6)
    expect(at(4)).toBeCloseTo(70, 6)
  })

  it('offers only the two ends on a beam rack, and still rotates', () => {
    const L = handleLayout(rack, 1)
    expect(L.handles.map(h => h.key)).toEqual(['ml', 'mr'])
    expect(L.rotate).toBeTruthy()
  })

  it('gives an aisle no frame and no handles', () => {
    const L = handleLayout({ ...box, type: 'aisle' }, 1)
    expect(L.box).toBeNull()
    expect(L.handles).toEqual([])
    expect(L.rotate).toBeNull()
  })

  it('puts endpoint squares on the endpoints, with a bend control only for arcs', () => {
    const line = { type: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }
    const L = handleLayout(line, 1)
    expect(L.kind).toBe('endpoints')
    expect(L.points.map(p => [p.x, p.y])).toEqual([[0, 0], [40, 0]])
    expect(L.arcCtrl).toBeNull()
    expect(handleLayout({ ...line, type: 'arc', bend: 0.5 }, 1).arcCtrl).toBeTruthy()
  })

  it('returns nothing without an object or a zoom', () => {
    expect(handleLayout(null, 1)).toBeNull()
    expect(handleLayout(box, 0)).toBeNull()
  })
})

describe('overlayOps — arc bend control', () => {
  it('sits on the midpoint when there is no bend', () => {
    const p = arcControlPoint({ x1: 0, y1: 0, x2: 100, y2: 0, bend: 0 })
    expect([p.x, p.y]).toEqual([50, 0])
  })

  it('pushes off the segment normal in proportion to the bend', () => {
    const p = arcControlPoint({ x1: 0, y1: 0, x2: 100, y2: 0, bend: 0.5 })
    expect(p.x).toBeCloseTo(50, 6)
    expect(Math.abs(p.y)).toBeCloseTo(50, 6)
  })
})

describe('overlayOps — dimension labels', () => {
  const fp = {
    id: 'f1', type: 'fp_rect', x: 0, y: 0, width: 400, height: 240,
    wallThicknessFt: 1,
  }

  it('produces one dimension per wall segment, each with a measurement', () => {
    const segs = wallDims(fp, { zoom: 1, gridSize: GS })
    expect(segs.length).toBeGreaterThanOrEqual(4)
    for (const s of segs) {
      expect(s.label).toBeTruthy()
      expect(s.head1).toHaveLength(3)      // arrowheads are triangles
      expect(s.head2).toHaveLength(3)
    }
  })

  it('offsets every dimension line OUTSIDE the building, never across it', () => {
    const segs = wallDims(fp, { zoom: 1, gridSize: GS })
    const cx = fp.x + fp.width / 2, cy = fp.y + fp.height / 2
    for (const s of segs) {
      const inside = s.mid.x > fp.x && s.mid.x < fp.x + fp.width &&
                     s.mid.y > fp.y && s.mid.y < fp.y + fp.height
      expect(inside).toBe(false)
      // and it is further from the centre than the wall it measures
      expect(Math.hypot(s.mid.x - cx, s.mid.y - cy)).toBeGreaterThan(0)
    }
  })

  it('marks only the active wall, and in the accent colour', () => {
    const segs = wallDims(fp, { zoom: 1, gridSize: GS, activeWallIdx: 1 })
    expect(segs.filter(s => s.active)).toHaveLength(1)
    expect(segs[1].color).toBe(OVERLAY.accent)
    expect(segs[0].color).toBe(OVERLAY.edge)
  })

  it('is empty for anything that is not a floor plan', () => {
    expect(wallDims(box, { zoom: 1, gridSize: GS })).toEqual([])
    expect(wallDims(null, {})).toEqual([])
  })

  it('scales its text with zoom so the pill stays a constant size on screen', () => {
    const a = wallDims(fp, { zoom: 1, gridSize: GS })[0]
    const b = wallDims(fp, { zoom: 2, gridSize: GS })[0]
    expect(b.pill.fontSize).toBeCloseTo(a.pill.fontSize / 2, 6)
  })
})

describe('overlayOps — aisle dimensions', () => {
  const r1 = { id: 'a', type: 'rack_row', x: 0,   y: 0,   width: 400, height: 40 }
  const r2 = { id: 'b', type: 'rack_row', x: 0,   y: 200, width: 400, height: 40 }
  const aisle = { id: 'ai', type: 'aisle', row1Id: 'a', row2Id: 'b', label: 'A1' }

  it('measures the gap between the two rows', () => {
    const D = aisleDim(aisle, [r1, r2], { zoom: 1, gridSize: GS })
    expect(D.horiz).toBe(true)
    expect(D.width).toBe(160)              // 200 - (0 + 40)
    expect(D.text).toContain('A1')
  })

  it('centres the label in the gap', () => {
    const D = aisleDim(aisle, [r1, r2], { zoom: 1, gridSize: GS })
    expect(D.mid).toBe(120)                // 40 + 160/2
  })

  it('repeats the label along longer aisles', () => {
    const D = aisleDim(aisle, [r1, r2], { zoom: 1, gridSize: GS })
    expect(D.positions.length).toBeGreaterThanOrEqual(1)
    const longer = aisleDim(aisle,
      [{ ...r1, width: 4000 }, { ...r2, width: 4000 }], { zoom: 1, gridSize: GS })
    expect(longer.positions.length).toBeGreaterThan(D.positions.length)
  })

  it('detects a vertical aisle too', () => {
    const v1 = { id: 'a', type: 'rack_row', x: 0,   y: 0, width: 40, height: 400 }
    const v2 = { id: 'b', type: 'rack_row', x: 200, y: 0, width: 40, height: 400 }
    expect(aisleDim(aisle, [v1, v2], { zoom: 1, gridSize: GS }).horiz).toBe(false)
  })

  it('returns nothing when a row is missing or the rows overlap', () => {
    expect(aisleDim(aisle, [r1], { zoom: 1, gridSize: GS })).toBeNull()
    expect(aisleDim(aisle, [r1, { ...r2, y: 10 }], { zoom: 1, gridSize: GS })).toBeNull()
  })
})

describe('overlayOps — conflict marks', () => {
  it('keeps the hatch a constant density on screen', () => {
    expect(conflictMarkStyle(1).tile).toBeCloseTo(9, 6)
    expect(conflictMarkStyle(3).tile).toBeCloseTo(3, 6)
  })

  it('uses the locked conflict red, not a UI alert colour', () => {
    expect(conflictMarkStyle(1).color).toBe('#C0392B')
  })

  it('separates a blocked aisle from a column inside a rack', () => {
    const { blocked, hatched } = splitMarks([
      { kind: 'aisle-blocked', x: 0, y: 0, w: 1, h: 1 },
      { kind: 'rack-conflict', x: 2, y: 2, w: 1, h: 1 },
      { x: 3, y: 3, w: 1, h: 1 },
    ])
    expect(blocked).toHaveLength(1)
    expect(hatched).toHaveLength(2)       // anything not aisle-blocked hatches
  })

  it('handles no marks at all', () => {
    expect(splitMarks()).toEqual({ blocked: [], hatched: [] })
  })
})
