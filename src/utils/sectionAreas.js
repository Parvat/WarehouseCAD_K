// sectionAreas.js — sections: named areas drawn on the plan (STUDIO.md §7a Sections). Nothing else — no racking
// settings, no Generate or Fill change; racks keep working as before. (Not the rack "sections" of canvas2/sections.js —
// pieces of one row — nor a zone: a zone_* cuts the racks under it, a section never does.)
//
//   { id, type: 'section_area', layerId: 'sections', label: 'Section 1', shape: 'rect' | 'poly',
//     x, y, width, height,               // the box (world px); a rectangle is its box
//     pts: [[dx, dy], …] }               // a custom shape: its points, from x/y — so a move (x/y) moves them all
//
// Membership: a rack belongs to the section that holds its centre; otherwise it is Unassigned — derived every time,
// never stored, so it follows every move of a rack or a section. Sections can touch but never overlap: a draw that
// overlaps a neighbour snaps to the neighbour's edge.

import { rackFootprint } from '../generate/rackFootprint'

export const SECTION = 'section_area'
export const isSection = (o) => !!o && o.type === SECTION
export const isRackObj = (o) => !!o && typeof o.type === 'string' && /^rack_/.test(o.type) && o.width > 0 && o.height > 0

/** The section's outline, world points [[x, y], …]. */
export function polygonOf(s) {
  if (s.shape === 'poly' && Array.isArray(s.pts) && s.pts.length >= 3) return s.pts.map(([px, py]) => [s.x + px, s.y + py])
  return [[s.x, s.y], [s.x + s.width, s.y], [s.x + s.width, s.y + s.height], [s.x, s.y + s.height]]
}
/** Is world point (x, y) inside polygon `poly` (even-odd)? */
export function pointInPolygon(poly, x, y) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const contains = (s, x, y) => pointInPolygon(polygonOf(s), x, y)
/** Distance from (x, y) to segment a–b. */
function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}
/** The nearest point on the outline of polygon `poly` to (x, y). */
function nearestOnOutline(poly, x, y) {
  let best = null
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0
    const p = [ax + t * dx, ay + t * dy], d = Math.hypot(x - p[0], y - p[1])
    if (!best || d < best.d) best = { p, d }
  }
  return best ? best.p : [x, y]
}
/** Is (x, y) within `band` of the section's outline? */
export function onOutline(s, x, y, band) {
  const poly = polygonOf(s)
  for (let i = 0; i < poly.length; i++) if (segDist(x, y, poly[i], poly[(i + 1) % poly.length]) <= band) return true
  return false
}

/* the name label: small caps, Plus Jakarta Sans 11px 600, at the top-left inside, 12px in — screen px, so ÷ zoom */
export const LABEL = { px: 11, inset: 12, color: '#767C74', font: "'Plus Jakarta Sans', sans-serif" }
/** The name label's box (world px) at `zoom`. */
export function labelBox(s, zoom = 1) {
  const z = zoom > 0 ? zoom : 1, h = LABEL.px / z, w = Math.max(3, String(s.label || '').length) * LABEL.px * 0.66 / z
  return { x: s.x + LABEL.inset / z, y: s.y + LABEL.inset / z, w, h: h * 1.25 }
}
export const onLabel = (s, x, y, zoom) => { const b = labelBox(s, zoom); return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h }

/** Area (world px²) — shoelace. */
export function areaOf(s) {
  const p = polygonOf(s)
  let a = 0
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0 }
  return Math.abs(a) / 2
}

/** The next default name: Section N, one past the highest N in use. */
export function nextName(objects) {
  let n = 0
  for (const o of objects || []) if (isSection(o)) { const m = /^Section (\d+)$/.exec(o.label || ''); if (m) n = Math.max(n, Number(m[1])) }
  return `Section ${n + 1}`
}

const box = (s) => ({ x0: s.x, y0: s.y, x1: s.x + s.width, y1: s.y + s.height })
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-6

/** A rectangle drawn as `r` ({ x, y, w, h }, world px): snapped off every section it overlaps — the drawn box keeps the
 *  side that loses least, its edge on the neighbour's edge (touching, never overlapping). Null when nothing is left. */
export function snapRect(r, objects, minPx = 1) {
  let b = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }
  const others = (objects || []).filter(isSection).map(box)
  for (let pass = 0; pass < others.length + 1; pass++) {
    const hit = others.find(n => overlap(b, n))
    if (!hit) break
    const area = (q) => Math.max(0, q.x1 - q.x0) * Math.max(0, q.y1 - q.y0)
    const opts = [
      { ...b, x1: Math.min(b.x1, hit.x0) }, { ...b, x0: Math.max(b.x0, hit.x1) },
      { ...b, y1: Math.min(b.y1, hit.y0) }, { ...b, y0: Math.max(b.y0, hit.y1) },
    ].filter(q => q.x1 - q.x0 >= minPx && q.y1 - q.y0 >= minPx && !overlap(q, hit))
    if (!opts.length) return null
    b = opts.sort((p, q) => area(q) - area(p))[0]
  }
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
}
/** A custom shape's clicked points (world): any point inside a neighbour section snaps to that neighbour's nearest edge. */
export function snapPoints(points, objects) {
  const polys = (objects || []).filter(isSection).map(polygonOf)
  return points.map(([x, y]) => { const hit = polys.find(p => pointInPolygon(p, x, y)); return hit ? nearestOnOutline(hit, x, y) : [x, y] })
}

/** The building whose box holds (x, y) — a section is its child, so a building drag carries it like its racks. */
const parentAt = (objects, x, y) => (objects || []).find(o => /^fp_/.test(o.type || '') && x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height)?.id
const withParent = (f, objects) => { const p = parentAt(objects, f.x + f.width / 2, f.y + f.height / 2); return p ? { ...f, parentId: p } : f }

/** A new rectangle section's fields (to add), or null. */
export function rectSection(r, objects) {
  const s = snapRect(r, objects)
  if (!s || !(s.w > 0) || !(s.h > 0)) return null
  return withParent({ type: SECTION, layerId: 'sections', label: nextName(objects), shape: 'rect', x: s.x, y: s.y, width: s.w, height: s.h }, objects)
}
/** A new custom-shape section's fields from its world points (3 or more), or null. */
export function polySection(points, objects) {
  const p = snapPoints(points, objects)
  if (p.length < 3) return null
  return withParent({ type: SECTION, layerId: 'sections', label: nextName(objects), shape: 'poly', ...normalPoly(p) }, objects)
}
/** World points → { x, y, width, height, pts } (pts from the box's top-left). */
export function normalPoly(p) {
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, pts: p.map(([px, py]) => [px - x, py - y]) }
}
/** Point `i` of a custom shape moved to world (wx, wy): the section's new fields. */
export const movePoint = (s, i, wx, wy) => normalPoly(polygonOf(s).map((q, k) => (k === i ? [wx, wy] : q)))

/** Which section each rack is in — its centre in the section; else Unassigned. → { bySection: Map(id → [rackId]),
 *  unassigned: [rackId] } — sections in the layout's order. */
export function membership(objects) {
  const secs = (objects || []).filter(isSection), polys = secs.map(polygonOf)
  const bySection = new Map(secs.map(s => [s.id, []])), unassigned = []
  for (const r of (objects || []).filter(isRackObj)) {
    const f = rackFootprint(r), cx = f.x + f.w / 2, cy = f.y + f.h / 2
    const i = polys.findIndex(p => pointInPolygon(p, cx, cy))
    if (i >= 0) bySection.get(secs[i].id).push(r.id); else unassigned.push(r.id)
  }
  return { bySection, unassigned }
}
