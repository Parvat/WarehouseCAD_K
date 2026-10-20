/* Where a floating panel (LeftPanel/FloatingToolbar.jsx FloatingPanel) is drawn: its remembered spot, kept
   inside the viewport and off the things it must never cover — every element marked `data-float-avoid`
   (the top bar, the "← Hub" button). Pure, so the window size and the avoided rects come in as arguments;
   the remembered spot itself is never rewritten, so a window made small and then large again puts the
   panel back where it was. */

export const FLOAT_EDGE = 8

const hits = (x, y, w, h, r) => x < r.right && x + w > r.left && y < r.bottom && y + h > r.top

/** The rects of every `data-float-avoid` element on screen. */
export function floatAvoidRects(doc = document) {
  return [...doc.querySelectorAll('[data-float-avoid]')]
    .map(e => e.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0)
    .map(r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
}

/** The spot a w×h panel asked to sit at (x, y) is drawn at: inside the viewport by FLOAT_EDGE, and when that
 *  lands on an avoided rect, the nearest spot just above, below, right or left of it that is clear of all of
 *  them. When none is clear, the viewport clamp alone. */
export function placeFloat(x, y, w, h, vw, vh, avoid = [], edge = FLOAT_EDGE) {
  const clamp = (px, py) => ({
    x: Math.round(Math.max(edge, Math.min(px, Math.max(edge, vw - w - edge)))),
    y: Math.round(Math.max(edge, Math.min(py, Math.max(edge, vh - h - edge)))),
  })
  const clear = (p) => !avoid.some(r => hits(p.x, p.y, w, h, r))
  const inside = (p) => p.x >= edge && p.y >= edge && p.x + w <= vw - edge && p.y + h <= vh - edge
  const p = clamp(x, y)
  if (clear(p)) return p
  let best = null, bestD = Infinity
  for (const r of avoid) {
    if (!hits(p.x, p.y, w, h, r)) continue
    for (const t of [{ x: p.x, y: r.top - h - edge }, { x: p.x, y: r.bottom + edge }, { x: r.right + edge, y: p.y }, { x: r.left - w - edge, y: p.y }]) {
      const c = { x: Math.round(t.x), y: Math.round(t.y) }
      if (!inside(c) || !clear(c)) continue
      const d = Math.hypot(c.x - p.x, c.y - p.y)
      if (d < bestD) { bestD = d; best = c }
    }
  }
  return best || p
}

/** The height free for a panel in the column x … x+w: the viewport less the avoided rects that cross that
 *  column from the top half (the top bar) and from the bottom half (the Hub button), less the edges. */
export function floatFreeHeight(x, w, vh, avoid = [], edge = FLOAT_EDGE) {
  let top = 0, bottom = vh
  for (const r of avoid) {
    if (!(x < r.right && x + w > r.left)) continue
    if ((r.top + r.bottom) / 2 < vh / 2) top = Math.max(top, r.bottom)
    else bottom = Math.min(bottom, r.top)
  }
  return bottom - top - 2 * edge
}
