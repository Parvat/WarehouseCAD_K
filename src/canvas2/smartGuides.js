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

    // ── Snap to columns — directional face pairs, PLUS centre-to-centre
    // (purple guides) ─────────────────────────────────────────────────────
    //
    // "Edge clear of a column": the row's LEADING edge (the one facing the
    // column, given which side the row is currently on) snaps to the ONE
    // column face on that side — never the far face. Only two pairs per
    // axis, not four: [row's right edge, column's LEFT face] and [row's
    // left edge, column's RIGHT face]. The other two combinations a naive
    // "check every edge against every face" would add (row's own left edge
    // against the column's own left face, right against right) only ever
    // match once the row already substantially OVERLAPS the column — not
    // an approach from a direction, a row already past it — so leaving
    // them out is what makes this "directional" at all, not an extra
    // side-selection branch: for any row far wider than the gap between
    // the two kept pairs' targets (the ordinary case), at most one of the
    // two can be within WALL_THRESH at once, so the correct face is the
    // only one that can ever fire.
    //
    // Centre-to-centre (`[sb.cx, cx]` / `[sb.cy, cy]`) is back, correctly
    // this time — a genuinely different, legitimate placement from "edge
    // clear of it": a row centred so the column runs through its own
    // midline, the same alignment `[sb.cx, ob.cx]` already offers against
    // any OTHER rack below. Dropping it entirely (an earlier version of
    // this file did) silently broke that specific case: two facing rows
    // straddling the same column line snap to EACH OTHER fine (their own
    // centres coincide), but remove one and drag the other back to that
    // exact spot with only the column left standing and nothing caught it
    // — the column was never offering the one pairing that used to make
    // that position reachable at all. It does not reintroduce the
    // original centre-snap bug (BUG: "snaps to centre regardless of
    // approach direction"): that bug was TWO things at once, both already
    // fixed independently of this pairing existing — the centre value
    // itself was wrong (`cx + colW/2`, actually a face position, not the
    // column's true centre `cx`), and the old face pairs weren't
    // directional yet, so a same-side edge/face match could coincide with
    // the (mis-valued) "centre" match at the same approach position and
    // either could win. With the face pairs now correctly directional and
    // the centre value now the true `cx`/`cy`, the two only ever compete
    // near the SAME drag position — which cannot happen: a row's own half-
    // width is far bigger than WALL_THRESH for any real rack, so its edge
    // reaches the column's face long before its centre gets anywhere near
    // the column's centre. They fire at geometrically distinct points in
    // an ordinary drag, not two answers to the same moment.
    colGrids.forEach(cg => {
      const spacingX = cg.spacingX || [cg.width || 40 * gridSize]
      const spacingY = cg.spacingY || [cg.height || 40 * gridSize]
      const colW = cg.columnW || (12 / 12) * gridSize
      const colH = cg.columnH || (12 / 12) * gridSize
      /* colXs/colYs are GRID-LINE positions, not edges — expandColumnGrid
       * (columnCheck.js), the same function ColumnGridShape actually
       * renders from, centres each column's drawn square ON its line
       * (`{x: cx - w/2, y: cy - h/2, w, h}`), it does not start the square
       * AT the line. Faces below are computed the same way for exactly
       * that reason: using `cx`/`cx + colW` here (an earlier version of
       * this file did) put the "face" a full half-column-width away from
       * where the square is actually drawn — on screen, a guide "snapped
       * to a face" like that lands INSIDE the column instead of on its
       * border, because it's aimed at a line offset from the real edge by
       * exactly that half-width. */
      const colXs = [cg.x]; spacingX.forEach(s => colXs.push(colXs[colXs.length - 1] + s))
      const colYs = [cg.y]; spacingY.forEach(s => colYs.push(colYs[colYs.length - 1] + s))
      const gridTop = colYs[0] - colH / 2, gridBottom = colYs[colYs.length - 1] + colH / 2
      const gridLeft = colXs[0] - colW / 2, gridRight = colXs[colXs.length - 1] + colW / 2
      colXs.forEach(cx => {
        const faceL = cx - colW / 2, faceR = cx + colW / 2
        ;[
          [sb.r, faceL],   // approaching from the left -> the column's LEFT face
          [sb.x, faceR],   // approaching from the right -> the column's RIGHT face
          [sb.cx, cx],     // row centred through the column's own centreline
        ].forEach(([ma, oa]) => {
          const diff = ma - oa
          if (Math.abs(diff) < WALL_THRESH) {
            if (snapX === null || Math.abs(diff) < Math.abs(snapX.diff)) snapX = { diff, isWall: true }
            guides.push({ axis: 'x', val: oa, from: gridTop - 20, to: gridBottom + 20, isWall: true })
          }
        })
      })
      colYs.forEach(cy => {
        const faceT = cy - colH / 2, faceB = cy + colH / 2
        ;[
          [sb.b, faceT],   // approaching from above -> the column's TOP face
          [sb.y, faceB],   // approaching from below -> the column's BOTTOM face
          [sb.cy, cy],     // row centred through the column's own centreline
        ].forEach(([ma, oa]) => {
          const diff = ma - oa
          if (Math.abs(diff) < WALL_THRESH) {
            if (snapY === null || Math.abs(diff) < Math.abs(snapY.diff)) snapY = { diff, isWall: true }
            guides.push({ axis: 'y', val: oa, from: gridLeft - 20, to: gridRight + 20, isWall: true })
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
