// elevationDrawing.js — the rack elevation drawing of one type at one beam length (Elevations v2 §D–F): ONE pure
// layout of primitives in pixel space, drawn by the editor pane (components/Elevations/ElevationPane.jsx — the same
// primitives made interactive by their `role`), the right panel's preview and the PDF (toSVG), so the three never
// differ.
//
// Dimensioned and labelled as on the reference rack elevation (the sample sheet); drawn in Trace's own colours (blue
// frames, orange beams, beige loads). Weights stay off.
// Front view, one bay: the uprights, the beams (to the TOP of the beam, the face below), the loads on each level (as
// many as the beam length holds), the bay width across the top. Dimensions in feet-inches: beam elevations to the top
// of the beam on the right; the clear opening between beams inside the bay; the chain of load + clearance per level on
// the left; overall on the far left: top of the top load, top of the upright, and — when the building has them — its
// clear height, to the underside of the roof structure (the truss's bottom chord, drawn there), and the sprinkler head
// at its own height (above the bottom chord, within the truss, as a rule). Side view beside it: the frame depth (two frames and
// the flue for a back-to-back), the upright height, a simple diagonal bracing pattern. Weights stay off the drawing.

import { beamFace, topLoadIssue, SPRINKLER_CLEARANCE_IN } from './elevations'
import { positionsPerBeam } from './palletFit'

/** 6'-2" / 26' / 0" — feet and inches as on a rack drawing. */
export function ftInDash(inches) {
  const v = Math.round(inches)
  const f = Math.floor(Math.abs(v) / 12), i = Math.abs(v) - f * 12, sign = v < 0 ? '-' : ''
  if (!f) return `${sign}${i}"`
  return i ? `${sign}${f}'-${i}"` : `${sign}${f}'`
}
/** Parse 6'-2" / 6' 2" / 6.5' / 74 / 74" / 6-2 → inches (NaN when it isn't a length). */
export function parseFtIn(text) {
  const t = String(text).trim().replace(/[″]/g, '"').replace(/[′]/g, "'")
  let m = t.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*"?$/)
  if (m) return Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0)
  m = t.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (m) return Number(m[1]) * 12 + Number(m[2])
  m = t.match(/^(\d+(?:\.\d+)?)\s*"?$/)
  if (m) return Number(m[1])
  return NaN
}

// Trace's own colours (the dimensioning and labelling follow the reference sheet; the look is Trace's)
const INK = '#1d2433', DIM = '#2b3a55', DIM_LIGHT = '#6b7a90', UPRIGHT = '#2f5d8a', BEAM = '#e07a1f', BEAM_EDGE = '#b4561a', LOAD = '#f3e2c3', LOAD_EDGE = '#8a6a3a', BRACE = '#5b7da3', TRUSS = '#6b7280', MISFIT = '#f8d7d3', MISFIT_EDGE = '#c0392b', HEAD = '#c0392b'

/** Which levels of `t` don't fit — a pallet plus the clearance taller than the top of its beam (the floor) to the
 *  underside of the next beam (the top level has none above it): the Check layout error's own rule
 *  (utils/elevations.js elevationIssues). → Map(k → { avail, need }). */
export function misfitLevels(t) {
  const face = beamFace(t), L = [...t.levels].map((l, k) => ({ ...l, k })).sort((a, b) => a.beamIn - b.beamIn), out = new Map()
  L.forEach((lv, i) => {
    if (i + 1 >= L.length) return
    const next = L[i + 1].beamIn - face
    const avail = next - lv.beamIn, need = (lv.palletHeightIn || 0) + (t.clearanceIn || 0)
    if (avail < need - 1e-6) out.set(lv.k, { avail, need })
  })
  return out
}

/** The drawing of type `t` with `bayIn` beams, fitted into and centred in `box` ({ w, h } px): { w, h (the box), scale
 *  (px per inch), items, bottom (the drawing's lowest y) }. opts: palletWIn, depthIn (frame depth, the racks'), pair +
 *  flueIn (back-to-back side view), building ({ clearHeightIn, sprinklerIn } or null), fontPx (the base label size),
 *  compact (no dimensions: the panel's preview), stacked (the side view under the front view, not beside it), scale (a
 *  drawing scale asked for), draft overrides { active: role key, removing: level index }. Items: { t: 'rect'|'line'|
 *  'text'|'poly'|'polygon'|'circle', ..., role, tag } — role { kind: 'beam', k } | { kind: 'upright', x } |
 *  { kind: 'top' } | { kind: 'dim', id, k?, value } for the editor; tag names a part ('load', 'chord', 'head', 'misfit').
 *  Labels come in three sizes — beam elevations largest and bold at the beam end, overall heights medium on the outer
 *  left, chains (load + clearance, clear openings, beam face) smaller and lighter — and none overlaps a load, a beam or
 *  another label (declutter). */
export function elevationLayout(t, bayIn = 96, box = { w: 800, h: 500 }, opts = {}) {
  const { palletWIn = 40, depthIn = 42, pair = false, flueIn = 9, building = null, fontPx = 11, compact = false, stacked = false, active = null, removing = null, scale = null, sprinklerClearanceIn = SPRINKLER_CLEARANCE_IN } = opts
  const face = beamFace(t), upW = 3, clearance = t.clearanceIn || 0
  const L = [...t.levels].map((l, k) => ({ ...l, k })).sort((a, b) => a.beamIn - b.beamIn)
  const top = L[L.length - 1]
  const misfit = misfitLevels(t)
  // the top load against the building: above the clear height, or within the sprinkler clearance — the Check layout errors
  const topIssue = topLoadIssue(t, building, sprinklerClearanceIn)
  const loadH = (lv, i) => { const ph = lv.palletHeightIn || 0, next = i + 1 < L.length ? L[i + 1].beamIn - face : Infinity; return Math.max(0, Math.min(ph, next - lv.beamIn - 0.5)) }
  const topLoad = top.beamIn + loadH(top, L.length - 1)
  const bClear = building?.clearHeightIn > 0 ? building.clearHeightIn : null
  const bSprink = building?.sprinklerIn > 0 ? building.sprinklerIn : null
  /* the roof truss: its bottom chord at the clear height (the underside of the roof structure), its top chord above
     both that and the sprinkler head */
  const TRUSS_IN = 22
  const trussTop = bClear ? Math.max(bClear + TRUSS_IN, (bSprink || 0) + 8) : null
  const H = Math.max(t.uprightHeightIn, topLoad + clearance, trussTop ? trussTop + 2 : 0, bSprink ? bSprink + 8 : 0)
  const hTop = t.uprightHeightIn
  const frontW = bayIn + 2 * upW, sideW = pair ? 2 * depthIn + flueIn + 2 * upW : depthIn + upW
  // the three label sizes: elevations, overall, chains
  const fE = fontPx * 1.15, fO = fontPx, fC = Math.max(8, fontPx * 0.84)
  const tw = (str, size) => String(str).length * size * 0.56
  const longestElev = Math.max(0, ...L.filter(l => l.beamIn > 0).map(l => tw(ftInDash(l.beamIn), fE)))
  const nOverall = 1 + (bClear ? 2 : 0)
  // the columns, in px from the rack: left — chain, beam face, overall; right — clear openings, the leader, elevations, sprinkler
  const cChain = fC * 1.5, cFace = cChain + fC * 2.4, cOver0 = cFace + fC * 2.2
  const mL = compact ? 6 : cOver0 + nOverall * fO * 2.2 + fO * 0.8
  const cOpen = fC * 1.4, cLead = cOpen + fC * 1.2, cElev = cLead + fE * 0.3
  const cSpr = cElev + longestElev + fO * 1.6
  const mR = compact ? 6 : (bSprink ? cSpr + fO * 1.4 : cElev + longestElev + fE * 0.6)
  const mT = compact ? 6 : fO * (bClear ? 1.4 : 3.0), mB = compact ? 6 : fO * 1.4
  const sideL = compact ? 6 : fO * 3.4, sideR = compact ? 6 : fO * 1.2, sideT = compact ? 6 : fO * (pair ? 4.2 : 2.6)
  const gap = compact ? 14 : fO * 2
  let fit
  if (stacked) fit = Math.min((box.w - mL - mR) / frontW, (box.w - sideL - sideR) / sideW, (box.h - mT - mB - gap - sideT - mB) / (H + hTop))
  else fit = Math.min((box.w - mL - mR - gap - sideL - sideR) / (frontW + sideW), (box.h - mT - mB) / H, (box.h - sideT - mB) / hTop)
  fit = Math.max(0.05, fit)
  const s = scale && scale <= fit ? scale : fit           // a drawing scale asked for (the PDF's standard one), if it fits
  // the content's size, then centred in the box
  const frontBoxW = mL + frontW * s + mR, frontBoxH = mT + H * s + mB
  const sideBoxW = sideL + sideW * s + sideR, sideBoxH = sideT + hTop * s + mB
  const cw = stacked ? Math.max(frontBoxW, sideBoxW) : frontBoxW + gap + sideBoxW
  const ch = stacked ? frontBoxH + gap + sideBoxH : Math.max(frontBoxH, sideBoxH)
  const ox = Math.max(0, (box.w - cw) / 2), oy = Math.max(0, (box.h - ch) / 2)
  const X0 = ox + (stacked ? (cw - frontBoxW) / 2 : 0) + mL, floor = oy + mT + H * s
  const Y = (z) => floor - z * s, Xf = (x) => X0 + x * s
  const XS0 = stacked ? ox + (cw - sideBoxW) / 2 + sideL : X0 + frontW * s + mR + gap + sideL
  const floorS = stacked ? floor + mB + gap + sideT + hTop * s : floor
  const Ys = (z) => floorS - z * s, Xs = (x) => XS0 + x * s
  const sw = Math.max(0.7, fontPx / 12)
  const items = []
  const rect = (x, y, w, h, o = {}) => items.push({ t: 'rect', x, y, w, h, ...o })
  const line = (x1, y1, x2, y2, o = {}) => items.push({ t: 'line', x1, y1, x2, y2, stroke: o.stroke || DIM, sw: o.sw || sw, ...o })
  const text = (x, y, str, o = {}) => items.push({ t: 'text', x, y, s: str, size: o.size || fO, fill: o.fill || DIM, anchor: o.anchor || 'middle', halo: Math.max(1, (o.size || fO) * 0.26), ...o })
  const keyOf = (r) => (r ? r.kind + ':' + (r.k ?? r.id ?? '') : null)
  const isActive = (r) => active && keyOf(r) === active
  const arrow = (x, y, dx, dy, c, size) => { const a = size * 0.5, b = size * 0.18; items.push({ t: 'polygon', points: [[x, y], [x - dx * a - dy * b, y - dy * a + dx * b], [x - dx * a + dy * b, y - dy * a - dx * b]], fill: c }) }

  /* a vertical dimension at x from y0 (lower) to y1 (upper) in px: extension lines from `from`, arrowheads, the label
     in a break of the line (beside it, arrows outside, when the span is too short); `pri`: the label's rank (1 the
     elevations, 2 overall, 3 chains), `out`: which way it may move when crowded */
  const dimV = (x, y0, y1, label, role, { from = null, size = fO, color = DIM, pri = 2, out = -1 } = {}) => {
    if (compact) return
    const hot = isActive(role), c = hot ? '#d0392b' : color, w = hot ? sw * 1.7 : sw
    if (from != null) for (const y of [y0, y1]) line(from, y, x + (from < x ? size * 0.4 : -size * 0.4), y, { stroke: c, sw: sw * 0.6 })
    const len = Math.abs(y0 - y1), need = tw(label, size) + size * 1.6
    const meta = { pri, out, span: [Math.min(y0, y1), Math.max(y0, y1)], lineX: x }
    if (len >= need) {
      const mid = (y0 + y1) / 2, half = tw(label, size) / 2 + size * 0.35
      line(x, y0, x, mid + half, { stroke: c, sw: w }); line(x, mid - half, x, y1, { stroke: c, sw: w })
      arrow(x, y0, 0, 1, c, size); arrow(x, y1, 0, -1, c, size)
      text(x + size * 0.35, mid, label, { rot: -90, size, fill: c, weight: hot ? 700 : undefined, role, ...meta })
    } else {
      line(x, y0, x, y1, { stroke: c, sw: w })
      line(x, y0, x, y0 + size, { stroke: c, sw: w }); line(x, y1, x, y1 - size, { stroke: c, sw: w })
      arrow(x, y0, 0, -1, c, size); arrow(x, y1, 0, 1, c, size)
      text(x + out * size * 0.45, (y0 + y1) / 2 + size * 0.35, label, { anchor: out < 0 ? 'end' : 'start', size, fill: c, weight: hot ? 700 : undefined, role, ...meta })
    }
  }
  const dimH = (y, x0, x1, label, { size = fO, color = DIM } = {}) => {
    if (compact) return
    for (const x of [x0, x1]) line(x, y - size * 0.5, x, y + size * 0.5, { stroke: color, sw: sw * 0.6 })
    const len = x1 - x0, need = tw(label, size) + size * 1.6
    if (len >= need) {
      const mid = (x0 + x1) / 2, half = tw(label, size) / 2 + size * 0.4
      line(x0, y, mid - half, y, { stroke: color }); line(mid + half, y, x1, y, { stroke: color })
      arrow(x0, y, -1, 0, color, size); arrow(x1, y, 1, 0, color, size)
      text(mid, y + size * 0.35, label, { size, fill: color, pri: 2 })
    } else {
      line(x0 - size * 1.2, y, x1 + size * 1.2, y, { stroke: color })
      arrow(x0, y, 1, 0, color, size); arrow(x1, y, -1, 0, color, size)
      text((x0 + x1) / 2, y - size * 0.45, label, { size, fill: color, pri: 2 })
    }
  }

  // ── the floor, under both views
  const floorLine = (x0, x1, y) => line(x0, y, x1, y, { stroke: INK, sw: sw * 1.8 })
  floorLine(X0 - (compact ? 0 : fO * 2), Xf(frontW) + (compact ? 0 : fO * 2), floor)
  floorLine(Xs(0) - (compact ? 0 : fO * 1.5), Xs(sideW) + (compact ? 0 : fO * 1.5), floorS)

  // ── the roof truss over the front view: double-line chords, Warren diagonals
  const xSpr = Xf(frontW) + cSpr
  if (bClear) {
    const tx0 = X0 - (compact ? 0 : fO * 1.5), tx1 = compact ? Xf(frontW) + 6 : (bSprink ? xSpr : Xf(frontW)) + fO * 2
    const c = Math.max(2, 3 * s), yb = Y(bClear), yt = Y(trussTop)
    rect(tx0, yb - c, tx1 - tx0, c, { fill: '#fff', stroke: TRUSS, sw: sw * 0.9, tag: 'chord', chordAt: bClear })
    rect(tx0, yt, tx1 - tx0, c, { fill: '#fff', stroke: TRUSS, sw: sw * 0.9, tag: 'chord', chordAt: trussTop })
    const d = yb - c - (yt + c), n = Math.max(2, Math.round((tx1 - tx0) / Math.max(4, d * 1.15)))
    const pts = []; for (let i = 0; i <= n; i++) pts.push([tx0 + (tx1 - tx0) * i / n, i % 2 ? yb - c : yt + c])
    items.push({ t: 'poly', points: pts, stroke: TRUSS, sw: sw * 1.1 })
  }

  // ── front view: uprights (filled), beams, loads (beige; a level that doesn't fit red, never over the beam above)
  for (const x of [0, frontW - upW]) {
    rect(Xf(x), Y(hTop), Math.max(2, upW * s), hTop * s, { fill: UPRIGHT, role: { kind: 'upright', x }, tag: 'upright' })
    if (!compact) rect(Xf(x) - 2, Y(hTop) - 3, Math.max(2, upW * s) + 4, 6, { fill: isActive({ kind: 'top' }) ? '#d0392b' : 'transparent', role: { kind: 'top' }, cursor: 'ns-resize' })
  }
  const per = Math.max(0, positionsPerBeam(bayIn, palletWIn))
  const gapIn = per ? (bayIn - per * palletWIn) / (per + 1) : 0
  L.forEach((lv, i) => {
    const isTop = i === L.length - 1, z = lv.beamIn, gone = removing === lv.k, bad = misfit.has(lv.k) || (isTop && !!topIssue)
    if (z > 0) rect(Xf(-1), Y(z), (frontW + 2) * s, Math.max(1.5, face * s), { fill: gone ? '#d0392b' : isActive({ kind: 'beam', k: lv.k }) ? BEAM_EDGE : BEAM, stroke: isActive({ kind: 'beam', k: lv.k }) ? '#7a3510' : undefined, sw: sw * 1.4, opacity: gone ? 0.5 : 1, role: { kind: 'beam', k: lv.k }, cursor: 'ns-resize', tag: 'beam' })
    const lh = loadH(lv, i)
    for (let p = 0; p < per; p++) {
      const x = upW + gapIn + p * (palletWIn + gapIn)
      rect(Xf(x), Y(z + lh), palletWIn * s, lh * s, { fill: bad ? MISFIT : LOAD, stroke: bad ? MISFIT_EDGE : LOAD_EDGE, sw: sw * (bad ? 1.2 : 0.8), opacity: gone ? 0.35 : 1, tag: 'load', level: lv.k })
    }
    if (bad && per) text(Xf(frontW / 2), Y(z + lh / 2) + fC * 0.35, misfit.has(lv.k) ? "doesn't fit" : topIssue === 'clear' ? 'above clear height' : `within ${sprinklerClearanceIn}" of sprinklers`, { size: fC, fill: MISFIT_EDGE, weight: 700, tag: 'misfit', pri: 1.5, level: lv.k })
  })
  if (!compact) {
    // the bay width across the top, over the top load
    dimH(Y(Math.max(topLoad, hTop)) - fO * 1.3, Xf(upW), Xf(upW + bayIn), ftInDash(bayIn), { size: fO })
    // right: each beam's elevation to its top — largest and bold, on a leader off the beam's end
    for (const lv of L) if (lv.beamIn > 0) {
      const y = Y(lv.beamIn), role = { kind: 'dim', id: 'elev', k: lv.k, value: lv.beamIn }, hot = isActive(role) || isActive({ kind: 'beam', k: lv.k })
      line(Xf(frontW + 1), y, Xf(frontW) + cLead, y, { stroke: hot ? '#d0392b' : DIM, sw: hot ? sw * 1.6 : sw })
      text(Xf(frontW) + cElev, y + fE * 0.36, ftInDash(lv.beamIn), { anchor: 'start', size: fE, fill: hot ? '#d0392b' : INK, weight: 700, role, pri: 1 })
    }
    // just outside the right upright: the clear opening from the top of each beam (the floor) to the underside of the next — a chain, small and light
    L.forEach((lv, i) => {
      if (i + 1 >= L.length) return
      const z0 = lv.beamIn, z1 = L[i + 1].beamIn - face
      dimV(Xf(frontW) + cOpen, Y(z0), Y(z1), ftInDash(z1 - z0), { kind: 'dim', id: 'open', k: L[i + 1].k, value: z1 - z0 }, { size: fC, color: DIM_LIGHT, pri: 3, out: 1 })
    })
    // left: the chain of load + clearance per level (the top level: its load), small and light
    L.forEach((lv, i) => {
      const h = (lv.palletHeightIn || 0) + (i + 1 < L.length ? clearance : 0)
      dimV(X0 - cChain, Y(lv.beamIn), Y(lv.beamIn + h), ftInDash(h), { kind: 'dim', id: 'chain', k: lv.k, value: h }, { from: X0 - fC * 0.4, size: fC, color: DIM_LIGHT, pri: 3, out: -1 })
    })
    // the beam face, at the lowest beam, small and light
    const low = L.find(l => l.beamIn > 0)
    if (low) dimV(X0 - cFace, Y(low.beamIn - face), Y(low.beamIn), ftInDash(face), { kind: 'dim', id: 'face', value: face }, { from: X0 - fC * 0.4, size: fC, color: DIM_LIGHT, pri: 3, out: -1 })
    // the outer left, overall heights, medium: the top of the top load, the clear height (the truss's bottom chord), the top of the truss
    const ov = [[topLoad, 'topload']]
    if (bClear) ov.push([bClear, 'clear'], [trussTop, 'truss'])
    ov.sort((a, b) => a[0] - b[0]).forEach(([z, id], i) => dimV(X0 - cOver0 - i * fO * 2.2, Y(0), Y(z), ftInDash(z), { kind: 'info', id }, { from: X0 - cFace + fC * 0.6, size: fO, pri: 2, out: -1 }))
    // the sprinkler head: dimensioned from the floor (overall, medium), the head drawn, labelled with a leader
    if (bSprink) {
      dimV(xSpr, Y(0), Y(bSprink), ftInDash(bSprink), { kind: 'info', id: 'sprinkler' }, { size: fO, pri: 2, out: 1 })
      items.push({ t: 'circle', cx: xSpr, cy: Y(bSprink) - fO * 0.35, r: fO * 0.32, fill: HEAD, stroke: '#922b21', sw: sw * 0.6, tag: 'head' })
      const ly = (trussTop ? Y(trussTop) : Y(bSprink) - fO * 3) - fO * 0.6, lx = xSpr - fO * 5.5
      text(lx, ly, 'Sprinkler head', { anchor: 'end', size: fC, fill: DIM_LIGHT, pri: 3 })
      items.push({ t: 'poly', points: [[lx + fC * 0.2, ly - fC * 0.3], [xSpr - fO * 0.8, ly - fC * 0.3], [xSpr - fO * 0.1, Y(bSprink) - fO * 0.8]], stroke: DIM_LIGHT, sw: sw * 0.8 })
    }
  }

  // ── side view: frames (filled uprights, two and the flue for a back-to-back), horizontals and alternating diagonals, flue spacers
  const frames = pair ? [0, depthIn + flueIn + upW] : [0]
  for (const f0 of frames) {
    for (const x of [f0, f0 + depthIn]) rect(Xs(x), Ys(hTop), Math.max(2, upW * s), hTop * s, { fill: UPRIGHT })
    const n = Math.max(3, Math.round((hTop - 6) / 28)), step = (hTop - 6) / n
    for (let i = 0; i <= n; i++) line(Xs(f0 + upW), Ys(6 + i * step), Xs(f0 + depthIn), Ys(6 + i * step), { stroke: BRACE, sw: sw * 0.9 })
    for (let i = 1; i < n; i += 2) {
      const a = Ys(6 + i * step), b = Ys(6 + (i + 1) * step), lr = ((i - 1) / 2) % 2 === 0
      line(Xs(lr ? f0 + upW : f0 + depthIn), a, Xs(lr ? f0 + depthIn : f0 + upW), b, { stroke: BRACE, sw: sw * 0.9 })
    }
  }
  if (pair) for (const z of [hTop / 3, (2 * hTop) / 3]) { const y = Ys(z); line(Xs(depthIn + upW), y - 1.5, Xs(depthIn + upW + flueIn), y - 1.5, { stroke: BRACE, sw: sw * 1.4 }); line(Xs(depthIn + upW), y + 1.5, Xs(depthIn + upW + flueIn), y + 1.5, { stroke: BRACE, sw: sw * 1.4 }) }
  if (!compact) {
    const yt = Ys(hTop) - fO * 1.3
    dimH(yt, Xs(0), Xs(depthIn + upW), ftInDash(depthIn))
    if (pair) { dimH(yt - fO * 1.7, Xs(depthIn + upW), Xs(depthIn + upW + flueIn), ftInDash(flueIn)); dimH(yt, Xs(depthIn + flueIn + upW), Xs(sideW), ftInDash(depthIn)) }
    dimV(Xs(0) - fO * 1.6, Ys(0), Ys(hTop), ftInDash(hTop), { kind: 'dim', id: 'upright', value: hTop }, { from: Xs(0) - fO * 0.4, size: fO, pri: 2, out: -1 })
  }
  if (!compact) declutter(items)
  return { w: box.w, h: box.h, scale: s, items, floor, Y, Xf, upW, frontW, bayIn, bottom: Math.max(floor, floorS) + mB }
}

/* ── labels never overlap a load, a beam or another label ─────────────────── */

/** A label's box (px). */
export function labelBox(i) {
  const len = String(i.s).length * i.size * 0.56
  if (i.rot === -90) return { x0: i.x - i.size * 0.85, x1: i.x + i.size * 0.2, y0: i.y - len / 2, y1: i.y + len / 2 }
  const x0 = i.anchor === 'start' ? i.x : i.anchor === 'end' ? i.x - len : i.x - len / 2
  return { x0, x1: x0 + len, y0: i.y - i.size * 0.8, y1: i.y + i.size * 0.22 }
}
const hit = (a, b, pad = 0.5) => a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.y0 < b.y1 - pad && b.y0 < a.y1 - pad
const rectBox = (r) => ({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h })
/** Move every label clear of the loads, the beams, the uprights and each other — in rank order (the elevations first);
 *  a dimension's label slides along its own line, then steps outward; a free label steps up or down; a chain label (or
 *  the sprinkler's note) that finds no room is dropped rather than drawn over something. In place. */
export function declutter(items) {
  const solids = items.filter(i => i.t === 'rect' && (i.tag === 'load' || i.tag === 'beam' || i.tag === 'upright'))
  const labels = items.filter(i => i.t === 'text').sort((a, b) => (a.pri ?? 2) - (b.pri ?? 2))
  const placed = [], drop = new Set()
  for (const l of labels) {
    const ok = () => { const b = labelBox(l); return !placed.some(p => hit(b, labelBox(p))) && !solids.some(r => !(l.tag === 'misfit' && r.level === l.level && r.tag === 'load') && hit(b, rectBox(r))) }
    if (ok()) { placed.push(l); continue }
    const x0 = l.x, y0 = l.y, step = l.size * 0.6
    let found = false
    // along its line, within its span
    if (l.span) for (let k = 1; k <= 12 && !found; k++) for (const d of [k, -k]) {
      const y = y0 + d * step
      if (l.rot === -90 ? (y - String(l.s).length * l.size * 0.28 < l.span[0] - l.size || y + String(l.s).length * l.size * 0.28 > l.span[1] + l.size) : (y < l.span[0] - l.size || y > l.span[1] + l.size)) continue
      l.y = y
      if (ok()) { found = true; break }
    }
    // then outward
    if (!found) { l.y = y0; for (let k = 1; k <= 4 && !found; k++) { l.x = x0 + (l.out || -1) * k * l.size * 1.1; if (ok()) found = true } }
    // a free label (no line of its own): up or down
    if (!found && !l.span) { l.x = x0; for (let k = 1; k <= 4 && !found; k++) for (const d of [-k, k]) { l.y = y0 + d * l.size * 0.95; if (ok()) { found = true; break } } }
    if (found) placed.push(l)
    else { l.x = x0; l.y = y0; if ((l.pri ?? 2) >= 3) drop.add(l); else placed.push(l) }
  }
  for (let n = items.length - 1; n >= 0; n--) if (drop.has(items[n])) items.splice(n, 1)
}

const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** One primitive as SVG markup. */
export function itemSVG(i) {
  if (i.t === 'rect') return `<rect x="${i.x}" y="${i.y}" width="${Math.max(0, i.w)}" height="${Math.max(0, i.h)}" fill="${i.fill || 'none'}"${i.stroke ? ` stroke="${i.stroke}" stroke-width="${i.sw || 1}"` : ''}${i.opacity != null ? ` opacity="${i.opacity}"` : ''}/>`
  if (i.t === 'line') return `<line x1="${i.x1}" y1="${i.y1}" x2="${i.x2}" y2="${i.y2}" stroke="${i.stroke}" stroke-width="${i.sw}"${i.dash ? ` stroke-dasharray="${i.dash}"` : ''}/>`
  if (i.t === 'polygon') return `<polygon points="${i.points.map(p => p.join(',')).join(' ')}" fill="${i.fill}"/>`
  if (i.t === 'circle') return `<circle cx="${i.cx}" cy="${i.cy}" r="${i.r}" fill="${i.fill}"${i.stroke ? ` stroke="${i.stroke}" stroke-width="${i.sw || 1}"` : ''}/>`
  if (i.t === 'poly') return `<polyline points="${i.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${i.stroke}" stroke-width="${i.sw}"/>`
  if (i.t === 'text') return `<text x="${i.x}" y="${i.y}" font-size="${i.size}" font-family="Arial, sans-serif" text-anchor="${i.anchor}" fill="${i.fill}"${i.halo ? ` stroke="#fff" stroke-width="${i.halo}" paint-order="stroke" stroke-linejoin="round"` : ''}${i.weight ? ` font-weight="${i.weight}"` : ''}${i.rot ? ` transform="rotate(${i.rot} ${i.x} ${i.y})"` : ''}>${esc(i.s)}</text>`
  return ''
}
/** The drawing as an SVG string, `w` × `h` px (or the units the caller wraps it in). */
export function toSVG(d, { width = d.w, height = d.h } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${d.w} ${d.h}">${d.items.map(itemSVG).join('')}</svg>`
}

/** The architectural scales, as on the sample ("SCALE: 1/4\"=1'"): paper inches per foot. */
export const ARCH_SCALES = [[3, '3"'], [1.5, '1-1/2"'], [1, '1"'], [0.75, '3/4"'], [0.5, '1/2"'], [0.375, '3/8"'], [0.25, '1/4"'], [0.1875, '3/16"'], [0.125, '1/8"'], [0.09375, '3/32"'], [0.0625, '1/16"'], [0.03125, '1/32"']]
/** The architectural scale for a drawing fitted at `mmPerIn` paper mm per real inch: the largest one at or under it, so
 *  it fits → { label: '1/4"=1\'', mmPerIn }. */
export function archScale(mmPerIn) {
  const pick = ARCH_SCALES.find(([pin]) => (pin * 25.4) / 12 <= mmPerIn + 1e-9) || ARCH_SCALES[ARCH_SCALES.length - 1]
  return { label: `${pick[1]}=1'`, mmPerIn: (pick[0] * 25.4) / 12 }
}

/* ── what the layout uses: lengths, depths, the building ─────────────────── */

/** Per type, the beam lengths its bays use in the layout: Map(typeId → [{ beamIn, bays, pair, depthIn, flueIn,
 *  palletWIn, parentId }]) most used first — what the editor's length picker lists and the PDF draws. */
export function lengthsByType(objects, table, typeIdAt) {
  const out = new Map()
  if (!table) return out
  for (const r of objects) {
    if (!r || !Array.isArray(r.beams) || (r.type !== 'rack_row' && r.type !== 'rack_double_row')) continue
    const sides = r.type === 'rack_double_row' ? 2 : 1
    for (let s = 0; s < sides; s++) r.beams.forEach((len, b) => {
      const id = typeIdAt(r, b, s, table)
      if (!out.has(id)) out.set(id, new Map())
      const m = out.get(id), e = m.get(len) || { beamIn: len, bays: 0, pair: false, depthIn: r.depthIn ?? 42, flueIn: r.flueSpaceIn ?? 9, palletWIn: r.palletWIn || 40, parentId: r.parentId ?? null }
      e.bays++
      if (r.type === 'rack_double_row') { e.pair = true; e.flueIn = r.flueSpaceIn ?? 9 }
      m.set(len, e)
    })
  }
  return new Map([...out].map(([id, m]) => [id, [...m.values()].sort((a, b) => b.bays - a.bays || a.beamIn - b.beamIn)]))
}
/** The building (floor plan) `parentId` names (else the layout's first), as the drawing reads it: { clearHeightIn, sprinklerIn } or null. */
export function buildingOf(objects, parentId) {
  // the racks' building; a type no bay carries yet: the layout's (first) building
  const isFp = (o) => typeof o.type === 'string' && o.type.startsWith('fp_')
  const fp = objects.find(o => o.id === parentId && isFp(o)) || objects.find(isFp)
  if (!fp) return null
  const c = Number.isFinite(fp.clearHeightFt) && fp.clearHeightFt > 0 ? fp.clearHeightFt * 12 : null
  const sp = Number.isFinite(fp.sprinklerFt) && fp.sprinklerFt > 0 ? fp.sprinklerFt * 12 : null
  return c || sp ? { clearHeightIn: c, sprinklerIn: sp } : null
}
