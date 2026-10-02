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
// Pure: objects in, analysis out. Shared by Check layout, Fill racking and
// racking areas (fillRacking.js patternFill) and Generate (traceGenerate.js).

import { rackFootprint } from './columnCheck'
import { uprightXs } from '../render/rackOps'
import { splitRackForBayDelete } from '../utils/baySplit'
import { innerOutline } from '../utils/floorGeom'

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
 *  along the run, right across the floor) crosses, removed. */
function carve(objects, ids, axis, band, gridSize, newId) {
  const want = new Set(ids)
  return objects.flatMap(o => {
    if (!want.has(o.id) || !BEAM.has(o.type)) return [o]
    const rot = (((o.rotation || 0) % 360) + 360) % 360
    if (rot !== 0 && rot !== 90) return [o]                                     // fills and Generate turn rows 0° or 90°
    const f = rackFootprint(o), vert = !!f.rotated
    if ((vert ? 'y' : 'x') !== axis) return [o]
    const { xs, upW } = uprightXs(o, gridSize)
    const toWorld = (lx) => (vert ? f.y + (lx - o.x) : f.x + (lx - o.x))
    const drop = new Set()
    for (let i = 0; i + 1 < xs.length; i++) {
      const b0 = toWorld(xs[i]), b1 = toWorld(xs[i + 1] + upW)
      if (Math.min(b1, band[1]) - Math.max(b0, band[0]) > 1e-6) drop.add(i)
    }
    if (!drop.size) return [o]
    if (drop.size === xs.length - 1) return []
    return splitRackForBayDelete(o, drop, newId, gridSize) || []
  })
}

/** Fill racking / racking areas / Generate: the racks `ids` (just placed, in `objects`) given a way
 *  in. When some are cut off — and no zone closes their rows — a travel path the travel width wide
 *  is carved right across the floor along a wall line: tried at every face of the building along
 *  the run, on its floor side, from the far end (`dir`: +1 / -1 along the run) in; the first that
 *  leaves nothing cut off is taken (so it stays put as a racking area's box changes), else the one
 *  keeping the most bays reachable (and once more). The placed rows give up the bays it crosses.
 *  Racks still cut off after that go: a pocket a zone closes keeps no racks. Returns the objects,
 *  trimmed / removed. */
export function giveWayIn(objects, fp, ids, { gridSize = 40, travelFt = 8, aisleFt = 10.5, dir = 1, newId } = {}) {
  if (!fp || !ids.length) return objects
  const opts = { gridSize, travelFt, aisleFt }
  const judge = (objs) => {
    const want = new Set(ids), alive = objs.filter(o => want.has(o.id) || (o.pieceOf && want.has(o.pieceOf)))
    const cut = cutOffRacks(objs, fp, { ...opts, ids: alive.map(o => o.id) }).cutOff
    const gone = new Set(cut.map(c => c.id))
    return { cut, kept: alive.filter(o => !gone.has(o.id)).reduce((t, o) => t + (o.beams?.length || 0), 0) }
  }
  let best = { objs: objects, ...judge(objects) }
  if (!best.cut.length) return objects
  const poly = innerOutline(fp, gridSize), T = travelFt * gridSize
  const zones = objects.filter(isZone).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }))
  const meets = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-6 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-6
  /* A cut-off row a ZONE closes (within the travel width past either end) sits in a pocket the
     office or staging makes: it gets no path, and goes. Any other cut-off row — closed by walls, or
     in a block whose cross-aisles lead nowhere — may get a travel path. */
  const byId = new Map(objects.map(o => [o.id, o]))
  const pathable = (o) => {
    const f = rackFootprint(o), vert = !!f.rotated
    const [r0, r1] = vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w], [s0, s1] = vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h]
    const zoneAt = (e, d) => zones.some(z => meets(z, vert ? { x: s0, y: Math.min(e, e + d * T), w: s1 - s0, h: T } : { x: Math.min(e, e + d * T), y: s0, w: T, h: s1 - s0 }))
    return zoneAt(r1, 1) || zoneAt(r0, -1) ? null : (vert ? 'y' : 'x')
  }
  const axes = new Set(best.cut.map(c => byId.get(c.id)).filter(Boolean).map(pathable).filter(Boolean))
  for (const axis of axes) {
    // the candidate paths: along each face of the building across this run axis, on its floor side(s)
    const us = [...new Set(poly.map(p => (axis === 'x' ? p.x : p.y)))]
    const bands = us.flatMap(u => [[u - T, u], [u, u + T]])
      .sort((a, b) => dir * ((b[0] + b[1]) - (a[0] + a[1])))                      // the far end first: it wins a tie
    /* the first path from the far end that leaves nothing cut off (so the path stays put as the box
       changes); failing that, the one that keeps the most bays reachable — then once more */
    for (let round = 0; round < 2 && best.cut.length; round++) {
      let pick = null
      for (const band of bands) {
        const objs = carve(best.objs, [...ids, ...best.objs.filter(o => o.pieceOf && ids.includes(o.pieceOf)).map(o => o.id)], axis, band, gridSize, newId)
        const j = judge(objs)
        if (!j.cut.filter(c => pathable(byId.get(c.id) || objs.find(o => o.id === c.id) || {})).length && j.kept > best.kept) { pick = { objs, ...j }; break }
        if (j.kept > (pick ? pick.kept : best.kept)) pick = { objs, ...j }
      }
      if (!pick) break
      best = pick
    }
  }
  // still cut off: those racks go
  if (best.cut.length) { const gone = new Set(best.cut.map(c => c.id)); return best.objs.filter(o => !gone.has(o.id)) }
  return best.objs
}
