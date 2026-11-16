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
//     (the anchor, group units), box: { w, h } (the label's size), fit: { w, h } (its room, optional) }. Every shape in it
//     (the pill and the text alike) grows about that anchor by the same factor, or the whole label hides;
//   - `minText: false` on a Text opts it out (none does today).
// The PDF is not drawn by Konva: untouched. What each text was drawn at is kept on the node (`_mtPx`: screen px, 0 when
// hidden by the rule) — REG-canvas-text-min reads it.

import Konva from 'konva'

export const MIN_TEXT_PX = 11

/** The nearest ancestor Group carrying `minLabel` (cached on the node), or null. */
function labelGroupOf(node) {
  if (node._mlg !== undefined) return node._mlg && node._mlg.getAttr('minLabel') ? node._mlg : null
  let p = node.getParent()
  while (p && !p.getAttr('minLabel')) { if (p.nodeType === 'Layer' || p.nodeType === 'Stage') { p = null; break } p = p.getParent() }
  node._mlg = p || null
  return node._mlg
}

/** A label group's factor now: 1 (already 11 px or more), k > 1 (grow), or 0 (hide: it cannot fit). */
function labelFactor(g) {
  const ml = g.getAttr('minLabel'), s = Math.abs(g.getAbsoluteScale().y) || 1, px = (ml.fs || 0) * s
  if (!(px > 0) || px >= MIN_TEXT_PX - 1e-6) return 1
  const k = MIN_TEXT_PX / px, box = ml.box || {}, fit = ml.fit || {}
  if ((fit.w != null && box.w != null && box.w * k > fit.w + 1e-6) || (fit.h != null && box.h != null && box.h * k > fit.h + 1e-6)) return 0
  return k
}

let installed = false
export function installMinText() {
  if (installed || !Konva?.Text?.prototype?._sceneFunc || !Konva?.Shape?.prototype?.getSceneFunc) return
  installed = true

  // a plain text: grown about its own anchor, or hidden past its `minFit`
  const textDraw = Konva.Text.prototype._sceneFunc
  Konva.Text.prototype._sceneFunc = function minTextScene(context) {
    if (labelGroupOf(this)) return textDraw.call(this, context)          // a label's text: the label decides (below)
    const fs = this.fontSize(), s = Math.abs(this.getAbsoluteScale().y) || 1, px = fs * s
    if (this.getAttr('minText') === false || !(px > 0) || px >= MIN_TEXT_PX - 1e-6) { this._mtPx = px; return textDraw.call(this, context) }
    const k = MIN_TEXT_PX / px
    const lines = (this.textArr && this.textArr.length) || 1, pad = this.padding() || 0, lh = this.lineHeight()
    const tw = (this.getTextWidth ? this.getTextWidth() : 0) * k, th = lines * fs * lh * k
    const fit = this.getAttr('minFit')
    if (fit && ((fit.w != null && tw > fit.w + 1e-6) || (fit.h != null && th > fit.h + 1e-6))) { this._mtPx = 0; return }
    const W = this.width(), H = this.height(), align = this.align(), va = this.verticalAlign()
    const ax = align === 'center' ? W / 2 : align === 'right' ? W - pad : pad
    const ay = va === 'middle' ? H / 2 : va === 'bottom' ? H - pad : pad + (lines * fs * lh) / 2
    context.save()
    context.translate(ax, ay); context.scale(k, k); context.translate(-ax, -ay)
    textDraw.call(this, context)
    context.restore()
    this._mtPx = MIN_TEXT_PX
  }

  // a label's shapes (its pill and its text): grown together about the label's anchor, or all hidden
  const sceneOf = Konva.Shape.prototype.getSceneFunc
  Konva.Shape.prototype.getSceneFunc = function minLabelSceneFunc() {
    const f = sceneOf.call(this)
    const g = f && labelGroupOf(this)
    if (!g) return f
    const node = this
    return function minLabelScene(context, shape) {
      const k = labelFactor(g)
      const isText = node.className === 'Text'
      if (k === 0) { if (isText) node._mtPx = 0; return }
      if (isText) node._mtPx = node.fontSize() * (Math.abs(node.getAbsoluteScale().y) || 1) * k
      if (k === 1) return f.call(node, context, shape)
      const at = g.getAttr('minLabel').at || { x: 0, y: 0 }
      const p = node.getAbsoluteTransform().copy().invert().point(g.getAbsoluteTransform().point(at))
      context.save()
      context.translate(p.x, p.y); context.scale(k, k); context.translate(-p.x, -p.y)
      f.call(node, context, shape)
      context.restore()
    }
  }
}
