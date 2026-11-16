// canvas2/minText.js — the canvas text floor (CLAUDE.md Critical Rule 8; STUDIO.md, Canvas text): every text on the
// canvas is drawn at least MIN_TEXT_PX (11) screen px tall, at any zoom — the size of the row numbers. A text that would
// draw smaller is drawn at 11 px, grown about its anchor; one that cannot fit at 11 px in the room it has hides instead
// of shrinking.
//
// One patch of Konva's drawing, so every text on the canvas — today's and any added later — keeps the rule without each
// painter knowing the zoom:
//   - a plain Konva Text grows about its own anchor (its aligned side across, its middle down); `minFit` ({ w, h } in its
//     own units, either optional) is the room it has — grown past it, it is not drawn;
//   - a LABEL — text on a pill, a chip, a bubble — is a Group with `minLabel`: { fs (its text's font size), at: { x, y }
//     (the anchor, group units), box: { w, h } (the label's size), fit: { w, h } (its room, optional), out (optional) }.
//     Every shape in it (the pill and the text alike) grows about that anchor by the same factor, or the whole label
//     hides. A DIMENSION value (`out`: { x, y — its dimension line's end, dx, dy — the way out past it }) that would grow
//     longer than its line does not hide: it moves outside its extension line, past that end, and a shape in it marked
//     `minLeader` is drawn as the short leader from the end to it (only then). A DRAWING-SCALE label (`hide: true` — the
//     doors' labels) is never grown: under 11 px it hides as a whole;
//   - `minText: false` on a Text opts it out (none does today).
// The PDF is not drawn by Konva: untouched. What each text was drawn at is kept on the node (`_mtPx`: screen px, 0 when
// hidden by the rule) — REG-canvas-text-min reads it.

import Konva from 'konva'

export const MIN_TEXT_PX = 11

/** One label px at `zoom` with the floor in it, for a layout whose text is 10.5 label px (the chains, the tags): the
 *  drawing size (1 / lz), or larger so its text is drawn at 11 px — a layout made with it is drawn as laid out, never
 *  grown after, so its values can be kept off each other (CLAUDE.md Rule 8). */
export const floorUnit = (lz, zoom, base = 10.5) => Math.max(1 / lz, MIN_TEXT_PX / (base * (zoom || 1)))

/** The nearest ancestor Group carrying `minLabel` (cached on the node), or null. */
function labelGroupOf(node) {
  if (node._mlg !== undefined) return node._mlg && node._mlg.getAttr('minLabel') ? node._mlg : null
  let p = node.getParent()
  while (p && !p.getAttr('minLabel')) { if (p.nodeType === 'Layer' || p.nodeType === 'Stage') { p = null; break } p = p.getParent() }
  node._mlg = p || null
  return node._mlg
}

/** A label group now: { k — 1 (already 11 px or more), > 1 (grow), 0 (hide: it cannot fit); t — moved outside (a
 *  dimension value that cannot fit its line: the shift, group units) or null; lead — the leader's points then }. */
function labelState(g) {
  const ml = g.getAttr('minLabel'), s = Math.abs(g.getAbsoluteScale().y) || 1, px = (ml.fs || 0) * s
  if (!(px > 0) || px >= MIN_TEXT_PX - 1e-6) return { k: 1, t: null }
  // a drawing-scale label (`hide`: the doors' — CLAUDE.md Rule 8, the door exception): never grown, hidden under 11 px
  if (ml.hide) return { k: 0, t: null }
  const k = MIN_TEXT_PX / px, box = ml.box || {}, fit = ml.fit || {}
  if (!((fit.w != null && box.w != null && box.w * k > fit.w + 1e-6) || (fit.h != null && box.h != null && box.h * k > fit.h + 1e-6))) return { k, t: null }
  const o = ml.out
  if (!o) return { k: 0, t: null }
  const along = (Math.abs(o.dx) >= Math.abs(o.dy) ? box.w : box.h) * k, gap = 5 / s, at = ml.at || { x: 0, y: 0 }
  const cx = o.x + o.dx * (gap + along / 2), cy = o.y + o.dy * (gap + along / 2)
  return { k, t: { x: cx - at.x, y: cy - at.y }, lead: [o.x, o.y, o.x + o.dx * gap, o.y + o.dy * gap] }
}

/** A text's drawn content, in its own units: { x, y, w, h } — the lines as laid out (Konva's textArr), aligned. */
function textBox(t) {
  const fs = t.fontSize(), lines = (t.textArr && t.textArr.length) || 1, pad = t.padding() || 0, lh = t.lineHeight()
  const tw = t.getTextWidth ? t.getTextWidth() : 0, th = lines * fs * lh
  const W = t.width(), H = t.height(), al = t.align(), va = t.verticalAlign()
  return { x: al === 'center' ? (W - tw) / 2 : al === 'right' ? W - pad - tw : pad, y: va === 'middle' ? (H - th) / 2 : va === 'bottom' ? H - pad - th : pad, w: tw, h: th }
}
/** Is the text cut — fewer characters laid out than it has (a box too narrow or too short for it)? */
function textClipped(t) {
  const all = String(t.text() ?? '').replace(/\s/g, ''), shown = (t.textArr || []).map(l => l.text).join('').replace(/\s/g, '').replace(/…$/, '')
  return shown.length < all.length
}
/** `node`'s local box `b` grown by `k` about local point `p`, on screen (stage px): { x, y, w, h }. */
function screenBox(node, b, k = 1, p = { x: 0, y: 0 }, t = null) {
  const T = node.getAbsoluteTransform(), tx = t ? t.x : 0, ty = t ? t.y : 0
  const cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => T.point({ x: p.x + k * (x - p.x) + tx, y: p.y + k * (y - p.y) + ty }))
  const xs = cs.map(c => c.x), ys = cs.map(c => c.y), x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
/* What each text (and each label's pill) was last drawn as is kept on its node for the tests (REG-canvas-text-min):
   `_mtPx` its screen size (0: hidden by the rule), `_mtRect` its drawn box on screen (null: hidden), `_mtClip` cut. */

let installed = false
export function installMinText() {
  if (installed || !Konva?.Text?.prototype?._sceneFunc || !Konva?.Shape?.prototype?.getSceneFunc) return
  installed = true

  // a plain text: grown about its own anchor, or hidden past its `minFit`
  const textDraw = Konva.Text.prototype._sceneFunc
  Konva.Text.prototype._sceneFunc = function minTextScene(context) {
    if (labelGroupOf(this)) return textDraw.call(this, context)          // a label's text: the label decides (below)
    const fs = this.fontSize(), s = Math.abs(this.getAbsoluteScale().y) || 1, px = fs * s
    this._mtClip = textClipped(this)
    if (this.getAttr('minText') === false || !(px > 0) || px >= MIN_TEXT_PX - 1e-6) { this._mtPx = px; this._mtRect = screenBox(this, textBox(this)); return textDraw.call(this, context) }
    const k = MIN_TEXT_PX / px
    const lines = (this.textArr && this.textArr.length) || 1, pad = this.padding() || 0, lh = this.lineHeight()
    const tw = (this.getTextWidth ? this.getTextWidth() : 0) * k, th = lines * fs * lh * k
    const fit = this.getAttr('minFit')
    if (fit && ((fit.w != null && tw > fit.w + 1e-6) || (fit.h != null && th > fit.h + 1e-6))) { this._mtPx = 0; this._mtRect = null; return }
    const W = this.width(), H = this.height(), align = this.align(), va = this.verticalAlign()
    const ax = align === 'center' ? W / 2 : align === 'right' ? W - pad : pad
    const ay = va === 'middle' ? H / 2 : va === 'bottom' ? H - pad : pad + (lines * fs * lh) / 2
    context.save()
    context.translate(ax, ay); context.scale(k, k); context.translate(-ax, -ay)
    textDraw.call(this, context)
    context.restore()
    this._mtPx = MIN_TEXT_PX
    this._mtRect = screenBox(this, textBox(this), k, { x: ax, y: ay })
  }

  // a label's shapes (its pill and its text): grown together about the label's anchor, or all hidden
  const sceneOf = Konva.Shape.prototype.getSceneFunc
  Konva.Shape.prototype.getSceneFunc = function minLabelSceneFunc() {
    const f = sceneOf.call(this)
    const g = f && labelGroupOf(this)
    if (!g) return f
    const node = this
    return function minLabelScene(context, shape) {
      const st = labelState(g), k = st.k
      const isText = node.className === 'Text'
      if (node.getAttr('minLeader')) {
        // the leader: drawn only while the value sits outside its line
        node._mtRect = null
        if (!st.t || k === 0) return
        context.beginPath(); context.moveTo(st.lead[0], st.lead[1]); context.lineTo(st.lead[2], st.lead[3]); context.strokeShape(node)
        return
      }
      if (k === 0) { if (isText) node._mtPx = 0; node._mtRect = null; return }
      if (isText) { node._mtPx = node.fontSize() * (Math.abs(node.getAbsoluteScale().y) || 1) * k; node._mtClip = textClipped(node) }
      const at = g.getAttr('minLabel').at || { x: 0, y: 0 }
      const p = k === 1 ? at : node.getAbsoluteTransform().copy().invert().point(g.getAbsoluteTransform().point(at))
      node._mtRect = screenBox(node, isText ? textBox(node) : node.getSelfRect(), k, p, st.t)
      if (k === 1) return f.call(node, context, shape)
      context.save()
      if (st.t) context.translate(st.t.x, st.t.y)
      context.translate(p.x, p.y); context.scale(k, k); context.translate(-p.x, -p.y)
      f.call(node, context, shape)
      context.restore()
    }
  }
}
