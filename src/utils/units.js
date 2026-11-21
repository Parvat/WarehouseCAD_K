// units.js — the project's units (units round): Imperial (ft-in) or Metric, with a precision (1/16, 1/8, 1/2 or 1 in;
// 1, 10 or 100 mm), set in Project settings and saved with the project (`project.rules.unitSystem`, `precisionIn`,
// `precisionMm`). ONE parser for every typed length, ONE formatter for every length shown:
//   - parseLength: 12'6, 12' 6", 12 ft 6 in, 150 in, 150", 3.8 m, 3800 mm, 38 cm, and a bare number in the project unit
//     (feet imperial, mm metric) → feet;
//   - formatting: imperial ft-in to the chosen precision; metric mm in cards, BOM, Tally, xlsx and CSV, metres to 2
//     decimals on plan labels.
// Storage never changes (world px, feet, inches), so switching units changes no geometry — only what is shown and how a
// typed length is read. Text sizes stay plain numbers (inches) in either unit.
import { create } from 'zustand'

export const IMPERIAL_PRECISIONS = [1 / 16, 1 / 8, 1 / 2, 1]          // inches
export const METRIC_PRECISIONS = [1, 10, 100]                           // mm
export const DEFAULT_UNITS = { metric: false, precisionIn: 1, precisionMm: 1 }

/** The project's units now (ProjectSync.jsx keeps it in step with the project). */
export const useUnits = create(() => ({ ...DEFAULT_UNITS }))
export const unitsNow = () => useUnits.getState()
/** The project's rules → units. An older project's `units` ('ft · in', 'inches', 'meters', 'cm', 'mm') maps on. */
export function unitsOfRules(rules = {}) {
  const sys = rules.unitSystem || (/^(meters|cm|mm)$/.test(rules.units || '') ? 'metric' : 'imperial')
  const pIn = IMPERIAL_PRECISIONS.includes(Number(rules.precisionIn)) ? Number(rules.precisionIn) : 1
  const pMm = METRIC_PRECISIONS.includes(Number(rules.precisionMm)) ? Number(rules.precisionMm) : 1
  return { metric: sys === 'metric', precisionIn: pIn, precisionMm: pMm }
}
/** Imperial at a whole inch: every formatter shows exactly what it always has. */
export const isDefaultUnits = (u = unitsNow()) => !u.metric && u.precisionIn === 1

const MM_PER_IN = 25.4
/** "12'6", "12' 6\"", "12 ft 6 in", "12′-6½″", "150 in", "150\"", "3.8 m", "3800 mm", "38 cm", or a bare number in the
 *  project unit (feet imperial, mm metric) → feet, or null when it is not a length. */
export function parseLength(text, u = unitsNow()) {
  let t = String(text ?? '').trim().toLowerCase()
  if (!t) return null
  t = t.replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/½/g, '.5').replace(/¼/g, '.25').replace(/¾/g, '.75').replace(/,/g, '.')
  const num = '(\\d+(?:\\.\\d+)?|\\d+\\s+\\d+/\\d+|\\d+/\\d+)'
  const val = (s) => { s = s.trim(); const m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + +m[2] / +m[3]; const f = s.match(/^(\d+)\/(\d+)$/); if (f) return +f[1] / +f[2]; return Number(s) }
  let m
  if ((m = t.match(new RegExp('^' + num + '\\s*(mm|millimet(?:er|re)s?)$')))) return val(m[1]) / MM_PER_IN / 12
  if ((m = t.match(new RegExp('^' + num + '\\s*(cm|centimet(?:er|re)s?)$')))) return (val(m[1]) * 10) / MM_PER_IN / 12
  if ((m = t.match(new RegExp('^' + num + '\\s*(m|met(?:er|re)s?)$')))) return (val(m[1]) * 1000) / MM_PER_IN / 12
  if ((m = t.match(new RegExp('^' + num + '\\s*("|in|inch|inches)$')))) return val(m[1]) / 12
  // feet, then inches: 12'6, 12' 6", 12 ft 6 in, 12'-6", 12ft
  if ((m = t.match(new RegExp('^' + num + "\\s*('|ft|feet|foot)\\s*-?\\s*(?:" + num + '\\s*("|in|inch|inches)?)?$')))) return val(m[1]) + (m[3] ? val(m[3]) / 12 : 0)
  if ((m = t.match(new RegExp('^' + num + '$')))) { const v = val(m[1]); return u.metric ? v / MM_PER_IN / 12 : v }
  return null
}

/** A fraction of an inch at precision `p` (1/16 … 1): "½", "3/8" — '' for none. */
function frac(rem, p) {
  if (p >= 1) return ''
  const den = Math.round(1 / p), n = Math.round(rem * den)
  if (!n) return ''
  const g = (a, b) => (b ? g(b, a % b) : a), d = g(n, den)
  const nn = n / d, dd = den / d
  return nn === 1 && dd === 2 ? '½' : `${nn}/${dd}`
}
/** Imperial: `inches` rounded to the precision, in `style`: 'plain' 12' 6" (and 6" under a foot), 'dash' 12′-6″,
 *  'space' 12′ 6″. */
export function fmtImperial(inches, style = 'plain', u = unitsNow()) {
  const p = u.precisionIn || 1, neg = inches < 0
  const tot = Math.round(Math.abs(inches) / p) * p
  let ft = Math.floor(tot / 12 + 1e-9), rem = tot - ft * 12
  if (rem >= 12 - 1e-9) { ft += 1; rem = 0 }
  const whole = Math.floor(rem + 1e-9), fr = frac(rem - whole, p)
  const inTxt = (whole || !fr ? String(whole) : '') + (fr ? (whole ? ' ' : '') + fr : '')
  const sgn = neg ? '-' : ''
  if (style === 'dash') return `${sgn}${ft}′-${inTxt}″`
  if (style === 'space') return ft === 0 ? `${sgn}${inTxt}″` : `${sgn}${ft}′ ${inTxt}″`
  if (!rem) return `${sgn}${ft}'`
  return ft ? `${sgn}${ft}' ${inTxt}"` : `${sgn}${inTxt}"`
}
/** Metric: `inches` as mm to the precision ("3810 mm"), or — on the plan — metres to 2 decimals ("3.81 m"). */
export function fmtMetric(inches, where = 'card', u = unitsNow()) {
  const mm = inches * MM_PER_IN
  if (where === 'plan') return `${(mm / 1000).toFixed(2)} m`
  const p = u.precisionMm || 1
  return `${Math.round(mm / p) * p} mm`
}
/** A length (inches) for `where` ('card' | 'plan' | 'table'), in the project's units; `style`: the imperial look. */
export function fmtLength(inches, where = 'card', style = 'plain', u = unitsNow()) {
  return u.metric ? fmtMetric(inches, where, u) : fmtImperial(inches, style, u)
}
/** World px → the length shown (the drawing's px per foot `gridSize`). */
export const fmtPx = (px, gridSize = 40, where = 'plan', style = 'plain') => fmtLength((px / gridSize) * 12, where, style)

/** pxToFtIn (utils/canvas.js — protected, unchanged) in the project's units: the same text at the default units. */
export function pxToFtIn(pixels, gridSize = 40, where = 'plan') {
  if (isDefaultUnits()) {
    const totalInches = (pixels / gridSize) * 12
    const ft = Math.floor(Math.abs(totalInches) / 12), inch = Math.round(Math.abs(totalInches) % 12)
    if (inch === 12) return `${ft + 1}'`
    if (inch === 0) return `${ft}'`
    return `${ft}' ${inch}"`
  }
  return fmtPx(Math.abs(pixels), gridSize, where, 'plain')
}
/** pxToFtIn for a card, a table or an export: mm in metric (the plan's is metres) — the same text at the default units. */
export const pxToFtInCard = (pixels, gridSize = 40) => pxToFtIn(pixels, gridSize, 'card')
