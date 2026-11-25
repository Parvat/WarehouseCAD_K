// hairlines.js — (rack-design) a rack's hairlines and dashed pallet slots, painted sharp: a fixed SCREEN width, each
// straight line on the half pixel or the whole pixel (render/pixelSnap.js does the same for outlines and frames).
// Pure canvas-2D calls on the context Konva hands a Shape's sceneFunc — no React, no Konva import, so it tests in Node.
import { isAxisAligned, deviceScale } from './pixelSnap'

const pixelRatioOf = (ctx) => (ctx.canvas && ctx.canvas.getPixelRatio ? ctx.canvas.getPixelRatio() : 1)

/** (rack-design) Where a hairline of device width `lw` sits for a device coordinate `v`: the half pixel for an odd
 *  width, the whole pixel for an even one — so its edges land on pixel boundaries and it is never a two-pixel smear. */
export const crispAt = (v, lw) => (lw % 2 ? Math.floor(v) + 0.5 : Math.round(v))

/** A slot smaller than this on screen (CSS px, its short side) is not drawn: its dashes would only grey the bay. */
export const SLOT_MIN_PX = 5

/** (rack-design) The painter of a `lines` or `slots` op: in device space for a rack square to the screen — each
 *  horizontal or vertical line crisp (crispAt), the width and the dash in screen px × the pixel ratio; a diagonal (a
 *  mezzanine's cross) or a turned rack as plain lines at the same screen width. */
export function paintHairlines(ctx, o) {
  const c = ctx._context, t = c.getTransform(), pr = pixelRatioOf(ctx)
  const m = { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f }, s = deviceScale(m) || 1
  // the segments: a slot op's rects as their four edges — none while the slots are too small to read
  let segs = o.segs
  if (o.op === 'slots') {
    const r0 = o.rects[0]
    if (!r0 || Math.min(r0.w, r0.h) * s < SLOT_MIN_PX * pr) return
    segs = []
    for (const r of o.rects) segs.push(r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x + r.w, r.y + r.h, r.x, r.y + r.h, r.x, r.y + r.h, r.x, r.y)
  }
  if (!segs || !segs.length) return
  // (rack-fixes 4) under one device px (a beam rack's 0.75 px slots at ratio 1): that fraction, antialiased, not rounded up
  const raw = o.strokeWidth * pr, lw = raw >= 1 ? Math.max(1, Math.round(raw)) : raw
  c.save()
  c.strokeStyle = o.stroke
  if (isAxisAligned(m)) {
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.lineWidth = lw
    c.setLineDash(o.dash ? o.dash.map(v => v * pr) : [])
    c.beginPath()
    for (let k = 0; k < segs.length; k += 4) {
      let X1 = m.a * segs[k] + m.c * segs[k + 1] + m.e, Y1 = m.b * segs[k] + m.d * segs[k + 1] + m.f
      let X2 = m.a * segs[k + 2] + m.c * segs[k + 3] + m.e, Y2 = m.b * segs[k + 2] + m.d * segs[k + 3] + m.f
      if (Math.abs(X1 - X2) < 1e-6) { X1 = X2 = crispAt(X1, lw); Y1 = Math.round(Y1); Y2 = Math.round(Y2) }
      else if (Math.abs(Y1 - Y2) < 1e-6) { Y1 = Y2 = crispAt(Y1, lw); X1 = Math.round(X1); X2 = Math.round(X2) }
      c.moveTo(X1, Y1); c.lineTo(X2, Y2)
    }
    c.stroke()
  } else {
    c.lineWidth = lw / s
    c.setLineDash(o.dash ? o.dash.map(v => (v * pr) / s) : [])
    c.beginPath()
    for (let k = 0; k < segs.length; k += 4) { c.moveTo(segs[k], segs[k + 1]); c.lineTo(segs[k + 2], segs[k + 3]) }
    c.stroke()
  }
  c.restore()
}

