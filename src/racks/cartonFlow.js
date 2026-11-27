// cartonFlow.js — (r8-carton-flow) carton flow: bays of sloped lanes, loaded at the back (LOAD) and picked at the front
// (PICK), the cartons rolling toward the pick face. The flow family (amber), its own letter K. Its properties, size, card
// edits, end handles in whole bays and its carton lanes. Its BOM is OFF (PP: dealer setups vary) — behind the same one
// setting as the lane BOMs (racks/laneBom.js LANE_BOMS_PENDING_ON), listed under "not in this BOM".
//
// THE OBJECT (inches): bays [3] · bayWidthIn [96 = 8 ft] · depthIn [96] · levels [4] · lanesPerLevel (per bay) [6] ·
// pitchInPerFt [0.5 — about 1/2 in per ft, card only, never printed] · frameHeightIn [84 = 7 ft].
// THE SIZE (world px at `gridSize` px a foot): width = bays × bay width; depth = depthIn.
// CAPACITY: carton lanes = bays × levels × lanes per level, on the card — never pallet positions.
// Pure.
import { anchoredResize } from '../utils/bayAnchor'

export const CARTON_DEFAULTS = { bays: 3, bayWidthIn: 96, depthIn: 96, levels: 4, lanesPerLevel: 6, pitchInPerFt: 0.5, frameHeightIn: 84 }
export const CARTON_BAY_IN = [72, 96, 108, 120], CARTON_DEPTH_IN = [72, 96, 120, 144], CARTON_HEIGHT_IN = [72, 84, 96, 120]

const r2 = (v) => Math.round(v * 100) / 100
const int = (v, d, min = 1) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min ? n : d }
const pos = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)

/** Its properties (inches); a field it does not carry: the default, its bay width and depth read from what it measures. */
export function cartonSpec(o, gridSize = 40) {
  const d = CARTON_DEFAULTS
  const wIn = ((o?.width || 0) / gridSize) * 12, hIn = ((o?.height || 0) / gridSize) * 12
  const bays = int(o?.bays, wIn > 0 ? Math.max(1, Math.round(wIn / d.bayWidthIn)) : d.bays)
  const bayWidthIn = o?.bayWidthIn > 0 ? o.bayWidthIn : (wIn > 0 ? r2(wIn / bays) : d.bayWidthIn)
  const depthIn = hIn > 0 ? r2(hIn) : pos(o?.depthIn, d.depthIn)
  return {
    bays, bayWidthIn, depthIn, levels: int(o?.levels, d.levels), lanesPerLevel: int(o?.lanesPerLevel, d.lanesPerLevel),
    pitchInPerFt: pos(o?.pitchInPerFt, d.pitchInPerFt), frameHeightIn: pos(o?.frameHeightIn, d.frameHeightIn),
  }
}
export const cartonSizeIn = (s) => ({ w: s.bays * s.bayWidthIn, h: s.depthIn })
/** Carton lanes: bays × levels × lanes per level. */
export const cartonLanes = (s) => s.bays * s.levels * s.lanesPerLevel

/** A new carton flow's fields (the library's placement). */
export function cartonNew(gridSize = 40) {
  const d = CARTON_DEFAULTS, { w, h } = cartonSizeIn(d)
  return { bays: d.bays, bayWidthIn: d.bayWidthIn, depthIn: d.depthIn, levels: d.levels, levelsOwn: true, lanesPerLevel: d.lanesPerLevel, pitchInPerFt: d.pitchInPerFt, frameHeightIn: d.frameHeightIn, width: (w / 12) * gridSize, height: (h / 12) * gridSize }
}

/** The object patch for an edit `p` — any of bays, bayWidthIn, depthIn, levels, lanesPerLevel, frameHeightIn — the size
 *  worked out again, the anchored corner held. */
export function cartonChange(o, p = {}, gridSize = 40, anchor = {}) {
  const s = cartonSpec(o, gridSize)
  const bays = p.bays != null ? int(p.bays, s.bays) : s.bays
  const bayWidthIn = p.bayWidthIn != null ? pos(p.bayWidthIn, s.bayWidthIn) : s.bayWidthIn
  const depthIn = p.depthIn != null ? pos(p.depthIn, s.depthIn) : s.depthIn
  const { w, h } = cartonSizeIn({ bays, bayWidthIn, depthIn })
  const w0 = (w / 12) * gridSize, h0 = (h / 12) * gridSize
  const width = Math.abs(w0 - o.width) < 1e-6 ? o.width : w0, height = Math.abs(h0 - o.height) < 1e-6 ? o.height : h0
  const out = { bays, bayWidthIn, depthIn, width, height }
  if (p.levels != null) { out.levels = int(p.levels, s.levels); out.levelsOwn = true }
  if (p.lanesPerLevel != null) out.lanesPerLevel = int(p.lanesPerLevel, s.lanesPerLevel)
  if (p.frameHeightIn != null) out.frameHeightIn = pos(p.frameHeightIn, s.frameHeightIn)
  if (Math.abs(width - o.width) > 1e-9 || Math.abs(height - o.height) > 1e-9) Object.assign(out, anchoredResize(o, { width, height }, anchor))
  return out
}

/** A drag on a resize handle: the end sides add or remove whole bays, the opposite end held; the depth sides nothing. */
export function cartonResize(o, handle, dx, dy, gridSize = 40) {
  const s = cartonSpec(o, gridSize), step = (s.bayWidthIn / 12) * gridSize
  let bays = s.bays
  if (handle.includes('l') || handle.includes('r')) bays = Math.max(1, s.bays + Math.round((handle.includes('r') ? dx : -dx) / step))
  if (bays === s.bays) return { width: o.width, height: o.height, x: o.x, y: o.y }
  const width = (bays * s.bayWidthIn / 12) * gridSize
  return { bays, bayWidthIn: s.bayWidthIn, width, height: o.height, x: handle.includes('l') ? o.x + o.width - width : o.x, y: o.y }
}

/** "K1 · 3 bays · 4 levels · 72 carton lanes". */
export function cartonHeadline(o, tag = '', gridSize = 40) {
  const s = cartonSpec(o, gridSize), pl = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`
  return [tag || null, pl(s.bays, 'bay'), pl(s.levels, 'level'), `${cartonLanes(s)} carton lane${cartonLanes(s) === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
}

const ftIn = (v) => { const t = Math.round(v), f = Math.floor(t / 12), i = t - f * 12; return f ? (i ? `${f} ft ${i} in` : `${f} ft`) : `${i} in` }
/** Its parts — a DRAFT, OFF (PP: dealer setups vary; behind racks/laneBom.js LANE_BOMS_PENDING_ON, as the lane BOMs):
 *  Upright frame (B + 1) by frame height × depth · Carton lane B × V × N by depth · Shelf beam B × V × 2 by bay width
 *  (B bays, V levels, N lanes per level). */
export function cartonParts(o, gridSize = 40) {
  const s = cartonSpec(o, gridSize), B = s.bays, V = s.levels, N = s.lanesPerLevel
  return [
    { part: 'Upright frame', size: `${ftIn(s.frameHeightIn)} × ${ftIn(s.depthIn)}`, qty: B + 1 },
    { part: 'Carton lane', size: ftIn(s.depthIn), qty: B * V * N },
    { part: 'Shelf beam', size: ftIn(s.bayWidthIn), qty: B * V * 2 },
  ]
}
