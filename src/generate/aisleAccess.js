// aisleAccess.js — every aisle needs a way in.
//
// A forklift reaches a pick face from an aisle, and the aisle has to connect —
// at one end or more — to a cross-aisle or travel path at least the truck's
// travel width that leads to the main floor. An aisle closed at both ends (a
// wall at one end, an office at the other; or walls at both) is a dead-end
// POCKET: nobody can drive into it.
//
// Worked on a grid over the building's floor (its inner wall face):
//   - walls, zones and racks are obstacles;
//   - the drivable floor is where a square the travel width wide fits (a
//     chessboard distance transform over cell centres: a gap reads its width
//     in cells, and half a cell of slack is allowed);
//   - its connected pieces: the MAIN floor is the largest one, unless that one
//     is itself just a corridor (thinner than the travel width once eroded —
//     a single aisle closed at both ends, as every aisle is when rows run
//     wall to wall with no cross-aisle or travel path): then there is none;
//   - every other piece is a pocket.
// A rack is cut off when no pick face of it (a double's two long sides, a
// single's either side) looks onto the main floor across an aisle's depth,
// while one looks onto a pocket.
//
// Fill racking, racking areas and Generate give their racks a way in (giveWayIn):
// with no main floor at all, a travel path right across the floor along a wall
// line; then each pocket is opened by its cheapest strip — a travel-wide strip
// against a zone's edge or a wall, across the rows from the pocket to the main
// floor, the fewest whole bays cut (a tie cut against the zone edge, so the
// racks stay against the building wall). Racks go only where no strip reaches
// the main floor.
//
// Pure: objects in, analysis out. Shared by Check layout, Fill racking and
// racking areas (fillRacking.js patternFill) and Generate (traceGenerate.js).

import { rackFootprint } from './columnCheck'
import { uprightXs } from '../render/rackOps'
import { splitRackForBayDelete } from '../utils/baySplit'
import { innerOutline, floorSection } from '../utils/floorGeom'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_')
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
const MAX_CELLS = 400000

/** The floor grid of building `fp`: cells (resolution `res` px) marked free / blocked by walls,
 *  zones and the racks in `objects`. */
function floorGrid(objects, fp, gridSize) {
  const poly = innerOutline(fp, gridSize)
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y)
  const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0
  const res = Math.max(gridSize / 2, Math.sqrt((W * H) / MAX_CELLS))
  const nx = Math.max(1, Math.ceil(W / res)), ny = Math.max(1, Math.ceil(H / res))
  const blocked = new Uint8Array(nx * ny).fill(1)
  // the floor: scan each row of cell centres across the outline's vertical edges
  for (let j = 0; j < ny; j++) {
    const cy = y0 + (j + 0.5) * res, cuts = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      if ((a.y > cy) !== (b.y > cy)) cuts.push(a.x + (cy - a.y) * (b.x - a.x) / (b.y - a.y))
    }
    cuts.sort((p, q) => p - q)
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((cuts[k] - x0) / res - 0.5)), i1 = Math.min(nx - 1, Math.floor((cuts[k + 1] - x0) / res - 0.5))
      for (let i = i0; i <= i1; i++) blocked[j * nx + i] = 0
    }
  }
  // zones and racks: every cell whose centre they cover (as the floor is read), so a gap between
  // two of them counts exactly its width in cells
  const mark = (b) => {
    const i0 = Math.max(0, Math.ceil((b.x - x0) / res - 0.5 - 1e-9)), i1 = Math.min(nx - 1, Math.floor((b.x + b.w - x0) / res - 0.5 + 1e-9))
    const j0 = Math.max(0, Math.ceil((b.y - y0) / res - 0.5 - 1e-9)), j1 = Math.min(ny - 1, Math.floor((b.y + b.h - y0) / res - 0.5 + 1e-9))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * nx + i] = 1
  }
  for (const o of objects) {
    if (isZone(o)) mark({ x: o.x, y: o.y, w: o.width, h: o.height })
    else if (isRack(o) && o.width > 0 && o.height > 0 && (!o.parentId || o.parentId === fp.id)) { const f = rackFootprint(o); mark({ x: f.x, y: f.y, w: f.w, h: f.h }) }
  }
  return { x0, y0, nx, ny, res, blocked }
}

/** Chessboard distance from each cell to the nearest blocked one (the grid's edge counts). */
function chessboard({ nx, ny, blocked }) {
  const d = new Int32Array(nx * ny)
  const BIG = nx + ny
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i
    if (blocked[k]) { d[k] = 0; continue }
    let v = BIG
    if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) v = 1
    if (i > 0) v = Math.min(v, d[k - 1] + 1)
    if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + 1); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + 1) }
    d[k] = v
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i
    if (!d[k]) continue
    let v = d[k]
    if (i < nx - 1) v = Math.min(v, d[k + 1] + 1)
    if (j < ny - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + 1); if (i > 0) v = Math.min(v, d[k + nx - 1] + 1) }
    d[k] = v
  }
  return d
}

/** The drivable floor's pieces in building `fp`: { grid, label (Int32Array, 0 = not drivable),
 *  comps: [{ id, cells, box (world px) }], main (a component id, or 0: no main floor) }. */
export function floorAccess(objects, fp, { gridSize = 40, travelFt = 8 } = {}) {
  const grid = floorGrid(objects, fp, gridSize)
  const { nx, ny, res, x0, y0 } = grid
  const d = chessboard(grid)
  // a travel-wide square fits: (2m - 1) cells ≥ the travel width less one cell
  const m = Math.max(1, Math.ceil((travelFt * gridSize) / res / 2))
  const label = new Int32Array(nx * ny)
  const comps = []
  const queue = new Int32Array(nx * ny)
  for (let s = 0; s < nx * ny; s++) {
    if (label[s] || d[s] < m) continue
    const id = comps.length + 1
    let head = 0, tail = 0, i0 = nx, i1 = -1, j0 = ny, j1 = -1
    queue[tail++] = s; label[s] = id
    while (head < tail) {
      const k = queue[head++], i = k % nx, j = (k - i) / nx
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j
      for (const [ok, q] of [[i > 0, k - 1], [i < nx - 1, k + 1], [j > 0, k - nx], [j < ny - 1, k + nx]]) if (ok && !label[q] && d[q] >= m) { label[q] = id; queue[tail++] = q }
    }
    // the drivable cells' box, widened by the clearance back to the floor they stand for
    const pad = (m - 0.5) * res
    comps.push({ id, cells: tail, thin: Math.min(i1 - i0 + 1, j1 - j0 + 1) * res,
      box: { x: x0 + i0 * res - pad, y: y0 + j0 * res - pad, w: (i1 - i0 + 1) * res + 2 * pad, h: (j1 - j0 + 1) * res + 2 * pad } })
  }
  const big = comps.reduce((a, c) => (!a || c.cells > a.cells ? c : a), null)
  // the largest piece is the main floor — unless it is only a corridor itself (no way in anywhere)
  const main = big && big.thin >= travelFt * gridSize ? big.id : 0
  return { grid, label, comps, main }
}

/** The pieces of floor a rack's pick faces look onto, across `aisleFt` in front of them:
 *  [component ids per face] — a double row's two long sides, a single row's either side. */
function facesOnto(access, r, aisleFt, gridSize) {
  const { grid: { x0, y0, nx, ny, res }, label } = access
  const f = rackFootprint(r), vert = !!f.rotated, A = aisleFt * gridSize
  const strips = vert
    ? [{ x: f.x - A, y: f.y, w: A, h: f.h }, { x: f.x + f.w, y: f.y, w: A, h: f.h }]
    : [{ x: f.x, y: f.y - A, w: f.w, h: A }, { x: f.x, y: f.y + f.h, w: f.w, h: A }]
  return strips.map(b => {
    const seen = new Set()
    const i0 = Math.max(0, Math.floor((b.x - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((b.x + b.w - x0) / res) - 1)
    const j0 = Math.max(0, Math.floor((b.y - y0) / res)), j1 = Math.min(ny - 1, Math.ceil((b.y + b.h - y0) / res) - 1)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const l = label[j * nx + i]; if (l) seen.add(l) }
    return seen
  })
}

/** Racks in building `fp` that only pockets reach: { cutOff: [{ id, pockets: [ids] }], pockets:
 *  Map(componentId -> { box, ids }) , access }. `ids` limits which racks are judged. */
export function cutOffRacks(objects, fp, { gridSize = 40, travelFt = 8, aisleFt = 10.5, ids = null } = {}) {
  const access = floorAccess(objects, fp, { gridSize, travelFt })
  const want = ids ? new Set(ids) : null
  const cutOff = [], pockets = new Map()
  for (const r of objects) {
    if (!BEAM.has(r.type) || !(r.width > 0) || (r.parentId && r.parentId !== fp.id) || (want && !want.has(r.id))) continue
    if (((r.rotation || 0) % 90) !== 0) continue
    const faces = facesOnto(access, r, aisleFt, gridSize)
    const seen = new Set(faces.flatMap(s => [...s]))
    if (!seen.size || (access.main && seen.has(access.main))) continue
    const ps = [...seen]
    cutOff.push({ id: r.id, pockets: ps })
    for (const p of ps) {
      if (!pockets.has(p)) pockets.set(p, { box: access.comps[p - 1].box, ids: [] })
      pockets.get(p).ids.push(r.id)
    }
  }
  return { cutOff, pockets, access }
}

/** The bays of the racks `ids` (rows along `axis`) that a travel path across `band` ([lo, hi]
 *  along the run) crosses, removed — right across the floor, or only for racks whose stack range
 *  meets `across` ([lo, hi]) when given. */
function carve(objects, ids, axis, band, gridSize, newId, across = null, tol = 1e-6) {
  const want = new Set(ids)
  return objects.flatMap(o => {
    if (!want.has(o.id) || !BEAM.has(o.type)) return [o]
    const rot = (((o.rotation || 0) % 360) + 360) % 360
    if (rot !== 0 && rot !== 90) return [o]                                     // fills and Generate turn rows 0° or 90°
    const f = rackFootprint(o), vert = !!f.rotated
    if ((vert ? 'y' : 'x') !== axis) return [o]
    if (across) { const [s0, s1] = vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h]; if (!(Math.min(s1, across[1]) - Math.max(s0, across[0]) > 1e-6)) return [o] }
    const { xs, upW } = uprightXs(o, gridSize)
    const toWorld = (lx) => (vert ? f.y + (lx - o.x) : f.x + (lx - o.x))
    const drop = new Set()
    for (let i = 0; i + 1 < xs.length; i++) {
      const b0 = toWorld(xs[i]), b1 = toWorld(xs[i + 1] + upW)
      if (Math.min(b1, band[1]) - Math.max(b0, band[0]) > tol) drop.add(i)
    }
    if (!drop.size) return [o]
    if (drop.size === xs.length - 1) return []
    return splitRackForBayDelete(o, drop, newId, gridSize) || []
  })
}
/** A pocket's shortened racks pushed tight against the building wall: each rack `carved` changed whose
 *  far end along the run (`axis`) faces the wall across clear floor, and whose other end faces a zone
 *  or the lane, slides along until it ends on the wall's inner face — the same bays, all the leftover
 *  going to the lane on the other side. Returns the objects, and how many racks moved. */
function tighten(objects, before, fp, axis, gridSize, travelFt) {
  const was = new Set(before)
  const moved = objects.filter(o => isRack(o) && o.width > 0 && !was.has(o))
  if (!moved.length) return { objects, n: 0 }
  const poly = innerOutline(fp, gridSize), cross = axis === 'x' ? 'y' : 'x'
  const blocks = [...objects.filter(o => isRack(o) && o.width > 0).map(o => ({ o, f: rackFootprint(o) })),
    ...objects.filter(isZone).map(o => ({ o, f: { x: o.x, y: o.y, w: o.width, h: o.height } }))]
  const run = (f) => (axis === 'x' ? [f.x, f.x + f.w] : [f.y, f.y + f.h]), acr = (f) => (axis === 'x' ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
  const shift = new Map()
  for (const o of moved) {
    const f = rackFootprint(o), [r0, r1] = run(f), [c0, c1] = acr(f)
    // the floor along the rack's row: the stretch holding it, at three points across its depth
    const lo = Math.min(...poly.map(q => q[axis])) - 1, hi = Math.max(...poly.map(q => q[axis])) + 1
    let e0 = -Infinity, e1 = Infinity
    for (const v of [c0 + 0.5, (c0 + c1) / 2, c1 - 0.5]) {
      const iv = floorSection(poly, cross, v, lo, hi).find(([a, b]) => a <= r0 + 1e-6 && b >= r1 - 1e-6)
      if (!iv) { e0 = e1 = NaN; break }
      e0 = Math.max(e0, iv[0]); e1 = Math.min(e1, iv[1])
    }
    if (!Number.isFinite(e0) || !Number.isFinite(e1)) continue
    // the nearest rack or zone either way along it
    let n0 = -Infinity, n1 = Infinity, z0 = false, z1 = false
    for (const b of blocks) {
      if (b.o === o) continue
      const [a0, a1] = acr(b.f), [q0, q1] = run(b.f)
      if (!(Math.min(a1, c1) - Math.max(a0, c0) > 1e-6)) continue
      // (a neighbour sharing its end frame overlaps it by an upright: still the next thing along)
      const up = (o.uprightWidth ?? 3) / 12 * gridSize + 1e-6
      if (q0 >= r1 - up && Math.max(q0, r1) < n1) { n1 = Math.max(q0, r1); z1 = isZone(b.o) }
      if (q1 <= r0 + up && Math.min(q1, r0) > n0) { n0 = Math.min(q1, r0); z0 = isZone(b.o) }
    }
    const wallHi = e1 <= n1 + 1e-6, wallLo = e0 >= n0 - 1e-6
    // the near end: a zone, or the lane (clear floor at least the travel width) — never a rack it carries on from
    const T = travelFt * gridSize - 1e-6
    const openLo = !wallLo && (z0 || r0 - n0 >= T), openHi = !wallHi && (z1 || n1 - r1 >= T)
    if (wallHi && openLo && e1 - r1 > 1e-6) shift.set(o, e1 - r1)
    else if (wallLo && openHi && r0 - e0 > 1e-6) shift.set(o, e0 - r0)
  }
  if (!shift.size) return { objects, n: 0 }
  return { objects: objects.map(o => (shift.has(o) ? { ...o, [axis]: o[axis] + shift.get(o) } : o)), n: shift.size }
}

/** The bays of the racks `ids` (and their pieces) in `objs`. */
const baysOf = (objs, ids) => { const want = new Set(ids); return objs.filter(o => want.has(o.id) || (o.pieceOf && want.has(o.pieceOf))).reduce((t, o) => t + (o.beams?.length || 0), 0) }

/** No main floor at all — every aisle a pocket, as when rows run wall to wall with no cross-aisle:
 *  a travel path the travel width wide is carved right across the floor along a wall line (each
 *  face of the building along the run, on its floor side, tried from the far end in; the first that
 *  leaves nothing cut off, else the one keeping the most bays reachable, and once more). */
function pathAcross(objects, fp, ids, { gridSize, travelFt, aisleFt, dir, newId }) {
  const judge = (objs) => {
    const want = new Set(ids), alive = objs.filter(o => want.has(o.id) || (o.pieceOf && want.has(o.pieceOf)))
    const cut = cutOffRacks(objs, fp, { gridSize, travelFt, aisleFt, ids: alive.map(o => o.id) }).cutOff
    const gone = new Set(cut.map(c => c.id))
    return { cut, kept: alive.filter(o => !gone.has(o.id)).reduce((t, o) => t + (o.beams?.length || 0), 0) }
  }
  let best = { objs: objects, ...judge(objects) }
  const poly = innerOutline(fp, gridSize), T = travelFt * gridSize
  const axes = new Set(best.cut.map(c => objects.find(o => o.id === c.id)).filter(Boolean).map(o => (rackFootprint(o).rotated ? 'y' : 'x')))
  for (const axis of axes) {
    const us = [...new Set(poly.map(p => (axis === 'x' ? p.x : p.y)))]
    const bands = us.flatMap(u => [[u - T, u], [u, u + T]]).sort((a, b) => dir * ((b[0] + b[1]) - (a[0] + a[1])))
    for (let round = 0; round < 2 && best.cut.length; round++) {
      let pick = null
      for (const band of bands) {
        const objs = carve(best.objs, [...ids, ...best.objs.filter(o => o.pieceOf && ids.includes(o.pieceOf)).map(o => o.id)], axis, band, gridSize, newId)
        const j = judge(objs)
        if (!j.cut.length && j.kept > best.kept) { pick = { objs, ...j }; break }
        if (j.kept > (pick ? pick.kept : best.kept)) pick = { objs, ...j }
      }
      if (!pick) break
      best = pick
    }
  }
  return best.objs
}

/** The ways one pocket could be opened: a travel-wide strip standing against something fixed —
 *  either side of a zone's edge or of a face of the building, across the run — running ACROSS the
 *  rows from the pocket toward the main floor, only as far as the first cell of main floor; each with
 *  the bays it costs (whole bays: the strip is the travel width, rounded up to whole bays by the bays
 *  it cuts). Cheapest first; a tie goes to the strip against a zone (so the racks stay against the
 *  building wall), then to the one nearer the far end. */
function stripsFor(objects, fp, res, pocketId, carvable, { gridSize, travelFt, dir }) {
  const { grid: { x0, y0, nx, ny, res: cell }, label, main } = res.access
  const T = travelFt * gridSize
  const mine = res.cutOff.filter(c => c.pockets.includes(pocketId)).map(c => objects.find(o => o.id === c.id)).filter(Boolean)
  if (!mine.length) return []
  const vert = !!rackFootprint(mine[0]).rotated, axis = vert ? 'y' : 'x'
  const poly = innerOutline(fp, gridSize)
  const zones = objects.filter(isZone).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }))
  const meets = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-6 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-6
  const onFloor = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c } return c }
  const others = objects.filter(o => isRack(o) && o.width > 0)
  const canCut = new Set(carvable)
  // the grid along this pocket's axes: u along the run, v across
  const nu = vert ? ny : nx, nv = vert ? nx : ny, u0 = vert ? y0 : x0, v0 = vert ? x0 : y0
  const at = (ui, vi) => label[(vert ? ui : vi) * nx + (vert ? vi : ui)]
  /* where a strip can stand against something fixed: either side of a zone's edge across the run
     (kind 'zone'), either side of a face of the building ('wall') */
  const lines = []
  for (const z of zones) for (const e of vert ? [z.y, z.y + z.h] : [z.x, z.x + z.w]) lines.push({ e, kind: 'zone' })
  for (const q of poly) lines.push({ e: vert ? q.y : q.x, kind: 'wall' })
  /* and, beside a zone's edge, on the bay grid of the racks the strip would cut: starting at the far
     face of an upright that the strip hard against the edge would nick, inside the open lane — so a
     rack it only nicks keeps that bay and the strip takes the next one (kind 'zone': it stands in the
     zone's lane) */
  const tol = 1e-3 * gridSize                                            // the travel width, to a thousandth of a foot
  const uprights = []
  for (const o of others) {
    if (!canCut.has(o.id) || !Array.isArray(o.beams)) continue
    const f = rackFootprint(o)
    if ((f.rotated ? 'y' : 'x') !== axis) continue
    const { xs, upW } = uprightXs(o, gridSize)
    for (const lx of xs) { const a = (f.rotated ? f.y : f.x) + (lx - o.x); uprights.push([a, a + upW]) }
  }
  const bands = []
  for (const { e, kind } of lines) for (const side of [-1, 1]) {
    bands.push({ band: side < 0 ? [e - T, e] : [e, e + T], kind })
    if (kind !== 'zone') continue
    for (const [a, b] of uprights) {
      if (side > 0 && b > e + tol && a < e + T - tol) bands.push({ band: [b, b + T], kind })
      if (side < 0 && a < e - tol && b > e - T + tol) bands.push({ band: [a - T, a], kind })
    }
  }
  const seen = new Set(), out = []
  for (const { band, kind } of bands) {
    const key = Math.round(band[0] * 100) + '|' + kind
    if (seen.has(key)) continue
    seen.add(key)
    const ua = Math.max(0, Math.floor((band[0] - u0) / cell)), ub = Math.min(nu - 1, Math.ceil((band[1] - u0) / cell) - 1)
    if (ub < ua) continue
    // the pocket's cells under the strip, across
    const vs = []
    for (let vi = 0; vi < nv; vi++) for (let ui = ua; ui <= ub; ui++) if (at(ui, vi) === pocketId) { vs.push(vi); break }
    if (!vs.length) continue
    for (const dv of [-1, 1]) {
      const start = dv > 0 ? Math.max(...vs) : Math.min(...vs)
      let hit = null
      for (let vi = start + dv; vi >= 0 && vi < nv && hit == null; vi += dv) for (let ui = ua; ui <= ub; ui++) if (at(ui, vi) === main) { hit = vi; break }
      if (hit == null) continue
      const va = Math.min(start, hit), vb = Math.max(start, hit)
      const across = [v0 + va * cell, v0 + (vb + 1) * cell]
      const R = vert ? { x: across[0], y: band[0], w: across[1] - across[0], h: T } : { x: band[0], y: across[0], w: T, h: across[1] - across[0] }
      // it can only run where nothing fixed stands: no zone, no rack it may not cut, on the floor
      if (zones.some(z => meets(z, R)) || others.some(q => !canCut.has(q.id) && meets(rackFootprint(q), R))) continue
      if (![[R.x + 1, R.y + 1], [R.x + R.w - 1, R.y + 1], [R.x + 1, R.y + R.h - 1], [R.x + R.w - 1, R.y + R.h - 1]].every(([x, y]) => onFloor(x, y))) continue
      let n = 0
      const after = carve(objects, [...canCut], axis, band, gridSize, () => 'cost' + (++n), across, tol)
      // its exact width: nothing left in the strip (past the tolerance) — the full travel width, all the way across
      const inner = vert ? { x: R.x, y: R.y + tol, w: R.w, h: R.h - 2 * tol } : { x: R.x + tol, y: R.y, w: R.w - 2 * tol, h: R.h }
      if (after.some(q => isRack(q) && q.width > 0 && meets(rackFootprint(q), inner))) continue
      const cost = baysOf(objects, [...canCut]) - after.filter(q => canCut.has(q.id) || String(q.id).startsWith('cost')).reduce((t, q) => t + (q.beams?.length || 0), 0)
      out.push({ axis, band, across, cost, kind, mid: (band[0] + band[1]) / 2, pocket: pocketId, racks: mine.length })
    }
  }
  // cheapest; a tie against a zone (the racks stay against the building wall); then nearer the far end
  return out.sort((a, b) => a.cost - b.cost || (a.kind === 'zone' ? 0 : 1) - (b.kind === 'zone' ? 0 : 1) || dir * (b.mid - a.mid))
}

/** Fill racking / racking areas / Generate: the racks `ids` (just placed, in `objects`) given a way
 *  in. With no main floor at all (rows wall to wall), a travel path runs right across the floor
 *  along a wall line (pathAcross). Then each pocket left is opened by its cheapest strip (stripsFor):
 *  the fewest bays; a tie cut against the zone edge, so the racks stay against the building wall. A
 *  pocket no strip can open — nothing reaches the main floor from it — loses its racks. `report`
 *  (an array) collects each pocket opened: { racks, bays, kind, at (the strip along the run),
 *  tiedWith (the kind of an equal-cost strip it beat, or null) }. Returns the objects. */
export function giveWayIn(objects, fp, ids, { gridSize = 40, travelFt = 8, aisleFt = 10.5, dir = 1, newId, report = null } = {}) {
  if (!fp || !ids.length) return objects
  const opts = { gridSize, travelFt, aisleFt }
  const live = (objs) => { const want = new Set(ids); return objs.filter(o => want.has(o.id) || (o.pieceOf && want.has(o.pieceOf))).map(o => o.id) }
  let objs = objects
  let res = cutOffRacks(objs, fp, { ...opts, ids: live(objs) })
  if (!res.cutOff.length) return objs
  if (!res.access.main) {
    objs = pathAcross(objs, fp, ids, { gridSize, travelFt, aisleFt, dir, newId })
    res = cutOffRacks(objs, fp, { ...opts, ids: live(objs) })
  }
  for (let guard = 0; guard < 40 && res.cutOff.length && res.access.main; guard++) {
    // the pocket with the most racks first
    const count = new Map()
    for (const c of res.cutOff) for (const p of c.pockets) count.set(p, (count.get(p) || 0) + 1)
    const pocket = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    const mine = new Set(res.cutOff.filter(c => c.pockets.includes(pocket)).map(c => c.id))
    let opened = false
    const strips = stripsFor(objs, fp, res, pocket, live(objs), { gridSize, travelFt, dir })
    for (const s of strips) {
      const before = baysOf(objs, ids)
      const next = carve(objs, live(objs), s.axis, s.band, gridSize, newId, s.across, 1e-3 * gridSize)
      const r2 = cutOffRacks(next, fp, { ...opts, ids: live(next) })
      const still = new Set(r2.cutOff.map(c => c.id))
      // opened: none of the pocket's racks (or what is left of them) cut off any more
      if (next.some(o => (mine.has(o.id) || (o.pieceOf && mine.has(o.pieceOf))) && still.has(o.id))) continue
      // (and whether a strip of the other kind cost the same: the tie the zone edge wins)
      const tie = strips.find(q => q !== s && q.kind !== s.kind && q.cost === s.cost)
      // the racks it shortened, tight against the building wall: the leftover goes to the lane (kept only if nothing is cut off)
      const t = tighten(next, objs, fp, s.axis, gridSize, travelFt)
      let tight = 0
      if (t.n) { const r3 = cutOffRacks(t.objects, fp, { ...opts, ids: live(t.objects) }); if (r3.cutOff.length <= r2.cutOff.length) { objs = t.objects; res = r3; tight = t.n } }
      if (!tight) { objs = next; res = r2 }
      if (report) report.push({ racks: mine.size, bays: before - baysOf(next, ids), kind: s.kind, at: s.band, across: s.across, tiedWith: tie ? tie.kind : null, tight })
      opened = true
      break
    }
    if (!opened) {
      // no strip reaches the main floor from it: its racks go
      objs = objs.filter(o => !mine.has(o.id))
      res = cutOffRacks(objs, fp, { ...opts, ids: live(objs) })
    }
  }
  if (res.cutOff.length) { const gone = new Set(res.cutOff.map(c => c.id)); objs = objs.filter(o => !gone.has(o.id)) }
  return objs
}
