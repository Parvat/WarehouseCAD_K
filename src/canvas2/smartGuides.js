// canvas2/smartGuides.js
// ─────────────────────────────────────────────────────────────────────────────
// Smart-guide alignment snapping during a plain object drag, ported from
// CanvasArea.jsx's inline move-drag branch (its 'move' case, ~688-827), NOT
// from snapToDimPoint — that is a different, unrelated feature (the
// dimension-TOOL's own endpoint snap when DRAWING a new dimension line,
// used nowhere in an object drag). This is "drag an existing object near
// another's edge/centre and it snaps, with a guide line shown" — a pure
// function, no React/Konva/DOM, so useCanvasInteraction's mousemove (which
// decides the drag) and the overlay painter (which draws the lines) share
// one computation, never two that could drift (CANVAS2.md rule 4).
//
// Pure geometry: given the dragged set's ids, the CURRENT full objects
// list, gridSize, zoom, and the RAW (pre-any-snap) pointer delta, returns
// every candidate guide line plus the best snap-adjusted delta per axis.
// The caller decides how to combine `snapDx`/`snapDy` with anything else
// (canvas2's own grid-snap-while-dragging, which the SVG engine does not
// have at all for a move — CanvasArea only ever snaps a move to another
// object, never to the grid).
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds } from '../utils/canvas'

const FP_SET_SNAP = new Set(['fp_rect', 'fp_l', 'fp_t', 'fp_u', 'fp_cross', 'fp_l_mirror'])
const COL_GRID_SET = new Set(['column_grid'])

/** @returns {{ guides: Array, snapDx: number|null, snapDy: number|null }}
 *  `guides` — de-duplicated {axis, val, from, to, isWall} line descriptors,
 *  in world coordinates, ready to paint. `snapDx`/`snapDy` — the delta to
 *  use INSTEAD of `dx`/`dy` on that axis if a guide caught within its snap
 *  radius, or null if nothing on that axis is close enough to snap to
 *  (guides can still be shown — CanvasArea's own THRESH for drawing a line
 *  is wider than SNAP_DIST/WALL_SNAP for actually moving the object). */
export function computeSmartGuides(selectedIds, objects, gridSize, zoom, dx, dy) {
  const THRESH      = 6  / zoom
  const SNAP_DIST    = 8  / zoom
  const WALL_THRESH  = 30 / zoom
  const WALL_SNAP    = 32 / zoom

  const selObjs  = objects.filter(o => selectedIds.includes(o.id))
  const others   = objects.filter(o => !selectedIds.includes(o.id) && !FP_SET_SNAP.has(o.type) && !COL_GRID_SET.has(o.type))
  const fpWalls  = objects.filter(o => !selectedIds.includes(o.id) && FP_SET_SNAP.has(o.type))
  const colGrids = objects.filter(o => !selectedIds.includes(o.id) && COL_GRID_SET.has(o.type))

  const selBounds = selObjs.map(o => {
    const b = getObjectBounds(o)
    return {
      x: b.x + dx, y: b.y + dy, r: b.x + b.width + dx, b: b.y + b.height + dy,
      cx: b.x + b.width / 2 + dx, cy: b.y + b.height / 2 + dy,
    }
  })

  const guides = []
  let snapX = null, snapY = null

  selBounds.forEach(sb => {
    // ── Snap to FP inner wall edges (purple guides) ─────────────────────
    fpWalls.forEach(fp => {
      const b = getObjectBounds(fp)
      if (!b || !b.width || !b.height) return
      const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : (fp.strokeWidth || 10)
      const innerLeft = b.x + wt, innerTop = b.y + wt
      const innerRight = b.x + b.width - wt, innerBottom = b.y + b.height - wt
      ;[[sb.x, innerLeft], [sb.r, innerRight]].forEach(([ma, oa]) => {
        const diff = ma - oa
        if (Math.abs(diff) < WALL_THRESH) {
          if (snapX === null || Math.abs(diff) < Math.abs(snapX.diff)) snapX = { diff, isWall: true }
          guides.push({ axis: 'x', val: oa, from: innerTop - 40, to: innerBottom + 40, isWall: true })
        }
      })
      ;[[sb.y, innerTop], [sb.b, innerBottom]].forEach(([ma, oa]) => {
        const diff = ma - oa
        if (Math.abs(diff) < WALL_THRESH) {
          if (snapY === null || Math.abs(diff) < Math.abs(snapY.diff)) snapY = { diff, isWall: true }
          guides.push({ axis: 'y', val: oa, from: innerLeft - 40, to: innerRight + 40, isWall: true })
        }
      })
    })

    // ── Snap to column faces (purple guides) ────────────────────────────
    colGrids.forEach(cg => {
      const spacingX = cg.spacingX || [cg.width || 40 * gridSize]
      const spacingY = cg.spacingY || [cg.height || 40 * gridSize]
      const colW = cg.columnW || (12 / 12) * gridSize
      const colH = cg.columnH || (12 / 12) * gridSize
      const colXs = [cg.x]; spacingX.forEach(s => colXs.push(colXs[colXs.length - 1] + s))
      const colYs = [cg.y]; spacingY.forEach(s => colYs.push(colYs[colYs.length - 1] + s))
      const gridBottom = colYs[colYs.length - 1] + colH
      const gridRight = colXs[colXs.length - 1] + colW
      colXs.forEach(cx => {
        ;[[sb.x, cx], [sb.r, cx], [sb.x, cx + colW], [sb.r, cx + colW]].forEach(([ma, oa]) => {
          const diff = ma - oa
          if (Math.abs(diff) < WALL_THRESH) {
            if (snapX === null || Math.abs(diff) < Math.abs(snapX.diff)) snapX = { diff, isWall: true }
            guides.push({ axis: 'x', val: oa, from: cg.y - 20, to: gridBottom + 20, isWall: true })
          }
        })
      })
      colYs.forEach(cy => {
        ;[[sb.y, cy], [sb.b, cy], [sb.y, cy + colH], [sb.b, cy + colH]].forEach(([ma, oa]) => {
          const diff = ma - oa
          if (Math.abs(diff) < WALL_THRESH) {
            if (snapY === null || Math.abs(diff) < Math.abs(snapY.diff)) snapY = { diff, isWall: true }
            guides.push({ axis: 'y', val: oa, from: cg.x - 20, to: gridRight + 20, isWall: true })
          }
        })
      })
    })

    // ── Snap to other objects' edges/centres (green guides) ─────────────
    others.forEach(o => {
      const b = getObjectBounds(o)
      const ob = { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }

      const xPairs = [
        [sb.x, ob.x], [sb.x, ob.r], [sb.x, ob.cx],
        [sb.r, ob.x], [sb.r, ob.r], [sb.r, ob.cx],
        [sb.cx, ob.x], [sb.cx, ob.r], [sb.cx, ob.cx],
      ]
      xPairs.forEach(([ma, oa]) => {
        if (Math.abs(ma - oa) < THRESH) {
          if (snapX === null || Math.abs(ma - oa) < Math.abs(snapX.diff)) snapX = { diff: ma - oa }
          guides.push({
            axis: 'x', val: oa,
            from: Math.min(sb.y, sb.b, ob.y, ob.b) - 20,
            to: Math.max(sb.y, sb.b, ob.y, ob.b) + 20,
          })
        }
      })

      const yPairs = [
        [sb.y, ob.y], [sb.y, ob.b], [sb.y, ob.cy],
        [sb.b, ob.y], [sb.b, ob.b], [sb.b, ob.cy],
        [sb.cy, ob.y], [sb.cy, ob.b], [sb.cy, ob.cy],
      ]
      yPairs.forEach(([ma, oa]) => {
        if (Math.abs(ma - oa) < THRESH) {
          if (snapY === null || Math.abs(ma - oa) < Math.abs(snapY.diff)) snapY = { diff: ma - oa }
          guides.push({
            axis: 'y', val: oa,
            from: Math.min(sb.x, sb.r, ob.x, ob.r) - 20,
            to: Math.max(sb.x, sb.r, ob.x, ob.r) + 20,
          })
        }
      })
    })
  })

  // Deduplicate — merge guide lines on the same axis within 0.5 world units
  // of each other into one, spanning both their extents.
  const uniq = []
  guides.forEach(g => {
    const ex = uniq.find(u => u.axis === g.axis && Math.abs(u.val - g.val) < 0.5)
    if (!ex) uniq.push(g)
    else { ex.from = Math.min(ex.from, g.from); ex.to = Math.max(ex.to, g.to) }
  })

  const snapDx = snapX && Math.abs(snapX.diff) < (snapX.isWall ? WALL_SNAP : SNAP_DIST) ? dx - snapX.diff : null
  const snapDy = snapY && Math.abs(snapY.diff) < (snapY.isWall ? WALL_SNAP : SNAP_DIST) ? dy - snapY.diff : null

  return { guides: uniq, snapDx, snapDy }
}
