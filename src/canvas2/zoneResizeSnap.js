// canvas2/zoneResizeSnap.js — a zone's edge or corner dragged: snapped exactly as a zone MOVE snaps.
//
// A move asks computeSmartGuides (smartGuides.js) for the dragged box's edges against every other object's
// edges and centres, the building's inner wall faces and the column faces, and falls back to the grid on an
// axis with no guide. A resize moves only one edge per axis, so each moving edge is handed to that SAME
// function as a box of zero width (or height) standing on that edge: its left, right and centre are all the
// edge, so it meets exactly the targets — and draws exactly the guide lines — a move would. The zone being
// resized is never its own target. With `noSnap` (Alt held, the same key as a move) the edge
// follows the pointer. Pure: no React, Konva or store.

import { computeSmartGuides } from './smartGuides'
import { snapToGrid } from '../utils/canvas'

/** Alt held: no snapping — for a move and a zone resize alike. Alt only: Shift keeps its own jobs (add to the
 *  selection on a click, the 45° rotate step, a line end's horizontal / vertical lock). */
export const snapOffKey = (evt) => !!(evt && evt.altKey)

const EDGE_ID = '__zone-edge'
const MIN = 8    // applyResize's own minimum box side (world px)

/**
 * @param orig     the zone as it was when the drag began ({ id, type, x, y, width, height })
 * @param handle   'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br'
 * @param dx, dy   the RAW pointer travel since the press (world px)
 * @param opts     { objects, gridSize, zoom, snapToGrid, snapUnit, noSnap }
 * @returns { box: { x, y, width, height }, guides }
 */
export function zoneResizeBox(orig, handle, dx, dy, { objects = [], gridSize = 40, zoom = 1, snapToGrid: gridOn = false, snapUnit, noSnap = false } = {}) {
  const L = handle.includes('l'), R = handle.includes('r'), T = handle.startsWith('t'), B = handle.startsWith('b')
  let l = orig.x, r = orig.x + orig.width, t = orig.y, b = orig.y + orig.height
  const targets = objects.filter(o => o && o.id !== orig.id)
  const guides = []
  const toGrid = (v) => (gridOn ? snapToGrid(v, gridSize, snapUnit) : v)

  if (L || R) {
    const raw = (L ? l : r) + dx
    let edge = raw
    if (!noSnap) {
      const fake = { id: EDGE_ID, type: orig.type, x: raw, y: t, width: 0, height: b - t }
      const g = computeSmartGuides([EDGE_ID], [...targets, fake], gridSize, zoom, 0, 0)
      edge = g.snapDx != null ? raw + g.snapDx : toGrid(raw)
      guides.push(...g.guides.filter(q => q.axis === 'x'))
    }
    if (L) l = Math.min(edge, r - MIN); else r = Math.max(edge, l + MIN)
  }
  if (T || B) {
    const raw = (T ? t : b) + dy
    let edge = raw
    if (!noSnap) {
      const fake = { id: EDGE_ID, type: orig.type, x: l, y: raw, width: r - l, height: 0 }
      const g = computeSmartGuides([EDGE_ID], [...targets, fake], gridSize, zoom, 0, 0)
      edge = g.snapDy != null ? raw + g.snapDy : toGrid(raw)
      guides.push(...g.guides.filter(q => q.axis === 'y'))
    }
    if (T) t = Math.min(edge, b - MIN); else b = Math.max(edge, t + MIN)
  }
  return { box: { x: l, y: t, width: r - l, height: b - t }, guides }
}
