// canvas2/viewport.js
// ─────────────────────────────────────────────────────────────────────────────
// The view transform, as pure maths.
//
// A "view" is { zoom, panX, panY } and means exactly one thing:
//
//     screen = world * zoom + pan
//
// World coordinates are the only truth — they are what the store holds and what
// every piece of frozen logic (snap, the column check, capacity) measures. The
// view is a lens over them and never writes back into them.
//
// This file has no React, no Konva and no DOM, so the one piece of maths that
// is easy to get subtly wrong — keeping the point under the cursor pinned while
// zooming — can be tested directly instead of by eye.
// ─────────────────────────────────────────────────────────────────────────────

import { expandColumnGrid } from '../generate/columnCheck'

/* Matches the store's own clamp, so the canvas can never drive the view
   somewhere the rest of the app will not follow. */
export const ZOOM_MIN = 0.01
export const ZOOM_MAX = 20

export const clampZoom = z =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1))

/** Screen point (relative to the canvas) → world. */
export function screenToWorld(view, p) {
  return {
    x: (p.x - view.panX) / view.zoom,
    y: (p.y - view.panY) / view.zoom,
  }
}

/** World point → screen (relative to the canvas). */
export function worldToScreen(view, w) {
  return {
    x: w.x * view.zoom + view.panX,
    y: w.y * view.zoom + view.panY,
  }
}

/** Zoom about a fixed screen point — the cursor.
 *
 *  The whole trick: read the world point under the cursor BEFORE the zoom
 *  changes, then choose the pan that puts that same world point back under the
 *  same pixel. Without this the drawing slides away from the pointer and you
 *  end up chasing the thing you were trying to look at, which at 7% zoom on a
 *  1,080ft building means losing your place entirely.
 *
 *  Returns a whole view so the caller applies one atomic change. */
export function zoomAtPoint(view, pointer, factor) {
  const next = clampZoom(view.zoom * factor)
  // Clamped to the same value → nothing moves. Returning the same numbers keeps
  // the caller from writing a no-op pan at the ends of the zoom range.
  if (next === view.zoom) return view

  const world = screenToWorld(view, pointer)
  return {
    zoom: next,
    panX: pointer.x - world.x * next,
    panY: pointer.y - world.y * next,
  }
}

/** Wheel delta → zoom factor.
 *
 *  Exponential so each notch is the same PROPORTIONAL step: from 7% one notch
 *  should feel like it does from 200%. A linear step would crawl when zoomed
 *  out and leap when zoomed in. deltaMode 1 is lines rather than pixels, which
 *  some mice and most of Firefox report. */
export function wheelFactor(deltaY, deltaMode = 0) {
  const px = deltaMode === 1 ? deltaY * 16 : deltaY
  // Clamped so one violent trackpad flick cannot cross the whole zoom range.
  const d = Math.max(-240, Math.min(240, px))
  return Math.exp(-d * 0.0015)
}

/** Fit a world rectangle into a viewport, with a margin.
 *
 *  Used for "show me the whole building" — the view a dealer actually works at.
 *  Returns a view, so it composes with everything else here. */
export function fitView(rect, size, margin = 0.06) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null
  if (!size || !(size.w > 0) || !(size.h > 0)) return null
  const pad = 1 - Math.max(0, Math.min(0.4, margin)) * 2
  const zoom = clampZoom(Math.min((size.w * pad) / rect.width, (size.h * pad) / rect.height))
  return {
    zoom,
    panX: size.w / 2 - (rect.x + rect.width / 2) * zoom,
    panY: size.h / 2 - (rect.y + rect.height / 2) * zoom,
  }
}

/** Axis-aligned world bounds of everything passed in, or null if there is
 *  nothing measurable. Reads the store's own shapes without interpreting them:
 *  a rect-ish object has x/y/width/height, a line has endpoints.
 *
 *  column_grid is a special case, checked FIRST: it carries no width/height of
 *  its own (its extent is the columns, described by spacingX/spacingY) — the
 *  generic x/y fallback below would collapse it to the single point (x,y),
 *  and since a column grid usually spans the whole building, that single
 *  point can dominate a fit-to-content and zoom in on almost nothing. Same
 *  fix shapes.jsx's outlineBounds already applies for the same reason. */
export function worldBounds(objects = [], gridSize = 40) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const eat = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const o of objects) {
    if (!o) continue
    if (o.type === 'column_grid') {
      for (const c of expandColumnGrid(o, gridSize)) { eat(c.x, c.y); eat(c.x + c.w, c.y + c.h) }
      continue
    }
    if (Number.isFinite(o.x1)) { eat(o.x1, o.y1); eat(o.x2, o.y2); continue }
    if (Number.isFinite(o.cx)) { const r = o.r || 0; eat(o.cx - r, o.cy - r); eat(o.cx + r, o.cy + r); continue }
    if (Number.isFinite(o.x)) { eat(o.x, o.y); eat(o.x + (o.width || 0), o.y + (o.height || 0)) }
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
