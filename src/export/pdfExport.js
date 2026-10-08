// export/pdfExport.js
// ─────────────────────────────────────────────────────────────────────────────
// Headless PDF export — replaces the old exportToPDFNow's DOM-clone-the-live-
// canvas approach entirely. This module never touches a mounted canvas: it
// reads the store's `objects` directly and draws them itself, the same way
// canvas2's Scene.jsx draws them — floor plans from getFpVertices/insetPolygon,
// column grids from expandColumnGrid, racks from render/rackOps.js's
// rackDrawOps (the renderer-neutral op list ALSO used by canvas2's Scene.jsx,
// so an export and the on-screen canvas2 drawing can never draw a rack two
// different ways). The output is one self-contained SVG string, in WORLD
// coordinates, wrapped in an A1-sized print page — no dependency on which
// canvas engine (or whether ANY canvas) is currently mounted.
//
// Scope: floor plans, zones (office, staging, washroom, custom area: a tinted
// rectangle and its name, as canvas2 draws them), column grids, every
// PORTED_RACK_TYPES rack, and the
// drawing's labels and marks — aisle and cross-aisle widths, column clearance
// labels and red aisle warnings, X marks, upright flags, oversized bays —
// from render/labelOps.js, the SAME ops the canvas paints, at the same Label
// size (labels are drawing size, so a label is as big on paper, relative to
// the racks, as on screen). Annotations, freehand strokes, free text and the
// selection-only dimension labels are NOT drawn here; see the bug journal
// entry for why that's a deliberate boundary, not an oversight.
// ─────────────────────────────────────────────────────────────────────────────

import { getFpVertices, insetPolygon, pxToFtIn } from '../utils/canvas'
import { expandColumnGrid } from '../generate/columnCheck'
import { rackDrawOps, PORTED_RACK_TYPES, uprightDrawRects, travelArrowGeom } from '../render/rackOps'
import { aisleLabelOps, aisleLabelBoxes, clearanceOps, blockedFaceOps, uprightOps, oversizedOps } from '../render/labelOps'
import { labelScale, autoPdfLabelInches, aisleLabelScale } from '../render/labelSize'
import { columnGridOps } from '../render/columnDraw'
import { aisleLabelLayout } from '../canvas2/hitTest'
import { crossAisleLabels } from '../canvas2/crossAisles'
import { useLabelPrefs } from '../canvas2/labelPrefs'
import { getColumnCheckView } from '../generate/columnCheckView'
import { checkColumns } from '../generate/columnCheck'
import { layoutColumns, layoutFloors } from '../generate/usableCapacity'
import { isShown, layerShown } from '../utils/layers'

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_')

// One real-world millimetre per world px, at the app's fixed 40px = 1ft
// convention (gridSize varies per-document, but the px-per-foot ratio is
// always gridSize — this stays independent of that by converting through
// feet, not assuming 40).
const FT_TO_MM = 304.8
const mmPerWorldPx = (gridSize) => FT_TO_MM / gridSize

const A1 = { w: 841, h: 594 } // landscape mm; swapped for a tall plan

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* On the sheet = on a shown layer (utils/layers.js). A LOCKED layer still
   prints: locking only stops picking, the same as on the canvas. */
const isLayerUsable = (layerMap, obj) => isShown(layerMap, obj)

/* ── Bounds — only over what this exporter actually draws, so an unrendered
   annotation off in a corner can't blow out the sheet's scale. */
function computeBounds(objects, gridSize) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const eat = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const o of objects) {
    if (!o) continue
    if (FP_TYPES.has(o.type)) {
      const verts = o.fpVerts || getFpVertices(o)
      for (const v of verts) eat(v.x, v.y)
    } else if (o.type === 'column_grid') {
      for (const c of expandColumnGrid(o, gridSize)) { eat(c.x, c.y); eat(c.x + c.w, c.y + c.h) }
    } else if (isZone(o)) {
      eat(o.x, o.y); eat(o.x + o.width, o.y + o.height)
    } else if (PORTED_RACK_TYPES.has(o.type)) {
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2
      const rot = ((o.rotation || 0) * Math.PI) / 180
      // Rotated corners, so a turned rack can't clip off the sheet edge.
      for (const [cxo, cyo] of [[0, 0], [o.width, 0], [o.width, o.height], [0, o.height]]) {
        const dx = cxo - o.width / 2, dy = cyo - o.height / 2
        eat(cx + dx * Math.cos(rot) - dy * Math.sin(rot), cy + dx * Math.sin(rot) + dy * Math.cos(rot))
      }
    }
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/* ── Floor plan — ported from canvas2's FloorPlanShape, SVG instead of a Konva
   sceneFunc: outer verts fill the wall colour, the inset polygon (same
   insetPolygon used on screen) cuts the interior out via evenodd, so the
   wall band is always the true wall thickness at any zoom the PDF is viewed
   at — it's real geometry, not a stroke width standing in for one.

   Print default differs from the screen default on purpose: canvas2's own
   default interior fill is near-black (right for sitting on a dark studio
   canvas), which would print as a black slab covering most of the sheet.
   An explicit obj.fill (the author picked a colour) is always honoured;
   only the UNSET case gets the print-appropriate default. */
function floorPlanSVG(obj, gridSize) {
  const verts = obj.fpVerts || getFpVertices(obj)
  if (!verts || verts.length < 3) return ''
  const wt = obj.wallThicknessFt ? obj.wallThicknessFt * gridSize : (obj.strokeWidth || 10)
  const inner = insetPolygon(verts, wt)
  const wallColor = obj.stroke || '#4a5568'
  const floorColor = obj.noFill ? 'none' : (obj.fill || '#ffffff')
  const path = (pts) => pts.map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ') + ' Z'
  return `<g opacity="${obj.opacity ?? 1}">` +
    (floorColor !== 'none' ? `<path d="${path(inner)}" fill="${floorColor}"/>` : '') +
    `<path d="${path(verts)} ${path([...inner].reverse())}" fill="${wallColor}" fill-rule="evenodd"/>` +
    `</g>`
}

/* ── Column grid — the real column squares in the canvas's own look
   (render/columnDraw.js: solid body, I-beam web and flanges, a thin outline
   in drawing units), from the same expandColumnGrid the check measures. */
/* ── Zone — canvas2's ZoneShape (shapes.jsx): its colour as a light tint and
   a 1.5-unit outline, its name centred, drawing-size text sized to the zone. */
function zoneSVG(obj, gridSize) {
  if (!(obj.width > 0) || !(obj.height > 0)) return ''
  const stroke = /^#[0-9a-f]{6}$/i.test(obj.stroke || '') ? obj.stroke : '#64748b'
  const fs = Math.max(gridSize, Math.min(4 * gridSize, Math.min(obj.width, obj.height) * 0.18))
  const name = esc(obj.label || 'Zone')
  return `<g data-zone="${esc(obj.id || '')}">` +
    `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" fill="${stroke}" fill-opacity="0.13" stroke="${stroke}" stroke-width="${gridSize * 0.0375}"/>` +
    `<text x="${obj.x + obj.width / 2}" y="${obj.y + obj.height / 2}" text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif" font-weight="600" font-size="${fs}" fill="${stroke}">${name}</text></g>`
}

function columnGridSVG(obj, gridSize) {
  const g = columnGridOps(obj, gridSize)
  if (!g) return ''
  return `<g>` +
    `<path d="${g.body}" fill="${g.color}" opacity="${g.opacity.body}"/>` +
    `<path d="${g.web}" fill="${g.color}" opacity="${g.opacity.web}"/>` +
    `<path d="${g.flanges}" fill="${g.color}" opacity="${g.opacity.flanges}"/>` +
    `<path d="${g.outline}" fill="none" stroke="${g.color}" stroke-width="${g.outlineWidth}"/>` +
    `</g>`
}

/* ── One rackDrawOps op → an SVG element. Same op shapes canvas2's Ops
   component (shapes.jsx) paints with Konva — ported to markup instead of
   canvas calls, not reinvented. `lz` is the sheet's label scale: the travel
   arrows are drawing size, like the labels. */
function opToSVG(o, lz) {
  if (o.op === 'rect') {
    return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" ` +
      `fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.strokeWidth ?? 1}" ` +
      `opacity="${o.opacity ?? 1}"/>`
  }
  if (o.op === 'path') {
    return `<path d="${o.d}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" ` +
      `stroke-width="${o.strokeWidth ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ` +
      `opacity="${o.opacity ?? 1}"/>`
  }
  /* Uprights at their real width, exactly as on screen. */
  if (o.op === 'uprights') {
    return `<g fill="${o.fill}">` +
      uprightDrawRects(o).map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`).join('') +
      `</g>`
  }
  /* Travel arrows: drawing size at the sheet's label size (travelArrowGeom,
     the same geometry the canvas draws). */
  if (o.op === 'arrows') {
    const g = travelArrowGeom(o, lz)
    return `<g stroke="${o.color}" fill="${o.color}" stroke-width="${g.strokeWidth}">` +
      g.arrows.map(a => `<line x1="${a.shaft[0]}" y1="${a.shaft[1]}" x2="${a.shaft[2]}" y2="${a.shaft[3]}"/>` +
        `<polygon points="${a.head[0]},${a.head[1]} ${a.head[2]},${a.head[3]} ${a.head[4]},${a.head[5]}"/>`).join('') + `</g>`
  }
  return ''
}

/* ── One label op (render/labelOps.js) → an SVG element: the same ops the
   canvas paints with Konva (canvas2/LabelOps.jsx), in world units. */
const pts = (a) => { let out = ''; for (let i = 0; i < a.length; i += 2) out += (i ? ' ' : '') + a[i] + ',' + a[i + 1]; return out }
const dashAttr = (d) => (d && d.length ? ` stroke-dasharray="${d.join(' ')}"` : '')
export function labelOpToSVG(o) {
  const op = ` opacity="${o.opacity ?? 1}"`
  if (o.op === 'line') return `<polyline points="${pts(o.points)}" fill="none" stroke="${o.stroke}" stroke-width="${o.strokeWidth}"${dashAttr(o.dash)}${op}/>`
  if (o.op === 'poly') return `<polygon points="${pts(o.points)}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.strokeWidth ?? 0}"${op}/>`
  if (o.op === 'rect') return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.cornerRadius ?? 0}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.strokeWidth ?? 0}"${dashAttr(o.dash)}${op}/>`
  if (o.op === 'text') return `<text x="${o.x + o.w / 2}" y="${o.y + o.h / 2}" font-size="${o.fontSize}" font-family="${o.fontFamily}" fill="${o.fill}" text-anchor="middle" dominant-baseline="central">${esc(o.text)}</text>`
  return ''
}

/* ── The labels and marks layer, in the canvas's own order (Overlays.jsx):
   aisle labels, cross-aisle labels, column clearances + red warnings, X
   marks, upright flags, oversized bays. `opts`: labelSize, showColumnLabels,
   showAisles, and the column check's profile / pickBothSides / showMarks. */
export function labelsSVG(objects, gridSize, opts) {
  const lz = labelScale(opts.labelSize, gridSize)   // a Label size key or inches
  const ops = []
  // the aisle width labels graded as on screen: coloured while the Checks layer and the markings are on
  const warnProfile = opts.showMarks ? (opts.profile || null) : null
  if (opts.showAisles) {
    for (const a of objects) {
      if (a.type !== 'aisle') continue
      const L = aisleLabelLayout(a, objects, gridSize, { profile: warnProfile })
      if (L) ops.push(...aisleLabelOps(L, aisleLabelScale(a, opts.labelSize, gridSize)))
    }
    for (const L of crossAisleLabels(objects, gridSize)) ops.push(...aisleLabelOps(L, lz))
  }
  if (opts.showMarks) {
    const racks = objects.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_'))
    const columns = layoutColumns(objects, gridSize)
    const byId = new Map()
    for (const o of objects) if (!byId.has(o.id)) byId.set(o.id, o)
    if (racks.length && columns.length) {
      const res = checkColumns({ racks, columns, profile: opts.profile, gridSize, pickBothSides: opts.pickBothSides, floors: layoutFloors(objects) })
      // a clearance label keeps clear of the aisle width labels drawn above (they have priority)
      const avoid = opts.showAisles ? aisleLabelBoxes(objects, gridSize, opts.labelSize, { profile: warnProfile }) : []
      for (const b of res.aisleBlocks) ops.push(...clearanceOps(b, columns[b.columnIndex], lz, gridSize, opts.showColumnLabels, avoid))
      for (const c of [...res.rackConflicts, ...res.pickBlocks]) ops.push(...blockedFaceOps(c, byId.get(c.rackId), gridSize, lz))
      for (const h of res.uprightHits) ops.push(...uprightOps(h, byId.get(h.rackId), gridSize, lz))
    }
    for (const o of racks) if ((o.type === 'rack_row' || o.type === 'rack_double_row') && Array.isArray(o.beams) && o.beams.length) ops.push(...oversizedOps(o, gridSize, lz))
  }
  return `<g class="labels">${ops.map(labelOpToSVG).join('')}</g>`
}

/* ── One rack. rackDrawOps returns ops in the object's own unrotated local
   frame (same contract canvas2's RackShape relies on) — rotation is applied
   here as an SVG transform around the object's own centre, the same pivot
   canvas2/shapes.jsx's spin() uses, so a turned rack prints exactly as it
   sits on screen. */
function rackSVG(obj, gridSize, lz) {
  const ops = rackDrawOps(obj, { gridSize })
  if (!ops) return ''
  const rot = obj.rotation || 0
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const transform = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''
  return `<g${transform}>${ops.map(o => opToSVG(o, lz)).join('')}</g>`
}

/* ── Scale bar — the tick SPACING is drawn in the same world-unit coordinate
   space as the plan itself, so the distance it claims to represent is
   correct by construction (no separate mm/scale arithmetic to keep in sync
   with the plan). The bar's own INK — its height, stroke, and label text —
   is a UI/readability concern, not a represented distance, and is sized in
   world units DERIVED FROM `u` (world units per physical mm, at this sheet's
   final print scale) so it comes out a fixed, legible size on paper (a ~3mm
   label) regardless of whether the plan is 50ft or 2,000ft across. Sizing
   it in raw world-unit literals instead (the bug this replaced) meant "10
   world units" of text against a 240ft building — a few millimetres of
   REAL-WORLD height, invisible once that building is scaled down to fit a
   sheet. */
function scaleBarSVG(x, y, gridSize, u) {
  const ftPerTick = Math.max(10, Math.round((200 / gridSize) / 10) * 10) // a readable tick size at typical plan sizes
  const tickPx = ftPerTick * gridSize
  const ticks = 4
  const h = 3 * u        // ~3mm tall ticks
  const fs = 3.2 * u      // ~3.2mm text
  let bars = ''
  for (let i = 0; i < ticks; i++) {
    bars += `<rect x="${x + i * tickPx}" y="${y}" width="${tickPx}" height="${h}" ` +
      `fill="${i % 2 === 0 ? '#111' : '#fff'}" stroke="#111" stroke-width="${0.3 * u}"/>`
  }
  let labels = ''
  for (let i = 0; i <= ticks; i++) {
    labels += `<text x="${x + i * tickPx}" y="${y + h + fs * 1.3}" font-size="${fs}" font-family="Arial, sans-serif" ` +
      `text-anchor="middle" fill="#111">${i * ftPerTick}'</text>`
  }
  return `<g>${bars}${labels}` +
    `<text x="${x}" y="${y - fs * 0.6}" font-size="${fs}" font-family="Arial, sans-serif" fill="#111">SCALE (FEET)</text></g>`
}

/* ── Title block — bottom-right corner, the standard CAD sheet position, a
   fixed physical size on the page (72mm × 30mm, derived from `u` the same
   way the scale bar is) — NOT a fraction of the plan's own extent, which
   would make the title block balloon on a huge building and shrink to
   nothing on a small one. Scale ratio is computed from the ACTUAL print
   transform (paper mm ÷ real-world mm of the drawn content) by the caller,
   not assumed — it is exactly what the sheet prints at, whatever the plan's
   real size turns out to be. */
function titleBlockSVG(x, y, u, { title, scaleRatio, date }) {
  const w = 72 * u, h = 30 * u
  const rows = [
    ['PROJECT', title],
    ['SCALE', `1 : ${scaleRatio}`],
    ['DATE', date],
    ['SHEET', 'A1'],
  ]
  const rowH = h / (rows.length + 1)
  const padX = 2 * u
  let inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#111" stroke-width="${0.4 * u}"/>` +
    `<text x="${x + padX}" y="${y + rowH * 0.7}" font-size="${4.5 * u}" font-weight="700" font-family="Arial, sans-serif" fill="#111">TRACE</text>` +
    `<line x1="${x}" y1="${y + rowH}" x2="${x + w}" y2="${y + rowH}" stroke="#111" stroke-width="${0.25 * u}"/>`
  rows.forEach(([label, value], i) => {
    const ry = y + rowH * (i + 1.7)
    inner += `<text x="${x + padX}" y="${ry}" font-size="${2.6 * u}" font-family="Arial, sans-serif" fill="#666">${esc(label)}</text>` +
      `<text x="${x + w - padX}" y="${ry}" font-size="${3 * u}" font-family="Arial, sans-serif" text-anchor="end" fill="#111">${esc(value)}</text>`
  })
  return `<g>${inner}</g>`
}

/** Builds the full print page as one self-contained SVG string, in world
 *  coordinates, sized in real mm so the browser's own print pipeline scales
 *  it to a true A1 sheet — no rasterization, no separate PDF library: the
 *  SVG's width/height are physical mm, its viewBox is world px, and the
 *  browser does the (exact, vector) conversion between the two. */
/* `labels`: overrides for the label layer; by default the canvas's own
   current settings (labelPrefs, the column check's published view). */
export function buildLayoutSVG(objects, layers, gridSize, { title = 'Untitled Layout', labels = {} } = {}) {
  const prefs = useLabelPrefs.getState(), view = getColumnCheckView()
  const labelOpts = { showColumnLabels: true, showAisles: true, ...view, ...labels }
  const layerMap = new Map((layers || []).map(l => [l.id, l]))
  /* the Aisles layer carries the aisle labels, the Checks layer every mark */
  labelOpts.showAisles = labelOpts.showAisles && layerShown(layerMap, 'aisles')
  labelOpts.showMarks = labelOpts.showMarks !== false && layerShown(layerMap, 'checks')
  const usable = (o) => isLayerUsable(layerMap, o)

  const bounds = computeBounds(objects.filter(usable), gridSize) || { x: 0, y: 0, width: gridSize * 40, height: gridSize * 30 }

  const pad = Math.max(bounds.width, bounds.height) * 0.05
  const titleStripH = Math.max(bounds.height * 0.14, gridSize * 12)
  const vb = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2 + titleStripH,
  }

  const landscape = vb.width >= vb.height
  const paperW = landscape ? A1.w : A1.h
  const paperH = landscape ? A1.h : A1.w

  /* The SVG's own preserveAspectRatio (default xMidYMid MEET) always fits the
     whole viewBox inside the paper frame without cropping, uniformly scaling
     by whichever axis is more constrained — so that same min() is what
     "world units per paper mm" (u) and the printed scale ratio must use too,
     or the print furniture below would be sized for a scale the sheet isn't
     actually using. Using vb.width alone (the original bug) was silently
     correct only for a plan whose aspect ratio happened to be WIDER than A1's
     own 1.416:1 — anything taller made height the true constraint instead. */
  const mmPerUnitPaper = Math.min(paperW / vb.width, paperH / vb.height)
  /* The PDF's label size: an explicit one (`labels.labelSize`, a Label size
     key or inches), else the PDF Label size setting — 'auto' (default) sizes
     the reference text so the SMALLEST printed label is at least 2.5 mm tall
     on this sheet, 'screen' uses the drawing's Label size, or a size key. An
     aisle's own label size still wins for that aisle. */
  if (labelOpts.labelSize == null) {
    const pdf = prefs.pdfLabelSize || 'auto'
    labelOpts.labelSize = pdf === 'auto' ? autoPdfLabelInches(mmPerUnitPaper, gridSize) : pdf === 'screen' ? prefs.labelSize : pdf
  }
  const lz = labelScale(labelOpts.labelSize, gridSize)
  const u = 1 / mmPerUnitPaper // world units per PAPER mm — sizes the print furniture below
  const scaleRatio = Math.round(mmPerWorldPx(gridSize) / mmPerUnitPaper)

  // Draw order matches canvas2's Scene.jsx: floor plans first (the ground),
  // then racks, then the columns on top (structure: a column inside a rack is
  // the conflict the check reports, so no rack may hide it), then the labels.
  const floors = [], zones = [], columns = [], racks = []
  for (const o of objects) {
    if (!o || !usable(o)) continue
    if (FP_TYPES.has(o.type)) floors.push(o)
    else if (isZone(o)) zones.push(o)
    else if (o.type === 'column_grid') columns.push(o)
    else if (PORTED_RACK_TYPES.has(o.type)) racks.push(o)
  }

  const stripY = bounds.y + bounds.height + pad
  const titleW = 72 * u, titleH = 30 * u   // fixed 72mm×30mm on paper, whatever the plan's own scale
  const titleX = vb.x + vb.width - titleW - 4 * u
  const titleY = stripY + (titleStripH - titleH) / 2

  const date = new Date().toISOString().slice(0, 10)

  const body = [
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="#ffffff"/>`,
    ...floors.map(o => floorPlanSVG(o, gridSize)),
    ...zones.map(o => zoneSVG(o, gridSize)),
    ...racks.map(o => rackSVG(o, gridSize, lz)),
    ...columns.map(o => columnGridSVG(o, gridSize)),
    /* labels and marks are worked out from the whole layout, as on the canvas
       (a hidden Columns layer still has columns); only their drawing is gated */
    labelsSVG(objects.filter(Boolean), gridSize, labelOpts),
    scaleBarSVG(vb.x + 10 * u, titleY + titleH * 0.45, gridSize, u),
    titleBlockSVG(titleX, titleY, u, { title, scaleRatio, date }),
    `<rect x="${vb.x + u}" y="${vb.y + u}" width="${vb.width - 2 * u}" height="${vb.height - 2 * u}" fill="none" stroke="#111" stroke-width="${0.4 * u}"/>`,
  ].join('\n')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${paperW}mm" height="${paperH}mm" ` +
    `viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}">${body}</svg>`

  return { svg, paperW, paperH }
}

/** Top-level entry — reads the store itself (headless: no mounted-canvas
 *  dependency of any kind) and opens the same print-ready window the old
 *  export used, so "Print / Save as PDF" still lands the user in their
 *  browser's native, genuinely-vector PDF output. */
export function exportLayoutToPDF(filename, storeState) {
  const { objects, layers, gridSize } = storeState
  const name = filename || 'warehouse-layout'
  const title = name.replace(/\.(wcad|pdf)$/i, '')

  const { svg, paperW, paperH } = buildLayoutSVG(objects, layers, gridSize, { title, labels: { showAisles: storeState.showAisles ?? true } })

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #888; }
  .page { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  svg { background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.3); max-width: 100%; height: auto; }
  @page { size: ${paperW}mm ${paperH}mm; margin: 0; }
  @media print {
    html, body { background: #fff; }
    .page { padding: 0; min-height: 0; }
    svg { box-shadow: none; max-width: none; width: ${paperW}mm; height: ${paperH}mm; }
    .no-print { display: none !important; }
  }
  .toolbar { position: fixed; top: 12px; right: 12px; z-index: 999; display: flex; gap: 8px; }
  .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; font-family: Arial, sans-serif; }
  .btn-primary { background: #f0b429; color: #13151a; }
  .btn-secondary { background: #e5e7eb; color: #374151; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
    <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
  <div class="page">${svg}</div>
  <script>window.focus()</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=1200,height=900')
  if (!win) window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
