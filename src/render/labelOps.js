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
import { AISLE_LABEL_FONT_PX, AISLE_LABEL_PADX_PX } from '../canvas2/hitTest'
import { visibleClearanceMarks, aisleWarningRect, SHORT_COLOR } from '../canvas2/aisleMarks'
import { positionRectForIndex, bayRectForIndex } from './bayGeom'
import { uprightFramesLocal } from '../generate/columnCheck'
import { oversizedBayIndices } from '../utils/capacity'

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
export function aisleLabelOps(L, lz) {
  const { isHoriz, gapLo, gapHi, labelMid, positions, text } = L
  const fs = AISLE_LABEL_FONT_PX / lz, aw = 5 / lz, sw = 1 / lz, clr = '#f0b429'
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
    out.push(...pillOps(lx, ly, text, fs, lz, { color: '#92400e', bg: 'rgba(255,251,235,0.9)', padX: AISLE_LABEL_PADX_PX / lz, heightScale: 1.5, rx: 2 / lz, stroke: clr, strokeWidth: 0.5 / lz, opacity: 0.95 }))
  }
  return out
}

/** One column standing in an aisle: the red aisle shade when pinched (always),
 *  and the clearance arrows + distance pills (only the red "under travel"
 *  ones when the Column labels switch is off). */
export function clearanceOps(block, col, lz, gridSize = 40, showLabels = true) {
  if (!col || !block.axis) return []
  const fs = 9 / lz, sw = 1.6 / lz
  const out = []
  const warn = aisleWarningRect(block, col)
  if (warn) out.push({ op: 'rect', name: 'aisle-warning', x: warn.x, y: warn.y, w: warn.w, h: warn.h, fill: 'rgba(192,57,43,0.16)', stroke: SHORT_COLOR, strokeWidth: 1.5 / lz, dash: [6 / lz, 4 / lz] })
  for (const m of visibleClearanceMarks(block, col, lz, gridSize, showLabels)) {
    /* A gap shorter than its own label can't hold it: slide the pill off to
       the side of the arrow instead of over the column and rack (text is
       always horizontal, so the pill's extent along the arrow differs by
       orientation). */
    const pillW = m.label.text.length * fs * 0.62 + (3 / lz) * 2, pillH = fs * 1.4
    const gapLen = Math.hypot(m.arrowhead[0].x - m.shaft[0].x, m.arrowhead[0].y - m.shaft[0].y)
    const along = block.axis === 'y' ? pillH : pillW, across = block.axis === 'y' ? pillW : pillH
    const off = gapLen < along + 4 / lz ? across / 2 + 6 / lz : 0
    const lx = m.label.x + (block.axis === 'y' ? off : 0), ly = m.label.y - (block.axis === 'x' ? off : 0)
    out.push({ op: 'line', points: [m.shaft[0].x, m.shaft[0].y, m.shaft[1].x, m.shaft[1].y], stroke: m.color, strokeWidth: sw },
      { op: 'poly', points: m.arrowhead.flatMap(q => [q.x, q.y]), fill: m.color },
      ...pillOps(lx, ly, m.label.text, fs, lz, { color: m.color, bg: m.short ? 'rgba(254,226,226,0.95)' : 'rgba(224,242,254,0.92)', padX: 3 / lz, heightScale: 1.4, rx: 2 / lz, stroke: m.short ? SHORT_COLOR : '#7dd3fc', strokeWidth: 0.5 / lz, opacity: 0.95 }))
  }
  return out
}

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
  for (const b of bad) for (const raw of bayRectForIndex(obj, gridSize, b)) out.push(...crossOps(grow(raw, lz), T, RED, 2 / lz))
  return out
}
