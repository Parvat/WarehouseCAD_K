// render/dimChain.js — a dimension chain laid out by the label rules (CLAUDE.md Critical Rule 8; STUDIO.md, Canvas text):
// a run of values along one line — the column grid's chain — each value in a break of its segment when it fits there. A
// value too long for its segment sits just outside it: on a second row just past the chain (away from the building), on a
// short leader from its segment, pushed apart so the values never overlap. CLAUDE.md Rule 8 — the CAD text model: laid out
// ONCE at the values' real text height (utils/textSizes.js), every offset in drawing units — the same at every zoom; it
// never hides.
//
// Pure layout in world px, as label ops (render/labelOps.js): the canvas and the PDF at the same label scale.

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/** A value's box in a chain: its text's width and the box around it (world px), at font size `fs`. */
export const chainValueBox = (text, fs, bold = false) => { const tw = String(text).length * fs * (bold ? 0.64 : 0.6); return { tw, w: tw + fs * 0.4, h: fs * 1.4 } }

/**
 * The chain → { items: [{ stop, box (the value's box, world px — a click on it types it), out (moved outside) }], ops,
 * reach (how far it reaches past its line on the `out` side, world px), hidden }.
 *   stops:  [{ lo, hi, text, bold, style (a font weight of its own) }] along the axis, in order — each item also carries its
 *           own ops (`ops`: its line pieces, its ticks, its leader, its text)
 *   axis:   'x' (a chain along x — the values upright) or 'y' (along y — the values upright too)
 *   at:     the chain line's position across; out: +1 / -1 — the side away from the building (the outside row's side)
 *   u:      one label px (world px); ink: the line and text colour; lo / hi: the run's ends (default: the stops' ends)
 *   cursor: the index of a stop being typed — a thin text cursor after its value
 */
export function dimChain(stops, { axis = 'x', at = 0, out = -1, u = 1, ink = '#2F6FD6', lo, hi, cursor = -1, faint = false } = {}) {
  const fs = 10.5 * u, tick = 5.5 * u, pad = 3 * u, gap = 4 * u, sw = 1 * u
  const P = (q, c) => (axis === 'x' ? [q, c] : [c, q])
  const runLo = lo ?? Math.min(...stops.map(s => s.lo)), runHi = hi ?? Math.max(...stops.map(s => s.hi))
  const sized = stops.map(s => ({ s, ...chainValueBox(s.text, fs, s.bold), m: (s.lo + s.hi) / 2, L: s.hi - s.lo }))
  // along the chain each value takes its width (a chain along y: its height — the values stand upright)
  const along = (v) => (axis === 'x' ? v.w : v.h)
  const across = (v) => (axis === 'x' ? v.h : v.w)
  for (const v of sized) v.fits = along(v) + pad <= v.L + 1e-6                // in its segment, a little clear of the ticks
  if (!stops.length) return { items: [], ops: [], reach: 0, hidden: false }
  // the outside row: past the values in the chain, pushed apart left to right, then back from the far end
  const rowAt = at + out * (Math.max(0, ...sized.map(across)) / 2 + gap + Math.max(0, ...sized.filter(v => !v.fits).map(across)) / 2)
  const outs = sized.filter(v => !v.fits)
  let edge = -Infinity
  for (const v of outs) { v.c = Math.max(v.m, edge + gap + along(v) / 2); edge = v.c + along(v) / 2 }
  edge = Infinity
  for (let i = outs.length - 1; i >= 0; i--) { const v = outs[i]; v.c = Math.min(v.c, edge - gap - along(v) / 2, runHi - along(v) / 2); edge = v.c - along(v) / 2 }
  edge = -Infinity
  for (const v of outs) { v.c = Math.max(v.c, edge + gap + along(v) / 2, runLo + along(v) / 2); edge = v.c + along(v) / 2 }
  const line = (a, b, extra) => ({ op: 'line', points: [...a, ...b], stroke: ink, strokeWidth: sw, ...extra })
  const ops = [], items = []
  const ticks = new Set()
  sized.forEach((v, i) => {
    const { s } = v, mine = []
    const push = (...o) => { ops.push(...o); mine.push(...o) }
    for (const q of [s.lo, s.hi]) { const k = Math.round(q * 1000); if (!ticks.has(k)) { ticks.add(k); push(line(P(q, at - tick), P(q, at + tick))) } }
    let cx, cy
    if (v.fits) {
      const brk = along(v) / 2 + pad
      if (v.L - 2 * brk > 0.01) push(line(P(s.lo, at), P(v.m - brk, at)), line(P(v.m + brk, at), P(s.hi, at)))
      ;[cx, cy] = P(v.m, at)
    } else {
      push(line(P(s.lo, at), P(s.hi, at)))
      // the leader: from the segment's middle on the chain to the value's near side on the outside row
      const near = rowAt - out * (across(v) / 2)
      push(line(P(v.m, at + out * tick * 0.6), P(v.c, near), { strokeWidth: 0.8 * u, leader: true }))
      ;[cx, cy] = P(v.c, rowAt)
    }
    const box = { x: cx - v.w / 2, y: cy - v.h / 2, w: v.w, h: v.h }
    push({ op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text: s.text, fontSize: fs, fill: ink, fontFamily: FONT, fontStyle: s.style || (s.bold ? '700' : '400'), ...(faint ? { opacity: 0.85 } : null) })
    if (i === cursor) { const x = cx + v.tw / 2 + fs * 0.08; push({ op: 'line', points: [x, cy - fs * 0.55, x, cy + fs * 0.55], stroke: ink, strokeWidth: 0.8 * u }) }
    items.push({ stop: s, box, out: !v.fits, ops: mine })
  })
  const inRow = Math.max(tick, Math.max(0, ...sized.map(across)) / 2)
  const reach = outs.length ? Math.abs(rowAt - at) + Math.max(...outs.map(across)) / 2 : inRow
  return { items, ops, reach, hidden: false }
}
