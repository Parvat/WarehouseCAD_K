// canvas2/minText.js — the one label rule on the canvas (CLAUDE.md Critical Rule 8; STUDIO.md, Canvas text — labels-final
// round): a label shows only when it FITS ITS OWN SPACE at 11 px (MIN_TEXT_PX) or more on screen; otherwise it hides until
// the zoom allows it. A label is drawn at its natural drawing size — never grown to reach 11 px, never grouped into ranges,
// never moved onto a leader.
//
// One patch of Konva's drawing, so every text on the canvas — today's and any added later — keeps the rule without each
// painter knowing the zoom:
//   - a plain Konva Text: under 11 px on screen it is not drawn; `minFit` ({ w, h } in its own units, either optional) is
//     the room it has — wider than that, it is not drawn;
//   - a LABEL — text on a pill, a chip, a bubble — is a Group with `minLabel`: { fs (its text's font size), at: { x, y }
//     (the anchor, group units), box: { w, h } (the label's size), fit: { w, h } (its room, optional), cover (optional) }.
//     Under 11 px, or bigger than its room, the whole label (its pill and its text) hides. `cover: true` (a label that
//     sits on the floor between objects — an aisle width, a door's values): it also hides while it would cover another
//     object — a rack, a door, a column, a zone (setLabelObstacles: the canvas's list, world px) — or be larger than the
//     object under its anchor (`own` ids: the objects it labels, never "another");
//   - `minText: false` on a Text opts it out (none does today).
// The PDF is not drawn by Konva: its layouts keep the same fit rule at the PDF's scale. What each text was drawn at is kept
// on the node (`_mtPx`: screen px, 0 when hidden by the rule) — REG-canvas-text-min reads it.

import Konva from 'konva'

export const MIN_TEXT_PX = 11

/** One label px for a layout: its natural drawing size, 1 / lz — never grown with the zoom (labels-final: a label too small
 *  for 11 px hides instead; was: enlarged so its text drew at 11 px). Kept so the layouts read one unit. */
export const floorUnit = (lz) => 1 / lz

/* The objects a grown label must not cover: [{ id, x, y, w, h }] (world px), set by the canvas (LabelObstacles). */
let OBST = [], OBST_V = 0
export function setLabelObstacles(list) { OBST = list || []; OBST_V++ }
/** Would a grown label, its box `sb` on screen and its anchor `sa` on screen, cover an object (or outgrow its own)? `node`:
 *  any node on its layer (world = the layer's space); `own`: object ids it labels. */
function coversObject(node, sb, sa, own) {
  if (!OBST.length) return false
  const layer = node.getLayer && node.getLayer()
  if (!layer) return false
  const inv = layer.getAbsoluteTransform().copy().invert()
  const p0 = inv.point({ x: sb.x, y: sb.y }), p1 = inv.point({ x: sb.x + sb.w, y: sb.y + sb.h }), a = inv.point(sa)
  const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y)
  const sc = Math.abs(layer.getAbsoluteScale().x) || 1, e = 0.5 / sc            // half a screen px: touching is not covering
  for (const o of OBST) {
    const mine = (own && own.includes(o.id)) || (a.x > o.x && a.x < o.x + o.w && a.y > o.y && a.y < o.y + o.h)
    if (mine) { if (x0 < o.x - e || x1 > o.x + o.w + e || y0 < o.y - e || y1 > o.y + o.h + e) { if (!own || !own.includes(o.id)) return true } continue }
    if (x0 < o.x + o.w - e && x1 > o.x + e && y0 < o.y + o.h - e && y1 > o.y + e) return true
  }
  return false
}

/** The nearest ancestor Group carrying `minLabel` (cached on the node), or null. */
function labelGroupOf(node) {
  if (node._mlg !== undefined) return node._mlg && node._mlg.getAttr('minLabel') ? node._mlg : null
  let p = node.getParent()
  while (p && !p.getAttr('minLabel')) { if (p.nodeType === 'Layer' || p.nodeType === 'Stage') { p = null; break } p = p.getParent() }
  node._mlg = p || null
  return node._mlg
}

/** A label group now: { k — 1 (drawn: 11 px or more, in its room), 0 (hidden), t — always null (nothing moves) }. */
function labelState(g) {
  const key = g.getAbsoluteTransform().m.join(',') + '|' + OBST_V
  const ml = g.getAttr('minLabel')
  if (g._mtS && g._mtS.key === key && g._mtS.ml === ml) return g._mtS.st
  const st = coverState(g, labelFloor(g))
  g._mtS = { key, ml, st }
  return st
}
/* a label on the floor (`cover`) that would cover an object, or outgrow the one it sits on: hidden */
function coverState(g, st) {
  const ml = g.getAttr('minLabel')
  if (st.k === 0 || !ml.cover) return st
  const box = ml.box || {}, at = ml.at || { x: 0, y: 0 }
  if (!(box.w > 0 && box.h > 0)) return st
  const sb = screenBox(g, { x: at.x - box.w / 2, y: at.y - box.h / 2, w: box.w, h: box.h }, st.k, at, st.t)
  const sa = g.getAbsoluteTransform().point(at)
  return coversObject(g, sb, sa, ml.own) ? { k: 0, t: null } : st
}
function labelFloor(g) {
  const ml = g.getAttr('minLabel'), s = Math.abs(g.getAbsoluteScale().y) || 1, px = (ml.fs || 0) * s
  if (!(px > 0)) return { k: 1, t: null }
  // under 11 px on screen: hidden (never grown)
  if (px < MIN_TEXT_PX - 1e-6) return { k: 0, t: null }
  // bigger than its own room: hidden (never moved outside)
  const box = ml.box || {}, fit = ml.fit || {}
  if ((fit.w != null && box.w != null && box.w > fit.w + 1e-6) || (fit.h != null && box.h != null && box.h > fit.h + 1e-6)) return { k: 0, t: null }
  return { k: 1, t: null }
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

  // a plain text: drawn at its own size — or not drawn, under 11 px or wider than its room (`minFit`)
  const textDraw = Konva.Text.prototype._sceneFunc
  Konva.Text.prototype._sceneFunc = function minTextScene(context) {
    if (labelGroupOf(this)) return textDraw.call(this, context)          // a label's text: the label decides (below)
    const fs = this.fontSize(), s = Math.abs(this.getAbsoluteScale().y) || 1, px = fs * s
    this._mtClip = textClipped(this)
    if (this.getAttr('minText') === false || !(px > 0)) { this._mtPx = px; this._mtRect = screenBox(this, textBox(this)); return textDraw.call(this, context) }
    const lines = (this.textArr && this.textArr.length) || 1, lh = this.lineHeight()
    const tw = this.getTextWidth ? this.getTextWidth() : 0, th = lines * fs * lh
    const fit = this.getAttr('minFit')
    if (px < MIN_TEXT_PX - 1e-6 || (fit && ((fit.w != null && tw > fit.w + 1e-6) || (fit.h != null && th > fit.h + 1e-6)))) { this._mtPx = 0; this._mtRect = null; return }
    this._mtPx = px
    this._mtRect = screenBox(this, textBox(this))
    return textDraw.call(this, context)
  }

  // a label's shapes (its pill and its text): drawn together, or all hidden
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
