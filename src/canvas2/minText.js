// canvas2/minText.js — the canvas text, measured (CLAUDE.md Critical Rule 8 — the CAD text model, labels-cad round): every
// label has a real-world text height in drawing units (utils/textSizes.js) and scales with the drawing exactly like
// geometry — no screen floor, no hiding, no growing, no ranges, no leaders added on zoom. This patch of Konva's drawing no
// longer changes anything it draws: it only records what each text was drawn as, for the tests (REG-canvas-text-cad) —
//   `_mtPx` its screen size, `_mtRect` its drawn box on screen, `_mtClip` cut (fewer characters laid out than it has).
// A label on a pill, chip or bubble is still a Group with `minLabel` ({ fs, at, box }) — its box is measured with it.
// The PDF is not drawn by Konva.

import Konva from 'konva'

/** (kept for the screen-sized UI texts that size themselves to it) */
export const MIN_TEXT_PX = 11

/** One label px for a layout at label scale `lz`: its drawing size, 1 / lz (the zoom never enters). */
export const floorUnit = (lz) => 1 / lz

/** The nearest ancestor Group carrying `minLabel` (cached on the node), or null. */
function labelGroupOf(node) {
  if (node._mlg !== undefined) return node._mlg && node._mlg.getAttr('minLabel') ? node._mlg : null
  let p = node.getParent()
  while (p && !p.getAttr('minLabel')) { if (p.nodeType === 'Layer' || p.nodeType === 'Stage') { p = null; break } p = p.getParent() }
  node._mlg = p || null
  return node._mlg
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
/** `node`'s local box `b`, on screen (stage px): { x, y, w, h }. */
function screenBox(node, b) {
  const T = node.getAbsoluteTransform()
  const cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => T.point({ x, y }))
  const xs = cs.map(c => c.x), ys = cs.map(c => c.y), x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

let installed = false
export function installMinText() {
  if (installed || !Konva?.Text?.prototype?._sceneFunc || !Konva?.Shape?.prototype?.getSceneFunc) return
  installed = true

  // a plain text: drawn as it is, measured
  const textDraw = Konva.Text.prototype._sceneFunc
  Konva.Text.prototype._sceneFunc = function minTextScene(context) {
    if (labelGroupOf(this)) return textDraw.call(this, context)          // a label's text: measured with its label (below)
    const s = Math.abs(this.getAbsoluteScale().y) || 1
    this._mtPx = this.fontSize() * s
    this._mtClip = textClipped(this)
    this._mtRect = screenBox(this, textBox(this))
    return textDraw.call(this, context)
  }

  // a label's shapes (its pill and its text): drawn as they are, measured
  const sceneOf = Konva.Shape.prototype.getSceneFunc
  Konva.Shape.prototype.getSceneFunc = function minLabelSceneFunc() {
    const f = sceneOf.call(this)
    const g = f && labelGroupOf(this)
    if (!g) return f
    const node = this
    return function minLabelScene(context, shape) {
      const isText = node.className === 'Text'
      if (isText) { node._mtPx = node.fontSize() * (Math.abs(node.getAbsoluteScale().y) || 1); node._mtClip = textClipped(node) }
      node._mtRect = screenBox(node, isText ? textBox(node) : node.getSelfRect())
      return f.call(node, context, shape)
    }
  }
}
