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
/* STUDIO.md §2 (PlanDetail C18): a column is a SOLID #1F2321 square at its true size — no web, no flanges, no
   outline. The canvas and the PDF both draw it from here. */
export const COLUMN_COLOR = '#1F2321'
export const COLUMN_OPACITY = { body: 1, web: 0, flanges: 0 }
/** Outline width, inches (drawing units). */
export const COLUMN_OUTLINE_IN = 1

const rect = (x, y, w, h) => (w > 0 && h > 0 ? `M${x} ${y}h${w}v${h}h${-w}Z` : '')

/** Every column as exactly its own square, one path. */
export function columnGridPath(obj, gridSize = 40, objects = null) {
  if (!obj || obj.showGrid === false) return null
  const cols = expandColumnGrid(obj, gridSize, objects)
  if (!cols.length) return null
  let d = ''
  for (const c of cols) d += rect(c.x, c.y, c.w, c.h)
  return d
}

/** The column look as four paths (world px): body, web, flanges, outline. */
export function columnGridOps(obj, gridSize = 40, objects = null) {
  const body = columnGridPath(obj, gridSize, objects)
  if (!body) return null
  // the solid square only (C18): the web, flanges and outline paths stay, empty, so every drawer reads one shape
  return { color: COLUMN_COLOR, body, web: '', flanges: '', outline: '', outlineWidth: 0, opacity: COLUMN_OPACITY }
}
