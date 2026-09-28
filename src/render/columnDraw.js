// render/columnDraw.js — a column grid's columns, every square at its REAL
// size (world px): no minimum on-screen size, no enlarged marker. A column is
// drawn like any other object and scales with the zoom.
//
// The look is the SVG engine's (ShapeGeometry.jsx, 'column_grid'): a SOLID
// body in the strong column colour at 0.85, an I-beam web (the middle 40 %,
// full height) at 0.5 and two flanges (top and bottom 15 %) at 0.9, plus a
// thin outline in DRAWING units (1", so it scales with the zoom) inset by
// half its width, so the drawn column is exactly the real column. The body
// colour is the grid's stroke colour — its fill is a pale wash that vanishes
// at working zoom. From the same expandColumnGrid the column check measures,
// so a red mark always lands on the column it refers to. Pure: the canvas
// (shapes.jsx ColumnGridShape) and the PDF export draw from it.
import { expandColumnGrid } from '../generate/columnCheck'

export const STRUCT_BLUE = '#3B6FB5'
export const COLUMN_OPACITY = { body: 0.85, web: 0.5, flanges: 0.9 }
/** Outline width, inches (drawing units). */
export const COLUMN_OUTLINE_IN = 1

const rect = (x, y, w, h) => (w > 0 && h > 0 ? `M${x} ${y}h${w}v${h}h${-w}Z` : '')

/** Every column as exactly its own square, one path. */
export function columnGridPath(obj, gridSize = 40) {
  if (!obj || obj.showGrid === false) return null
  const cols = expandColumnGrid(obj, gridSize)
  if (!cols.length) return null
  let d = ''
  for (const c of cols) d += rect(c.x, c.y, c.w, c.h)
  return d
}

/** The column look as four paths (world px): body, web, flanges, outline. */
export function columnGridOps(obj, gridSize = 40) {
  const body = columnGridPath(obj, gridSize)
  if (!body) return null
  const cols = expandColumnGrid(obj, gridSize)
  const sw = (COLUMN_OUTLINE_IN / 12) * gridSize
  let web = '', flanges = '', outline = ''
  for (const c of cols) {
    web += rect(c.x + c.w * 0.3, c.y, c.w * 0.4, c.h)
    flanges += rect(c.x, c.y, c.w, c.h * 0.15) + rect(c.x, c.y + c.h * 0.85, c.w, c.h * 0.15)
    outline += rect(c.x + sw / 2, c.y + sw / 2, c.w - sw, c.h - sw)
  }
  return { color: obj.stroke || STRUCT_BLUE, body, web, flanges, outline, outlineWidth: sw, opacity: COLUMN_OPACITY }
}
