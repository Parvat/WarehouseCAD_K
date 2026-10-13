// elevationDrawing.js — the rack elevation drawing of one type at one beam length (Elevations v2 §D–F): ONE pure
// layout of primitives in pixel space, drawn by the editor pane (components/Elevations/ElevationPane.jsx — the same
// primitives made interactive by their `role`), the right panel's preview and the PDF (toSVG), so the three never
// differ.
//
// Drawn in the style of the reference rack elevation (docs: the sample sheet): dark-red dimensions with filled arrowheads
// and the text in a break of the line, red upright outlines, orange beams, blue load outlines on a pallet base, a sand
// floor strip, "RACK ELEVATIONS" and an architectural scale under it (the PDF). Weights stay off.
// Front view, one bay: the uprights, the beams (to the TOP of the beam, the face below), the loads on each level (as
// many as the beam length holds), the bay width across the top. Dimensions in feet-inches: beam elevations to the top
// of the beam on the right; the clear opening between beams inside the bay; the chain of load + clearance per level on
// the left; overall on the far left: top of the top load, top of the upright, and — when the building has them — its
// clear height, to the underside of the roof structure (the truss's bottom chord, drawn there), and the sprinkler head
// at its own height (above the bottom chord, within the truss, as a rule). Side view beside it: the frame depth (two frames and
// the flue for a back-to-back), the upright height, a simple diagonal bracing pattern. Weights stay off the drawing.

import { beamFace } from './elevations'
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

// the sample's palette: dimensions dark red, uprights red outlines, beams orange, loads blue outlines on a pallet base
const DIM = '#a3201b', UPRIGHT = '#c8372d', BEAM = '#f39c12', BEAM_EDGE = '#c97c06', LOAD = '#2e86de', BASE = '#d4e6f9', BRACE = '#7d8590', FLOOR = '#e7dcc3', FLOOR_EDGE = '#b8aa8a', TRUSS = '#4b5563', HEAD = '#27ae60'

/** The drawing of type `t` with `bayIn` beams, fitted into `box` ({ w, h } px): { w, h, scale (px per inch), items }.
 *  opts: palletWIn, depthIn (frame depth, the racks'), pair + flueIn (back-to-back side view), building ({ clearHeightIn,
 *  sprinklerIn } or null), fontPx, compact (no dimensions: the panel's preview), scale (a drawing scale asked for),
 *  draft overrides: { active: role key, removing: level index }. Items: { t: 'rect'|'line'|'text'|'poly'|'polygon',
 *  ..., role, tag } — role { kind: 'beam', k } | { kind: 'upright', x } | { kind: 'top' } | { kind: 'dim', id, k?, value }
 *  for the editor; tag names a part for tests ('load', 'chord', 'head'). */
export function elevationLayout(t, bayIn = 96, box = { w: 800, h: 500 }, opts = {}) {
  const { palletWIn = 40, depthIn = 42, pair = false, flueIn = 9, building = null, fontPx = 11, compact = false, active = null, removing = null, scale = null } = opts
  const face = beamFace(t), upW = 3, clearance = t.clearanceIn || 0
  const L = [...t.levels].map((l, k) => ({ ...l, k })).sort((a, b) => a.beamIn - b.beamIn)
  const top = L[L.length - 1]
  const topLoad = top.beamIn + (top.palletHeightIn || 0)
  const bClear = building?.clearHeightIn > 0 ? building.clearHeightIn : null
  const bSprink = building?.sprinklerIn > 0 ? building.sprinklerIn : null
  /* the roof truss: its bottom chord at the clear height (the underside of the roof structure), its top chord above
     both that and the sprinkler head */
  const TRUSS_IN = 22
  const trussTop = bClear ? Math.max(bClear + TRUSS_IN, (bSprink || 0) + 8) : null
  const H = Math.max(t.uprightHeightIn, topLoad + clearance, trussTop ? trussTop + 2 : 0, bSprink ? bSprink + 8 : 0)
  const frontW = bayIn + 2 * upW, sideW = pair ? 2 * depthIn + flueIn + 2 * upW : depthIn + upW
  const fp = fontPx
  // margins in px: the left holds the load chain and the overall dimensions; the right the beam elevations and the sprinkler
  const nOverall = 1 + (bClear ? 2 : 0)
  const mL = compact ? 6 : fp * (3.6 + nOverall * 2.3)
  const mR = compact ? 6 : fp * (bSprink ? 9.5 : 6.5)
  const gap = compact ? 18 : fp * 4.2
  const mT = compact ? 6 : fp * (bClear ? 1.2 : 3.2), mB = compact ? 6 : fp * 1.6
  const fit = Math.max(0.05, Math.min((box.w - mL - mR - gap - (compact ? 0 : fp * 2)) / (frontW + sideW), (box.h - mT - mB) / H))
  const s = scale && scale <= fit ? scale : fit           // a drawing scale asked for (the PDF's standard one), if it fits
  const items = []
  const X0 = mL, floor = mT + H * s, Y = (z) => floor - z * s, Xf = (x) => X0 + x * s
  const XS0 = X0 + frontW * s + mR + gap - (compact ? mR : 0), Xs = (x) => XS0 + x * s
  const sw = Math.max(0.7, fp / 12)
  const rect = (x, y, w, h, o = {}) => items.push({ t: 'rect', x, y, w, h, ...o })
  const line = (x1, y1, x2, y2, o = {}) => items.push({ t: 'line', x1, y1, x2, y2, stroke: o.stroke || DIM, sw: o.sw || sw, ...o })
  const text = (x, y, str, o = {}) => items.push({ t: 'text', x, y, s: str, size: o.size || fp, fill: o.fill || DIM, anchor: o.anchor || 'middle', halo: Math.max(1, fp * 0.28), ...o })
  const keyOf = (r) => (r ? r.kind + ':' + (r.k ?? r.id ?? '') : null)
  const isActive = (r) => active && keyOf(r) === active
  const tw = (str, size = fp) => String(str).length * size * 0.56            // a label's width, for the break in its line
  /* a filled arrowhead with its tip at (x, y), pointing (dx, dy) */
  const arrow = (x, y, dx, dy, c) => { const a = fp * 0.55, b = fp * 0.2; items.push({ t: 'polygon', points: [[x, y], [x - dx * a - dy * b, y - dy * a + dx * b], [x - dx * a + dy * b, y - dy * a - dx * b]], fill: c }) }

  /* a vertical dimension at x from z0 up to z1: extension lines from `from`, arrowheads, the text in a break of the line
     (beside it, the arrows outside, when the span is too short) */
  const dimV = (x, z0, z1, label, role, from = null) => {
    if (compact) return
    const y0 = Y(z0), y1 = Y(z1), hot = isActive(role), c = hot ? '#e74c3c' : DIM, w = hot ? sw * 1.8 : sw
    if (from != null) for (const y of [y0, y1]) line(from, y, x + (from < x ? fp * 0.4 : -fp * 0.4), y, { stroke: c, sw: sw * 0.7 })
    const len = Math.abs(y0 - y1), need = tw(label) + fp * 1.6
    if (len >= need) {
      const mid = (y0 + y1) / 2, half = tw(label) / 2 + fp * 0.35
      line(x, y0, x, mid + half, { stroke: c, sw: w }); line(x, mid - half, x, y1, { stroke: c, sw: w })
      arrow(x, y0, 0, 1, c); arrow(x, y1, 0, -1, c)
      text(x + fp * 0.35, mid, label, { rot: -90, fill: c, weight: hot ? 700 : 400, role })
    } else {
      line(x, y0, x, y1, { stroke: c, sw: w })
      line(x, y0, x, y0 + fp * 1.1, { stroke: c, sw: w }); line(x, y1, x, y1 - fp * 1.1, { stroke: c, sw: w })
      arrow(x, y0, 0, -1, c); arrow(x, y1, 0, 1, c)
      text(x - fp * 0.4, (y0 + y1) / 2 + fp * 0.35, label, { anchor: 'end', fill: c, weight: hot ? 700 : 400, role })
    }
  }
  const dimH = (y, x0, x1, label, role = null) => {
    if (compact) return
    for (const x of [x0, x1]) line(x, y - fp * 0.5, x, y + fp * 0.5, { sw: sw * 0.7 })
    const len = x1 - x0, need = tw(label) + fp * 1.6
    if (len >= need) {
      const mid = (x0 + x1) / 2, half = tw(label) / 2 + fp * 0.4
      line(x0, y, mid - half, y); line(mid + half, y, x1, y)
      arrow(x0, y, -1, 0, DIM); arrow(x1, y, 1, 0, DIM)
      text(mid, y + fp * 0.35, label, { role })
    } else {
      line(x0 - fp * 1.2, y, x1 + fp * 1.2, y)
      arrow(x0, y, 1, 0, DIM); arrow(x1, y, -1, 0, DIM)
      text((x0 + x1) / 2, y - fp * 0.45, label, { role })
    }
  }

  // ── the floor, under both views
  const xFloor0 = X0 - (compact ? 0 : fp * 2.2), xFloor1 = compact ? Xs(sideW) + 4 : Xs(sideW) + fp * 2
  rect(xFloor0, floor, xFloor1 - xFloor0, Math.max(3, fp * 0.8), { fill: FLOOR, stroke: FLOOR_EDGE, sw: sw * 0.6 })

  // ── the roof truss over the front view: double-line chords, Warren diagonals
  const xSpr = Xf(frontW) + fp * 7.6
  if (bClear) {
    const tx0 = X0 - (compact ? 0 : fp * 1.5), tx1 = compact ? Xf(frontW) + 6 : (bSprink ? xSpr : Xf(frontW)) + fp * 2.5
    const c = Math.max(2, 3 * s), yb = Y(bClear), yt = Y(trussTop)
    rect(tx0, yb - c, tx1 - tx0, c, { fill: '#fff', stroke: TRUSS, sw: sw * 0.9, tag: 'chord', chordAt: bClear })
    rect(tx0, yt, tx1 - tx0, c, { fill: '#fff', stroke: TRUSS, sw: sw * 0.9, tag: 'chord', chordAt: trussTop })
    const d = yb - c - (yt + c), n = Math.max(2, Math.round((tx1 - tx0) / (d * 1.15)))
    const pts = []; for (let i = 0; i <= n; i++) pts.push([tx0 + (tx1 - tx0) * i / n, i % 2 ? yb - c : yt + c])
    items.push({ t: 'poly', points: pts, stroke: TRUSS, sw: sw * 1.1 })
  }

  // ── front view
  for (const x of [0, frontW - upW]) {
    rect(Xf(x), Y(t.uprightHeightIn), Math.max(2, upW * s), t.uprightHeightIn * s, { fill: '#fff', stroke: UPRIGHT, sw: sw, role: { kind: 'upright', x } })
    if (!compact) rect(Xf(x) - 2, Y(t.uprightHeightIn) - 3, Math.max(2, upW * s) + 4, 6, { fill: isActive({ kind: 'top' }) ? '#e74c3c' : 'transparent', role: { kind: 'top' }, cursor: 'ns-resize' })
  }
  const per = Math.max(0, positionsPerBeam(bayIn, palletWIn))
  const gapIn = per ? (bayIn - per * palletWIn) / (per + 1) : 0
  for (const lv of L) {
    const z = lv.beamIn, gone = removing === lv.k
    if (z > 0) rect(Xf(-1.5), Y(z), (frontW + 3) * s, Math.max(1.5, face * s), { fill: gone ? '#e74c3c' : isActive({ kind: 'beam', k: lv.k }) ? '#d35400' : BEAM, stroke: BEAM_EDGE, sw: sw * 0.6, opacity: gone ? 0.5 : 1, role: { kind: 'beam', k: lv.k }, cursor: 'ns-resize' })
    const ph = lv.palletHeightIn || 0, base = Math.min(6, ph * 0.12)
    for (let p = 0; p < per; p++) {
      const x = upW + gapIn + p * (palletWIn + gapIn)
      rect(Xf(x), Y(z + ph), palletWIn * s, ph * s, { fill: '#fff', stroke: LOAD, sw: sw, opacity: gone ? 0.35 : 1, tag: 'load' })
      rect(Xf(x), Y(z + base), palletWIn * s, base * s, { fill: BASE, stroke: LOAD, sw: sw * 0.8, opacity: gone ? 0.35 : 1 })
    }
  }
  if (!compact) {
    // the bay width across the top, over the top load
    dimH(Y(Math.max(topLoad, t.uprightHeightIn)) - fp * 1.3, Xf(upW), Xf(upW + bayIn), ftInDash(bayIn))
    // right: each beam's elevation to its top, on a leader off the beam's end
    for (const lv of L) if (lv.beamIn > 0) {
      const y = Y(lv.beamIn), role = { kind: 'dim', id: 'elev', k: lv.k, value: lv.beamIn }, hot = isActive(role) || isActive({ kind: 'beam', k: lv.k })
      line(Xf(frontW + 1.5), y, Xf(frontW) + fp * 1.6, y, { stroke: hot ? '#e74c3c' : DIM, sw: hot ? sw * 1.6 : sw })
      text(Xf(frontW) + fp * 1.9, y + fp * 0.36, ftInDash(lv.beamIn), { anchor: 'start', fill: hot ? '#e74c3c' : DIM, weight: hot ? 700 : 400, role })
    }
    // inside the bay, by the right upright: the clear opening from the top of each beam (the floor) to the underside of the next
    L.forEach((lv, i) => {
      if (i + 1 >= L.length) return
      const z0 = lv.beamIn, z1 = L[i + 1].beamIn - face
      dimV(Xf(frontW - upW) - fp * 1.0, z0, z1, ftInDash(z1 - z0), { kind: 'dim', id: 'open', k: L[i + 1].k, value: z1 - z0 })
    })
    // the beam face, at the lowest beam
    const low = L.find(l => l.beamIn > 0)
    if (low) dimV(Xf(frontW - upW) - fp * 2.6, low.beamIn - face, low.beamIn, ftInDash(face), { kind: 'dim', id: 'face', value: face })
    // left: the chain of load + clearance per level (the top level: its load)
    L.forEach((lv, i) => {
      const h = (lv.palletHeightIn || 0) + (i + 1 < L.length ? clearance : 0)
      dimV(X0 - fp * 1.4, lv.beamIn, lv.beamIn + h, ftInDash(h), { kind: 'dim', id: 'chain', k: lv.k, value: h }, X0 - fp * 0.4)
    })
    // far left, overall: the top of the top load, the clear height (the underside of the roof structure), the top of the truss
    const ov = [[topLoad, 'topload']]
    if (bClear) ov.push([bClear, 'clear'], [trussTop, 'truss'])
    ov.sort((a, b) => a[0] - b[0]).forEach(([z, id], i) => dimV(X0 - fp * (3.7 + i * 2.3), 0, z, ftInDash(z), { kind: 'info', id }, X0 - fp * 2.6))
    // the sprinkler head: dimensioned from the floor on the right, the head drawn, labelled with a leader
    if (bSprink) {
      dimV(xSpr, 0, bSprink, ftInDash(bSprink), { kind: 'info', id: 'sprinkler' }, null)
      items.push({ t: 'circle', cx: xSpr, cy: Y(bSprink) - fp * 0.35, r: fp * 0.32, fill: HEAD, stroke: '#1e8449', sw: sw * 0.6, tag: 'head' })
      line(xSpr - fp * 1.2, Y(bSprink), xSpr + fp * 0.6, Y(bSprink), { sw: sw * 0.8 })
      const ly = (trussTop ? Y(trussTop) : Y(bSprink) - fp * 3) - fp * 0.6, lx = xSpr - fp * 6
      text(lx, ly, 'Sprinkler head', { anchor: 'end' })
      items.push({ t: 'poly', points: [[lx + fp * 0.2, ly - fp * 0.3], [xSpr - fp * 0.8, ly - fp * 0.3], [xSpr - fp * 0.1, Y(bSprink) - fp * 0.8]], stroke: DIM, sw: sw * 0.8 })
    }
  }

  // ── side view: the frames (two and the flue for a back-to-back), horizontals and diagonals, the flue spacers
  const frames = pair ? [0, depthIn + flueIn + upW] : [0]
  const hTop = t.uprightHeightIn
  for (const f0 of frames) {
    for (const x of [f0, f0 + depthIn]) rect(Xs(x), Y(hTop), Math.max(2, upW * s), hTop * s, { fill: '#fff', stroke: UPRIGHT, sw })
    const n = Math.max(3, Math.round((hTop - 6) / 28)), step = (hTop - 6) / n
    for (let i = 0; i <= n; i++) line(Xs(f0 + upW), Y(6 + i * step), Xs(f0 + depthIn), Y(6 + i * step), { stroke: BRACE, sw: sw * 0.9 })
    // diagonals in every other panel, alternating, as on a welded frame
    for (let i = 1; i < n; i += 2) {
      const a = Y(6 + i * step), b = Y(6 + (i + 1) * step), lr = ((i - 1) / 2) % 2 === 0
      line(Xs(lr ? f0 + upW : f0 + depthIn), a, Xs(lr ? f0 + depthIn : f0 + upW), b, { stroke: BRACE, sw: sw * 0.9 })
    }
  }
  if (pair) for (const z of [hTop / 3, (2 * hTop) / 3]) { const y = Y(z); line(Xs(depthIn + upW), y - 1.5, Xs(depthIn + upW + flueIn), y - 1.5, { stroke: BRACE, sw: sw * 1.4 }); line(Xs(depthIn + upW), y + 1.5, Xs(depthIn + upW + flueIn), y + 1.5, { stroke: BRACE, sw: sw * 1.4 }) }
  if (!compact) {
    const yt = Y(hTop) - fp * 1.3
    dimH(yt, Xs(0), Xs(depthIn + upW), ftInDash(depthIn))
    if (pair) { dimH(yt - fp * 1.6, Xs(depthIn + upW), Xs(depthIn + upW + flueIn), ftInDash(flueIn)); dimH(yt, Xs(depthIn + flueIn + upW), Xs(sideW), ftInDash(depthIn)) }
    dimV(Xs(0) - fp * 1.5, 0, hTop, ftInDash(hTop), { kind: 'dim', id: 'upright', value: hTop }, Xs(0) - fp * 0.4)
  }
  const w = compact ? Xs(sideW) + 6 : Xs(sideW) + fp * 2.5
  return { w, h: floor + mB + (compact ? 0 : fp * 0.9), scale: s, items, floor, Y, Xf, upW, frontW, bayIn }
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
