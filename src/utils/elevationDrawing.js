// elevationDrawing.js — the rack elevation drawing of one type at one beam length (Elevations v2 §D–F): ONE pure
// layout of primitives in pixel space, drawn by the editor (components/Elevations/ElevationDrawing.jsx — the same
// primitives made interactive by their `role`) and the PDF (toSVG), so the two never differ.
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

import { beamFace, topLoadIssue, topOfLoad, SPRINKLER_CLEARANCE_IN, ceilingOf, frameDepthNote } from './elevations'
import { positionsPerBeam } from './palletFit'

/** 6'-2" / 26'-0" / 8" — feet and inches as on a rack drawing: a length of a foot or more always with its inches,
 *  under a foot in inches. */
export function ftInDash(inches) {
  const v = Math.round(inches)
  const f = Math.floor(Math.abs(v) / 12), i = Math.abs(v) - f * 12, sign = v < 0 ? '-' : ''
  if (!f) return `${sign}${i}"`
  return `${sign}${f}'-${i}"`
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

// the reference sheet's visual language: JetBrains Mono (the app's mono), dark green frames and beams, kraft loads on a deck board, an
// ink ground line with grey hatching, a dashed clear-height line over a yellow clearance band; dimensions blue,
// clearances red, tags grey
const FONT = "'JetBrains Mono', monospace"
const AMBER = '#B5730F'   // warnings on the drawing (THEME.md's warning)
/* Studio (STUDIO.md §2 drawing palette, §3 drawing type, §7 the panel's labels; design/studio/Studio.dc.html panel
   "elev"): the right card's sheet. Plus Jakarta Sans for words and numbers alike, numbers 600 in the dimension blue. */
const S_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const S = { up: '#14392B', ink: '#1F2321', blue: '#1B4FD8', words: '#767C74', ceil: '#41483F', maxLine: '#C99A1E', maxText: '#8A6D14', maxNote: '#A89060', band: '#F2C230', hatch: '#C3BEB1', tag: '#8A7A55', red: '#C0452A' }
/** 30'-0" → 30′-0″ (the Studio drawing's primes) */
const prime = (str) => String(str).replace(/'/g, '′').replace(/"/g, '″')
const INK = '#15181C', PINE = '#123A2E', LOAD = '#E8DCC2', LOAD_EDGE = '#B08F52', DECK = '#C9A870', BLUE = '#1B4FD8', RED = '#A8341C', GREY = '#7A828C', HATCH = '#B6BAB3', BAND = '#F2C230', MISFIT = '#F5E7E3', MISFIT_EDGE = '#A8341C'

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
 *  (px per inch), items, bottom }. In the reference sheet's style. opts: palletWIn, depthIn (frame depth, the racks'),
 *  pair + flueIn (back-to-back side view), building ({ clearHeightIn, sprinklerIn } or null), sprinklerClearanceIn,
 *  fontPx (the base label size), detail ('simple': level tags, frame height, the beam with its pallets, the clear-height
 *  line and clearance band, pitch and the pallets' side clearance; 'detailed': those plus each beam's elevation to its top
 *  and per level the pallet height and the ACTUAL gap to the underside of the beam above, red under the clearance, and
 *  that beam's face), compact (the panel's preview: no labels), stacked (the side view under the front view), scale, bg
 *  (the colour behind the labels' halo: the panel's), frame / ink (the frames' and beams' colour, the ground's and base
 *  plates'), view ('both' — the PDF's figure —, 'front' or 'side': one view, fitted alone; the Elevation workspace's
 *  Front | Side switch), blue / red (the dimensions', the clearances') — the editor passes theme tokens so a dark panel keeps them
 *  readable; the PDF the reference's own colours — draft overrides { active, removing }. Items: { t: 'rect'|'line'|
 *  'text'|'poly'|'polygon'|'path', ..., role, tag } — role { kind: 'beam', k } | { kind: 'upright', x } | { kind: 'top' } |
 *  { kind: 'dim', id, k?, value } for the editor. No label overlaps a load, a beam or another label (declutter). */
export function elevationLayout(t, bayIn = 96, box = { w: 800, h: 500 }, opts = {}) {
  const { palletWIn = 40, palletDIn = null, depthIn = 42, pair = false, flueIn = 9, building = null, fontPx = 11, compact = false, stacked = false, active = null, removing = null, scale = null, sprinklerClearanceIn = SPRINKLER_CLEARANCE_IN, detail = 'simple', bg = '#fff', frame = PINE, ink = INK, blue = BLUE, red = RED, view = 'both', zoom = 1, pan = null } = opts
  const showFront = view !== 'side', showSide = view !== 'front'
  const detailed = detail === 'detailed'
  // 'studio': the right card's sheet — the label set of STUDIO.md §7, nothing else (no pitch, no chain, no bracing)
  const studio = detail === 'studio', u = fontPx / 9.4
  const face = beamFace(t), upW = 3, clearance = t.clearanceIn || 0
  const L = [...t.levels].map((l, k) => ({ ...l, k })).sort((a, b) => a.beamIn - b.beamIn)
  const top = L[L.length - 1]
  const misfit = misfitLevels(t)
  // an assumed clear height (none set) is drawn, never checked: no ABOVE CLEAR HEIGHT / sprinkler flag against it
  const topIssue = building?.assumed ? null : topLoadIssue(t, building, sprinklerClearanceIn)
  const loadH = (lv, i) => { const ph = lv.palletHeightIn || 0, next = i + 1 < L.length ? L[i + 1].beamIn - face : Infinity; return Math.max(0, Math.min(ph, next - lv.beamIn - 0.5)) }
  const topLoad = top.beamIn + loadH(top, L.length - 1)
  const bClear = building?.clearHeightIn > 0 ? building.clearHeightIn : null
  const bSprink = building?.sprinklerIn > 0 ? building.sprinklerIn : null
  const hTop = t.uprightHeightIn
  /* Studio: ONE ceiling for every label and line on the sheet — the one shown (the elevation's clear height; with only
     a sprinkler height, that) — and the max load height is it less the sprinkler clearance. The drawing stops at it: no
     room above (the sheet is anchored at its top, a fixed margin over the ceiling's label). */
  const ceilS = bClear || bSprink || null
  const H = studio ? Math.max(hTop, topLoad + clearance, ceilS || 0) : Math.max(hTop, topLoad + clearance, bClear || 0, bSprink || 0) + 6
  const frontW = bayIn + 2 * upW, sideW = pair ? 2 * depthIn + flueIn + 2 * upW : depthIn + upW
  const fO = fontPx, fT = Math.max(8, fontPx * 0.85), fE = fontPx * 1.05
  const tw = (str, size) => String(str).length * size * 0.6
  // a uniform level spacing gives the pitch
  const steps = L.slice(1).map((l, i) => l.beamIn - L[i].beamIn), pitch = steps.length && steps.every(x => Math.abs(x - steps[0]) < 1e-6) ? steps[0] : null
  const longestElev = detailed ? Math.max(0, ...L.filter(l => l.beamIn > 0).map(l => tw(ftInDash(l.beamIn), fE))) : 0
  // the columns, px from the frames
  const cTag = fO * 0.8, cElev = cTag + fT * 2.4, cPitch = (detailed ? cElev + longestElev + fO * 0.8 : cTag + fT * 2.6) + fO * 0.6
  const cChain = fO * 1.4, cFrame = detailed ? cChain + fO * 3.4 : fO * 1.8
  const mL = compact ? 6 : studio ? 80 * u : cFrame + fO * 1.6, mR = compact ? 6 : studio ? 70 * u : Math.max(cPitch + fO * 1.6, tw('0.0" CLR', fT) + cTag + fO)
  // the pallet deeper than these frames allow: an amber note under the drawing (a warning), a line of its own below the
  // beam label (Studio: the editor's warning box says it, with its action — never on the sheet)
  const deepNote = !compact && !studio && frameDepthNote(palletDIn, depthIn)
  const mT = compact ? 6 : studio ? 20 * u : fO * (bClear || bSprink ? 2.0 : 1.2), mB = compact ? 6 : studio ? 58 * u : fO * (deepNote ? 6 : 4.4)
  const sideL = compact ? 6 : fO * 3.2, sideR = compact ? 6 : fO * 1.2, sideT = compact ? 6 : fO * (pair ? 4.4 : 2.8)
  const gap = compact ? 14 : fO * 2.4
  let fit
  if (view === 'front') fit = Math.min((box.w - mL - mR) / frontW, (box.h - mT - mB) / H)
  else if (view === 'side') fit = Math.min((box.w - sideL - sideR) / sideW, (box.h - Math.max(sideT, mT) - mB) / H)
  else if (stacked) fit = Math.min((box.w - mL - mR) / frontW, (box.w - sideL - sideR) / sideW, (box.h - mT - mB - gap - sideT - mB) / (H + H))
  else fit = Math.min((box.w - mL - mR - gap - sideL - sideR) / (frontW + sideW), (box.h - mT - mB) / H, (box.h - sideT - mB) / H)
  fit = Math.max(0.05, fit)
  // zoom: the fitted scale times it (labels stay their screen size: they are laid out in screen px); pan: the
  // content moved by it (px) — the Elevations tab's wheel / pinch and drag
  const zoomed = zoom !== 1 || !!(pan && (pan.x || pan.y))
  const s = scale && scale <= fit ? scale : fit * zoom
  const frontBoxW = mL + frontW * s + mR, frontBoxH = mT + H * s + mB
  const sideBoxW = sideL + sideW * s + sideR, sideBoxH = Math.max(sideT, mT) + H * s + mB
  const cw = view === 'front' ? frontBoxW : view === 'side' ? sideBoxW : stacked ? Math.max(frontBoxW, sideBoxW) : frontBoxW + gap + sideBoxW
  const ch = view === 'front' ? frontBoxH : view === 'side' ? sideBoxH : stacked ? frontBoxH + gap + sideBoxH : Math.max(frontBoxH, sideBoxH)
  const ox = zoomed ? (box.w - cw) / 2 + (pan?.x || 0) : Math.max(0, (box.w - cw) / 2), oy = zoomed ? (box.h - ch) / 2 + (pan?.y || 0) : studio ? 0 : Math.max(0, (box.h - ch) / 2)
  const X0 = ox + (stacked ? (cw - frontBoxW) / 2 : 0) + mL, floor = oy + mT + H * s
  const Y = (z) => floor - z * s, Xf = (x) => X0 + x * s
  const XS0 = view === 'side' ? ox + sideL : stacked ? ox + (cw - sideBoxW) / 2 + sideL : X0 + frontW * s + mR + gap + sideL
  const floorS = view === 'side' ? oy + Math.max(sideT, mT) + H * s : stacked ? floor + mB + gap + Math.max(sideT, mT) + H * s : floor
  const Ys = (z) => floorS - z * s, Xs = (x) => XS0 + x * s
  const sw = Math.max(0.8, fontPx / 11)
  const colPx = Math.max(3.5, upW * s), beamPx = Math.max(4, face * s), deckPx = Math.max(3, 4 * s)
  const items = []
  const rect = (x, y, w, h, o = {}) => items.push({ t: 'rect', x, y, w, h, ...o })
  const line = (x1, y1, x2, y2, o = {}) => items.push({ t: 'line', x1, y1, x2, y2, stroke: o.stroke || blue, sw: o.sw || sw, ...o })
  const text = (x, y, str, o = {}) => items.push({ t: 'text', x, y, s: str, size: o.size || fO, fill: o.fill || blue, anchor: o.anchor || 'middle', font: FONT, halo: Math.max(1.5, (o.size || fO) * 0.45), haloColor: bg, ...o, weight: o.weight ?? 500 })   // (500: a touch bolder than book, to read at small sizes)
  const keyOf = (r) => (r ? r.kind + ':' + (r.k ?? r.id ?? '') : null)
  const isActive = (r) => active && keyOf(r) === active

  /* a vertical dimension (the reference's: a thin line with short ticks at its ends, the label turned along it on its
     outer side); too short for its label, the label sits beside it */
  const dimV = (x, y0, y1, label, role, { from = null, color = blue, size = fO, pri = 2, out = -1 } = {}) => {
    if (compact) return
    const hot = isActive(role), c = hot ? '#d0392b' : color, w = hot ? sw * 1.6 : sw * 0.9
    if (from != null) for (const y of [y0, y1]) line(from, y, x + (from < x ? size * 0.4 : -size * 0.4), y, { stroke: c, sw: sw * 0.5 })
    line(x, y0, x, y1, { stroke: c, sw: w })
    for (const y of [y0, y1]) line(x - size * 0.45, y, x + size * 0.45, y, { stroke: c, sw: w })
    const len = Math.abs(y0 - y1), meta = { pri, out, span: [Math.min(y0, y1), Math.max(y0, y1)] }
    if (len >= tw(label, size) + size) text(x + out * size * 0.55, (y0 + y1) / 2, label, { rot: -90, size, fill: c, weight: hot ? 700 : undefined, role, ...meta })
    else text(x + out * size * 0.6, (y0 + y1) / 2 + size * 0.35, label, { anchor: out < 0 ? 'end' : 'start', size, fill: c, weight: hot ? 700 : undefined, role, ...meta })
  }
  // (`outboard` 'left' | 'right': a label wider than its span goes beyond that end, on the line's own row, as drafted)
  const dimH = (y, x0, x1, label, { color = blue, size = fO, below = true, outboard = null } = {}) => {
    if (compact) return
    line(x0, y, x1, y, { stroke: color, sw: sw * 0.9 })
    for (const x of [x0, x1]) line(x, y - size * 0.45, x, y + size * 0.45, { stroke: color, sw: sw * 0.9 })
    if (outboard && tw(label, size) + size > x1 - x0) text(outboard === 'left' ? x0 - size * 0.6 : x1 + size * 0.6, y + size * 0.35, label, { anchor: outboard === 'left' ? 'end' : 'start', size, fill: color, pri: 2 })
    else text((x0 + x1) / 2, below ? y + size * 1.45 : y - size * 0.55, label, { size, fill: color, pri: 2 })
  }
  /* the ground: an ink line, grey hatching below it */
  const ground = (x0, x1, y) => {
    line(x0, y, x1, y, { stroke: ink, sw: compact ? 2 : 3 })
    if (!compact) for (let x = x0 + fO * 1.4; x < x1 - fO * 0.6; x += fO * 2.2) line(x, y, x - fO, y + fO, { stroke: HATCH, sw: 1 })
  }
  /* the building over a view: the clearance band under the sprinkler heads (yellow), the dashed clear-height line, the
     sprinkler line — Simple: dashed, as on the reference; Detailed: red, labelled with its height — their labels grey,
     the clearance red */
  const shell = (Yv, x0, x1) => {
    if (bSprink) {
      const top = Yv(bSprink), bot = top + sprinklerClearanceIn * s
      rect(x0, top, x1 - x0, bot - top, { fill: BAND, opacity: 0.2, tag: 'band' })
      line(x0, top, x1, top, detailed ? { stroke: red, sw: sw * 1.4, tag: 'sprinkler' } : { stroke: ink, sw: sw * 1.2, dash: `${fO * 0.7} ${fO * 0.4}` })
      if (!compact) {
        // (Simple, the sprinklers at the clear height itself: one line, labelled as the clear height, as on the reference)
        if (detailed || !(bClear && Math.abs(bClear - bSprink) < 0.5)) text(x1 - 2, top - fT * 0.55, `SPRINKLERS ${ftInDash(bSprink)}`, { anchor: 'end', size: fT, fill: detailed ? red : GREY, pri: 2, tag: 'shell' })
        // the band's label inside the band, under the clear-height line where that line crosses it — never on the line;
        // no room there: none (it stays in that strip when it gives way, or goes)
        const lineY = bClear ? Yv(bClear) : null
        const y0 = lineY != null && lineY > top - 0.5 && lineY < bot ? lineY + sw * 2 : top + 1, y1 = bot - 1
        if (y1 - y0 >= fT * 1.05) text(x0 + 2, (y0 + y1) / 2 + fT * 0.29, `CLEARANCE ${ftInDash(sprinklerClearanceIn)}`, { anchor: 'start', size: fT, fill: red, pri: 3, tag: 'shell', keepIn: [y0, y1] })
      }
    }
    if (bClear) {
      line(x0, Yv(bClear), x1, Yv(bClear), { stroke: ink, sw: sw * 1.5, dash: `${fO * 0.8} ${fO * 0.45}`, tag: 'clear' })
      if (!compact) text(x1 - 2, Yv(bClear) + (bSprink && bSprink > bClear ? fT * 1.25 : -fT * 0.55), `CLEAR HEIGHT ${ftInDash(bClear)}${building?.assumed ? ' (ASSUMED)' : ''}`, { anchor: 'end', size: fT, fill: GREY, pri: 2, tag: 'shell' })
    }
  }


  /* ── Studio: the building over a view — the dashed ceiling line, the max load height (the sprinkler heads less their
     clearance) with the band up to the ceiling, both labelled at the left */
  /* a Studio label: `str` a string, or runs — [word, [value]] — the value 600 in `o.value` colour (the dimension blue) */
  const sText = (x, y, str, o = {}) => items.push({ t: 'text', x, y, s: Array.isArray(str) ? str.map(r => (Array.isArray(r) ? r[0] : r)).join('') : str, runs: Array.isArray(str) ? str.map(r => (Array.isArray(r) ? { s: r[0], fill: r[1] || o.value || S.blue, weight: 600 } : { s: r })) : undefined, size: o.size || 10 * u, fill: o.fill || S.words, anchor: o.anchor || 'start', font: S_FONT, halo: Math.max(1.5, (o.size || 10 * u) * 0.45), haloColor: bg, ...o, weight: o.weight ?? 400 })
  const sArrowHead = (x, y, dx, dy) => { const l = 5 * u, w = 2.1 * u, px = -dy, py = dx; items.push({ t: 'polygon', points: [[x, y], [x - dx * l + px * w, y - dy * l + py * w], [x - dx * l - px * w, y - dy * l - py * w]], fill: S.blue }) }
  function studioShell(Yv, x0, x1) {
    const base = ceilS
    if (base) {
      line(x0, Yv(base), x1, Yv(base), { stroke: S.ceil, sw: 1.2, dash: '6 4', tag: 'clear' })
      if (!compact) sText(x0 + 24 * u, Yv(base) - 5 * u, building?.assumed ? `Ceiling ${Math.round(base / 12)} ft (assumed)` : ['Ceiling ', [prime(ftInDash(base)), S.words]], { pri: 2, tag: 'shell' })   // assumed: all grey, no value in bold
      // the band from the ceiling down to the max load height (the ceiling less the sprinkler clearance)
      const maxLoad = base - sprinklerClearanceIn, yM = Yv(maxLoad), yC = Yv(base)
      rect(x0, yC, x1 - x0, yM - yC, { fill: S.band, opacity: 0.22, tag: 'band' })
      line(x0, yM, x1, yM, { stroke: S.maxLine, sw: 1.2, dash: '5 3', tag: 'max-load' })
      if (!compact) sText(x0 + 48 * u, yM + 12 * u, ['Max load height ', [prime(ftInDash(maxLoad)), S.maxText], ' ', [`(sprinklers −${sprinklerClearanceIn}″)`, S.maxNote]], { fill: S.maxText, pri: 2, tag: 'shell' })
    }
  }
  /* the ground: a 2.5 ink line, 1px hatching every 16 below it */
  function studioGround(x0, x1, y) {
    line(x0, y, x1, y, { stroke: S.ink, sw: 2.5 })
    if (!compact) for (let x = x0 + 20 * u; x <= x1; x += 16 * u) line(x, y, x - 8 * u, y + 8 * u, { stroke: S.hatch, sw: 1 })
  }
  /* a Studio dimension: a thin blue line with 10 px end ticks */
  const sDim = (x, y0, y1) => { line(x, y0, x, y1, { stroke: S.blue, sw: 1 }); for (const y of [y0, y1]) line(x - 5 * u, y, x + 5 * u, y, { stroke: S.blue, sw: 1 }) }
  function studioFront() {
    const fx0 = X0 - 88 * u, fx1 = Xf(frontW) + 88 * u
    studioShell(Y, fx0, fx1)
    studioGround(fx0, fx1, floor)
    const per = Math.max(0, positionsPerBeam(bayIn, palletWIn))
    const gapIn = per ? (bayIn - per * palletWIn) / (per + 1) : 0
    const xR = Xf(frontW)
    L.forEach((lv, i) => {
      const isTop = i === L.length - 1, z = lv.beamIn, gone = removing === lv.k, bad = misfit.has(lv.k) || (isTop && !!topIssue)
      if (z > 0) rect(Xf(upW), Y(z), bayIn * s, beamPx, { fill: gone ? '#d0392b' : isActive({ kind: 'beam', k: lv.k }) ? '#2a7a5f' : S.up, opacity: gone ? 0.5 : 1, role: { kind: 'beam', k: lv.k }, cursor: 'ns-resize', tag: 'beam' })
      const lh = loadH(lv, i)
      let lastX = null
      for (let p = 0; p < per; p++) {
        const x = upW + gapIn + p * (palletWIn + gapIn)
        rect(Xf(x), Y(z + lh), palletWIn * s, Math.max(0, lh * s - deckPx), { fill: bad ? MISFIT : LOAD, stroke: bad ? S.red : LOAD_EDGE, sw: 1, opacity: gone ? 0.35 : 1, tag: 'load', level: lv.k })
        rect(Xf(x), Y(z) - Math.min(deckPx, lh * s), palletWIn * s, Math.min(deckPx, lh * s), { fill: bad ? S.red : DECK, opacity: gone ? 0.35 : 1, tag: 'load', level: lv.k })
        lastX = x
      }
      if (compact || !per) return
      if (bad) sText(Xf(frontW / 2), Y(z + lh / 2) + 3.5 * u, misfit.has(lv.k) ? "Doesn't fit" : topIssue === 'clear' ? 'Above the ceiling' : `Within ${sprinklerClearanceIn}″ of sprinklers`, { anchor: 'middle', size: 9 * u, fill: S.red, weight: 600, tag: 'misfit', pri: 1.5, level: lv.k })
      // the level tag inside the right pallet, top-right (PJS 8.5 / 600)
      if (lh * s > 14 * u) sText(Xf(lastX + palletWIn) - 3 * u, Y(z + lh) + 10 * u, `L${i + 1}`, { anchor: 'end', size: 8.5 * u, fill: S.tag, weight: 600, tag: 'level-tag', halo: 0, fixed: true })
      // the beam's height to its top, on a short tick off the right upright
      if (z > 0) {
        const role = { kind: 'dim', id: 'elev', k: lv.k, value: z }, hot = isActive(role) || isActive({ kind: 'beam', k: lv.k })
        line(xR + 1 * u, Y(z) + 2 * u, xR + 7 * u, Y(z) + 2 * u, { stroke: hot ? '#d0392b' : S.blue, sw: 1 })
        sText(xR + 9 * u, Y(z) + 5.5 * u, prime(ftInDash(z)), { fill: hot ? '#d0392b' : S.blue, weight: 600, role, pri: 1 })
      }
    })
    // the frames: uprights and base plates (no bracing on the front view)
    for (const x of [0, frontW - upW]) {
      const fxp = Xf(x)
      rect(fxp, Y(hTop), colPx, hTop * s, { fill: S.up, role: { kind: 'upright', x }, tag: 'upright' })
      if (!compact) {
        rect(fxp - 4.5 * u, floor - 3 * u, colPx + 9 * u, 3 * u, { fill: S.ink })
        rect(fxp - 2, Y(hTop) - 3, colPx + 4, 6, { fill: isActive({ kind: 'top' }) ? '#d0392b' : 'transparent', role: { kind: 'top' }, cursor: 'ns-resize' })
      }
    }
    if (compact) return
    const lv0 = L[0], lh0 = loadH(lv0, 0), lv1 = L[1]
    // inside the L1 pallets: the pallet's height (left pallet) and width (right pallet), arrowed
    if (per && lh0 > 0) {
      const xa = Xf(upW + gapIn), ya0 = Y(lv0.beamIn + lh0) + 3 * u, ya1 = Y(lv0.beamIn) - deckPx - 3 * u, xl = xa + 8 * u
      if (ya1 - ya0 > 14 * u) {
        line(xl, ya0, xl, ya1, { stroke: S.blue, sw: 1 }); sArrowHead(xl, ya0, 0, -1); sArrowHead(xl, ya1, 0, 1)
        sText(xl + 4 * u, (ya0 + ya1) / 2 + 3 * u, `${Math.round(lv0.palletHeightIn || lh0)}″`, { size: 9.5 * u, fill: S.blue, weight: 600, halo: 0, tag: 'pallet-h', fixed: true })
      }
      const xp = upW + gapIn + (per - 1) * (palletWIn + gapIn), xb0 = Xf(xp) + 3 * u, xb1 = Xf(xp + palletWIn) - 1 * u, yb = Y(lv0.beamIn) - deckPx - 8 * u
      if (xb1 - xb0 > 18 * u) {
        line(xb0, yb, xb1, yb, { stroke: S.blue, sw: 1 }); sArrowHead(xb0, yb, -1, 0); sArrowHead(xb1, yb, 1, 0)
        sText((xb0 + xb1) / 2, yb - 5 * u, `${Math.round(palletWIn)}″`, { anchor: 'middle', size: 9.5 * u, fill: S.blue, weight: 600, halo: 0, tag: 'pallet-w', fixed: true })
      }
    }
    // left of L1: the beam above it — its face (top and underside) and the lift-off (underside to the top of the load)
    if (lv1 && lv1.beamIn > 0) {
      const xu = X0, yt = Y(lv1.beamIn), yu = Y(lv1.beamIn - face), yl = Y(lv0.beamIn + lh0)
      for (const y of [yt, yu]) line(xu - 13 * u, y, xu - 1 * u, y, { stroke: S.blue, sw: 0.8 })
      sText(xu - 15 * u, yu, prime(ftInDash(face)), { anchor: 'end', size: 8.5 * u, fill: S.blue, weight: 600, pri: 3, tag: 'face', role: { kind: 'dim', id: 'face', value: face } })
      const lift = lv1.beamIn - face - (lv0.beamIn + lh0)
      if (lift > 0) {
        line(xu - 13 * u, yl, Xf(upW + gapIn) - 2 * u, yl, { stroke: S.blue, sw: 0.8 })
        sText(xu - 15 * u, yl + 4 * u, prime(ftInDash(lift)), { anchor: 'end', size: 8.5 * u, fill: S.blue, weight: 600, pri: 3, tag: 'lift-off' })
      }
    }
    // far left, one column: the free headroom over the top load (to the max load height), then the top of the load
    const base = ceilS, xo = X0 - 52 * u, zTop = topLoad
    const maxLoad = base ? base - sprinklerClearanceIn : null
    const free = maxLoad != null ? maxLoad - zTop : null
    // an assumed ceiling (none set) is drawn, never checked: no red "over" against it — only the free headroom, when there is some
    if (maxLoad != null && !(building?.assumed && free < 0)) {
      sDim(xo, Y(maxLoad), Y(zTop))
      sText(xo - 13 * u, (Y(maxLoad) + Y(zTop)) / 2, free >= 0 ? [[prime(ftInDash(free))], ' free'] : [[prime(ftInDash(-free)), S.red], ' over'], { anchor: 'middle', rot: -90, size: 9.5 * u, fill: free >= 0 ? S.words : S.red, pri: 2, tag: 'free' })
    }
    sDim(xo, Y(zTop), floor)
    line(xo + 5 * u, Y(zTop), Xf(upW + gapIn) - 2 * u, Y(zTop), { stroke: S.blue, sw: 0.6, dash: '2 2' })
    sText(xo - 13 * u, (Y(zTop) + floor) / 2, ['Top of load ', [prime(ftInDash(zTop))]], { anchor: 'middle', rot: -90, pri: 2, tag: 'top-load' })
    // the frame, the column inside it
    const xf = X0 - 26 * u
    sDim(xf, Y(hTop), floor)
    sText(xf - 10 * u, (Y(hTop) + floor) / 2, ['Frame ', [prime(ftInDash(hTop))]], { anchor: 'middle', rot: -90, pri: 2, tag: 'frame', role: { kind: 'dim', id: 'upright', value: hTop } })
    // under the rack: the beam, its pallets and the load
    const yb = floor + 13 * u + 6 + 2, lb = Math.max(0, ...L.map(l => l.loadLb || 0))   // its ticks clear the hatch by 6px+
    line(Xf(upW), yb, Xf(upW + bayIn), yb, { stroke: S.blue, sw: 1 }); for (const x of [Xf(upW), Xf(upW + bayIn)]) line(x, yb - 5 * u, x, yb + 5 * u, { stroke: S.blue, sw: 1 })
    sText(Xf(upW + bayIn / 2), yb + 18 * u, ['Beam ', [`${Math.round(bayIn)}″`], ` · ${per} pallet${per === 1 ? '' : 's'}`, ...(lb ? [' · ', [lb.toLocaleString('en-US')], ' lb'] : [])], { anchor: 'middle', pri: 1, tag: 'beam-label' })
  }

  // ── front view, Studio (the right card's sheet)
  if (showFront && studio) studioFront()
  // ── front view
  if (showFront && !studio) {
  const fx0 = X0 - (compact ? 0 : fO * 1.4), fx1 = Xf(frontW) + (compact ? 0 : fO * 1.2)
  shell(Y, fx0, fx1)
  ground(fx0, fx1, floor)
  const per = Math.max(0, positionsPerBeam(bayIn, palletWIn))
  const gapIn = per ? (bayIn - per * palletWIn) / (per + 1) : 0
  L.forEach((lv, i) => {
    const isTop = i === L.length - 1, z = lv.beamIn, gone = removing === lv.k, bad = misfit.has(lv.k) || (isTop && !!topIssue)
    if (z > 0) rect(Xf(upW), Y(z), bayIn * s, beamPx, { fill: gone ? '#d0392b' : isActive({ kind: 'beam', k: lv.k }) ? '#2a7a5f' : frame, opacity: gone ? 0.5 : 1, role: { kind: 'beam', k: lv.k }, cursor: 'ns-resize', tag: 'beam' })
    const lh = loadH(lv, i)
    for (let p = 0; p < per; p++) {
      const x = upW + gapIn + p * (palletWIn + gapIn)
      rect(Xf(x), Y(z + lh), palletWIn * s, Math.max(0, lh * s - deckPx), { fill: bad ? MISFIT : LOAD, stroke: bad ? MISFIT_EDGE : LOAD_EDGE, sw: bad ? sw * 1.2 : 1, opacity: gone ? 0.35 : 1, tag: 'load', level: lv.k })
      rect(Xf(x), Y(z) - Math.min(deckPx, lh * s), palletWIn * s, Math.min(deckPx, lh * s), { fill: bad ? MISFIT_EDGE : DECK, stroke: bad ? MISFIT_EDGE : LOAD_EDGE, sw: 1, opacity: gone ? 0.35 : 1, tag: 'load', level: lv.k })
    }
    if (bad && per && !compact) text(Xf(frontW / 2), Y(z + lh / 2) + fT * 0.35, misfit.has(lv.k) ? "DOESN'T FIT" : topIssue === 'clear' ? 'ABOVE CLEAR HEIGHT' : `WITHIN ${sprinklerClearanceIn}" OF SPRINKLERS`, { size: fT, fill: red, weight: 600, tag: 'misfit', pri: 1.5, level: lv.k })
    // the level tag, grey, beside the right frame
    if (!compact && per) text(Xf(frontW) + cTag, Y(z + lh / 2) + fT * 0.35, `L${i + 1}`, { anchor: 'start', size: fT, fill: GREY, pri: 2, tag: 'tag' })
  })
  // the frames: dark green uprights with a zigzag of bracing, base plates
  for (const x of [0, frontW - upW]) {
    const fxp = Xf(x)
    rect(fxp, Y(hTop), colPx, hTop * s, { fill: frame, role: { kind: 'upright', x }, tag: 'upright' })
    if (!compact) {
      const cx = fxp + colPx / 2, step = Math.max(fO * 1.6, 26 * s * 0.5), zz = []
      let d = true
      for (let y = Y(hTop) + step * 0.5; y < floor - step * 0.4; y += step) { zz.push(d ? `M${cx - colPx * 0.4} ${y}L${cx + colPx * 0.4} ${Math.min(floor, y + step)}` : `M${cx + colPx * 0.4} ${y}L${cx - colPx * 0.4} ${Math.min(floor, y + step)}`); d = !d }
      items.push({ t: 'path', d: zz.join(''), stroke: frame, sw: 1.4, opacity: 0.65 })
      rect(fxp - fO * 0.5, floor - fO * 0.45, colPx + fO, fO * 0.45, { fill: ink })
      rect(fxp - 2, Y(hTop) - 3, colPx + 4, 6, { fill: isActive({ kind: 'top' }) ? '#d0392b' : 'transparent', role: { kind: 'top' }, cursor: 'ns-resize' })
    }
  }
  if (!compact) {
    // the frame height, blue, on the left
    dimV(X0 - cFrame, Y(0), Y(hTop), `FRAME ${ftInDash(hTop)}`, { kind: 'dim', id: 'upright', value: hTop }, { pri: 2, out: -1 })
    // the pitch, blue, on the right (a uniform level spacing)
    if (pitch && L.length > 1) dimV(Xf(frontW) + cPitch, Y(L[0].beamIn), Y(L[1].beamIn), `PITCH ${ftInDash(pitch)}`, { kind: 'info', id: 'pitch' }, { pri: 2, out: 1 })
    // the pallets' side clearance to the frames, red, under the bay
    if (per) {
      const yc = floor + fO * 1.1, g = gapIn * s
      line(Xf(upW), yc, Xf(upW) + g, yc, { stroke: red, sw: sw * 0.9 }); line(Xf(upW + bayIn) - g, yc, Xf(upW + bayIn), yc, { stroke: red, sw: sw * 0.9 })
      text(Xf(frontW) + cTag, yc + fT * 0.35, `${(Math.round(gapIn * 10) / 10)}" CLR`, { anchor: 'start', size: fT, fill: red, pri: 2, tag: 'clr' })
    }
    // the beam, with its pallets per level, blue, under the bay
    dimH(floor + fO * 2.4, Xf(upW), Xf(upW + bayIn), `BEAM ${ftInDash(bayIn)} · ${per}P`)
    if (detailed) {
      // each beam's elevation to its top, blue, on a leader off the beam's end
      for (const lv of L) if (lv.beamIn > 0) {
        const y = Y(lv.beamIn), role = { kind: 'dim', id: 'elev', k: lv.k, value: lv.beamIn }, hot = isActive(role) || isActive({ kind: 'beam', k: lv.k })
        line(Xf(frontW), y, Xf(frontW) + cElev - fE * 0.3, y, { stroke: hot ? '#d0392b' : blue, sw: hot ? sw * 1.6 : sw * 0.9 })
        text(Xf(frontW) + cElev, y + fE * 0.36, ftInDash(lv.beamIn), { anchor: 'start', size: fE, fill: hot ? '#d0392b' : blue, weight: 600, role, pri: 1 })
      }
      // per level: the pallet, the ACTUAL gap to the underside of the beam above (red under the clearance), that beam's face
      const xc = X0 - cChain, ext = X0 - fO * 0.35, chainO = { from: ext, size: fT, pri: 3, out: -1 }
      L.forEach((lv, i) => {
        const z0 = lv.beamIn, ph = lv.palletHeightIn || 0
        if (i + 1 < L.length) {
          const under = L[i + 1].beamIn - face, g = under - (z0 + ph)
          if (ph > 0) dimV(xc, Y(z0), Y(Math.min(z0 + ph, under)), ftInDash(ph), { kind: 'dim', id: 'pallet', k: lv.k, value: ph }, chainO)
          if (g > 0) dimV(xc, Y(z0 + ph), Y(under), ftInDash(g), { kind: 'dim', id: 'gap', k: lv.k, value: g }, { ...chainO, color: g < clearance - 1e-6 ? red : blue })
          else text(xc - fT * 0.6, Y(under) + fT * 0.35, 'GAP ' + ftInDash(g), { anchor: 'end', size: fT, fill: red, weight: 600, pri: 3, tag: 'gap', level: lv.k })
          const y0 = Y(under), y1 = Y(L[i + 1].beamIn)
          line(xc, y0, xc, y1, { stroke: blue, sw: sw * 0.9 })
          text(xc - fT * 1.6, (y0 + y1) / 2 + fT * 0.32, ftInDash(face), { anchor: 'end', size: fT, fill: GREY, pri: 3, role: { kind: 'dim', id: 'face', value: face }, tag: 'face' })
        } else {
          // the top level: its pallet, then the gaps up to the clear height and the sprinkler heads (red: above the clear
          // height, or within the sprinkler clearance)
          const zTop = topOfLoad(t)
          if (ph > 0) dimV(xc, Y(z0), Y(zTop), ftInDash(ph), { kind: 'dim', id: 'pallet', k: lv.k, value: ph }, chainO)
          const marks = [bClear ? [bClear, 'clear'] : null, bSprink ? [bSprink, 'sprinkler'] : null].filter(Boolean).sort((a, b) => a[0] - b[0])
          let from = zTop
          for (const [h, id] of marks) {
            const red = id === 'clear' ? h < zTop - 1e-6 : h - zTop < sprinklerClearanceIn - 1e-6
            if (h > from + 1e-6) { dimV(xc, Y(from), Y(h), ftInDash(h - from), { kind: 'info', id: 'gap-' + id }, { ...chainO, color: red ? red : blue }); from = h }
            else if (h < zTop) text(xc - fT * 0.6, Y(h) + fT * 0.35, (id === 'clear' ? 'CLEAR ' : 'SPRINKLER ') + ftInDash(h - zTop), { anchor: 'end', size: fT, fill: red, weight: 600, pri: 3, tag: 'gap', level: lv.k })
          }
        }
      })
    }
  }

  }

  // ── side view: dark green frames (two and the flue for a back-to-back), horizontals and diagonals, flue spacers
  if (showSide) {
  const sx0 = Xs(0) - (compact ? 0 : fO * 1.2), sx1 = Xs(sideW) + (compact ? 0 : fO * 1.0)
  if (studio) { studioShell(Ys, sx0, sx1); studioGround(sx0, sx1, floorS) } else { shell(Ys, sx0, sx1); ground(sx0, sx1, floorS) }
  const frames = pair ? [0, depthIn + flueIn + upW] : [0]
  // the pallets on each level, at their real depth, centred on the frame; past the frame + 6" (3" a side) the overhang
  // is amber — the pallet needs a deeper frame (frameDepthNote)
  const pd = palletDIn > 0 ? palletDIn : depthIn + 6, allow = depthIn + 6
  for (const f0 of frames) {
    const c = f0 + (depthIn + upW) / 2, a0 = c - pd / 2, a1 = c + pd / 2, o0 = c - allow / 2, o1 = c + allow / 2
    L.forEach((lv, i) => {
      const h = loadH(lv, i)
      if (!(h > 0)) return
      const z0 = lv.beamIn
      rect(Xs(a0), Ys(z0 + h), pd * s, h * s, { fill: LOAD, stroke: LOAD_EDGE, sw: sw * 0.8, tag: 'side-load', level: lv.k })
      rect(Xs(a0), Ys(z0) - Math.max(2, 4 * s), pd * s, Math.max(2, 4 * s), { fill: DECK, tag: 'side-load', level: lv.k })
      if (pd > allow + 1e-6) for (const [x0, x1] of [[a0, o0], [o1, a1]]) rect(Xs(x0), Ys(z0 + h), (x1 - x0) * s, h * s, { fill: AMBER, opacity: 0.55, stroke: AMBER, sw: sw * 0.8, tag: 'side-overhang', level: lv.k })
    })
  }
  for (const f0 of frames) {
    for (const x of [f0, f0 + depthIn]) rect(Xs(x), Ys(hTop), colPx, hTop * s, { fill: frame, tag: 'frame' })
    const n = Math.max(3, Math.round((hTop - 6) / 28)), step = (hTop - 6) / n
    for (let i = 0; i <= n; i++) line(Xs(f0 + upW), Ys(6 + i * step), Xs(f0 + depthIn), Ys(6 + i * step), { stroke: frame, sw: sw * 0.9, opacity: 0.65 })
    for (let i = 1; i < n; i += 2) {
      const a = Ys(6 + i * step), b = Ys(6 + (i + 1) * step), lr = ((i - 1) / 2) % 2 === 0
      line(Xs(lr ? f0 + upW : f0 + depthIn), a, Xs(lr ? f0 + depthIn : f0 + upW), b, { stroke: frame, sw: sw * 0.9, opacity: 0.65 })
    }
    if (!compact) for (const x of [f0, f0 + depthIn]) rect(Xs(x) - fO * 0.4, floorS - fO * 0.45, colPx + fO * 0.8, fO * 0.45, { fill: ink })
  }
  if (pair) for (const z of [hTop / 3, (2 * hTop) / 3]) rect(Xs(depthIn + upW), Ys(z) - 2, flueIn * s, 4, { fill: frame, tag: 'spacer' })
  if (!compact) {
    // under the ground, like the front view's beam: over the frames they would run into the building's labels
    const yb = floorS + fO * 2.4
    dimH(yb, Xs(0), Xs(depthIn + upW), ftInDash(depthIn), { outboard: pair ? 'left' : null })
    if (pair) { dimH(yb, Xs(depthIn + upW), Xs(depthIn + upW + flueIn), ftInDash(flueIn), { below: false }); dimH(yb, Xs(depthIn + flueIn + upW), Xs(sideW), ftInDash(depthIn), { outboard: 'right' }) }
    dimV(Xs(0) - fO * 1.8, Ys(0), Ys(hTop), studio ? prime(`Frame ${ftInDash(hTop)}`) : `FRAME ${ftInDash(hTop)}`, { kind: 'dim', id: 'upright', value: hTop }, { pri: 2, out: -1 })
  }
  }
  if (!compact) declutter(items, box)
  // every label over the linework, so its halo clears the dashed building lines and the dimension lines beneath it
  const drawn = [...items.filter(i => i.t !== 'text'), ...items.filter(i => i.t === 'text')]
  items.length = 0; items.push(...drawn)
  // the elevation's pallet deeper than these frames allow (~3" overhang each side): said in red under the drawing
  if (deepNote) text(ox + cw / 2, oy + ch - fT * 0.4, deepNote.toUpperCase(), { size: fT, fill: AMBER, weight: 600, pri: 1, tag: 'frame-depth' })

  return { w: box.w, h: box.h, scale: s, items, floor, Y, Xf, upW, frontW, bayIn, bottom: Math.max(floor, floorS) + mB }
}

/* ── labels never overlap a load, a beam or another label ─────────────────── */

/** A label's box (px). */
export function labelBox(i) {
  // a monospace advance; the Studio sheet's Plus Jakarta Sans runs narrower
  const len = String(i.s).length * i.size * (/Jakarta/.test(i.font || '') ? 0.53 : 0.6)
  if (i.rot === -90) return { x0: i.x - i.size * 0.85, x1: i.x + i.size * 0.2, y0: i.y - len / 2, y1: i.y + len / 2 }
  const x0 = i.anchor === 'start' ? i.x : i.anchor === 'end' ? i.x - len : i.x - len / 2
  return { x0, x1: x0 + len, y0: i.y - i.size * 0.8, y1: i.y + i.size * 0.22 }
}
const hit = (a, b, pad = 0.5) => a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.y0 < b.y1 - pad && b.y0 < a.y1 - pad
const rectBox = (r) => ({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h })
/** Move every label clear of the loads, the beams, the uprights and each other — in rank order (the elevations first);
 *  a dimension's label slides along its own line, then steps outward; a free label steps up or down; a chain label (or
 *  the sprinkler's note) that finds no room is dropped rather than drawn over something. Two labels keep half a character
 *  apart side to side — closer, they read as one run. A label with keepIn [y0, y1] stays inside that strip; with the `box`, every label inside the drawing (one with no
 *  room there is dropped, or left where it was if it ranks). In place. */
export function declutter(items, box = null) {
  const solids = items.filter(i => i.t === 'rect' && (i.tag === 'load' || i.tag === 'beam' || i.tag === 'upright' || i.tag === 'frame'))
  const labels = items.filter(i => i.t === 'text').sort((a, b) => (a.pri ?? 2) - (b.pri ?? 2))
  const placed = [], drop = new Set()
  for (const l of labels) {
    if (l.fixed) { placed.push(l); continue }      // drawn inside its own shape (a level tag, a pallet's size): it stays
    let inBox = !!box
    const ok = () => { const b = labelBox(l), g = l.size * 0.5, bg = { x0: b.x0 - g, x1: b.x1 + g, y0: b.y0, y1: b.y1 }; if (l.keepIn && (b.y0 < l.keepIn[0] - 0.5 || b.y1 > l.keepIn[1] + 0.5)) return false; if (inBox && (b.x0 < 0 || b.x1 > box.w || b.y0 < 0 || b.y1 > box.h)) return false; return !placed.some(p => hit(bg, labelBox(p))) && !solids.some(r => !(l.tag === 'misfit' && r.level === l.level && r.tag === 'load') && hit(b, rectBox(r))) }
    if (ok()) { placed.push(l); continue }
    const x0 = l.x, y0 = l.y, step = l.size * 0.6
    const search = () => {
      // along its line, within its span
      if (l.span) for (let k = 1; k <= 12; k++) for (const d of [k, -k]) {
        const y = y0 + d * step
        if (l.rot === -90 ? (y - String(l.s).length * l.size * 0.28 < l.span[0] - l.size || y + String(l.s).length * l.size * 0.28 > l.span[1] + l.size) : (y < l.span[0] - l.size || y > l.span[1] + l.size)) continue
        l.x = x0; l.y = y
        if (ok()) return true
      }
      // then outward
      l.y = y0; for (let k = 1; k <= 4; k++) { l.x = x0 + (l.out || -1) * k * l.size * 1.1; if (ok()) return true }
      // a free label (no line of its own): up or down
      if (!l.span) { l.x = x0; for (let k = 1; k <= 4; k++) for (const d of [-k, k]) { l.y = y0 + d * l.size * 0.95; if (ok()) return true } }
      l.x = x0; l.y = y0
      return false
    }
    // inside the drawing first; a label that ranks (it is drawn whatever) may then go past its edge rather than on another
    let found = search()
    if (!found && inBox && (l.pri ?? 2) < 3) { inBox = false; found = ok() || search() }
    if (found) placed.push(l)
    else if ((l.pri ?? 2) >= 3) drop.add(l)
    else placed.push(l)
  }
  for (let n = items.length - 1; n >= 0; n--) if (drop.has(items[n])) items.splice(n, 1)
}

const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** One primitive as SVG markup. */
export function itemSVG(i) {
  const op = i.opacity != null ? ` opacity="${i.opacity}"` : ''
  if (i.t === 'rect') return `<rect x="${i.x}" y="${i.y}" width="${Math.max(0, i.w)}" height="${Math.max(0, i.h)}" fill="${i.fill || 'none'}"${i.stroke ? ` stroke="${i.stroke}" stroke-width="${i.sw || 1}"` : ''}${op}/>`
  if (i.t === 'line') return `<line x1="${i.x1}" y1="${i.y1}" x2="${i.x2}" y2="${i.y2}" stroke="${i.stroke}" stroke-width="${i.sw}"${i.dash ? ` stroke-dasharray="${i.dash}"` : ''}${op}/>`
  if (i.t === 'path') return `<path d="${i.d}" fill="none" stroke="${i.stroke}" stroke-width="${i.sw}"${op}/>`
  if (i.t === 'polygon') return `<polygon points="${i.points.map(p => p.join(',')).join(' ')}" fill="${i.fill}"/>`
  if (i.t === 'circle') return `<circle cx="${i.cx}" cy="${i.cy}" r="${i.r}" fill="${i.fill}"${i.stroke ? ` stroke="${i.stroke}" stroke-width="${i.sw || 1}"` : ''}/>`
  if (i.t === 'poly') return `<polyline points="${i.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${i.stroke}" stroke-width="${i.sw}"/>`
  // the label's halo in the colour behind it (the panel's, or the paper's): a style, so a CSS variable works too
  if (i.t === 'text') return `<text x="${i.x}" y="${i.y}" font-size="${i.size}" font-family="${esc(i.font || 'Arial, sans-serif')}" text-anchor="${i.anchor}" fill="${i.fill}"${i.halo ? ` style="stroke:${esc(i.haloColor || '#fff')};stroke-width:${i.halo}px;paint-order:stroke;stroke-linejoin:round"` : ''}${i.weight ? ` font-weight="${i.weight}"` : ''}${i.rot ? ` transform="rotate(${i.rot} ${i.x} ${i.y})"` : ''}>${i.runs ? i.runs.map(r => `<tspan${r.fill ? ` fill="${r.fill}"` : ''}${r.weight ? ` font-weight="${r.weight}"` : ''}>${esc(r.s)}</tspan>`).join('') : esc(i.s)}</text>`
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
/** The ceiling the drawing reads → { clearHeightIn, sprinklerIn } or null: type `type`'s from the project (`table`,
 *  utils/project.js), else the building (floor plan) `parentId` names (else the layout's first). */
export function ceilingForDrawing(objects, table, type, parentId) { return ceilingOf(table, type) || buildingOf(objects, parentId) }
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
