// Popover.jsx — every dropdown list and popover in the app opens ATTACHED to its own field (CLAUDE.md Rule 9, d1-bar
// round): directly below it, left-aligned with it — or directly above it when there is no room below — never anywhere
// else on screen. It floats over the canvas, portalled to the themed root (the variables resolve there; position: fixed
// inside a transformed bar would be placed against the bar, not the window — the Text bar's Size list did that), so a
// card's or a bar's edge never clips it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** The gap between a field and its list (px). */
export const POP_GAP = 4
const EDGE = 8

/** Where a list `w` × `h` opens for a field at screen rect `r` (window `win` { w, h }): below it, its left edge on the
 *  field's (slid in only as far as the window's edge needs) — above it when it does not fit below and does above.
 *  → { left, top, above }. */
export function anchorPlace(r, w, h, win) {
  const fitsBelow = r.bottom + POP_GAP + h <= win.h - EDGE
  const fitsAbove = r.top - POP_GAP - h >= EDGE
  const above = !fitsBelow && fitsAbove
  const top = above ? r.top - POP_GAP - h : r.bottom + POP_GAP
  const left = Math.max(EDGE, Math.min(r.left, win.w - w - EDGE))
  return { left, top, above }
}

/** The themed root a popover portals to (its colours are variables scoped there). */
export const popHost = () => (typeof document !== 'undefined' ? document.querySelector('[data-theme]') || document.body : null)

/** A popover attached to `anchor` (an element): portalled, fixed, placed by anchorPlace once measured; closed by a press
 *  outside it and its anchor, Esc, a scroll outside it or a resize. `role`, `label` and the rest go on its box. */
export function Popover({ anchor, onClose, children, role = 'dialog', label, style, width, ...rest }) {
  const ref = useRef(null)
  const [at, setAt] = useState(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = anchor.getBoundingClientRect(), el = ref.current
    const next = anchorPlace(r, el.offsetWidth, el.offsetHeight, { w: window.innerWidth, h: window.innerHeight })
    setAt(a => (a && a.left === next.left && a.top === next.top ? a : next))
  })
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose() }
    const away = (e) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose() }
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose() } }
    window.addEventListener('pointerdown', down, true); window.addEventListener('scroll', away, true)
    window.addEventListener('resize', onClose); window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', onClose); window.removeEventListener('keydown', key, true)
    }
  }, [onClose, anchor])
  const host = popHost()
  if (!host) return null
  return createPortal(
    <div ref={ref} role={role} aria-label={label} data-popover data-card-dark {...rest}
      onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
      style={{ position: 'fixed', left: at ? at.left : -9999, top: at ? at.top : -9999, visibility: at ? 'visible' : 'hidden', zIndex: 500, ...(width ? { width } : null), ...style }}>
      {children}
    </div>, host)
}
