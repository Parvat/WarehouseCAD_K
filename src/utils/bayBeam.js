// bayBeam.js — per-bay beam length: the presets, the custom-value parser,
// where a rack sits after a beam change, the wall clear along the rack's own
// length at any rotation, and the red warnings (overlaps another rack /
// passes the wall). Pure: the right panel previews with it and the store
// action commits the same geometry.
//
// Geometry rule (bayAnchor.js): a beam change holds the rack's START end
// (local x = obj.x, bay 0's side) where it is drawn, so bays before the
// changed one stay put and later ones slide, at any rotation. Warnings never
// block — the dealer knows the site.

import { anchoredResize } from './bayAnchor'

/** 4' to 16' in 1' steps, in inches. */
export const BEAM_PRESETS_IN = Array.from({ length: 13 }, (_, i) => 48 + 12 * i)
export const BEAM_MIN_IN = 12
export const BEAM_MAX_IN = 360

/** A typed beam length -> inches, or null. Accepts inches ("102", "102\""),
 *  feet ("9'"), or feet and inches ("8' 6\"", "8'6"). */
export function parseBeamIn(text) {
  const s = String(text ?? '').trim()
  if (!s) return null
  let v = null
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/)
  if (ftIn) v = Number(ftIn[1]) * 12 + (ftIn[2] ? Number(ftIn[2]) : 0)
  else {
    const inch = s.match(/^(\d+(?:\.\d+)?)\s*"?$/)
    if (inch) v = Number(inch[1])
  }
  if (v == null || !Number.isFinite(v)) return null
  v = Math.round(v * 100) / 100
  return v >= BEAM_MIN_IN && v <= BEAM_MAX_IN ? v : null
}

/** Uprights x (bays + 1) + the beams. */
export function rackLengthIn(beams, upIn = 3) {
  return upIn * (beams.length + 1) + beams.reduce((a, b) => a + b, 0)
}

/** The { beams, width, x, y } commit for a rack given new beams: width from
 *  the beams, START end held where it is drawn (any rotation). */
export function beamsUpdate(obj, beams, gridSize = 40) {
  const width = (rackLengthIn(beams, obj.uprightWidth || 3) / 12) * gridSize
  return { beams, width, ...anchoredResize(obj, { width }, { x: 'start' }) }
}

/** Change the listed bays of one or more racks to `beamIn`.
 *  `entries` = [{ objId, bayIdx }]. Returns Map(id -> beamsUpdate). */
export function planBayBeamChange(objects, entries, beamIn, gridSize = 40) {
  const byObj = new Map()
  for (const { objId, bayIdx } of entries) {
    if (!byObj.has(objId)) byObj.set(objId, [])
    byObj.get(objId).push(bayIdx)
  }
  const out = new Map()
  for (const [id, idxs] of byObj) {
    const obj = objects.find(o => o.id === id)
    if (!obj || !Array.isArray(obj.beams)) continue
    const beams = [...obj.beams]
    for (const i of idxs) if (i >= 0 && i < beams.length) beams[i] = beamIn
    out.set(id, beamsUpdate(obj, beams, gridSize))
  }
  return out
}

/** Add one bay of `beamIn` at the far end. */
export function planAddBay(obj, beamIn, gridSize = 40) {
  return beamsUpdate(obj, [...(obj.beams || []), beamIn], gridSize)
}

/** The rack's four drawn corners (its box spun about its own centre). */
export function rackCorners(o) {
  const t = ((o.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = (sx * o.width) / 2, ly = (sy * o.height) / 2
    return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }
  })
}

/** The floor plan's inner box (bbox less the wall thickness each side). */
function innerRect(fp, gridSize) {
  const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : 10
  const x = fp.x || 0, y = fp.y || 0, w = fp.width || 0, h = fp.height || 0
  return { x0: x + wt, y0: y + wt, x1: x + w - wt, y1: y + h - wt, wt }
}

/** Wall clear ALONG THE RACK'S OWN LENGTH, at any rotation: the chord of the
 *  building's inner box on the line through the rack's centre in its run
 *  direction. At 0°/180° that is the inner width, at 90°/270° the inner
 *  height. Null if the rack has no parent floor plan. */
export function wallClearAlong(obj, objects, gridSize = 40) {
  if (!obj.parentId) return null
  const fp = objects.find(o => o.id === obj.parentId)
  if (!fp) return null
  const r = innerRect(fp, gridSize)
  const t = ((obj.rotation || 0) * Math.PI) / 180
  const dx = Math.cos(t), dy = Math.sin(t)
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  let lo = -Infinity, hi = Infinity, ok = true
  for (const [p, d, a, b] of [[cx, dx, r.x0, r.x1], [cy, dy, r.y0, r.y1]]) {
    if (Math.abs(d) < 1e-12) { if (p < a || p > b) ok = false; continue }
    const t1 = (a - p) / d, t2 = (b - p) / d
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2))
  }
  const inside = ok && hi > lo
  const clearPx = inside
    ? hi - lo
    : Math.abs(dx) * (r.x1 - r.x0) + Math.abs(dy) * (r.y1 - r.y0)   // centre outside: the extent along the run
  /* Room between the rack's FAR end (where "+ bay" and a longer beam grow
     it, the start end being held) and the inner wall ahead of it. Negative
     = already past the wall. */
  const aheadPx = inside ? hi - obj.width / 2 : clearPx - obj.width
  return { clearPx, clearIn: (clearPx / gridSize) * 12, aheadIn: (aheadPx / gridSize) * 12, fp, wt: r.wt }
}

const isRack = (o) => typeof o.type === 'string' && o.type.startsWith('rack_')

/** Two drawn rack boxes overlap (separating-axis test; touching edges don't count). */
function boxesOverlap(a, b, eps = 0.01) {
  const A = rackCorners(a), B = rackCorners(b)
  for (const P of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const ax = P[i + 1].x - P[i].x, ay = P[i + 1].y - P[i].y
      const len = Math.hypot(ax, ay) || 1
      const nx = -ay / len, ny = ax / len
      const proj = (Q) => Q.map(q => q.x * nx + q.y * ny)
      const pa = proj(A), pb = proj(B)
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= eps) return false
    }
  }
  return true
}

/** What's wrong with a rack where it is: the racks it overlaps and how far
 *  (inches) its drawn box passes the building's inner wall (0 = inside). */
export function rackIssues(obj, objects, gridSize = 40) {
  const overlaps = objects.filter(o => o.id !== obj.id && isRack(o) && o.width > 0 && o.height > 0 && boxesOverlap(obj, o)).map(o => o.id)
  let wallOutIn = 0
  const fp = obj.parentId ? objects.find(o => o.id === obj.parentId) : null
  if (fp) {
    const r = innerRect(fp, gridSize)
    let out = 0
    for (const p of rackCorners(obj)) out = Math.max(out, r.x0 - p.x, p.x - r.x1, r.y0 - p.y, p.y - r.y1)
    wallOutIn = out > 0.01 ? Math.round(((out / gridSize) * 12) * 100) / 100 : 0
  }
  return { overlaps, wallOutIn }
}

/** Issues for every rack in `updates` (Map id -> partial) after applying
 *  them all together. Returns { byId: Map(id -> issues), any }. */
export function changeIssues(objects, updates, gridSize = 40) {
  const next = objects.map(o => (updates.has(o.id) ? { ...o, ...updates.get(o.id) } : o))
  const byId = new Map()
  let any = false
  for (const id of updates.keys()) {
    const o = next.find(q => q.id === id)
    if (!o) continue
    const iss = rackIssues(o, next, gridSize)
    byId.set(id, iss)
    if (iss.overlaps.length || iss.wallOutIn > 0) any = true
  }
  return { byId, any }
}

/** One-line red warning text for a set of issues, or null. */
export function issuesText(issues, fmtIn = (v) => `${v}"`) {
  const parts = []
  let overlaps = 0, wall = 0
  for (const iss of issues) { overlaps += iss.overlaps.length; wall = Math.max(wall, iss.wallOutIn) }
  if (overlaps) parts.push(`overlaps ${overlaps} rack${overlaps > 1 ? 's' : ''}`)
  if (wall > 0) parts.push(`passes the wall by ${fmtIn(wall)}`)
  return parts.length ? parts.join(' · ') : null
}
