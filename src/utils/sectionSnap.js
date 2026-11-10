// sectionSnap.js — a section's edges snap while it is drawn, moved or resized (sections-3, STUDIO.md §7a Sections): onto
// other sections' edges, the building's inner walls, zone edges and rack ends (a rack's two ends along its run), within
// SECTION_SNAP_PX screen px, the nearest one per axis, with a dashed guide through the matched edge. Alt held: none.
// Pure: objects in, lines and offsets out.

import { isSection, polygonOf } from './sectionAreas'
import { innerOutline } from './floorGeom'
import { rackFootprint } from '../generate/rackFootprint'

export const SECTION_SNAP_PX = 8
const EPS = 1e-6

/** The lines a section's edges may snap to — { x: [{ v, a, b }] (vertical lines: x = v, from y = a to b), y: [...]
 *  (horizontal) } — of everything in `objects` but the ids in `skip` (what moves with the section). */
export function sectionSnapLines(objects, skip = new Set(), gridSize = 40) {
  const x = [], y = []
  const seg = (p, q) => {
    if (Math.abs(p.x - q.x) < EPS) x.push({ v: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) })
    else if (Math.abs(p.y - q.y) < EPS) y.push({ v: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) })
  }
  const ring = (pts) => pts.forEach((c, i) => seg(c, pts[(i + 1) % pts.length]))
  for (const o of objects || []) {
    if (!o || skip.has(o.id) || typeof o.type !== 'string') continue
    if (isSection(o)) ring(polygonOf(o).map(([px, py]) => ({ x: px, y: py })))
    else if (o.type.startsWith('fp_')) { const p = innerOutline(o, gridSize); if (p && p.length) ring(p) }
    else if (o.type.startsWith('zone_') && o.width > 0 && o.height > 0) ring([{ x: o.x, y: o.y }, { x: o.x + o.width, y: o.y }, { x: o.x + o.width, y: o.y + o.height }, { x: o.x, y: o.y + o.height }])
    else if (o.type.startsWith('rack_') && o.width > 0 && o.height > 0) {
      // a rack's ends: the two short sides, across its run
      const f = rackFootprint(o)
      if (f.rotated) { y.push({ v: f.y, a: f.x, b: f.x + f.w }); y.push({ v: f.y + f.h, a: f.x, b: f.x + f.w }) }
      else { x.push({ v: f.x, a: f.y, b: f.y + f.h }); x.push({ v: f.x + f.w, a: f.y, b: f.y + f.h }) }
    }
  }
  return { x, y }
}

/** The snap of moving edges `edges` ({ x: [values], y: [values] }) onto `lines` within `tol` (world px): per axis the
 *  nearest line → { dx, dy, guides } (dx / dy 0 with none); a guide is drawn through the matched edge, over the line's
 *  extent and `span` ({ x0, y0, x1, y1 }: what moves, after the snap) — the canvas's smart-guide shape. */
export function snapSectionEdges(edges, lines, tol, span = null) {
  const best = (vals, ls) => {
    let b = null
    for (const v of vals || []) for (const l of ls) { const d = l.v - v; if (Math.abs(d) <= tol + EPS && (!b || Math.abs(d) < Math.abs(b.d) - EPS)) b = { d, l } }
    return b
  }
  const bx = best(edges.x, lines.x), by = best(edges.y, lines.y)
  const dx = bx ? bx.d : 0, dy = by ? by.d : 0, guides = []
  const s = span && { x0: span.x0 + dx, x1: span.x1 + dx, y0: span.y0 + dy, y1: span.y1 + dy }
  if (bx) guides.push({ axis: 'x', val: bx.l.v, from: Math.min(bx.l.a, s ? s.y0 : bx.l.a), to: Math.max(bx.l.b, s ? s.y1 : bx.l.b), section: true })
  if (by) guides.push({ axis: 'y', val: by.l.v, from: Math.min(by.l.a, s ? s.x0 : by.l.a), to: Math.max(by.l.b, s ? s.x1 : by.l.b), section: true })
  return { dx, dy, guides }
}

/** A section's box (world px): its polygon's extent. */
export function sectionBox(s) {
  const p = polygonOf(s), xs = p.map(q => q[0]), ys = p.map(q => q[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}
