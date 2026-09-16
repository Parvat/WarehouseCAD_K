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
// Scope: floor plans, column grids and every PORTED_RACK_TYPES rack — the
// three things this was asked to cover ("render/rackOps.js draw-ops plus
// floor-plan and column geometry"). Annotations, freehand strokes, text,
// aisles, and interactive-only dimension labels are NOT drawn here; see the
// bug journal entry for why that's a deliberate boundary, not an oversight.
// ─────────────────────────────────────────────────────────────────────────────

import { getFpVertices, insetPolygon, pxToFtIn } from '../utils/canvas'
import { expandColumnGrid } from '../generate/columnCheck'
import { rackDrawOps, PORTED_RACK_TYPES } from '../render/rackOps'

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

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

const isLayerUsable = (layerMap, obj) => {
  if (!obj.layerId) return true
  const l = layerMap.get(obj.layerId)
  return !l || (l.visible !== false && !l.locked)
}

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

/* ── Column grid — the real column squares, ported from canvas2's
   ColumnGridShape / expandColumnGrid, the same function the column-conflict
   check measures against. */
function columnGridSVG(obj, gridSize) {
  const cols = expandColumnGrid(obj, gridSize)
  if (!cols.length) return ''
  const color = obj.stroke || '#3B6FB5'
  return `<g fill="none" stroke="${color}" stroke-width="1.5">` +
    cols.map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>`).join('') +
    `</g>`
}

/* ── One rackDrawOps op → an SVG element. Same op shapes canvas2's Ops
   component (shapes.jsx) paints with Konva — ported to markup instead of
   canvas calls, not reinvented. Arrows drop the live /stage.scaleX() divide:
   that only existed to keep a screen-constant size across live zoom, which
   a static print page has no notion of — the op's own len/head/gap numbers
   are used directly as world units, which is what they draw as at a normal
   "fit the plan" viewing zoom anyway. */
function opToSVG(o) {
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
  if (o.op === 'arrows') {
    const { len, head, gap, color, strokeWidth, items } = o
    return `<g stroke="${color}" fill="${color}" stroke-width="${strokeWidth}">` +
      items.map(it => {
        const tipY = it.side === 'below' ? it.edgeY + gap : it.edgeY - gap - len
        const baseY = tipY + head
        return `<line x1="${it.cx}" y1="${tipY + len}" x2="${it.cx}" y2="${baseY}"/>` +
          `<polygon points="${it.cx - head * 0.48},${baseY} ${it.cx},${tipY} ${it.cx + head * 0.48},${baseY}"/>`
      }).join('') + `</g>`
  }
  return ''
}

/* ── One rack. rackDrawOps returns ops in the object's own unrotated local
   frame (same contract canvas2's RackShape relies on) — rotation is applied
   here as an SVG transform around the object's own centre, the same pivot
   canvas2/shapes.jsx's spin() uses, so a turned rack prints exactly as it
   sits on screen. */
function rackSVG(obj, gridSize) {
  const ops = rackDrawOps(obj, { gridSize })
  if (!ops) return ''
  const rot = obj.rotation || 0
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const transform = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''
  return `<g${transform}>${ops.map(opToSVG).join('')}</g>`
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
export function buildLayoutSVG(objects, layers, gridSize, { title = 'Untitled Layout' } = {}) {
  const layerMap = new Map((layers || []).map(l => [l.id, l]))
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
  const u = 1 / mmPerUnitPaper // world units per PAPER mm — sizes the print furniture below
  const scaleRatio = Math.round(mmPerWorldPx(gridSize) / mmPerUnitPaper)

  // Draw order matches canvas2's Scene.jsx: floor plans first (the ground),
  // then columns, then racks, then the object array's own order for the rest.
  const floors = [], columns = [], racks = []
  for (const o of objects) {
    if (!o || !usable(o)) continue
    if (FP_TYPES.has(o.type)) floors.push(o)
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
    ...columns.map(o => columnGridSVG(o, gridSize)),
    ...racks.map(o => rackSVG(o, gridSize)),
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

  const { svg, paperW, paperH } = buildLayoutSVG(objects, layers, gridSize, { title })

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
