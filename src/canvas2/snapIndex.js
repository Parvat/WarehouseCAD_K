// snapIndex.js — (drag-perf-bar) a drag's snap targets near the dragged objects only. The smart guides and the in-line
// snap used to test every object on the plan every frame; on a 50,000-position layout that is thousands of boxes per
// frame for a snap that reaches 12 screen px. Built once per drag: every target's drawn box in a uniform grid of cells;
// each frame asks for the cells around the dragged objects' box, padded by NEAR_FT. The building (its walls are its
// snap) and the column grids (one object spanning the building) are always kept, and so are the dragged objects
// themselves (the guides read their boxes from the same list). A layout with few objects skips the index entirely.
import { worldBoundsOf } from './hitTest'

export const NEAR_FT = 50                   // how far from the dragged objects a target still counts
export const INDEX_FROM = 200               // fewer objects than this: every target, as before
const ALWAYS = (o) => typeof o?.type === 'string' && (o.type.startsWith('fp_') || o.type === 'column_grid')

/** The index of `objects` (world px): { cell, cells: Map("i,j" → [id]), boxes: Map(id → box) }. */
export function makeSnapIndex(objects, gridSize = 40) {
  const cell = 40 * gridSize, cells = new Map(), boxes = new Map()
  for (const o of objects) {
    if (!o || ALWAYS(o)) continue
    const b = worldBoundsOf(o, objects)
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue
    boxes.set(o.id, b)
    for (let i = Math.floor(b.x / cell); i <= Math.floor((b.x + (b.width || 0)) / cell); i++)
      for (let j = Math.floor(b.y / cell); j <= Math.floor((b.y + (b.height || 0)) / cell); j++) {
        const k = i + ',' + j
        if (!cells.has(k)) cells.set(k, [])
        cells.get(k).push(o.id)
      }
  }
  return { cell, cells, boxes }
}
/** The ids whose box meets `box` padded by NEAR_FT. */
export function nearIds(index, box, gridSize = 40) {
  const pad = NEAR_FT * gridSize, out = new Set()
  const x0 = box.x - pad, y0 = box.y - pad, x1 = box.x + box.width + pad, y1 = box.y + box.height + pad
  for (let i = Math.floor(x0 / index.cell); i <= Math.floor(x1 / index.cell); i++)
    for (let j = Math.floor(y0 / index.cell); j <= Math.floor(y1 / index.cell); j++)
      for (const id of index.cells.get(i + ',' + j) || []) {
        if (out.has(id)) continue
        const b = index.boxes.get(id)
        if (b.x <= x1 && b.x + b.width >= x0 && b.y <= y1 && b.y + b.height >= y0) out.add(id)
      }
  return out
}
/** `targets` cut to what is near the dragged `ids` moved by (dx, dy) — the dragged objects, the buildings and the
 *  column grids always kept. `drag` carries the index (built on its first call) and the dragged box at the start. */
export function nearTargets(targets, drag, objects, gridSize, dx, dy) {
  if (objects.length < INDEX_FROM) return targets
  if (!drag.snapIndex) {
    drag.snapIndex = makeSnapIndex(objects.filter(o => !drag.movedIds?.has(o.id)), gridSize)
    const bs = (drag.ids || []).map(id => objects.find(o => o.id === id)).filter(Boolean).map(o => worldBoundsOf(o, objects)).filter(Boolean)
    drag.snapBox = bs.length ? bs.reduce((u, b) => ({ x: Math.min(u.x, b.x), y: Math.min(u.y, b.y), x1: Math.max(u.x1, b.x + b.width), y1: Math.max(u.y1, b.y + b.height) }), { x: Infinity, y: Infinity, x1: -Infinity, y1: -Infinity }) : null
  }
  if (!drag.snapBox) return targets
  const b = drag.snapBox, near = nearIds(drag.snapIndex, { x: b.x + dx, y: b.y + dy, width: b.x1 - b.x, height: b.y1 - b.y }, gridSize)
  return targets.filter(o => near.has(o.id) || ALWAYS(o) || drag.movedIds?.has(o.id) || (drag.ids || []).includes(o.id))
}
