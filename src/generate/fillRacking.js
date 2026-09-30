// fillRacking.js — "Fill racking": fill a dragged box of a building with
// racking, using the generator's own walks (sizingLayout.js rowBands /
// rowSegments) — tight forklift aisles, columns seated in flues or faces
// (never straddled), cross-aisles by the max rack run, wall clearance.
//
// The box is clipped to the building's REAL outline (L, T, U, cross — any
// rectilinear shape), and existing racks are taken out of it. What is left is
// cut into rectangles along the run axis (strips with the same stack extent
// merged back together), and each rectangle is filled on its own:
//   - a side on a WALL gets the wall clearance, and the row against it is a
//     single — any wall, including the inside corner of an L;
//   - a side on OPEN floor (the box edge, an existing rack) leaves a full
//     forklift aisle, so two filled areas never meet rack to rack;
//   - where the region carries on into another of its rectangles (the elbow
//     of an L), each side leaves half a cross-aisle.
// A rectangle building filled wall to wall is one rectangle with four walls:
// exactly Generate's calls, so exactly Generate's rows.
//
// Rows get section and row stamps like Generate (genSection, rowIndex), new
// numbers after any already in the building, so "Copy to other sections",
// "Match bays" and Check layout work on a filled area.
//
// Pure: objects in, planned objects out. No store, no React.

import { rowBands, rowSegments, layoutSpec } from './sizingLayout'
import { placementToObject, aisleObjectsForRacks, parentGenerated } from './traceGenerate'
import { rackFootprint, expandColumnGrid } from './columnCheck'
import { layerForType } from '../utils/layers'
import { getRackCapacity } from '../utils/capacity'
import { DEFAULT_RULES } from '../rules/defaults'
import { nanoid } from 'nanoid'

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const EPS = 1e-6
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')

/** The Racking settings a fill uses (the Generate panel's own, same defaults). */
export const DEFAULT_FILL_SETTINGS = {
  orientation: 'horizontal', beamIn: 96, palletWIn: 40, palletDIn: 48,
  mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, wallClearanceIn: 6, levels: 4,
}

/** The building's outline as world px points (its drawn walls' outer line). */
export function buildingOutline(fp) {
  if (Array.isArray(fp.fpVerts) && fp.fpVerts.length >= 4) return fp.fpVerts.map(v => ({ x: v.x, y: v.y }))
  return [{ x: fp.x, y: fp.y }, { x: fp.x + fp.width, y: fp.y }, { x: fp.x + fp.width, y: fp.y + fp.height }, { x: fp.x, y: fp.y + fp.height }]
}

/** The building a box belongs to: the one containing its centre, else the one it overlaps most. */
export function buildingForBox(objects, box) {
  const fps = objects.filter(o => FP.has(o.type))
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const inside = fps.filter(f => pointInPolygon(cx, cy, buildingOutline(f)))
  if (inside.length) return inside[inside.length - 1]
  let best = null, area = 0
  for (const f of fps) {
    const a = Math.max(0, Math.min(box.x + box.w, f.x + f.width) - Math.max(box.x, f.x)) * Math.max(0, Math.min(box.y + box.h, f.y + f.height) - Math.max(box.y, f.y))
    if (a > area) { area = a; best = f }
  }
  return best
}

function pointInPolygon(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The column lines along one axis (feet), from the building's column grids. */
function columnLines(grids, axis, gridSize) {
  const vals = new Set()
  for (const g of grids) for (const c of expandColumnGrid(g, gridSize)) vals.add(Math.round((axis === 'x' ? c.x + c.w / 2 : c.y + c.h / 2) / gridSize * 1e6) / 1e6)
  return [...vals].sort((a, b) => a - b)
}
/** The grid a 1D walk reads, relative to \`originFt\`: { pitch, offset, max } (pitch 0: no columns). */
function walkGrid(lines, originFt, lengthFt) {
  const rel = lines.map(v => v - originFt).filter(v => v >= -EPS && v <= lengthFt + EPS)
  if (lines.length < 2 || !rel.length) return { pitch: 0, offset: 0, max: lengthFt }
  const pitch = lines[1] - lines[0]
  return { pitch, offset: Math.max(0, rel[0]), max: rel[rel.length - 1] }
}

/** The region to fill, as rectangles in (run, stack) feet with each side's
 *  kind: 'wall' | 'open' (box edge, an existing rack) | 'join' (the region
 *  carries on into another rectangle). Horizontal: run = x, stack = y. */
export function fillRects(objects, fp, boxPx, { orientation = 'horizontal', gridSize = 40 } = {}) {
  const vert = orientation === 'vertical'
  const ft = (v) => v / gridSize
  const rs = (p) => (vert ? { r: ft(p.y), s: ft(p.x) } : { r: ft(p.x), s: ft(p.y) })
  const poly = buildingOutline(fp).map(rs)
  const b0 = rs({ x: boxPx.x, y: boxPx.y }), b1 = rs({ x: boxPx.x + boxPx.w, y: boxPx.y + boxPx.h })
  const box = { r0: Math.min(b0.r, b1.r), r1: Math.max(b0.r, b1.r), s0: Math.min(b0.s, b1.s), s1: Math.max(b0.s, b1.s) }
  // existing racks, as (run, stack) rects
  const obstacles = objects.filter(isRack).map(o => {
    const f = rackFootprint(o), a = rs({ x: f.x, y: f.y }), c = rs({ x: f.x + f.w, y: f.y + f.h })
    return { r0: Math.min(a.r, c.r), r1: Math.max(a.r, c.r), s0: Math.min(a.s, c.s), s1: Math.max(a.s, c.s) }
  }).filter(o => o.r1 > box.r0 + EPS && o.r0 < box.r1 - EPS && o.s1 > box.s0 + EPS && o.s0 < box.s1 - EPS)

  // the outline's stack extent at a run position: [[s, s], ...] (even-odd over the run-parallel edges)
  const crossings = (r) => {
    const out = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length]
      if (Math.abs(a.s - c.s) > EPS) continue                       // not parallel to the run
      if (r > Math.min(a.r, c.r) + EPS && r < Math.max(a.r, c.r) - EPS) out.push(a.s)
    }
    out.sort((p, q) => p - q)
    const iv = []
    for (let i = 0; i + 1 < out.length; i += 2) iv.push([out[i], out[i + 1]])
    return iv
  }
  const cuts = [...new Set([box.r0, box.r1, ...poly.map(p => p.r), ...obstacles.flatMap(o => [o.r0, o.r1])]
    .filter(r => r >= box.r0 - EPS && r <= box.r1 + EPS).map(r => Math.round(r * 1e6) / 1e6))].sort((p, q) => p - q)

  // each strip's intervals, their ends' kinds
  const strips = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const ra = cuts[i], rb = cuts[i + 1]
    if (rb - ra < EPS) continue
    const rm = (ra + rb) / 2
    let ivs = crossings(rm).map(([a, c]) => {
      const lo = Math.max(a, box.s0), hi = Math.min(c, box.s1)
      return hi - lo > EPS ? { s0: lo, s1: hi, k0: lo > a + EPS ? 'open' : 'wall', k1: hi < c - EPS ? 'open' : 'wall' } : null
    }).filter(Boolean)
    for (const o of obstacles) {
      if (!(o.r0 <= ra + EPS && o.r1 >= rb - EPS)) continue
      ivs = ivs.flatMap(v => {
        if (o.s1 <= v.s0 + EPS || o.s0 >= v.s1 - EPS) return [v]
        const out = []
        if (o.s0 > v.s0 + EPS) out.push({ s0: v.s0, s1: o.s0, k0: v.k0, k1: 'open' })
        if (o.s1 < v.s1 - EPS) out.push({ s0: o.s1, s1: v.s1, k0: 'open', k1: v.k1 })
        return out
      })
    }
    strips.push({ ra, rb, ivs })
  }
  // merge strips with the same interval into longer rectangles
  const rects = []
  let open = []
  for (const st of strips) {
    const next = []
    for (const v of st.ivs) {
      const same = open.find(o => Math.abs(o.r1 - st.ra) < EPS && Math.abs(o.s0 - v.s0) < EPS && Math.abs(o.s1 - v.s1) < EPS && o.k0 === v.k0 && o.k1 === v.k1)
      if (same) { same.r1 = st.rb; next.push(same) } else { const n = { r0: st.ra, r1: st.rb, ...v }; rects.push(n); next.push(n) }
    }
    open = next
  }
  // the run ends' kinds: a wall when the building stops there for the whole side; open floor
  // past the box, or an existing rack on ANY part of the side (a forklift aisle off it); the
  // region carrying on (inside the box, no rack there) is a join
  const rackOnSide = (r, s0, s1) => obstacles.some(o => r > o.r0 - EPS && r < o.r1 + EPS && o.s1 > s0 + EPS && o.s0 < s1 - EPS)
  const endKind = (r, s0, s1) => {
    const iv = crossings(r).filter(([a, c]) => Math.min(c, s1) - Math.max(a, s0) > EPS)
    if (!iv.length) return 'wall'
    if (r < box.r0 - EPS || r > box.r1 + EPS) return 'open'
    return rackOnSide(r, s0, s1) ? 'open' : 'join'
  }
  for (const q of rects) {
    q.e0 = endKind(q.r0 - 1e-3, q.s0, q.s1)
    q.e1 = endKind(q.r1 + 1e-3, q.s0, q.s1)
  }
  return { rects, vert }
}

/** Plan a fill of \`boxPx\` (world px) with \`settings\`: the new racks and
 *  aisles (world px, stamped, parented to the building), how many rows and
 *  pallet positions, and the rectangles it used. */
export function planFill(objects, boxPx, settings = {}, { gridSize = 40, rules = DEFAULT_RULES, newId = nanoid } = {}) {
  const set = { ...DEFAULT_FILL_SETTINGS, ...settings }
  const fp = buildingForBox(objects, boxPx)
  const empty = { fp: null, racks: [], aisles: [], rows: 0, positions: 0, rects: [] }
  if (!fp || !(boxPx.w > 0) || !(boxPx.h > 0)) return empty
  const mhe = rules.mhe?.[set.mhe] || {}
  const aisleFt = set.aisleFt ?? mhe.aisleFt ?? 10.5
  const travelFt = Math.min(mhe.travelFt ?? 8, aisleFt)
  const crossAisleFt = mhe.crossAisleFt ?? aisleFt
  const spec = layoutSpec({ beamIn: set.beamIn, palletWIn: set.palletWIn, palletDIn: set.palletDIn, wallClearanceIn: set.wallClearanceIn }, rules)
  const { beamIn, depthIn, upIn, flueIn, palletWIn, endClearFt } = spec
  const rackType = 'rack_double_row'
  const colSizeIn = 12

  const { rects, vert } = fillRects(objects, fp, boxPx, { orientation: set.orientation, gridSize })
  const grids = objects.filter(o => o.type === 'column_grid' && (!o.parentId || o.parentId === fp.id))
  const runLines = columnLines(grids, vert ? 'y' : 'x', gridSize)
  const stackLines = columnLines(grids, vert ? 'x' : 'y', gridSize)

  // new stamps come after any the building already has
  const inBuilding = objects.filter(o => isRack(o) && o.parentId === fp.id)
  let rowBase = Math.max(0, ...inBuilding.map(o => o.rowIndex || 0))
  let secBase = Math.max(0, ...inBuilding.map(o => o.genSection || 0))

  const sideClear = (kind) => (kind === 'wall' ? endClearFt : kind === 'join' ? crossAisleFt / 2 : aisleFt)
  const placements = []
  let rows = 0
  for (const q of rects) {
    const W = q.s1 - q.s0, L = q.r1 - q.r0
    // stack: both walls → exactly Generate's call; otherwise each side's own clearance
    const allWallS = q.k0 === 'wall' && q.k1 === 'wall'
    const sLo = allWallS ? 0 : sideClear(q.k0), sHi = allWallS ? 0 : sideClear(q.k1)
    const sg = walkGrid(stackLines, q.s0 + sLo, W - sLo - sHi)
    const bands = rowBands(W - sLo - sHi, { rackType, depthIn, aisleFt, flueIn, gridYFt: sg.pitch, travelFt, gridOffsetFt: sg.offset, gridMaxFt: sg.max, colSizeIn, wallClearFt: allWallS ? endClearFt : 0 })
    const allWallR = q.e0 === 'wall' && q.e1 === 'wall'
    const rLo = allWallR ? 0 : sideClear(q.e0), rHi = allWallR ? 0 : sideClear(q.e1)
    const rg = walkGrid(runLines, q.r0 + rLo, L - rLo - rHi)
    const { segments, bays } = rowSegments(L - rLo - rHi, { crossAisleFt, endClearFt: allWallR ? endClearFt : 0, beamIn, upIn, runGridFt: rg.pitch, runGridOffsetFt: rg.offset, runGridMaxFt: rg.max, maxRunFt: set.maxRunFt })
    if (!bands.length || !segments.length || bays <= 0) continue
    bands.forEach((band, bi) => {
      segments.forEach((seg, si) => {
        const runLen = (upIn * (seg.bays + 1) + seg.bays * beamIn) / 12
        const sPos = q.s0 + sLo + band.yFt, rPos = q.r0 + rLo + seg.xFt
        const at = vert
          ? { xFt: sPos + band.depthFt / 2 - runLen / 2, yFt: rPos + runLen / 2 - band.depthFt / 2, angle: 90 }
          : { xFt: rPos, yFt: sPos, angle: 0 }
        placements.push({
          type: band.type, ...at,
          bays: seg.bays, beamIn, depthIn, flueIn: band.flueIn ?? flueIn, flueBaseIn: flueIn, levels: set.levels, palletWIn,
          palletDIn: spec.palletDIn, uprightWidthIn: upIn,
          rowIndex: rowBase + bi + 1, genSection: secBase + si + 1,
        })
      })
    })
    rows += bands.length
    rowBase += bands.length
    secBase += segments.length
  }
  // ids first: the aisles between the new rows refer to them
  const racks = placements.map(p => ({ ...placementToObject(p), id: newId() }))
  // the aisles get ids here too: the fill goes into the store in one write, not through addObject
  const aisles = aisleObjectsForRacks(racks).map(o => ({ ...o, id: o.id || newId() }))
  const withParent = parentGenerated([...racks, ...aisles], fp.id).map(o => ({ ...o, layerId: layerForType(o.type) }))
  const positions = racks.reduce((t, o) => t + (getRackCapacity(o)?.total || 0), 0)
  return { fp, racks: withParent.filter(isRack), aisles: withParent.filter(o => o.type === 'aisle'), rows, positions, rects }
}
