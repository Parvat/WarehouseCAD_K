// cullWindow.js — (perf) viewport culling for the scene: the world area worth drawing now. The visible area (the window's
// size — the canvas never exceeds it — at a zoom rounded DOWN to a power of two, so the cells only grow) is snapped to
// half-screen cells and padded by half a screen or more on every side: the visible area always lies inside it, so nothing on
// screen ever changes, and the key changes only when a pan or a zoom crosses into a new cell — not on every frame.
// Scene.jsx draws only the objects that meet this window (and every selected one).
import { useLiveView } from './live'

const screen = () => (typeof window !== 'undefined' ? { w: window.innerWidth || 1440, h: window.innerHeight || 900 } : { w: 1440, h: 900 })
/** The window's key for a view: "x0,y0,x1,y1" in world px (the padded cells), or '' before the view is ready. */
export function cullKey(v) {
  if (!v || !v.ready || !(v.zoom > 0) || (typeof window !== 'undefined' && window.__noCull)) return ''   // (window.__noCull: off, for the tests that compare)
  // the zoom rounded DOWN to a half power of two (the visible area is at most √2 of the cells' screen); a cell: half a
  // screen at it. The visible area (≤ 2 cells across) starts in cell q: the window, cells q − 1 … q + 4, holds it whole.
  const zb = Math.pow(2, Math.floor(Math.log2(v.zoom) * 2) / 2), { w, h } = screen()
  const cw = w / zb / 2, ch = h / zb / 2
  const vx = -v.panX / v.zoom, vy = -v.panY / v.zoom                     // the visible area's top-left (world)
  const qx = Math.floor(vx / cw), qy = Math.floor(vy / ch)
  return [(qx - 1) * cw, (qy - 1) * ch, (qx + 4) * cw, (qy + 4) * ch].map(n => Math.round(n)).join(',')
}
/** The scene's window now (re-renders only when it changes): { x0, y0, x1, y1 } or null (draw everything). */
export function useCullWindow() {
  const key = useLiveView(cullKey)
  if (!key) return null
  const [x0, y0, x1, y1] = key.split(',').map(Number)
  return { key, x0, y0, x1, y1 }
}
/** Whether object `o` may be skipped: it has a plain box and that box (turned any way: its circumscribed square) lies
 *  wholly outside `win`. Anything without a plain box (an aisle, a line, a polyline …) is always drawn. */
export function culled(o, win) {
  if (!win || !o || !Number.isFinite(o.x) || !Number.isFinite(o.y) || !(o.width >= 0) || !(o.height >= 0)) return false
  const r = (o.rotation || 0) % 360 ? Math.hypot(o.width, o.height) / 2 : null
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2
  const hw = r ?? o.width / 2, hh = r ?? o.height / 2
  return cx + hw < win.x0 || cx - hw > win.x1 || cy + hh < win.y0 || cy - hh > win.y1
}
