// elevationDrawing.js — the rack elevation drawing of one type at one beam length (Elevations v2 §D–F): ONE pure
// layout of primitives in pixel space, drawn by the editor pane (components/Elevations/ElevationPane.jsx — the same
// primitives made interactive by their `role`), the right panel's preview and the PDF (toSVG), so the three never
// differ.
//
// Front view, one bay: the uprights, the beams (to the TOP of the beam, the face below), the pallets on each level (as
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

const INK = '#1d2433', DIM = '#2b3a55', UPRIGHT = '#2f5d8a', BEAM = '#e07a1f', PALLET = '#f3e2c3', PALLET_EDGE = '#8a6a3a'

/** The drawing of type `t` with `bayIn` beams, fitted into `box` ({ w, h } px): { w, h, scale (px per inch), items }.
 *  opts: palletWIn, depthIn (frame depth, the racks'), pair + flueIn (back-to-back side view), building ({ clearHeightIn,
 *  sprinklerIn } or null), fontPx, compact (no dimensions: the panel's preview), draft overrides: { active: role key,
 *  removing: level index }. Items: { t: 'rect'|'line'|'text'|'poly', ..., role } — role { kind: 'beam', k } |
 *  { kind: 'upright', x } | { kind: 'top' } | { kind: 'dim', id, value } for the editor. */
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
  const H = Math.max(t.uprightHeightIn, topLoad + clearance, trussTop ? trussTop + 4 : 0, bSprink ? bSprink + 8 : 0)
  const frontW = bayIn + 2 * upW, sideW = pair ? 2 * depthIn + flueIn + 2 * upW : depthIn + upW
  // margins in px (dimensions need room; the preview needs none)
  const fp = fontPx
  const mL = compact ? 6 : fp * 13, mR = compact ? 6 : fp * (10 + Math.min(4, L.length) * 1.6), mT = compact ? 6 : fp * 4, mB = compact ? 6 : fp * 4.5, gap = compact ? 18 : fp * 9
  const fit = Math.max(0.05, Math.min((box.w - mL - mR - gap - (compact ? 0 : fp * (bClear || bSprink ? 16 : 7))) / (frontW + sideW), (box.h - mT - mB) / H))
  const s = scale && scale <= fit ? scale : fit           // a drawing scale asked for (the PDF's standard one), if it fits
  const items = []
  const X0 = mL, floor = mT + H * s, Y = (z) => floor - z * s, Xf = (x) => X0 + x * s
  const XS0 = X0 + frontW * s + mR + gap * 0.3 - (compact ? mR : 0), Xs = (x) => XS0 + x * s
  const sw = Math.max(0.8, fp / 11)
  const rect = (x, y, w, h, o = {}) => items.push({ t: 'rect', x, y, w, h, ...o })
  const line = (x1, y1, x2, y2, o = {}) => items.push({ t: 'line', x1, y1, x2, y2, stroke: o.stroke || INK, sw: o.sw || sw, ...o })
  const text = (x, y, str, o = {}) => items.push({ t: 'text', x, y, s: str, size: o.size || fp, fill: o.fill || DIM, anchor: o.anchor || 'middle', ...o })
  const keyOf = (r) => (r ? r.kind + ':' + (r.k ?? r.id ?? '') : null)
  const isActive = (r) => active && keyOf(r) === active

  /* a vertical dimension at x from z0 up to z1: extension lines from `from` (x of the object edge), ticks, the text */
  const dimV = (x, z0, z1, label, role, from = null, textSide = -1) => {
    if (compact) return
    const y0 = Y(z0), y1 = Y(z1), hot = isActive(role)
    const c = hot ? '#d0392b' : DIM, w = hot ? sw * 1.8 : sw
    if (from != null) for (const y of [y0, y1]) line(from, y, x + (from < x ? 4 : -4), y, { stroke: '#9aa3b5', sw: sw * 0.7 })
    line(x, y0, x, y1, { stroke: c, sw: w })
    for (const y of [y0, y1]) line(x - 3.5, y + 3.5, x + 3.5, y - 3.5, { stroke: c, sw: w })
    const ty = (y0 + y1) / 2, tx = x + textSide * (fp * 0.55)
    if (Math.abs(y0 - y1) > fp * 2.2) text(tx, ty, label, { rot: -90, fill: c, weight: hot ? 700 : 400, role })
    else text(x + textSide * fp * 0.5, ty + fp * 0.35, label, { anchor: textSide < 0 ? 'end' : 'start', fill: c, weight: hot ? 700 : 400, role })
  }
  const dimH = (y, x0, x1, label, role = null) => {
    if (compact) return
    line(x0, y, x1, y, { stroke: DIM })
    for (const x of [x0, x1]) { line(x - 3.5, y + 3.5, x + 3.5, y - 3.5, { stroke: DIM }); line(x, y - 6, x, y + 6, { stroke: '#9aa3b5', sw: sw * 0.7 }) }
    text((x0 + x1) / 2, y - fp * 0.45, label, { role })
  }

  // ── the building: the roof truss (bottom chord at the clear height) and the sprinkler line, across both views
  const xEnd = compact ? Xs(sideW) : Xs(sideW) + fp * 2
  if (bClear) {
    const y = Y(bClear), d = (trussTop - bClear) * s, x0 = X0 - (compact ? 0 : fp * 3)
    line(x0, y, xEnd, y, { stroke: '#6b7280', sw: sw * 1.2 })
    line(x0, y - d, xEnd, y - d, { stroke: '#6b7280', sw: sw * 1.2 })
    const n = Math.max(2, Math.round((xEnd - x0) / (d * 1.6)))
    const pts = []; for (let i = 0; i <= n; i++) pts.push([x0 + (xEnd - x0) * i / n, i % 2 ? y - d : y])
    items.push({ t: 'poly', points: pts, stroke: '#6b7280', sw: sw * 0.9 })
  }
  if (bSprink) {
    const y = Y(bSprink)
    line(X0 - (compact ? 0 : fp * 3), y, xEnd, y, { stroke: '#c0392b', sw: sw * 0.9, dash: `${fp * 0.6} ${fp * 0.4}` })
  }
  /* the building's labels beyond the side view, each at its own height, nudged apart so none overlaps */
  if (!compact && (bClear || bSprink)) {
    const labels = []
    if (bClear) { labels.push({ y: Y((bClear + trussTop) / 2), s: 'ROOF TRUSS', fill: '#6b7280' }); labels.push({ y: Y(bClear), s: 'U/S OF BOTTOM CHORD', fill: '#6b7280' }) }
    if (bSprink) labels.push({ y: Y(bSprink), s: 'SPRINKLER HEAD', fill: '#c0392b' })
    labels.sort((a, b) => a.y - b.y)
    let last = -Infinity
    for (const l of labels) { const y = Math.max(l.y, last + fp * 1.1); last = y; text(xEnd + fp * 0.6, y + fp * 0.3, l.s, { anchor: 'start', size: fp * 0.8, fill: l.fill }) }
  }
  // floor
  line(X0 - (compact ? 0 : fp * 3), floor, xEnd, floor, { stroke: INK, sw: sw * 1.6 })

  // ── front view
  for (const x of [0, frontW - upW]) {
    rect(Xf(x), Y(t.uprightHeightIn), upW * s, t.uprightHeightIn * s, { fill: UPRIGHT, role: { kind: 'upright', x } })
    if (!compact) rect(Xf(x) - 2, Y(t.uprightHeightIn) - 3, upW * s + 4, 6, { fill: isActive({ kind: 'top' }) ? '#d0392b' : '#183a5c', role: { kind: 'top' }, cursor: 'ns-resize' })
  }
  const per = Math.max(0, positionsPerBeam(bayIn, palletWIn))
  const gapIn = per ? (bayIn - per * palletWIn) / (per + 1) : 0
  for (const lv of L) {
    const z = lv.beamIn, gone = removing === lv.k
    if (z > 0) rect(Xf(upW) - (gone ? 0 : 0), Y(z), bayIn * s, face * s, { fill: gone ? '#d0392b' : isActive({ kind: 'beam', k: lv.k }) ? '#b4561a' : BEAM, opacity: gone ? 0.5 : 1, role: { kind: 'beam', k: lv.k }, cursor: 'ns-resize' })
    for (let p = 0; p < per; p++) {
      const x = upW + gapIn + p * (palletWIn + gapIn)
      rect(Xf(x), Y(z + (lv.palletHeightIn || 0)), palletWIn * s, (lv.palletHeightIn || 0) * s, { fill: PALLET, stroke: PALLET_EDGE, sw: sw * 0.8, opacity: gone ? 0.35 : 1 })
    }
  }
  // the bay width across the top
  dimH(Y(t.uprightHeightIn) - fp * 1.8, Xf(upW), Xf(upW + bayIn), ftInDash(bayIn))
  if (!compact) {
    // right: beam elevations to the top of the beam, each its own line, from the floor
    const beams = L.filter(l => l.beamIn > 0)
    beams.forEach((lv, i) => dimV(Xf(frontW) + fp * (3.4 + i * 1.6), 0, lv.beamIn, ftInDash(lv.beamIn), { kind: 'dim', id: 'elev', k: lv.k, value: lv.beamIn }, Xf(frontW), +1))
    // just outside the bay, by the right upright: the clear opening from the top of each beam (the floor) to the underside of the next
    L.forEach((lv, i) => {
      if (i + 1 >= L.length) return
      const z0 = lv.beamIn, z1 = L[i + 1].beamIn - face
      dimV(Xf(frontW) + fp * 1.3, z0, z1, ftInDash(z1 - z0), { kind: 'dim', id: 'open', k: L[i + 1].k, value: z1 - z0 }, null, +1)
    })
    // left: the chain of load + clearance per level (the top level: its load)
    L.forEach((lv, i) => {
      const h = (lv.palletHeightIn || 0) + (i + 1 < L.length ? clearance : 0)
      dimV(X0 - fp * 1.6, lv.beamIn, lv.beamIn + h, ftInDash(h), { kind: 'dim', id: 'chain', k: lv.k, value: h }, Xf(0), -1)
    })
    // far left: overall
    const ov = [[topLoad, 'topload', 'TOP OF LOAD'], [t.uprightHeightIn, 'upright', 'TOP OF UPRIGHT']]
    if (bSprink) ov.push([bSprink, 'sprinkler', 'SPRINKLER'])
    if (bClear) ov.push([bClear, 'clear', 'CLEAR HEIGHT'])
    ov.sort((a, b) => a[0] - b[0]).forEach(([z, id], i) => dimV(X0 - fp * (4.4 + i * 2.1), 0, z, ftInDash(z), id === 'upright' ? { kind: 'dim', id: 'upright', value: z } : { kind: 'info', id }, Xf(0), -1))
    text(Xf(frontW / 2), floor + fp * 1.6, 'FRONT VIEW', { size: fp * 0.85, fill: '#6b7280' })
  }

  // ── side view: frame depth (two frames + the flue for a back-to-back), the upright height, bracing
  const frames = pair ? [0, depthIn + flueIn + upW] : [0]
  for (const f0 of frames) {
    for (const x of [f0, f0 + depthIn]) rect(Xs(x), Y(t.uprightHeightIn), upW * s, t.uprightHeightIn * s, { fill: UPRIGHT })
    const n = Math.max(2, Math.round(t.uprightHeightIn / 48)), step = (t.uprightHeightIn - 6) / n
    const pts = []
    for (let i = 0; i <= n; i++) pts.push([Xs(i % 2 ? f0 + depthIn : f0 + upW), Y(6 + i * step)])
    items.push({ t: 'poly', points: pts, stroke: '#5b7da3', sw: sw * 0.9 })
    line(Xs(f0 + upW), Y(6), Xs(f0 + depthIn), Y(6), { stroke: '#5b7da3', sw: sw * 0.9 })
    line(Xs(f0 + upW), Y(t.uprightHeightIn - 2), Xs(f0 + depthIn), Y(t.uprightHeightIn - 2), { stroke: '#5b7da3', sw: sw * 0.9 })
    for (const lv of L) if (lv.beamIn > 0) for (const x of [f0 - 1.5, f0 + depthIn + upW - 1.5]) rect(Xs(x), Y(lv.beamIn), 3 * s, face * s, { fill: BEAM })
  }
  if (!compact) {
    const yb = floor + fp * 1.4
    dimH(yb, Xs(0), Xs(depthIn + upW), ftInDash(depthIn))
    if (pair) { dimH(yb, Xs(depthIn + upW), Xs(depthIn + upW + flueIn), ftInDash(flueIn)); dimH(yb, Xs(depthIn + flueIn + upW), Xs(sideW), ftInDash(depthIn)) }
    dimV(Xs(sideW) + fp * 1.4, 0, t.uprightHeightIn, ftInDash(t.uprightHeightIn), { kind: 'dim', id: 'upright', value: t.uprightHeightIn }, Xs(sideW), +1)
    text(Xs(sideW / 2), floor + fp * 3.1, pair ? 'SIDE VIEW — BACK TO BACK' : 'SIDE VIEW', { size: fp * 0.85, fill: '#6b7280' })
  }
  const w = compact ? Xs(sideW) + 6 : Xs(sideW) + fp * (bClear || bSprink ? 14 : 4)
  return { w, h: floor + mB, scale: s, items, floor, Y, Xf, upW, frontW, bayIn }
}

const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** One primitive as SVG markup. */
export function itemSVG(i) {
  if (i.t === 'rect') return `<rect x="${i.x}" y="${i.y}" width="${Math.max(0, i.w)}" height="${Math.max(0, i.h)}" fill="${i.fill || 'none'}"${i.stroke ? ` stroke="${i.stroke}" stroke-width="${i.sw || 1}"` : ''}${i.opacity != null ? ` opacity="${i.opacity}"` : ''}/>`
  if (i.t === 'line') return `<line x1="${i.x1}" y1="${i.y1}" x2="${i.x2}" y2="${i.y2}" stroke="${i.stroke}" stroke-width="${i.sw}"${i.dash ? ` stroke-dasharray="${i.dash}"` : ''}/>`
  if (i.t === 'poly') return `<polyline points="${i.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${i.stroke}" stroke-width="${i.sw}"/>`
  if (i.t === 'text') return `<text x="${i.x}" y="${i.y}" font-size="${i.size}" font-family="Arial, sans-serif" text-anchor="${i.anchor}" fill="${i.fill}"${i.weight ? ` font-weight="${i.weight}"` : ''}${i.rot ? ` transform="rotate(${i.rot} ${i.x} ${i.y})"` : ''}>${esc(i.s)}</text>`
  return ''
}
/** The drawing as an SVG string, `w` × `h` px (or the units the caller wraps it in). */
export function toSVG(d, { width = d.w, height = d.h } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${d.w} ${d.h}">${d.items.map(itemSVG).join('')}</svg>`
}

/** The standard drawing scale (1:n) for `s` mm per inch: the next standard one at or under it, so the drawing fits. */
export const STANDARD_SCALES = [10, 12, 16, 20, 24, 25, 30, 32, 40, 48, 50, 60, 64, 75, 96, 100, 120, 150, 200, 250, 300]
export const standardScale = (mmPerIn) => STANDARD_SCALES.find(n => 25.4 / n <= mmPerIn + 1e-9) || STANDARD_SCALES[STANDARD_SCALES.length - 1]

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
