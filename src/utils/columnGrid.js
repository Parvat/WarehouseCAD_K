// columnGrid.js — a column grid as the card types it (col-grid round; STUDIO.md §7a Columns).
//
// The grid object is unchanged (its first column's centre x, y and the spacings between its gridlines, spacingX /
// spacingY — expandColumnGrid), so every saved grid loads exactly as it was. The card reads it as an X / Y spacing (its
// first spacing) and an X / Y offset: the building's outline (its outer wall line) to the first gridline — 0 puts the
// first gridline on the wall, as Generate does. Typed, the grid is laid again: gridlines from the offset at the spacing
// up to the far wall; the last bay is whatever is left to it. Columns are drawn at every crossing inside the building's
// outline — an L's open corner skipped, its gridline kept (generate/columnCheck.js expandColumnGrid). A building grown
// gets columns at the same spacing on the side it grew; a shrink drops the gridlines left outside (utils/buildingResize.js).

import { buildingOutline } from './floorGeom'

const E = 0.5

/** The grid's gridlines (world px): { xs, ys } — its first column's centre on, then each spacing. */
export function gridLines(cg) {
  const line = (o, sp) => { const v = [o]; for (const s of sp || []) v.push(v[v.length - 1] + s); return v }
  return { xs: line(cg.x, cg.spacingX), ys: line(cg.y, cg.spacingY) }
}
/** The building a grid belongs to: its parent, else the first building. */
export const gridBuilding = (objects, cg) => (objects || []).find(o => o.id === cg?.parentId && /^fp_/.test(o.type || '')) || (objects || []).find(o => /^fp_/.test(o.type || '')) || null
const extent = (fp) => { const p = buildingOutline(fp); return { x0: Math.min(...p.map(q => q.x)), x1: Math.max(...p.map(q => q.x)), y0: Math.min(...p.map(q => q.y)), y1: Math.max(...p.map(q => q.y)) } }

/** Is (x, y) inside polygon `poly` ({x, y}[]) or on its outline (within `tol`)? */
export function inOutline(poly, x, y, tol = 1) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  if (inside) return true
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy
    const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0
    if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) <= tol) return true
  }
  return false
}

/** The grid as the card reads it (ft; in for the column): { spX, spY, offX, offY, wIn, dIn }. */
export function gridParams(cg, fp, gs = 40) {
  const ex = fp ? extent(fp) : { x0: cg.x, y0: cg.y }
  const w = cg.columnW || gs, d = cg.columnH || gs
  return { spX: (cg.spacingX?.[0] ?? 0) / gs, spY: (cg.spacingY?.[0] ?? 0) / gs, offX: (cg.x - ex.x0) / gs, offY: (cg.y - ex.y0) / gs, wIn: (w / gs) * 12, dIn: (d / gs) * 12 }
}
/** Gridlines from `start` at `step` up to `end` (the far wall, a line on it kept): world px. */
function axisLines(start, step, end) {
  if (!(step > 0)) return start <= end + E ? [start] : []
  const out = []
  for (let v = start; v <= end + E && out.length < 500; v += step) out.push(v)
  return out
}
/** The update that lays grid `cg` again from `p` (gridParams' fields; ft, in) in building `fp`. */
export function gridUpdate(cg, fp, p, gs = 40) {
  const ex = fp ? extent(fp) : { x0: cg.x, y0: cg.y, x1: cg.x + (cg.width || 0), y1: cg.y + (cg.height || 0) }
  const xs = axisLines(ex.x0 + p.offX * gs, p.spX * gs, ex.x1), ys = axisLines(ex.y0 + p.offY * gs, p.spY * gs, ex.y1)
  const w = (p.wIn / 12) * gs, d = (p.dIn / 12) * gs
  const x = xs.length ? xs[0] : ex.x0 + p.offX * gs, y = ys.length ? ys[0] : ex.y0 + p.offY * gs
  const spacingX = xs.slice(1).map((v, i) => v - xs[i]), spacingY = ys.slice(1).map((v, i) => v - ys[i])
  return { x, y, spacingX, spacingY, columnW: w, columnH: d, colSizeIn: Math.round(p.wIn), width: spacingX.reduce((t, s) => t + s, 0) + w, height: spacingY.reduce((t, s) => t + s, 0) + d }
}
/** A gridline's name: A, B … Z, AA … across; 1, 2 … down. */
export const lineName = (i, axis) => {
  if (axis === 'y') return String(i + 1)
  let s = '', n = i
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}
/** The card's Result: { count (columns drawn — inside the building), xs, ys (gridline counts), range ('A–J · 1–5'),
 *  lastX, lastY (ft: the last gridline to the far wall; the last gridline on that wall: the last two's bay), none (no column inside: the warning) }. */
export function gridResult(cg, objects, gs = 40, expand) {
  const fp = gridBuilding(objects, cg), { xs, ys } = gridLines(cg), ex = fp ? extent(fp) : null
  const count = expand ? expand(cg, gs, objects).length : xs.length * ys.length
  const range = xs.length && ys.length ? `${lineName(0, 'x')}–${lineName(xs.length - 1, 'x')} · ${lineName(0, 'y')}–${lineName(ys.length - 1, 'y')}` : '—'
  // the last bay: the last gridline to the far wall — or, the last gridline on the far wall, the bay between the last two
  const last = (vs, far) => { const n = vs.length, rest = far - vs[n - 1]; return rest <= E && n > 1 ? vs[n - 1] - vs[n - 2] : Math.max(0, rest) }
  return { count, nx: xs.length, ny: ys.length, range, lastX: ex ? last(xs, ex.x1) / gs : null, lastY: ex ? last(ys, ex.y1) / gs : null, none: count === 0 }
}
/** Grid `cg` after its building grew from `before` to `after`: gridlines added at the grid's spacing on each side the
 *  building came out on (the near side: before its first; the far side: after its last), every gridline already there
 *  where it was. → the update, or null (nothing to add). */
export function growGrid(cg, before, after, gs = 40) {
  const a = extent(before), b = extent(after), { xs, ys } = gridLines(cg)
  const spX = cg.spacingX?.length ? cg.spacingX[cg.spacingX.length - 1] : 0, spY = cg.spacingY?.length ? cg.spacingY[cg.spacingY.length - 1] : 0
  const sx0 = cg.spacingX?.length ? cg.spacingX[0] : 0, sy0 = cg.spacingY?.length ? cg.spacingY[0] : 0
  const nx = [...xs], ny = [...ys]
  if (spX > 0 && b.x1 > a.x1 + E) for (let v = nx[nx.length - 1] + spX; v <= b.x1 + E; v += spX) nx.push(v)
  if (sx0 > 0 && b.x0 < a.x0 - E) for (let v = nx[0] - sx0; v >= b.x0 - E; v -= sx0) nx.unshift(v)
  if (spY > 0 && b.y1 > a.y1 + E) for (let v = ny[ny.length - 1] + spY; v <= b.y1 + E; v += spY) ny.push(v)
  if (sy0 > 0 && b.y0 < a.y0 - E) for (let v = ny[0] - sy0; v >= b.y0 - E; v -= sy0) ny.unshift(v)
  if (nx.length === xs.length && ny.length === ys.length) return null
  const spacingX = nx.slice(1).map((v, i) => v - nx[i]), spacingY = ny.slice(1).map((v, i) => v - ny[i])
  const w = cg.columnW || gs, d = cg.columnH || gs
  return { x: nx[0], y: ny[0], spacingX, spacingY, width: spacingX.reduce((t, s) => t + s, 0) + w, height: spacingY.reduce((t, s) => t + s, 0) + d }
}
