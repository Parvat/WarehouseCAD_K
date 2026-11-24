// rackOps.js
// ─────────────────────────────────────────────────────────────────────────────
// Rack drawing as DATA, not as markup.
//
// A rack's geometry is derived once, here, into a flat list of draw-ops in
// WORLD pixels. Konva paints that list (canvas2/shapes.jsx Ops); the PDF export
// reads the same list and emits SVG from it. One description, two renderers —
// so a rack can never look like one thing on screen and another on paper.
//
// Pure: no React, no store, no DOM. Given the same object it returns the same
// ops, which also makes the geometry testable without a canvas.
//
// (rack-design — design/rack-plan-colour.png) A rack has NO fill. It is drawn in
// its family's line colour (render/rackFamily.js): the outline, the frames, the
// lane posts, the face bars, the arrows and the face words; its pallet slots are
// dashed in the family's tint. Structure (frames, posts, face bars, a cantilever's
// spine and arms) is drawn at its REAL size with a 1-screen-px floor; hairlines
// (the outline, lane lines, slots) are a fixed SCREEN width, snapped to device
// pixels so they stay sharp at every zoom (shapes.jsx).
//
// ── Op shapes ────────────────────────────────────────────────────────────────
//   { op:'rect', x, y, w, h, border:true, stroke, strokeWidth }   the body: its outline (screen px), its hit area
//   { op:'rect', x, y, w, h, fill }                               a plain rect (a cantilever's clear hit body)
//   { op:'uprights', rects:[{x,y,w,h}], fill }                    filled structure at real size (frames, posts, bars)
//   { op:'lines', segs:[x1,y1,x2,y2,…], d, stroke, strokeWidth, dash? }   hairlines, screen px (d: the same as SVG)
//   { op:'slots', rects:[{x,y,w,h}], stroke, strokeWidth, dash }  pallet slots, dashed outlines, screen px
//   { op:'arrows', items:[{x, y0, y1}], head, color, strokeWidth } travel arrows in WORLD size, tail y0 → tip y1
//   { op:'dots', pts:[x,y,…], r, fill }                           posts (a mezzanine's), radius in world px
//   { op:'text', x, y, size, text, color, bold? }                 words at a real height (x the centre, y the top)
// ─────────────────────────────────────────────────────────────────────────────

import { BEAM_TYPES } from '../utils/rackTypes'
import { hasEmpty, isEmptySide } from '../utils/bayEmpty'
import { deepOf, deepGapOf } from '../utils/deep'   // (r2-double-deep)
import { positionsPerBeam } from '../utils/palletFit'
import { rackColors, RACK_FAMILIES } from './rackFamily'

/* The older names, kept for the code and tests that read them: the pallet family now (rack-design). */
export const RACK_PALETTE = {
  fill:      null,                          // no fill on any rack (rack-design)
  border:    RACK_FAMILIES.pallet.line,
  divider:   RACK_FAMILIES.pallet.tint,
  upright:   RACK_FAMILIES.pallet.line,
  structure: RACK_FAMILIES.pallet.line,
  conflict:  '#C0392B',
}

/** Screen widths (px): the outline, a hairline (lane lines, deep lines), a slot's dash line, the travel arrow. */
export const RACK_LINE = { edge: 1.25, hair: 1, lane: 1.5, slot: 1, arrow: 2, mezz: 3 }   // (rack-design-match) lane 1.5, arrow 2, mezz 3 — as the mockup
/** The pallet slots' dash, screen px. */
export const SLOT_DASH = [4, 3]
/** A face bar's real depth, inches (ENTRY / LOAD / PICK). */
export const FACE_BAR_IN = 4
/** The face words' real height, inches. */
export const FACE_TEXT_IN = 12
/** How far a slot sits in from its bay or lane on each side, inches. */
export const SLOT_INSET_IN = 3

/** The outline's width — kept for callers that ask for it (it is a screen width now, RACK_LINE.edge). */
export const RACK_BORDER_IN = 0.45
export const rackBorderWidth = () => RACK_LINE.edge

const inch = (v, gs) => (v / 12) * gs
const colorsOf = (obj) => rackColors(obj.type) || RACK_FAMILIES.pallet

/** Upright boundary positions across a beam rack.
 *  Layout is `upright | beam | upright | beam | upright`, so there are
 *  beams.length + 1 uprights and beams.length - 1 interior boundaries. */
export function uprightXs(obj, gridSize) {
  const upW   = ((obj.uprightWidth || 3) / 12) * gridSize
  const beams = Array.isArray(obj.beams) && obj.beams.length ? obj.beams : [96]
  const xs = [obj.x]
  let cursor = obj.x + upW
  for (const beamIn of beams) {
    cursor += (beamIn / 12) * gridSize
    xs.push(cursor)
    cursor += upW
  }
  return { xs, upW, beams }
}

/* ── shared op makers ─────────────────────────────────────────────────────── */

/** The body: its outline in the family colour (no fill) — and the rect a press inside it hits. */
const body = (x, y, w, h, stroke) => ({ op: 'rect', x, y, w, h, fill: null, stroke, strokeWidth: RACK_LINE.edge, border: true })

/** Hairline segments as one op (`d`: the same segments as SVG path data). */
function linesOp(segs, stroke, strokeWidth = RACK_LINE.hair, extra = {}) {
  if (!segs.length) return null
  let d = ''
  for (let i = 0; i < segs.length; i += 4) d += `M${segs[i]} ${segs[i + 1]}L${segs[i + 2]} ${segs[i + 3]}`
  return { op: 'lines', segs, d, stroke, strokeWidth, ...extra }
}

/** Dashed pallet slots, one op. */
const slotsOp = (rects, stroke) => (rects.length ? { op: 'slots', rects, stroke, strokeWidth: RACK_LINE.slot, dash: SLOT_DASH } : null)

/** Every upright frame of a beam rack, drawn to scale: a filled rect at the
 *  frame's real width (`uprightWidth`, 3" default) across each band — one
 *  op, one node, however many bays. Never drawn across a double row's flue. */
function uprightsOp(lefts, upW, bands, fill) {
  if (!lefts.length || !bands.length) return null
  const rects = []
  for (const x of lefts) for (const b of bands) rects.push({ x, y: b.y, w: upW, h: b.h })
  return { op: 'uprights', rects, fill }
}

/** The rects an `uprights` op paints, in world px: each at its real size. (The canvas then gives each a 1-screen-px
 *  floor and snaps it to whole pixels — render/pixelSnap.js — which is a screen matter, not data.) */
export function uprightDrawRects(op) {
  return op.rects.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
}

/** A face bar along the top (`side` 'top') or bottom face, FACE_BAR_IN deep, centred on the face line. */
const faceBar = (obj, side, gs) => {
  const t = inch(FACE_BAR_IN, gs), y = side === 'top' ? obj.y : obj.y + obj.height
  return { x: obj.x, y: y - t / 2, w: obj.width, h: t }
}
/** The face's words, outside the face: centred, FACE_TEXT_IN high. */
const faceText = (obj, side, text, color, gs) => {
  const s = inch(FACE_TEXT_IN, gs), gap = inch(FACE_BAR_IN, gs) / 2 + s * 0.35
  return { op: 'text', x: obj.x + obj.width / 2, y: side === 'top' ? obj.y - gap - s : obj.y + obj.height + gap, size: s, text, color, bold: true }
}

/* ── Beam racks ───────────────────────────────────────────────────────────── */

/** The pallet slots of a beam rack's bays: in each bay (between its two frames) as many pallets as its beam carries
 *  (utils/palletFit.js — the same count the positions use), across each band; a double-deep band is split into its
 *  deep positions. `skip(i, s)`: a bay side drawn empty. */
function beamSlotRects(obj, xs, upW, bands, gs, skip = null) {
  const pw = inch(obj.palletWIn || 40, gs), inset = inch(SLOT_INSET_IN, gs)
  const n = deepOf(obj), d = inch(obj.depthIn ?? 42, gs), g = inch(deepGapOf(obj), gs)
  const out = []
  bands.forEach((b, s) => {
    // the depth bands a pallet stands in: the face's whole depth, or each deep position (from the face inward)
    const rows = []
    if (n < 2) rows.push([b.y, b.h])
    else for (let k = 0; k < n; k++) {
      const y0 = b.dir === -1 ? b.y + b.h - (k + 1) * d - k * g : b.y + k * (d + g)
      if (y0 >= b.y - 1e-6 && y0 + d <= b.y + b.h + 1e-6) rows.push([y0, d])
    }
    for (let i = 0; i + 1 < xs.length; i++) {
      if (skip && skip(i, s)) continue
      const beamIn = ((xs[i + 1] - xs[i] - upW) / gs) * 12
      const per = positionsPerBeam(beamIn, obj.palletWIn || 40)
      if (!per) continue
      const bx = xs[i] + upW, bw = xs[i + 1] - bx, gap = (bw - per * pw) / (per + 1)
      for (const [ry, rh] of rows) {
        if (rh <= inset * 2) continue
        for (let j = 0; j < per; j++) out.push({ x: bx + gap + j * (pw + gap), y: ry + inset, w: pw, h: rh - inset * 2 })
      }
    }
  })
  return out
}

/** (r2-double-deep) A double-deep rack's frame lines: in each bay, a dashed line between the front and the rear pallet
 *  positions — across the middle of each deep spacing — on each face (`bands`: { y, h } of each face). One op. */
function deepLinesOp(obj, xs, upW, bands, gridSize, color) {
  const n = deepOf(obj)
  if (n < 2) return null
  const d = ((obj.depthIn ?? 42) / 12) * gridSize, g = (deepGapOf(obj) / 12) * gridSize
  const segs = []
  for (const b of bands) for (let k = 1; k < n; k++) {
    const yy = b.y + k * d + (k - 0.5) * g
    if (!(yy > b.y && yy < b.y + b.h)) continue
    for (let i = 0; i + 1 < xs.length; i++) segs.push(xs[i] + upW, yy, xs[i + 1], yy)
  }
  return linesOp(segs, color, RACK_LINE.hair, { name: 'deep-line', dash: SLOT_DASH })
}

/** SELECTIVE (`rack_row`, a double-deep one too) — the outline, its frames, and its pallet slots. */
export function rackRowOps(obj, gridSize) {
  const { xs, upW } = uprightXs(obj, gridSize)
  const { x, y, width: w, height: h } = obj
  const c = colorsOf(obj)
  const ops = [body(x, y, w, h, c.line)]
  const band = [{ y, h, dir: 1 }]
  const slots = slotsOp(beamSlotRects(obj, xs, upW, band, gridSize), c.tint)
  if (slots) ops.push(slots)
  const uprights = uprightsOp(xs, upW, band, c.line)
  if (uprights) ops.push(uprights)
  const dd = deepLinesOp(obj, xs, upW, band, gridSize, c.line)
  if (dd) ops.push(dd)
  return ops
}

/** DOUBLE ROW (`rack_double_row`) — two bands back to back with the flue gap
 *  between them, left empty: the gap itself, at its own real width, reads as the
 *  flue. A pair's empty bay sides (utils/bayEmpty.js) have no slots, and no
 *  upright between two empty bays (an upright beside a full bay is its frame). */
export function rackDoubleRowOps(obj, gridSize) {
  const { xs, upW } = uprightXs(obj, gridSize)
  const { x, y, width: w, height: h } = obj
  const c = colorsOf(obj)

  const flueH = ((obj.flueSpaceIn || 9) / 12) * gridSize
  /* Guard a flue taller than the object itself — a malformed rack should draw
     as one band rather than two inverted ones. */
  const rowH = Math.max(0, (h - flueH) / 2)
  if (rowH <= 0) return rackBoxOps(obj, gridSize)

  const topY = y
  const botY = y + rowH + flueH
  // each face deep from its aisle face inward: the top face from its top, the bottom from its bottom
  const bands = [{ y: topY, h: rowH, dir: 1 }, { y: botY, h: rowH, dir: -1 }]
  const ops = [body(x, topY, w, rowH, c.line), body(x, botY, w, rowH, c.line)]
  const empty = hasEmpty(obj)
  const slots = slotsOp(beamSlotRects(obj, xs, upW, bands, gridSize, empty ? (i, s) => isEmptySide(obj, i, s) : null), c.tint)
  if (slots) ops.push(slots)
  if (empty) {
    const n = xs.length - 1, rects = []
    for (const [s, by] of [[0, topY], [1, botY]]) {
      for (let k = 0; k <= n; k++) if (!(isEmptySide(obj, k - 1, s) || k === 0) || !(isEmptySide(obj, k, s) || k === n)) rects.push({ x: xs[k], y: by, w: upW, h: rowH })
    }
    if (rects.length) ops.push({ op: 'uprights', rects, fill: c.line })
  } else {
    const uprights = uprightsOp(xs, upW, bands, c.line)
    if (uprights) ops.push(uprights)
  }
  const dd = deepLinesOp(obj, xs, upW, bands, gridSize, c.line)
  if (dd) ops.push(dd)
  return ops
}

/** A rack's bare box, with no internal structure: a fallback for geometry that cannot be subdivided sensibly — a flue
 *  taller than the rack, say — NOT a zoom behaviour (the ops never depend on zoom). */
export function rackBoxOps(obj, gridSize = 40) {
  void gridSize
  return [body(obj.x, obj.y, obj.width, obj.height, colorsOf(obj).line)]
}

/* ── Lane racks ──────────────────────────────────────────────────────────────
   Drive-in, drive-through, push-back and pallet-flow share the chassis — lanes,
   each `palletDeep` slots deep — and differ in their cues: which faces carry a
   face bar and its words, and which way the arrows run.

   Lane width is DERIVED from the object's own width, never rebuilt from pallet
   dimensions: the object was dimensioned at creation and its width is what
   selection, snapping and the column check all measure, so the drawing has to
   subdivide that same box or the symbol drifts out of its own outline. */
export function laneGeom(obj, gridSize) {
  const lanes = Math.max(1, obj.lanes || 2)
  const upW   = ((obj.uprightWidth || 4) / 12) * gridSize
  const laneW = Math.max(0, (obj.width - (lanes + 1) * upW) / lanes)
  const postXs = Array.from({ length: lanes + 1 }, (_, i) => obj.x + i * (laneW + upW))
  const laneCx = Array.from({ length: lanes }, (_, i) => postXs[i] + upW + laneW / 2)
  return { lanes, upW, laneW, postXs, laneCx }
}

/** How deep a lane is drawn, in pallets: its own, kept to something drawable. */
const laneDeep = (obj) => Math.max(1, Math.min(Math.round(obj.palletDeep || 4), 20))

/** One rack of the lane family: `faces` { top, bottom } (each a word, or null for no face bar), `arrows` 'up' (into the
 *  lane from the bottom face) or 'down' (toward the bottom face), `posts` 'bars' (a frame the full depth — the flow
 *  racks) or 'squares' (a post at each pallet — the drive-ins). */
function laneOps(obj, gridSize, { faces, arrows, posts }) {
  const { upW, laneW, postXs, laneCx } = laneGeom(obj, gridSize)
  const { x, y, width: w, height: h } = obj
  const c = colorsOf(obj), deep = laneDeep(obj), sd = h / deep, inset = inch(SLOT_INSET_IN, gridSize)
  const ops = [body(x, y, w, h, c.line)]

  // the pallet slots: each lane, each pallet deep
  const slots = []
  if (laneW > inset * 2 && sd > inset * 2) for (const px of postXs.slice(0, -1)) for (let k = 0; k < deep; k++) slots.push({ x: px + upW + inset, y: y + k * sd + inset, w: laneW - inset * 2, h: sd - inset * 2 })
  const so = slotsOp(slots, c.tint)
  if (so) ops.push(so)

  if (posts === 'bars') {
    ops.push({ op: 'uprights', name: 'lane-posts', rects: postXs.map(px => ({ x: px, y, w: upW, h })), fill: c.line })
  } else {
    // a thin lane line at each post's centre, and a square post at each pallet along it
    const segs = []
    for (const px of postXs.slice(1, -1)) segs.push(px + upW / 2, y, px + upW / 2, y + h)
    const lo = linesOp(segs, c.line, RACK_LINE.lane)
    if (lo) ops.push(lo)
    const rects = []
    // (rack-design-match) a post square at each pallet, never under 6″ (the mockup's posts read as squares, not dots)
    const ps = Math.max(upW, inch(6, gridSize))
    for (const px of postXs) for (let k = 0; k <= deep; k++) rects.push({ x: px + upW / 2 - ps / 2, y: y + k * sd - ps / 2, w: ps, h: ps })
    ops.push({ op: 'uprights', name: 'lane-posts', rects, fill: c.line })
  }

  // the face bars and their words
  const bars = []
  for (const side of ['top', 'bottom']) if (faces[side]) bars.push(faceBar(obj, side, gridSize))
  if (bars.length) ops.push({ op: 'uprights', name: 'face-bar', rects: bars, fill: c.line })

  // the arrows, in the front (bottom) pallet of each lane
  if (arrows) {
    const s0 = y + h - sd + inset, s1 = y + h - inset, len = Math.max(0, (s1 - s0) * 0.7), mid = (s0 + s1) / 2
    if (len > 0) {
      const head = Math.min(len * 0.32, laneW * 0.25)
      const items = laneCx.map(cx => (arrows === 'up' ? { x: cx, y0: mid + len / 2, y1: mid - len / 2 } : { x: cx, y0: mid - len / 2, y1: mid + len / 2 }))
      ops.push({ op: 'arrows', items, head, color: c.line, strokeWidth: RACK_LINE.arrow })
    }
  }
  for (const side of ['top', 'bottom']) if (faces[side]) ops.push(faceText(obj, side, faces[side], c.line, gridSize))
  return ops
}

/** An `arrows` op's geometry (world px): each arrow's shaft (x1, y1, x2, y2) to its tip at y1, and its open head (a
 *  chevron: three points, stroked — rack-design-match, as the mockup; was a filled triangle).
 *  The canvas painter and the PDF export both draw from this. */
export function arrowGeom(o) {
  return o.items.map(it => {
    const dir = Math.sign(it.y1 - it.y0) || -1, hb = it.y1 - dir * o.head
    return { shaft: [it.x, it.y0, it.x, it.y1], head: [it.x - o.head * 0.5, hb, it.x, it.y1, it.x + o.head * 0.5, hb] }
  })
}

/** Each lane rack's faces: the word on its top and bottom face (a face bar with it), or none. */
export const LANE_FACES = {
  rack_drive_in:      { bottom: 'ENTRY' },
  rack_drive_through: { top: 'ENTRY', bottom: 'ENTRY' },
  rack_pushback:      { bottom: 'LOAD · PICK' },
  rack_pallet_flow:   { top: 'LOAD', bottom: 'PICK' },
}
/** How far a rack's face words reach past its `side` face ('top' | 'bottom'), world px — 0 with none there. The
 *  selected rack's dimension labels sit past them (canvas2/DimensionLabels.jsx), never over them. */
export function faceWordsReach(obj, side, gridSize = 40) {
  if (!LANE_FACES[obj?.type]?.[side]) return 0
  const s = inch(FACE_TEXT_IN, gridSize)
  return inch(FACE_BAR_IN, gridSize) / 2 + s * 0.35 + s
}

/** DRIVE-IN · LIFO — one entry: a face bar and ENTRY on the front, arrows into each lane. */
export const rackDriveInOps = (obj, gs) => laneOps(obj, gs, { faces: LANE_FACES.rack_drive_in, arrows: 'up', posts: 'squares' })
/** DRIVE-THROUGH · FIFO — an entry at both ends. */
export const rackDriveThroughOps = (obj, gs) => laneOps(obj, gs, { faces: LANE_FACES.rack_drive_through, arrows: 'up', posts: 'squares' })
/** PUSH-BACK · LIFO — one face loads and picks; the carts push back into the lane. */
export const rackPushbackOps = (obj, gs) => laneOps(obj, gs, { faces: LANE_FACES.rack_pushback, arrows: 'up', posts: 'bars' })
/** PALLET FLOW · FIFO — loaded at the back, picked at the front, the pallets rolling toward the pick face. */
export const rackPalletFlowOps = (obj, gs) => laneOps(obj, gs, { faces: LANE_FACES.rack_pallet_flow, arrows: 'down', posts: 'bars' })

/** Tower centres and the spine band for a cantilever.
 *  Towers are spread evenly across the object's own width rather than at a
 *  nominal 48" pitch, for the same reason lanes are: the box is what everything
 *  else measures, so the symbol has to fill it exactly. */
export function cantileverGeom(obj, gridSize) {
  const doubleSided = obj.doubleSided ?? true
  const towers  = Array.isArray(obj.towers) && obj.towers.length
    ? obj.towers : [36, 36, 36, 36, 36]
  const towerW  = ((obj.towerWidthIn   || 10) / 12) * gridSize
  const spineH  = ((obj.spineDepthIn   ||  4) / 12) * gridSize
  const armT    = ((obj.armThicknessIn ||  3) / 12) * gridSize

  /* Single-sided hangs its arms off a spine at the TOP (the wall side);
     double-sided centres the spine and throws arms both ways. */
  const spineY = doubleSided ? obj.y + (obj.height - spineH) / 2 : obj.y
  const step   = towers.length > 1 ? obj.width / (towers.length - 1) : obj.width
  const cxs    = towers.map((_, i) => obj.x + i * step)
  return { doubleSided, towers, towerW, spineH, armT, spineY, cxs }
}

/** CANTILEVER, from above — the column line (the spine, a square at each column), each column's arm, and the arms'
 *  reach as a dashed tint zone on each loaded side. */
export function rackCantileverOps(obj, gridSize) {
  const { doubleSided, towers, towerW, spineH, armT, spineY, cxs } = cantileverGeom(obj, gridSize)
  const c = colorsOf(obj)
  if (!cxs.length) return rackBoxOps(obj)
  const reach = Math.max(...cxs.map((_, i) => ((towers[i] || 36) / 12) * gridSize))
  const x0 = cxs[0], x1 = cxs[cxs.length - 1]
  const zones = [{ x: x0, y: doubleSided ? spineY - reach : spineY + spineH, w: x1 - x0, h: reach }]
  if (doubleSided) zones.push({ x: x0, y: spineY + spineH, w: x1 - x0, h: reach })

  const ops = [
    /* A clear body: the column line and arms are slender, and without it a press inside the rack's own outline would
       fall straight through to the canvas instead of selecting it. */
    { op: 'rect', x: obj.x, y: obj.y, w: obj.width, h: obj.height, fill: 'transparent' },
  ]
  const zo = slotsOp(zones.filter(z => z.w > 0 && z.h > 0), c.tint)
  if (zo) ops.push({ ...zo, name: 'arm-reach' })
  const arms = []
  cxs.forEach((cx, i) => {
    const armPx = ((towers[i] || 36) / 12) * gridSize
    arms.push({ x: cx - armT / 2, y: doubleSided ? spineY - armPx : spineY + spineH, w: armT, h: armPx })
    if (doubleSided) arms.push({ x: cx - armT / 2, y: spineY + spineH, w: armT, h: armPx })
  })
  ops.push({ op: 'uprights', name: 'arms', rects: arms, fill: c.line })
  ops.push({ op: 'uprights', name: 'spine', rects: [{ x: x0, y: spineY, w: x1 - x0, h: spineH }], fill: c.line })
  ops.push({ op: 'uprights', name: 'columns', rects: cxs.map(cx => ({ x: cx - towerW / 2, y: spineY + spineH / 2 - towerW / 2, w: towerW, h: towerW })), fill: c.line })
  return ops
}

/** MEZZANINE — a raised floor, not a rack: a dashed outline with a thin cross, its posts along the edges, and its name
 *  and size in the middle. */
export function rackMezzanineOps(obj, gridSize) {
  const { x, y, width: w, height: h } = obj
  const c = colorsOf(obj)
  const ops = [{ ...body(x, y, w, h, null) }]   // the body: its hit area only — its edge is the dashed line below
  ops.push(linesOp([x, y, x + w, y, x + w, y, x + w, y + h, x + w, y + h, x, y + h, x, y + h, x, y], c.line, RACK_LINE.mezz, { name: 'mezz-edge', dash: [9, 5] }))
  ops.push(linesOp([x, y, x + w, y + h, x + w, y, x, y + h], c.line, RACK_LINE.hair, { name: 'mezz-cross', opacity: 0.6 }))
  // the posts: the corners, and along each edge no more than 25 ft apart
  const pts = [], step = 25 * gridSize
  const nx = Math.max(1, Math.ceil(w / step)), ny = Math.max(1, Math.ceil(h / step))
  for (let i = 0; i <= nx; i++) pts.push(x + (w * i) / nx, y, x + (w * i) / nx, y + h)
  for (let j = 1; j < ny; j++) pts.push(x, y + (h * j) / ny, x + w, y + (h * j) / ny)
  ops.push({ op: 'dots', pts, r: inch(5, gridSize), fill: c.line })
  // its name and size, centred
  const s1 = inch(14, gridSize), s2 = inch(11, gridSize)   // (rack-design-match — was 16″ / 12″)
  if (w > s1 * 7 && h > (s1 + s2) * 1.6) {
    const ft = (v) => `${Math.round((v / gridSize) * 10) / 10}′`
    ops.push({ op: 'text', x: x + w / 2, y: y + h / 2 - (s1 + s2 * 1.2) / 2, size: s1, text: 'MEZZANINE', color: c.line, bold: true, halo: true })
    ops.push({ op: 'text', x: x + w / 2, y: y + h / 2 - (s1 + s2 * 1.2) / 2 + s1 * 1.15, size: s2, text: `${ft(w)} × ${ft(h)}`, color: c.line, halo: true })
  }
  return ops
}

/** SHELVING — hand-picked units: each unit's outline (about 4 ft wide, the run split evenly) with its shelf count
 *  inside, in the family colour. */
export function rackShelvingOps(obj, gridSize) {
  const { x, y, width: w, height: h } = obj
  const c = colorsOf(obj)
  const n = Math.max(1, Math.round(w / (4 * gridSize))), uw = w / n
  const ops = [body(x, y, w, h, c.line)]
  const segs = []
  for (let i = 1; i < n; i++) segs.push(x + i * uw, y, x + i * uw, y + h)
  const lo = linesOp(segs, c.line, RACK_LINE.hair, { name: 'shelf-units' })
  if (lo) ops.push(lo)
  const s = Math.min(h * 0.55, inch(13, gridSize)), shelves = Math.max(1, Math.round(obj.shelves || 5))
  if (s > 0) for (let i = 0; i < n; i++) ops.push({ op: 'text', x: x + (i + 0.5) * uw, y: y + (h - s) / 2, size: s, text: String(shelves), color: c.line })
  return ops
}

const BUILDERS = {
  rack_row: rackRowOps,
  rack_double_row: rackDoubleRowOps,
  rack_drive_in: rackDriveInOps,
  rack_drive_through: rackDriveThroughOps,
  rack_pushback: rackPushbackOps,
  rack_pallet_flow: rackPalletFlowOps,
  rack_cantilever: rackCantileverOps,
  rack_mezzanine: rackMezzanineOps,
  rack_shelving: rackShelvingOps,
}

/** Draw-ops for a rack, or null if this type is not ported yet (the caller
 *  then leaves it to the existing renderer rather than drawing it wrong).
 *
 *  Takes no zoom and has no level-of-detail switch: the ops are identical at
 *  2% and 400%, so a rack's op list can be built once per object rather than
 *  rebuilt whenever the view changes. */
export function rackDrawOps(obj, { gridSize = 40 } = {}) {
  if (!obj || !BUILDERS[obj.type]) return null
  if (!(obj.width > 0) || !(obj.height > 0)) return null
  return BUILDERS[obj.type](obj, gridSize)
}

/** Types this module can currently draw — the Konva layer uses it to decide
 *  what it is allowed to take over from the SVG renderer. */
export const PORTED_RACK_TYPES = new Set(Object.keys(BUILDERS))

/** Types that actually have BAYS, which is a smaller set than the types this
 *  module can draw. Lane racks are divided into lanes, a cantilever into
 *  towers, and a mezzanine or shelving unit into neither — asking any of them
 *  which bay a click landed in is a category error, and before this set existed
 *  they would each have answered "bay 0" from a defaulted 96in beam. */
const BAY_TYPES = BEAM_TYPES   // the beam racks (utils/rackTypes.js — R1)
/** Turn a dragged WIDTH back into a bay count.
 *
 *  A rack resize is semantic, not a scale: dragging the end of a rack adds or
 *  removes BAYS, it does not stretch the bays it already has. A Transformer
 *  hands back a scale factor, so this is the conversion that makes the gesture
 *  mean the right thing — invert the same width formula the generator uses,
 *
 *      width = uprightWidth x (bays + 1) + sum(beams)
 *
 *  and round to the nearest whole bay. Rounding, not truncating: dragging a
 *  hair past the midpoint of a bay should gain it, or the rack feels like it
 *  resists the pointer.
 *
 *  Returns null when the type has no bays, so the caller can fall back to a
 *  plain geometric resize for a deck or a shelving unit. */
export function bayCountForWidth(obj, widthPx, gridSize = 40) {
  if (!obj || !BAY_TYPES.has(obj.type)) return null
  if (!(widthPx > 0) || !(gridSize > 0)) return null
  const upIn   = obj.uprightWidth || 3
  const beams  = Array.isArray(obj.beams) && obj.beams.length ? obj.beams : [96]
  const beamIn = beams[0] || 96
  const widthIn = (widthPx / gridSize) * 12
  const bays = Math.round((widthIn - upIn) / (upIn + beamIn))
  return Math.max(1, bays)
}

/** The store patch for a rack resized to `widthPx`: a new bay list, and the
 *  exact width that bay list actually measures.
 *
 *  The width is recomputed from the bays rather than kept as the dragged value,
 *  so the object's width and its bay list can never disagree — everything
 *  downstream (capacity, the column check, snapping) reads width. */
export function resizeRackToWidth(obj, widthPx, gridSize = 40) {
  const bays = bayCountForWidth(obj, widthPx, gridSize)
  if (bays == null) return null
  const upIn   = obj.uprightWidth || 3
  const prev   = Array.isArray(obj.beams) && obj.beams.length ? obj.beams : [96]
  const beamIn = prev[0] || 96
  const nextBeams = Array.from({ length: bays }, (_, i) => prev[i] ?? beamIn)
  const totalIn = upIn * (bays + 1) + nextBeams.reduce((s, b) => s + b, 0)
  return { beams: nextBeams, width: (totalIn / 12) * gridSize }
}

/** Which bay does a world-x fall in? Returns a 0-based index, or null if the
 *  point is outside the rack.
 *
 *  Consolidating bays into one path removed the per-bay node that used to
 *  answer this by being clicked, so the hit test moves here — where the bay
 *  geometry is already derived, and where it can be tested without a canvas.
 *
 *  A click landing on an upright resolves to the bay it borders rather than
 *  returning null: the uprights are only a few inches wide, and a dead strip
 *  between every bay would feel broken long before it felt precise. */
export function bayAtPoint(obj, worldX, gridSize = 40) {
  if (!obj || !BAY_TYPES.has(obj.type)) return null
  if (!(obj.width > 0)) return null
  if (worldX < obj.x || worldX > obj.x + obj.width) return null

  const { xs, beams } = uprightXs(obj, gridSize)
  for (let i = 0; i < beams.length; i++) {
    if (worldX <= xs[i + 1]) return i
  }
  return beams.length - 1        // past the last beam = the trailing upright
}
