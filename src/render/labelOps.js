// render/labelOps.js — every label and mark on the drawing as a renderer-
// neutral op list, in WORLD units: aisle and cross-aisle width labels, column
// clearance arrows / labels and the red aisle shade, X marks on blocked pallet
// positions, orange upright flags, oversized-bay crosses. The canvas paints
// these ops with Konva (canvas2/LabelOps.jsx) and the PDF export writes the
// same ops as SVG (export/pdfExport.js), so a label is the same on screen and
// on paper — the rackDrawOps pattern, for labels.
//
// Sizes are drawing sizes (render/labelSize.js): `lz` is the label scale for
// the chosen Label size, used where the old designs divided by the view zoom.
// Nothing here knows the view zoom. Pure — no React, no Konva.
//
// Ops:
//   { op: 'line',  points, stroke, strokeWidth, dash?, opacity? }
//   { op: 'poly',  points, fill?, stroke?, strokeWidth? , opacity? }   (closed)
//   { op: 'rect',  x, y, w, h, fill?, stroke?, strokeWidth?, dash?, cornerRadius?, opacity?, name? }
//   { op: 'text',  x, y, w, h, text, fontSize, fill, fontFamily }      (centred in the box)
import { AISLE_LABEL_FONT_PX, AISLE_LABEL_PADX_PX, aisleLabelLayout } from '../canvas2/hitTest'
import { crossAisleLabels } from '../canvas2/crossAisles'
import { labelScale, aisleLabelScale } from './labelSize'
import { visibleClearanceMarks, aisleWarningRect, SHORT_COLOR } from '../canvas2/aisleMarks'
import { positionRectForIndex, bayRectForIndex } from './bayGeom'
import { uprightFramesLocal, rackFootprint, expandColumnGrid } from '../generate/columnCheck'
import { oversizedBayIndices } from '../utils/capacity'
import { isEmptySide } from '../utils/bayEmpty'

export const LABEL_FONT = 'JetBrains Mono, monospace'
const RED = '#C0392B'
const ORANGE = '#E67E22'
const MIN_MARK_PX = 6

/** A text pill: rounded box + centred text (the old LabelPill). */
export function pillOps(cx, cy, text, fontSize, lz, { color = '#4a9eff', bg = '#0a0d16', padX = 4 / lz, heightScale = 1.5, rx = 2 / lz, stroke, strokeWidth, opacity = 0.85 } = {}) {
  const w = text.length * fontSize * 0.62 + padX * 2
  const h = fontSize * heightScale
  return [
    { op: 'rect', x: cx - w / 2, y: cy - h / 2, w, h, fill: bg, stroke, strokeWidth, cornerRadius: rx, opacity },
    { op: 'text', x: cx - w / 2, y: cy - h / 2, w, h, text, fontSize, fill: color, fontFamily: LABEL_FONT },
  ]
}

/** An aisle / cross-aisle width label from its layout ({ isHoriz, gapLo,
 *  gapHi, labelMid, positions, text }): an arrow across the gap at each
 *  station, the width in a pill. */
/** An aisle width label's look by its grade (L.level, rowAisleLevel): 3 — the usual amber-on-cream; 2 — under
 *  the pick width, a filled amber pill in Check layout's amber; 1 — under the drive width, a filled red pill
 *  in Check layout's red (the "under travel" clearance labels' style). A cross-aisle label is 1 or 3 only
 *  (crossAisleLabels: red over a cross-aisle Check layout lists as an error). */
export const AISLE_PICK_COLOR = '#B87309', AISLE_DRIVE_COLOR = '#C0392B'
const AISLE_LOOK = {
  3: { clr: '#f0b429', text: '#92400e', bg: 'rgba(255,251,235,0.9)', stroke: '#f0b429', sw: 0.5 },
  2: { clr: AISLE_PICK_COLOR, text: '#7a4a06', bg: 'rgba(253,230,138,0.95)', stroke: AISLE_PICK_COLOR, sw: 1 },
  1: { clr: AISLE_DRIVE_COLOR, text: AISLE_DRIVE_COLOR, bg: 'rgba(254,226,226,0.95)', stroke: AISLE_DRIVE_COLOR, sw: 1 },
}
export function aisleLabelOps(L, lz) {
  const { isHoriz, gapLo, gapHi, labelMid, positions, text } = L
  const look = AISLE_LOOK[L.level] || AISLE_LOOK[3]
  const fs = AISLE_LABEL_FONT_PX / lz, aw = 5 / lz, sw = 1 / lz, clr = look.clr
  const out = []
  for (const pos of positions) {
    const lx = isHoriz ? pos : labelMid, ly = isHoriz ? labelMid : pos
    const pad2 = 3 / lz
    const a1 = gapLo + pad2, a2 = gapHi - pad2
    if (isHoriz) {
      out.push({ op: 'line', points: [lx, a1, lx, a2], stroke: clr, strokeWidth: sw },
        { op: 'poly', points: [lx, a1, lx - aw / 2, a1 + aw, lx + aw / 2, a1 + aw], fill: clr },
        { op: 'poly', points: [lx, a2, lx - aw / 2, a2 - aw, lx + aw / 2, a2 - aw], fill: clr })
    } else {
      out.push({ op: 'line', points: [a1, ly, a2, ly], stroke: clr, strokeWidth: sw },
        { op: 'poly', points: [a1, ly, a1 + aw, ly - aw / 2, a1 + aw, ly + aw / 2], fill: clr },
        { op: 'poly', points: [a2, ly, a2 - aw, ly - aw / 2, a2 - aw, ly + aw / 2], fill: clr })
    }
    out.push(...pillOps(lx, ly, text, fs, lz, { color: look.text, bg: look.bg, padX: AISLE_LABEL_PADX_PX / lz, heightScale: 1.5, rx: 2 / lz, stroke: look.stroke, strokeWidth: look.sw / lz, opacity: 0.95 }))
  }
  return out
}

/** The pill boxes of the aisle width labels (`aisles`: each aisle object's label, at its own Label size)
 *  and the cross-aisle width labels (`cross`: the layout's cross-aisles), as `aisleLabelOps` draws them —
 *  read off its own rect ops, so they are exactly what is on the drawing. A column clearance label keeps
 *  clear of these (clearanceOps' `avoid`): the aisle width label has priority. */
export function aisleLabelBoxes(objects, gridSize = 40, labelSize, { aisles = true, cross = true, profile = null } = {}) {
  const out = [], take = (ops) => { for (const o of ops) if (o.op === 'rect') out.push({ x: o.x, y: o.y, w: o.w, h: o.h }) }
  if (aisles) for (const a of objects) {
    if (!a || a.type !== 'aisle') continue
    const lz = aisleLabelScale(a, labelSize, gridSize)
    const L = aisleLabelLayout(a, objects, gridSize, { profile, lz })
    if (L) take(aisleLabelOps(L, lz))
  }
  if (cross) { const lz = labelScale(labelSize, gridSize); for (const L of crossAisleLabels(objects, gridSize, { profile, lz })) take(aisleLabelOps(L, lz)) }
  return out
}

/** One column standing in an aisle: the red aisle shade when pinched (with `warnings` — the Checks layer
 *  shown), and the clearance arrows + distance pills on BOTH sides, always (only the red "under travel"
 *  ones when the Column labels switch is off). */
export function clearanceOps(block, col, lz, gridSize = 40, showLabels = true, avoid = [], { warnings = true, solids = [] } = {}) {
  if (!col || !block.axis) return []
  /* only the aisle labels a pill could reach (the PDF hands every label on the sheet) */
  if (avoid.length) {
    const R = (Math.max(Math.abs(block.nearClearFt || 0), Math.abs(block.farClearFt || 0)) + 1) * gridSize + 160 / lz
    const x0 = col.x - R, x1 = col.x + col.w + R, y0 = col.y - R, y1 = col.y + col.h + R
    avoid = avoid.filter(r => r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0)
  }
  /* `solids`: the racks and columns ({ x, y, w, h }) — a number is never drawn on one (STUDIO.md §7) */
  { const R = 4 * gridSize + 120 / lz, x0 = col.x - R, x1 = col.x + col.w + R, y0 = col.y - R, y1 = col.y + col.h + R
    solids = solids.filter(r => r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0) }
  const cfs = 9.5 / lz                                // the number: 9.5 at the label size (C18)
  const out = []
  const warn = warnings ? aisleWarningRect(block, col) : null
  if (warn) out.push({ op: 'rect', name: 'aisle-warning', x: warn.x, y: warn.y, w: warn.w, h: warn.h, fill: 'rgba(192,57,43,0.16)', stroke: SHORT_COLOR, strokeWidth: 1.5 / lz, dash: [6 / lz, 4 / lz] })
  const vertArrow = block.axis === 'y'                // the gap runs along y: the arrow is vertical, a pill steps off it in x
  const marks = visibleClearanceMarks(block, col, lz, gridSize, showLabels).map(m => {
    /* A gap shorter than its own label can't hold it: slide the pill off to
       the side of the arrow instead of over the column and rack (text is
       always horizontal, so the pill's extent along the arrow differs by
       orientation). */
    const pillW = m.label.text.length * cfs * 0.56, pillH = cfs * 1.25
    const across = vertArrow ? pillW : pillH
    const step = across / 2 + 6 / lz                  // a number touching a face: beside the column, this far off the line
    const off = m.stub ? step : 0
    const lx = m.label.x + (vertArrow ? off : 0), ly = m.label.y - (vertArrow ? 0 : off)
    return { m, lx, ly, step, w: pillW, h: pillH, pill: { x: lx - pillW / 2, y: ly - pillH / 2, w: pillW, h: pillH } }
  })
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const onSolid = (p) => solids.some(r => hit(p, r))
  const clashes = (p) => avoid.some(r => hit(p, r)) || onSolid(p)
  const rectAt = (k, x, y) => ({ x: x - k.w / 2, y: y - k.h / 2, w: k.w, h: k.h })
  const place = (k, lx, ly) => { k.lx = lx; k.ly = ly; k.pill = rectAt(k, lx, ly) }
  /* Where each label may go, nearest its own place first: along its arrow (column edge to what stands on that
     side — its own place, the arrow's ends, just past each aisle label) and, at each, on the arrow or stepped
     off it to either side (one or two pill-widths). The aisle width labels have priority and the column's two
     labels may not overlap each other: the pair nearest home that meets both is drawn; with none, the pair
     that breaks the fewest. Never hidden — a column always shows its clear distance on both sides. */
  const u = vertArrow ? 'y' : 'x', len = u === 'y' ? 'h' : 'w'
  const spots = (k) => {
    const ends = [k.m.shaft[0][u], k.m.arrowhead[0][u]], lo = Math.min(...ends), hi = Math.max(...ends)
    const half = k[len] / 2, eps = 0.5 / lz, c0 = u === 'x' ? k.lx : k.ly
    // a number in its gap stays wholly in it: its centre at least half its length from either end
    const lo2 = k.m.stub ? lo : lo + half + 2 / lz, hi2 = k.m.stub ? hi : hi - half - 2 / lz
    const along = [c0, lo2, hi2]
    for (const r of avoid) along.push(r[u] - half - eps, r[u] + r[len] + half + eps)
    const line = vertArrow ? k.m.label.x : k.m.label.y
    const v = vertArrow ? 'x' : 'y', vlen = v === 'x' ? 'w' : 'h', vhalf = k[vlen] / 2
    // across the arrow: on it, one or two steps either side, and just past any aisle label within four steps
    // a number in its line's break stays on the line; one touching a face may step either side
    const offs = k.m.stub ? [0, k.step, -k.step, 2 * k.step, -2 * k.step] : [0]
    if (k.m.stub) for (const r of avoid) for (const e of [r[v] - vhalf - eps, r[v] + r[vlen] + vhalf + eps]) {
      const o = vertArrow ? e - line : line - e
      if (Math.abs(o) <= 4 * k.step) offs.push(o)
    }
    const out = []
    for (const c of along) {
      if (c !== c0 && (c < lo2 - 1e-9 || c > hi2 + 1e-9)) continue
      for (const o of offs) {
        const x = vertArrow ? line + o : c, y = vertArrow ? c : line - o
        const r = rectAt(k, x, y)
        out.push({ x, y, r, d: Math.hypot(x - k.lx, y - k.ly), bad: clashes(r) ? 1 : 0 })
      }
    }
    return out.sort((p, q) => p.d - q.d).slice(0, 60)          // the nearest few dozen are plenty
  }
  if (marks.length === 1) {
    const k = marks[0]
    if (clashes(k.pill)) { const ok = spots(k).find(p => !p.bad); if (ok) place(k, ok.x, ok.y) }
  } else if (marks.length === 2) {
    const [p, q] = marks
    if (clashes(p.pill) || clashes(q.pill) || hit(p.pill, q.pill)) {
      const sp = spots(p), sq = spots(q)
      let best = null
      for (const a of sp) for (const b of sq) {
        const bad = (hit(a.r, b.r) ? 10 : 0) + a.bad + b.bad, d = a.d + b.d
        if (!best || bad < best.bad || (bad === best.bad && d < best.d)) best = { a, b, bad, d }
      }
      place(p, best.a.x, best.a.y); place(q, best.b.x, best.b.y)
    }
  }
  /* The look (STUDIO.md §2, PlanDetail C18): a thin dotted #9AA29C line from the column to the face, no arrowheads,
     the number (ft-in, #767C74, Plus Jakarta Sans 600) in a break in the line; under travel in red. Touching a face:
     the number only, beside the column. A number whose gap is shorter than the number itself is not drawn (the line
     is) — so a number never sits on a rack or a column. Its box is kept (an invisible rect before the text, as a pill)
     so the selection bar keeps off it. */
  for (const k of marks) {
    const { m } = k
    const a = m.stub ? null : { x0: m.shaft[0].x, y0: m.shaft[0].y, x1: m.arrowhead[0].x, y1: m.arrowhead[0].y }
    const gapLen = a ? Math.hypot(a.x1 - a.x0, a.y1 - a.y0) : 0
    const tw = m.label.text.length * cfs * 0.56, th = cfs * 1.25, along = vertArrow ? th : tw
    // hidden: a gap narrower than its number, or (touching a face) no spot beside the column clear of a rack or column
    const fits = (m.stub || gapLen >= along + 4 / lz) && !clashes(k.pill)
    const { lx, ly } = k
    const line = m.short ? SHORT_COLOR : CLEAR_LINE, ink = m.short ? SHORT_COLOR : CLEAR_INK
    if (a) {
      if (fits) {
        // the line, broken round the number (where it was placed along the line)
        const c = vertArrow ? ly : lx, lo = Math.min(vertArrow ? a.y0 : a.x0, vertArrow ? a.y1 : a.x1), hi = Math.max(vertArrow ? a.y0 : a.x0, vertArrow ? a.y1 : a.x1)
        const b0 = Math.max(lo, c - along / 2 - 2 / lz), b1 = Math.min(hi, c + along / 2 + 2 / lz)
        const seg = (p, q) => (q - p > 1e-6 ? [{ op: 'line', points: vertArrow ? [a.x0, p, a.x0, q] : [p, a.y0, q, a.y0], stroke: line, strokeWidth: 1 / lz, dash: [2 / lz, 2 / lz] }] : [])
        out.push(...seg(lo, b0), ...seg(b1, hi))
      } else {
        out.push({ op: 'line', points: [a.x0, a.y0, a.x1, a.y1], stroke: line, strokeWidth: 1 / lz, dash: [2 / lz, 2 / lz] })
      }
    }
    if (!fits) continue
    out.push({ op: 'rect', x: lx - tw / 2, y: ly - th / 2, w: tw, h: th, fill: 'rgba(0,0,0,0)', opacity: 0 },
      { op: 'text', x: lx - tw / 2, y: ly - th / 2, w: tw, h: th, text: m.label.text, fontSize: cfs, fill: ink, fontFamily: CLEAR_FONT, fontStyle: '600' })
  }
  return out
}
/** What a clearance number may never sit on: every rack's footprint and every column ({ x, y, w, h }, world px). */
export function clearanceSolids(objects, gridSize = 40) {
  const out = []
  for (const o of objects || []) {
    if (!o) continue
    if (typeof o.type === 'string' && o.type.startsWith('rack_')) { const f = rackFootprint(o); if (f && f.w > 0) out.push({ x: f.x, y: f.y, w: f.w, h: f.h }) }
    else if (o.type === 'column_grid' && o.showGrid !== false) for (const c of expandColumnGrid(o, gridSize)) out.push({ x: c.x, y: c.y, w: c.w, h: c.h })
  }
  return out
}
const CLEAR_LINE = '#9AA29C', CLEAR_INK = '#767C74', CLEAR_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* ── marks on a rack, drawn in its local frame and turned with it ─────────── */
const grow = (r, lz) => {
  const min = MIN_MARK_PX / lz
  const width = Math.max(r.width, min), height = Math.max(r.height, min)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}
/** local (unrotated) point -> world, turning about the rack's centre (spin()'s pivot). */
const turner = (obj) => {
  const a = ((obj.rotation || 0) * Math.PI) / 180
  if (!a) return (x, y) => [x, y]
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2, c = Math.cos(a), s = Math.sin(a)
  return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
const crossOps = (r, T, color, sw) => [
  { op: 'line', points: [...T(r.x, r.y), ...T(r.x + r.width, r.y + r.height)], stroke: color, strokeWidth: sw },
  { op: 'line', points: [...T(r.x + r.width, r.y), ...T(r.x, r.y + r.height)], stroke: color, strokeWidth: sw },
]

/** The pallet positions a column blocks, in the rack's own (unrotated) frame
 *  — one rect per position and face. The X marks below and Check layout's
 *  highlight both come from this, so they always mark the same spots. */
export function blockedPositionRects(c, obj, gridSize) {
  if (c.bayIndex == null || !obj) return []
  const out = []
  for (const f of c.faces || [0]) for (const p of c.positionIndices || []) {
    if (isEmptySide(obj, c.bayIndex, f)) continue   // an empty bay side holds nothing to block (utils/bayEmpty.js)
    const raw = positionRectForIndex(obj, gridSize, c.bayIndex, p, f)
    if (raw && raw.width > 0) out.push(raw)
  }
  return out
}

/** The red X on each pallet position a column blocks (in-rack or pick zone). */
export function blockedFaceOps(c, obj, gridSize, lz) {
  const T = turner(obj), sw = 2 / lz, out = []
  for (const raw of blockedPositionRects(c, obj, gridSize)) out.push(...crossOps(grow(raw, lz), T, RED, sw))
  return out
}

/** The orange flag on an upright frame a column overlaps. */
export function uprightOps(h, obj, gridSize, lz) {
  if (!obj) return []
  const T = turner(obj), sw = 2 / lz
  return uprightFramesLocal(obj, gridSize).filter(f => f.upright === h.upright && h.faces.includes(f.face)).map(f => {
    const r = grow({ x: f.x, y: f.y, width: f.w, height: f.h }, lz)
    return { op: 'poly', points: [...T(r.x, r.y), ...T(r.x + r.width, r.y), ...T(r.x + r.width, r.y + r.height), ...T(r.x, r.y + r.height)],
      fill: 'rgba(230,126,34,0.25)', stroke: ORANGE, strokeWidth: sw }
  })
}

/** The red cross over a bay that holds no pallet position at all. */
export function oversizedOps(obj, gridSize, lz) {
  const bad = oversizedBayIndices(obj.beams, obj.palletWIn || 40)
  if (!bad.length) return []
  const T = turner(obj), out = []
  for (const b of bad) for (const [s, raw] of bayRectForIndex(obj, gridSize, b).entries()) if (!isEmptySide(obj, b, s)) out.push(...crossOps(grow(raw, lz), T, RED, 2 / lz))
  return out
}
