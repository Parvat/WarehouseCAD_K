// fillRacking.js — "Fill racking": fill a dragged box of a building with
// racking, using the generator's own walks (sizingLayout.js rowBands /
// rowSegments) — tight forklift aisles, columns seated in flues or faces
// (never straddled), cross-aisles by the max rack run.
//
// The box IS the racking area, and the area is a WINDOW on a fixed PATTERN:
//   - areaPattern: computed once from the edges the drag started at — the row
//     sequence across (the first row single, an aisle, back-to-back pairs,
//     aisles …), the bay grid and cross-aisles along the rows. The rows are ONE
//     regular walk (rowBands) from the start edge of the first box (clipped to
//     the building's REAL inner wall face — L, T, U, cross, any rectilinear
//     shape — and kept an aisle off existing racks) on past the building: every
//     aisle the forklift aisle, none widened to sit a row flush on the far edge
//     (what is left there stays empty). The start edge's single is half of a
//     pair whose other half lies behind it, and the walk carries on that way too.
//   - patternFill: the racks the box shows — the pattern clipped to it (whole
//     bays, rows wholly inside). A pair an edge cuts so only one half fits shows
//     that half as a single row; no row is ever added at an edge. Walls and
//     ZONES (office, staging, washroom, custom area — any `zone_*`) clip it the
//     same way; existing racks are obstacles with a forklift aisle kept off
//     them (never overlapped, never moved). Last, no pick face without an aisle:
//     a pair with one face against a wall or a zone loses that face's bays
//     along that stretch (single there, back-to-back elsewhere; faceReach.js).
// So a box resized and resized back shows exactly the racks it had, and an
// extended box carries the same rows on (generate/rackingArea.js).
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
import { buildingOutline, innerOutline } from '../utils/floorGeom'
import { dropUnreachableFaces } from './faceReach'
import { getRackCapacity } from '../utils/capacity'
import { DEFAULT_RULES } from '../rules/defaults'
import { nanoid } from 'nanoid'

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const EPS = 1e-6
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
export { buildingOutline, innerOutline }
export const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_')

/** The Racking settings a fill uses (the Generate panel's own, same defaults). */
export const DEFAULT_FILL_SETTINGS = {
  orientation: 'horizontal', beamIn: 96, palletWIn: 40, palletDIn: 48,
  mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, wallClearanceIn: 6, levels: 4,
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
/** The grid a 1D walk reads, from `originFt` going `dir` (+1 up, -1 down):
 *  { pitch, offset, max } (pitch 0: no columns). */
function walkGrid(lines, originFt, lengthFt, dir = 1) {
  const rel = lines.map(v => dir * (v - originFt)).filter(v => v >= -EPS && v <= lengthFt + EPS).sort((a, b) => a - b)
  if (lines.length < 2 || !rel.length) return { pitch: 0, offset: 0, max: lengthFt }
  const pitch = Math.abs(lines[1] - lines[0])
  return { pitch, offset: Math.max(0, rel[0]), max: rel[rel.length - 1] }
}

/** The region to fill, as rectangles in (run, stack) feet with each side's
 *  kind: 'wall' (a wall, or a zone's edge) | 'open' (the box edge) | 'rack'
 *  (an existing rack) | 'join' (the region carries on into another
 *  rectangle). Horizontal: run = x, stack = y. */
export function fillRects(objects, fp, boxPx, { orientation = 'horizontal', gridSize = 40 } = {}) {
  const vert = orientation === 'vertical'
  const ft = (v) => v / gridSize
  const rs = (p) => (vert ? { r: ft(p.y), s: ft(p.x) } : { r: ft(p.x), s: ft(p.y) })
  const poly = innerOutline(fp, gridSize).map(rs)
  const b0 = rs({ x: boxPx.x, y: boxPx.y }), b1 = rs({ x: boxPx.x + boxPx.w, y: boxPx.y + boxPx.h })
  const box = { r0: Math.min(b0.r, b1.r), r1: Math.max(b0.r, b1.r), s0: Math.min(b0.s, b1.s), s1: Math.max(b0.s, b1.s) }
  // existing racks in the box or touching it, as (run, stack) rects
  const obstacles = objects.filter(isRack).map(o => {
    const f = rackFootprint(o), a = rs({ x: f.x, y: f.y }), c = rs({ x: f.x + f.w, y: f.y + f.h })
    return { r0: Math.min(a.r, c.r), r1: Math.max(a.r, c.r), s0: Math.min(a.s, c.s), s1: Math.max(a.s, c.s) }
  }).filter(o => o.r1 > box.r0 - EPS && o.r0 < box.r1 + EPS && o.s1 > box.s0 - EPS && o.s0 < box.s1 + EPS)
  // the ones inside the box cut the region; the ones only touching it just mark the side they touch
  const cutting = obstacles.filter(o => o.r1 > box.r0 + EPS && o.r0 < box.r1 - EPS && o.s1 > box.s0 + EPS && o.s0 < box.s1 - EPS)
  // zones in the box or touching it: holes with wall edges
  const zones = objects.filter(isZone).map(o => {
    const a = rs({ x: o.x, y: o.y }), c = rs({ x: o.x + o.width, y: o.y + o.height })
    return { r0: Math.min(a.r, c.r), r1: Math.max(a.r, c.r), s0: Math.min(a.s, c.s), s1: Math.max(a.s, c.s) }
  }).filter(o => o.r1 > box.r0 - EPS && o.r0 < box.r1 + EPS && o.s1 > box.s0 - EPS && o.s0 < box.s1 + EPS)

  // the inner outline's stack extent at a run position: [[s, s], ...] (even-odd over the run-parallel edges)
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
  // near-equal cuts merged, never moved: a cut is a wall, rack or zone edge, and rounding it would
  // shift that edge (an aisle laid off it would come out a hair under width)
  const cuts = [box.r0, box.r1, ...poly.map(p => p.r), ...cutting.flatMap(o => [o.r0, o.r1]), ...zones.flatMap(o => [o.r0, o.r1])]
    .filter(r => r >= box.r0 - EPS && r <= box.r1 + EPS).sort((p, q) => p - q)
    .filter((r, i, all) => i === 0 || r - all[i - 1] > 1e-7)

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
    // a zone across the strip: a hole, its edges walls
    for (const z of zones) {
      if (!(z.r0 < rm && z.r1 > rm)) continue
      ivs = ivs.flatMap(v => {
        if (z.s1 <= v.s0 + EPS || z.s0 >= v.s1 - EPS) return [v]
        const out = []
        if (z.s0 > v.s0 + EPS) out.push({ s0: v.s0, s1: z.s0, k0: v.k0, k1: 'wall' })
        if (z.s1 < v.s1 - EPS) out.push({ s0: z.s1, s1: v.s1, k0: 'wall', k1: v.k1 })
        return out
      })
    }
    for (const o of cutting) {
      if (!(o.r0 < rm && o.r1 > rm)) continue
      ivs = ivs.flatMap(v => {
        if (o.s1 <= v.s0 + EPS || o.s0 >= v.s1 - EPS) return [v]
        const out = []
        if (o.s0 > v.s0 + EPS) out.push({ s0: v.s0, s1: o.s0, k0: v.k0, k1: 'rack' })
        if (o.s1 < v.s1 - EPS) out.push({ s0: o.s1, s1: v.s1, k0: 'rack', k1: v.k1 })
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
  // a stack side with an existing rack on ANY part of it (touching or cut by it): an aisle off it
  const rackAlong = (q, sv) => obstacles.some(o => o.r1 > q.r0 + EPS && o.r0 < q.r1 - EPS && o.s0 <= sv + EPS && o.s1 >= sv - EPS)
  for (const q of rects) {
    if (q.k0 === 'open' && rackAlong(q, q.s0)) q.k0 = 'rack'
    if (q.k1 === 'open' && rackAlong(q, q.s1)) q.k1 = 'rack'
  }
  // the run ends' kinds: a wall when the building (or a zone) stops the floor there for the
  // whole side; an existing rack on ANY part of the side; the box edge (open floor past it);
  // else the region carries on
  const rackOnSide = (r, s0, s1) => obstacles.some(o => r > o.r0 - EPS && r < o.r1 + EPS && o.s1 > s0 + EPS && o.s0 < s1 - EPS)
  const floorAt = (r, s0, s1) => {
    let iv = crossings(r).map(([a, c]) => [Math.max(a, s0), Math.min(c, s1)]).filter(([a, c]) => c - a > EPS)
    for (const z of zones) {
      if (!(r > z.r0 - EPS && r < z.r1 + EPS)) continue
      iv = iv.flatMap(([a, c]) => [[a, Math.min(c, z.s0)], [Math.max(a, z.s1), c]].filter(([p, q]) => q - p > EPS))
    }
    return iv
  }
  const endKind = (r, s0, s1) => {
    if (!floorAt(r, s0, s1).length) return 'wall'
    if (rackOnSide(r, s0, s1)) return 'rack'
    if (r < box.r0 - EPS || r > box.r1 + EPS) return 'open'
    return 'join'
  }
  for (const q of rects) {
    q.e0 = endKind(q.r0 - 1e-3, q.s0, q.s1)
    q.e1 = endKind(q.r1 + 1e-3, q.s0, q.s1)
  }
  return { rects, vert }
}

/** The racking parameters a fill uses, from its settings and the rules. */
function fillParams(settings, rules) {
  const set = { ...DEFAULT_FILL_SETTINGS, ...settings }
  const mhe = rules.mhe?.[set.mhe] || {}
  const aisleFt = set.aisleFt ?? mhe.aisleFt ?? 10.5
  const spec = layoutSpec({ beamIn: set.beamIn, palletWIn: set.palletWIn, palletDIn: set.palletDIn }, rules)
  return { set, aisleFt, travelFt: Math.min(mhe.travelFt ?? 8, aisleFt), crossAisleFt: mhe.crossAisleFt ?? aisleFt, ...spec }
}
/** World px ↔ (run, stack) feet. Horizontal: run = x, stack = y. */
const rsOf = (vert, gridSize) => (p) => (vert ? { r: p.y / gridSize, s: p.x / gridSize } : { r: p.x / gridSize, s: p.y / gridSize })
const rsRect = (vert, gridSize, b) => {
  const rs = rsOf(vert, gridSize), a = rs({ x: b.x, y: b.y }), c = rs({ x: b.x + b.w, y: b.y + b.h })
  return { r0: Math.min(a.r, c.r), r1: Math.max(a.r, c.r), s0: Math.min(a.s, c.s), s1: Math.max(a.s, c.s) }
}
/** Feet of floor kept past the building's extent either way, so a pattern still
 *  covers the floor when its area is extended right up to the far wall. */
const PATTERN_MARGIN_FT = 200

/** A racking area's PATTERN: computed once, when the area is first filled (and
 *  again when its settings change), from the edges the drag started at. It
 *  reaches past the building both ways, and the area's box is a window on it
 *  (patternFill): every fill, extend and shrink shows the same racks.
 *
 *  In feet along the area's (run, stack) axes, absolute:
 *    - `units`: the rows across — { s0, d, type, flueIn, row }. The walk is
 *      Generate's own (rowBands, columns included), one regular walk from the
 *      first box's start edge on past the building — aisle, pair, aisle …,
 *      every aisle the forklift aisle; the first box's far edge is not special.
 *      The start edge's row is a single there, in the pattern one half of a
 *      back-to-back pair whose other half lies behind the edge, and the walk
 *      carries on that way too.
 *    - `pieces`: the runs along a row — { r0, n, sec } (n bays of beamIn on
 *      upIn uprights), rowSegments' own walk over the first box with its
 *      cross-aisles; past it the end runs carry on bay by bay up to the max
 *      rack run, then a cross-aisle and whole max-length runs.
 *  `row` / `sec` are the stamps (rowIndex / genSection) a rack there gets.
 *
 *  Returns { pattern, rects, fp }, or null when the box holds no row. */
export function areaPattern(objects, boxPx, settings = {}, { gridSize = 40, rules = DEFAULT_RULES, from = null, areaId = null } = {}) {
  const P = fillParams(settings, rules)
  const { set, aisleFt, travelFt, crossAisleFt, beamIn, depthIn, upIn, flueIn } = P
  const fp = buildingForBox(objects, boxPx)
  if (!fp || !(boxPx.w > 0) || !(boxPx.h > 0)) return null
  const rackType = 'rack_double_row', colSizeIn = 12
  const { rects, vert } = fillRects(objects, fp, boxPx, { orientation: set.orientation, gridSize })
  if (!rects.length) return null
  const grids = objects.filter(o => o.type === 'column_grid' && (!o.parentId || o.parentId === fp.id))
  const runLines = columnLines(grids, vert ? 'y' : 'x', gridSize)
  const stackLines = columnLines(grids, vert ? 'x' : 'y', gridSize)
  const box = rsRect(vert, gridSize, boxPx)
  const poly = innerOutline(fp, gridSize).map(rsOf(vert, gridSize))
  const pr0 = Math.min(...poly.map(p => p.r)) - PATTERN_MARGIN_FT, pr1 = Math.max(...poly.map(p => p.r)) + PATTERN_MARGIN_FT
  const ps0 = Math.min(...poly.map(p => p.s)) - PATTERN_MARGIN_FT, ps1 = Math.max(...poly.map(p => p.s)) + PATTERN_MARGIN_FT
  // the drag's start corner: the walks start on its side of each axis
  const start = from ? rsOf(vert, gridSize)(from) : null
  const flipR = !!start && start.r > (box.r0 + box.r1) / 2
  const flipS = !!start && start.s > (box.s0 + box.s1) / 2
  // new stamps come after any the building already has (not this area's own)
  const inBuilding = objects.filter(o => isRack(o) && o.parentId === fp.id && !(areaId && o.areaId === areaId))
  const rowBase = Math.max(0, ...inBuilding.map(o => o.rowIndex || 0))
  const secBase = Math.max(0, ...inBuilding.map(o => o.genSection || 0))

  // ── across the rows ──
  // the first box's extent: nothing kept clear at a wall or the box edge, an aisle off an existing rack
  const clear = (kind) => (kind === 'rack' ? aisleFt : 0)
  /* and an aisle off any existing rack facing a side across its run, touching it or not (a rack
     an earlier fill left short of the edge still needs its aisle): where a row can really start */
  const facing = objects.filter(o => isRack(o) && o.width > 0 && o.height > 0).map(o => { const f = rackFootprint(o); return rsRect(vert, gridSize, { x: f.x, y: f.y, w: f.w, h: f.h }) })
  const along = (q, o) => o.r1 > q.r0 + EPS && o.r0 < q.r1 - EPS
  const sideLo = (q) => Math.max(q.s0 + clear(q.k0), ...facing.filter(o => along(q, o) && o.s1 <= q.s0 + EPS && o.s1 + aisleFt > q.s0).map(o => o.s1 + aisleFt))
  const sideHi = (q) => Math.min(q.s1 - clear(q.k1), ...facing.filter(o => along(q, o) && o.s0 >= q.s1 - EPS && o.s0 - aisleFt < q.s1).map(o => o.s0 - aisleFt))
  const sLo = Math.min(...rects.map(sideLo)), sHi = Math.max(...rects.map(sideHi))
  const dirS = flipS ? -1 : 1, anchorS = flipS ? sHi : sLo
  const singleFt = depthIn / 12, flueFt = flueIn / 12, pairFt = (2 * depthIn + flueIn) / 12
  const bandsOver = (originS, len, dir) => {
    const sg = walkGrid(stackLines, originS, len, dir)
    return rowBands(len, { rackType, depthIn, aisleFt, flueIn, gridYFt: sg.pitch, travelFt, gridOffsetFt: sg.offset, gridMaxFt: sg.max, colSizeIn, wallClearFt: 0 })
  }
  if (!(sHi - sLo >= singleFt - 1e-9)) return null
  /* One walk from the start edge on past the building: a single there, then aisle, pair, aisle …
     every aisle the forklift aisle (wider only where a column forces it). The first box's far edge
     is not special: what is left there (less than a row and an aisle) stays empty, so extending
     past it carries the same regular rows on. */
  const toS = (t, d) => (dirS > 0 ? anchorS + t : anchorS - t - d)
  const stackLen = dirS > 0 ? ps1 - anchorS : anchorS - ps0
  const walkRows = bandsOver(anchorS, stackLen, dirS).map(b => ({ t: b.yFt, d: b.depthFt, type: b.type, flueIn: b.flueIn ?? flueIn }))
  // the start edge's single is half a pair: its other half lies behind the edge
  walkRows[0] = { t: walkRows[0].t - flueFt - singleFt, d: pairFt, type: rackType, flueIn }
  // behind the start edge, the same walk the other way from the inner face of the first pair's hidden half
  const backOrigin = -flueFt                                       // walk t of that face
  const backLen = (dirS > 0 ? toS(backOrigin, 0) - ps0 : ps1 - toS(backOrigin, 0))
  const behind = backLen > singleFt ? bandsOver(toS(backOrigin, 0), backLen, -dirS).slice(1).map(b => ({ t: backOrigin - b.yFt - b.depthFt, d: b.depthFt, type: b.type, flueIn: b.flueIn ?? flueIn })) : []
  const units = [...walkRows, ...behind].map((u, i) => ({ s0: toS(u.t, u.d), d: u.d, type: u.type, flueIn: u.flueIn, row: rowBase + i + 1 }))

  // ── along the rows ──
  const rLo = Math.min(...rects.map(q => q.r0 + clear(q.e0))), rHi = Math.max(...rects.map(q => q.r1 - clear(q.e1)))
  const len = rHi - rLo
  if (!(len > EPS)) return null
  const rg = walkGrid(runLines, flipR ? rHi : rLo, len, flipR ? -1 : 1)
  const { segments } = rowSegments(len, { crossAisleFt, endClearFt: 0, beamIn, upIn, runGridFt: rg.pitch, runGridOffsetFt: rg.offset, runGridMaxFt: rg.max, maxRunFt: set.maxRunFt })
  if (!segments.length) return null
  const pitch = (upIn + beamIn) / 12
  const runLen = (n) => (upIn * (n + 1) + n * beamIn) / 12
  // walk order: from the start edge in. Each piece kept as { a (its start-edge end), n }, in walk distance
  const walkPieces = segments.map(seg => ({ a: seg.xFt, n: seg.bays }))
  const maxBays = Number.isFinite(set.maxRunFt) ? Math.max(1, Math.floor((set.maxRunFt * 12 - upIn) / (beamIn + upIn))) : Infinity
  const toR = (a, n) => (flipR ? rHi - a - runLen(n) : rLo + a)          // a piece's low-end run position
  const fwdLen = (flipR ? rHi - pr0 : pr1 - rLo), backRun = (flipR ? pr1 - rHi : rLo - pr0)
  const extra = []
  /* past the far end: the last run carries on bay by bay up to the max run, then a cross-aisle
     and whole max-length runs */
  {
    const last = walkPieces[walkPieces.length - 1]
    const room = Number.isFinite(maxBays) ? maxBays - last.n : Math.ceil((fwdLen - last.a - runLen(last.n)) / pitch)
    if (room > 0) last.n += room
    let at = last.a + runLen(last.n) + crossAisleFt
    const n = Number.isFinite(maxBays) ? maxBays : Math.ceil(fwdLen / pitch)
    while (at < fwdLen) { extra.push({ a: at, n }); at += runLen(n) + crossAisleFt }
  }
  /* behind the start edge, the same the other way: the first run grows back toward it (its own
     uprights where they were) — a lone run already grew forward to the max — then a cross-aisle
     and whole runs */
  const back = []
  {
    const first = walkPieces[0]
    const room = Number.isFinite(maxBays) ? maxBays - first.n : Math.ceil(backRun / pitch)
    if (room > 0) { first.a -= room * pitch; first.n += room }
    const n = Number.isFinite(maxBays) ? maxBays : Math.ceil(backRun / pitch)
    let end = first.a - crossAisleFt
    while (end > -backRun) { back.push({ a: end - runLen(n), n }); end -= runLen(n) + crossAisleFt }
  }
  const pieces = [...walkPieces, ...extra, ...back].map((p, i) => ({ r0: toR(p.a, p.n), n: p.n, sec: secBase + i + 1 }))

  const pattern = {
    vert, units, pieces, beamIn, upIn, depthIn, flueIn, aisleFt,
    palletWIn: P.palletWIn, palletDIn: P.palletDIn, levels: set.levels,
  }
  return { pattern, rects, fp }
}

/** The racks a racking area's box shows: its pattern (areaPattern) clipped to
 *  the box — whole bays, rows wholly inside. A pair the edge cuts so only one
 *  half fits shows that half as a single row; nothing else is ever added at an
 *  edge. Clipped to the building's inner wall face and to zones the same way;
 *  every rack in `objects` is an obstacle with an aisle kept off it all round;
 *  `blocked` (world px rects) are kept clear with nothing added (racks removed
 *  from the area by hand). A face against a wall or zone (under an aisle of
 *  clear floor in front of it) loses its bays there (faceReach.js). Returns
 *  { fp, racks, aisles, rows, positions }. */
export function patternFill(objects, boxPx, pattern, { gridSize = 40, newId = nanoid, areaId = null, fp = null, blocked = [] } = {}) {
  const empty = { fp: null, racks: [], aisles: [], rows: 0, positions: 0 }
  fp = fp || buildingForBox(objects, boxPx)
  if (!fp || !pattern || !(boxPx.w > 0) || !(boxPx.h > 0)) return empty
  const { vert, beamIn, upIn, depthIn, flueIn, aisleFt } = pattern
  const box = rsRect(vert, gridSize, boxPx)
  const poly = innerOutline(fp, gridSize).map(rsOf(vert, gridSize))
  const grow = (q, by) => ({ r0: q.r0 - by, r1: q.r1 + by, s0: q.s0 - by, s1: q.s1 + by })
  const blockers = [
    ...objects.filter(o => isRack(o) && o.width > 0 && o.height > 0).map(o => { const f = rackFootprint(o); return grow(rsRect(vert, gridSize, { x: f.x, y: f.y, w: f.w, h: f.h }), aisleFt) }),
    ...objects.filter(isZone).map(o => rsRect(vert, gridSize, { x: o.x, y: o.y, w: o.width, h: o.height })),
    ...blocked.map(b => rsRect(vert, gridSize, b)),
  ].filter(q => q.r1 > box.r0 && q.r0 < box.r1 && q.s1 > box.s0 && q.s0 < box.s1)
  const polyR = [...new Set(poly.map(p => p.r))].sort((a, b) => a - b)
  /** Whether the inner outline holds all of [sa, sb] at run position r. */
  const holds = (r, sa, sb) => {
    const out = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length]
      if (Math.abs(a.s - c.s) > EPS) continue
      if (r > Math.min(a.r, c.r) + EPS && r < Math.max(a.r, c.r) - EPS) out.push(a.s)
    }
    out.sort((p, q) => p - q)
    for (let i = 0; i + 1 < out.length; i += 2) if (out[i] <= sa + EPS && out[i + 1] >= sb - EPS) return true
    return false
  }
  const subtract = (ivs, a, c) => ivs.flatMap(([x, y]) => (c <= x || a >= y ? [[x, y]] : [[x, Math.min(y, a)], [Math.max(x, c), y]].filter(([p, q]) => q - p > EPS)))
  /** The run intervals where a row across [sa, sb] is wholly clear. */
  const freeRun = (sa, sb) => {
    if (sa < box.s0 - EPS || sb > box.s1 + EPS) return []
    const cuts = [box.r0, ...polyR.filter(r => r > box.r0 && r < box.r1), box.r1]
    let ivs = []
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], c = cuts[i + 1]
      if (c - a < EPS || !holds((a + c) / 2, sa, sb)) continue
      if (ivs.length && Math.abs(ivs[ivs.length - 1][1] - a) < EPS) ivs[ivs.length - 1][1] = c
      else ivs.push([a, c])
    }
    for (const q of blockers) if (q.s1 > sa + EPS && q.s0 < sb - EPS) ivs = subtract(ivs, q.r0, q.r1)
    return ivs
  }
  const pitch = (upIn + beamIn) / 12, bayFt = (2 * upIn + beamIn) / 12
  const placements = []
  const used = new Set()
  /** Each pattern piece's whole bays inside the interval [a, c], placed across [sa, sa + depthFt]. */
  const place = (unit, type, sa, depthFt, ivs) => {
    for (const [a, c] of ivs) for (const pc of pattern.pieces) {
      const kLo = Math.max(0, Math.ceil((a - pc.r0) / pitch - 1e-9)), kHi = Math.min(pc.n - 1, Math.floor((c - pc.r0 - bayFt) / pitch + 1e-9))
      if (kHi < kLo) continue
      const n = kHi - kLo + 1, r0 = pc.r0 + kLo * pitch, len = (upIn * (n + 1) + n * beamIn) / 12
      const at = vert
        ? { xFt: sa + depthFt / 2 - len / 2, yFt: r0 + len / 2 - depthFt / 2, angle: 90 }
        : { xFt: r0, yFt: sa, angle: 0 }
      const beams = Array(n).fill(beamIn)
      placements.push({
        type, ...at, bays: n, beams, beamIn, depthIn, flueIn: type === 'rack_double_row' ? unit.flueIn : flueIn, flueBaseIn: flueIn,
        levels: pattern.levels, palletWIn: pattern.palletWIn, palletDIn: pattern.palletDIn, uprightWidthIn: upIn,
        rowIndex: unit.row, genSection: pc.sec,
      })
      used.add(unit.row)
    }
  }
  const singleFt = depthIn / 12
  for (const u of pattern.units) {
    if (u.s0 + u.d < box.s0 - EPS || u.s0 > box.s1 + EPS) continue
    if (u.type !== 'rack_double_row') { place(u, u.type, u.s0, u.d, freeRun(u.s0, u.s0 + u.d)); continue }
    // the pair where all of it fits; elsewhere either half that fits on its own, as a single row
    const pair = freeRun(u.s0, u.s0 + u.d)
    place(u, 'rack_double_row', u.s0, u.d, pair)
    let lo = freeRun(u.s0, u.s0 + singleFt), hi = freeRun(u.s0 + u.d - singleFt, u.s0 + u.d)
    for (const [a, c] of pair) { lo = subtract(lo, a, c); hi = subtract(hi, a, c) }
    place(u, 'rack_row', u.s0, singleFt, lo)
    place(u, 'rack_row', u.s0 + u.d - singleFt, singleFt, hi)
  }
  // ids first: the aisles between the new rows refer to them
  // and no pick face without an aisle: a face against a wall or a zone loses its bays there (faceReach.js)
  const racks = dropUnreachableFaces(placements.map(p => ({ ...placementToObject(p), id: newId(), ...(areaId ? { areaId } : {}) })), {
    poly: innerOutline(fp, gridSize), aislePx: aisleFt * gridSize, gridSize, newId,
    zones: objects.filter(isZone).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height })),
  })
  // the aisles get ids here too: the fill goes into the store in one write, not through addObject
  const aisles = aisleObjectsForRacks(racks).map(o => ({ ...o, id: o.id || newId() }))
  const withParent = parentGenerated([...racks, ...aisles], fp.id).map(o => ({ ...o, layerId: layerForType(o.type) }))
  const positions = racks.reduce((t, o) => t + (getRackCapacity(o)?.total || 0), 0)
  return { fp, racks: withParent.filter(isRack), aisles: withParent.filter(o => o.type === 'aisle'), rows: used.size, positions }
}

/** Plan a fill of `boxPx` (world px) with `settings`: its pattern (areaPattern,
 *  anchored at `from`, where the drag started) clipped to the box
 *  (patternFill). The racks and aisles (world px, stamped, parented to the
 *  building), how many rows and pallet positions, the rectangles of the
 *  region, and the pattern. */
export function planFill(objects, boxPx, settings = {}, { gridSize = 40, rules = DEFAULT_RULES, newId = nanoid, from = null, areaId = null } = {}) {
  const made = areaPattern(objects, boxPx, settings, { gridSize, rules, from, areaId })
  if (!made) return { fp: null, racks: [], aisles: [], rows: 0, positions: 0, rects: [], pattern: null }
  const plan = patternFill(objects, boxPx, made.pattern, { gridSize, newId, areaId, fp: made.fp })
  return { ...plan, rects: made.rects, pattern: made.pattern }
}
