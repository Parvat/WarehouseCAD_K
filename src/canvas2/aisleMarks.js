// aisleMarks.js — geometry for a column standing in a travel aisle: the
// clearance arrow on EACH side of it and, when neither side reaches the
// forklift's travelFt, the red aisle-warning shade. Pure (no React/Konva) so
// the drawing and the tests read the same numbers.
//
// Orientation-free by construction: everything is built in (d, r) — `d`
// along the aisle's gap axis (the axis rows are stacked on), `r` along the
// aisle's run — and mapped to world x/y only at the end. A vertical layout's
// marks are therefore the horizontal layout's marks with x and y swapped:
// same arrows, same labels, same colours.

export const CLEAR_COLOR = '#0369a1'
export const SHORT_COLOR = '#C0392B'

/** Screen-constant sizes (px), divided by zoom by the caller's `zoom`. */
const HEAD_PX = 9, MIN_DRAW_PX = 1

const toXY = (axis) => (d, r) => (axis === 'y' ? { x: r, y: d } : { x: d, y: r })

/** The two clearance arrows for one aisle block. Each runs from the column's
 *  edge to the rack face on that side, arrowhead at the rack, label centred
 *  on the shaft. A side with no gap (column touching the rack) has nothing
 *  to measure and is skipped. When the aisle is pinched (neither side
 *  reaches travelFt) both are drawn in red and say so. */
export function clearanceMarks(block, col, zoom = 1, gridSize = 40) {
  const axis = block.axis
  const P = toXY(axis)
  const dLo = axis === 'y' ? col.y : col.x
  const dHi = axis === 'y' ? col.y + col.h : col.x + col.w
  const rMid = axis === 'y' ? col.x + col.w / 2 : col.y + col.h / 2
  const head = HEAD_PX / zoom
  const sides = [
    { side: 'near', from: dLo, to: block.gapStart, ft: block.nearClearFt, short: block.pinched && block.nearShort },
    { side: 'far', from: dHi, to: block.gapEnd, ft: block.farClearFt, short: block.pinched && block.farShort },
  ]
  const out = []
  for (const s of sides) {
    const len = Math.abs(s.to - s.from)
    if (len * zoom < MIN_DRAW_PX) continue
    const dir = Math.sign(s.to - s.from)
    const h = Math.min(head, len)
    const color = s.short ? SHORT_COLOR : CLEAR_COLOR
    const base = s.to - dir * h
    out.push({
      side: s.side, color, short: s.short, style: 'arrow', dash: null,
      shaft: [P(s.from, rMid), P(base, rMid)],
      arrowhead: [P(s.to, rMid), P(base, rMid - h / 2), P(base, rMid + h / 2)],
      label: { ...P((s.from + s.to) / 2, rMid), text: s.short ? `${s.ft}' — under travel` : `${s.ft}' clear` },
    })
  }
  return out
}

/** The red aisle-warning shade for a pinched aisle block, or null: across the
 *  whole aisle gap, and along the run the column's own extent plus half the
 *  gap on each side (so the shade reads as "this stretch"), clamped to where
 *  the two rows actually face each other. */
export function aisleWarningRect(block, col) {
  if (!block.pinched) return null
  const axis = block.axis
  const rLo = axis === 'y' ? col.x : col.y
  const rHi = axis === 'y' ? col.x + col.w : col.y + col.h
  const pad = (block.gapEnd - block.gapStart) / 2
  const r0 = Math.max(block.crossStart, rLo - pad), r1 = Math.min(block.crossEnd, rHi + pad)
  const d0 = block.gapStart, d1 = block.gapEnd
  return axis === 'y'
    ? { x: r0, y: d0, w: r1 - r0, h: d1 - d0 }
    : { x: d0, y: r0, w: d1 - d0, h: r1 - r0 }
}
