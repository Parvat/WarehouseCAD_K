// elevFit.js — auto-fit elevation proposals from the building and the racking settings (ELEVATIONS_PLAN.md §3).
//
// The first level is on the floor. Level pitch = pallet + clearance + beam face, rounded up to the hole pitch; beam k
// (to the TOP of the beam) at k × pitch. A level fits when its top load (beam + pallet) is at or under the clear height
// and at or under the sprinkler height less the sprinkler clearance. The upright = the top beam + 12", rounded up to
// the upright step, never above the clear height. Pure.

import { ELEV_FIELDS, isBeamRack, LOAD_LB, ASSUMED_CLEAR_IN } from './elevations'
import { bayLedger } from './bayLedger'

export const FIT_DEFAULTS = { palletHeightIn: 48, clearanceIn: 6, beamFaceIn: 4, holePitchIn: 2, uprightStepIn: 12, sprinklerClearanceIn: 18 }
export const UPRIGHT_OVER_TOP_BEAM_IN = 12

/** The fit inputs, defaults under them. */
export const fitInputs = (f = {}) => ({ ...FIT_DEFAULTS, ...Object.fromEntries(Object.entries(f || {}).filter(([, v]) => Number.isFinite(v) && v >= 0)) })

/** The level pitch (in): pallet + clearance + beam face, rounded up to the hole pitch. */
export function levelPitch(f) {
  const i = fitInputs(f), raw = i.palletHeightIn + i.clearanceIn + i.beamFaceIn, hp = i.holePitchIn > 0 ? i.holePitchIn : 1
  return Math.ceil(raw / hp - 1e-9) * hp
}

/** The limit a top load must stay under in building `b` ({ clearHeightIn, sprinklerIn }) → { limit, kind: 'clear' |
 *  'sprinkler' } (the lower one), or null with no clear height. */
export function loadLimit(b, f) {
  if (!b || !(b.clearHeightIn > 0)) return null
  const i = fitInputs(f), spr = b.sprinklerIn > 0 ? b.sprinklerIn - i.sprinklerClearanceIn : Infinity
  return spr < b.clearHeightIn ? { limit: spr, kind: 'sprinkler' } : { limit: b.clearHeightIn, kind: 'clear' }
}

/** The upright for a top beam at `topBeamIn`: + 12", up to the next step, never above the clear height. */
export function uprightFor(topBeamIn, b, f) {
  const i = fitInputs(f), step = i.uprightStepIn > 0 ? i.uprightStepIn : 12
  const up = Math.ceil((topBeamIn + UPRIGHT_OVER_TOP_BEAM_IN) / step - 1e-9) * step
  return b?.clearHeightIn > 0 ? Math.min(up, b.clearHeightIn) : up
}

/** An elevation design of `n` levels (a type without id / name / colour). */
export function designFor(n, b, f) {
  const i = fitInputs(f), P = levelPitch(i), N = Math.max(1, n)
  const levels = Array.from({ length: N }, (_, k) => ({ beamIn: k * P, palletHeightIn: i.palletHeightIn, loadLb: LOAD_LB }))
  return { uprightHeightIn: uprightFor((N - 1) * P, b, i), clearanceIn: i.clearanceIn, beamFaceIn: i.beamFaceIn, holePitchIn: i.holePitchIn, levels }
}

/** `n` levels against building `b` → { topLoad, limit, kind, over (in past the limit, > 0 fails), headroom (≥ 0) }. */
export function fitOf(n, b, f) {
  const i = fitInputs(f), P = levelPitch(i), lim = loadLimit(b, i)
  const topLoad = (Math.max(1, n) - 1) * P + i.palletHeightIn
  if (!lim) return { topLoad, limit: null, kind: null, over: 0, headroom: null }
  return { topLoad, limit: lim.limit, kind: lim.kind, over: Math.max(0, topLoad - lim.limit), headroom: Math.max(0, lim.limit - topLoad) }
}

/** The most levels that fit in building `b` (0: not even one; null: no clear height). */
export function maxLevels(b, f) {
  const i = fitInputs(f), lim = loadLimit(b, i)
  if (!lim) return null
  if (lim.limit < i.palletHeightIn) return 0
  return Math.floor((lim.limit - i.palletHeightIn) / levelPitch(i) + 1e-9) + 1
}

/** The proposals for building `b`: max levels (best), one fewer, and the next one up flagged → [{ n, design, best, over,
 *  kind, headroom, topLoad, positions }]; `positionsFor(design)` gives the layout's total pallet positions. Null with no
 *  clear height. */
export function proposals(b, f, positionsFor = () => null) {
  const m = maxLevels(b, f)
  if (m == null) return null
  const ns = [...new Set([m, m - 1, m + 1])].filter(n => n >= 1).sort((a, c) => c - a)
  return ns.map(n => { const design = designFor(n, b, f), fit = fitOf(n, b, f); return { n, design, best: n === m, ...fit, positions: positionsFor(design) } })
    .sort((a, c) => (a.best ? -1 : c.best ? 1 : 0) || (a.over > 0) - (c.over > 0) || c.n - a.n)
}

/** The layout's total pallet positions if every bay carried `design` (the bay ledger, overlaps counted once). */
export function layoutPositions(objects, design, gridSize = 40) {
  const plain = objects.map(o => { if (!isBeamRack(o)) return o; const r = { ...o }; for (const k of ELEV_FIELDS) delete r[k]; return r })
  return bayLedger(plain, gridSize, { version: 1, defaultId: 'fit', types: [{ ...design, id: 'fit', name: 'fit' }] }).positions
}

/** Feet, whole or with inches: 21', 21'-6". */
export const feetLabel = (inches) => { const v = Math.round(inches), ft = Math.floor(v / 12), r = v - ft * 12; return r ? `${ft}'-${r}"` : `${ft}'` }
/** An elevation's name from its level count and upright: "5 levels · 21'". */
export const autoName = (t) => `${t.levels.length} level${t.levels.length === 1 ? '' : 's'} · ${feetLabel(t.uprightHeightIn)}`
/** A name autoName made (a unique suffix allowed) — it follows its elevation's changes; a renamed one keeps its own. */
export const isAutoName = (name) => /^\d+ levels? · \d+'(-\d+")?( \d+)?$/.test(String(name || ''))

/* ── an elevation for a ceiling + pallet pair (the Elevations tab, the project's first elevation) ───────────────── */

/** The fit inputs for pallet `pallet` under project `project` (its advanced settings; the beam face: the project's
 *  default for new elevations — a pallet from before the beam face left it still read for its own). */
export const fitForPallet = (project, pallet) => fitInputs({ palletHeightIn: pallet?.heightIn, clearanceIn: project?.advanced?.clearanceIn, beamFaceIn: project?.advanced?.beamFaceIn ?? pallet?.beamFaceIn, holePitchIn: project?.advanced?.holePitchIn, uprightStepIn: project?.advanced?.uprightStepIn, sprinklerClearanceIn: project?.advanced?.sprinklerClearanceIn })
/** The ceiling entry as a building ({ clearHeightIn, sprinklerIn }) for the fit — a clear height not set (or no
 *  ceiling at all) assumed ASSUMED_CLEAR_IN (24'). */
export const ceilingBuilding = (c) => ({ clearHeightIn: c?.clearHeightIn > 0 ? c.clearHeightIn : ASSUMED_CLEAR_IN, sprinklerIn: c?.sprinklerIn > 0 ? c.sprinklerIn : null })
/** The best-fit elevation design for ceiling `ceiling` and pallet `pallet` — the most levels that fit, the pallet's
 *  height, weight and beam face on every level — tagged with the pair (a type without id / name / colour); null when
 *  not even one level fits. No ceiling (or none set): 24' assumed. */
export function bestFitFor(project, ceiling, pallet, { beamFaceIn = null } = {}) {
  // `beamFaceIn`: the elevation's own beam face (the editor's), else the project's default
  const b = ceilingBuilding(ceiling), f = { ...fitForPallet(project, pallet), ...(beamFaceIn > 0 ? { beamFaceIn } : {}) }, n = maxLevels(b, f)
  if (!n) return null
  const d = designFor(n, b, f)
  return { ...d, levels: d.levels.map(l => ({ ...l, loadLb: pallet?.weightLb ?? l.loadLb })), ceilingId: ceiling?.id ?? null, palletId: pallet?.id ?? null }
}
/** An elevation's base auto name: "N levels · DEPTH×FACE · CEILING" — "5 levels · 48×40 · Main": the pallet depth first, as
 *  the industry says it (a standard pallet is 48×40); the pallet's stored face and depth are unchanged (the pallet's face
 *  across the beam × its depth, the ceiling's name). project.js autoNames keeps them unique. */
export function pairName(project, t) {
  const p = project?.pallets?.find(x => x.id === t.palletId), c = project?.ceilings?.find(x => x.id === t.ceilingId)
  const n = t.levels.length
  return [`${n} level${n === 1 ? '' : 's'}`, p ? `${p.depthIn}×${p.faceIn}` : null, c?.name].filter(Boolean).join(' · ')
}

/** The design of exactly `n` levels for ceiling `ceiling` and pallet `pallet` — bestFitFor's inputs (the pallet's height,
 *  weight and beam face, the project's clearance and hole pitch), the count given instead of the most that fit (the
 *  Elevations row's quick edit: Levels). Tagged with the pair; null when `n` is not a whole number ≥ 1. */
export function designForLevels(project, ceiling, pallet, n, { beamFaceIn = null } = {}) {
  const N = Math.floor(Number(n))
  if (!(N >= 1)) return null
  const b = ceilingBuilding(ceiling), f = { ...fitForPallet(project, pallet), ...(beamFaceIn > 0 ? { beamFaceIn } : {}) }
  const d = designFor(N, b, f)
  return { ...d, levels: d.levels.map(l => ({ ...l, loadLb: pallet?.weightLb ?? l.loadLb })), ceilingId: ceiling?.id ?? null, palletId: pallet?.id ?? null }
}
