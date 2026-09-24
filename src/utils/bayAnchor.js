// bayAnchor.js — where a rack sits after its size changes.
//
// canvas2 draws every object spun about its OWN centre (shapes.jsx's spin()),
// but a rack's stored x/y/width/height are the pre-rotation box. Changing the
// width (bays, beams, uprights, towers, lanes) or the height (flue, depth,
// cantilever arms) moves that centre, so at any rotation other than 0° the
// whole drawn rack jumped. The rule here: for any rotation the result is
// exactly the 0° result rotated — whichever point stays fixed at 0° stays
// fixed on screen. It's the rotated-anchor correction the SVG engine applies
// on resize (CanvasArea.jsx: old centre from the original object, counter-
// rotated delta). Every size-changing edit goes through anchoredResize.

/** Which end stays put when bays are deleted — the store's 0° rule: the
 *  first bay deleted but not the last -> the far ('end') end was untouched,
 *  hold it; any other case -> hold the near ('start') end. */
export function bayDeleteAnchor(bayCount, removed) {
  const set = removed instanceof Set ? removed : new Set(removed)
  return set.has(0) && !set.has(bayCount - 1) ? 'end' : 'start'
}

/** New { x, y } for a rack resized to { width, height }, holding the chosen
 *  end of each local axis fixed where it is DRAWN. `anchor.x` 'start' holds
 *  the local x = obj.x end (what an unrotated rack does by keeping x),
 *  'end' holds the far end; `anchor.y` likewise for the local y = obj.y
 *  (front/top) side. The rack is drawn as its box rotated about the box
 *  centre C, a local point p landing at C + R(p - C); holding the start
 *  corner fixed gives the new centre C' = C + R((w' - w) / 2, (h' - h) / 2),
 *  with the sign flipped on an axis anchored at its end. At 0° this is
 *  x/y unchanged ('start') or x += w - w' ('end'). */
export function anchoredResize(obj, size = {}, anchor = {}) {
  const width = size.width ?? obj.width, height = size.height ?? obj.height
  const t = ((obj.rotation || 0) * Math.PI) / 180
  const c = Math.cos(t), s = Math.sin(t)
  const sx = anchor.x === 'end' ? (obj.width - width) / 2 : (width - obj.width) / 2
  const sy = anchor.y === 'end' ? (obj.height - height) / 2 : (height - obj.height) / 2
  const cx = obj.x + obj.width / 2 + sx * c - sy * s
  const cy = obj.y + obj.height / 2 + sx * s + sy * c
  // snap away float noise from cos/sin of right angles
  const clean = (v) => (Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-9 ? Math.round(v * 1e6) / 1e6 : v)
  return { x: clean(cx - width / 2), y: clean(cy - height / 2) }
}

/** Width-only resize (bay deletes, beam changes) — anchoredResize on x. */
export function anchoredShrink(obj, newWidth, anchor = 'start') {
  return anchoredResize(obj, { width: newWidth }, { x: anchor })
}

/** A commit payload with x/y added so the size change it makes keeps the
 *  anchored corner where it is drawn. Every panel edit that changes a
 *  rack's width or height commits through this. */
export function withAnchoredPosition(obj, updates, anchor = {}) {
  if (updates.width == null && updates.height == null) return updates
  return { ...updates, ...anchoredResize(obj, { width: updates.width, height: updates.height }, anchor) }
}
