// laneEngine.js — (r3-drive-in) the one lane-rack engine: drive-in, drive-through (R3), push-back (R4), pallet flow
// (R5). A lane rack is `lanes` lanes side by side, each `deep` pallets deep, `levels` high. Everything about its size,
// its card, its resize handles and its BOM is worked out here from the object; the drawing (render/rackOps.js laneOps),
// the positions (utils/capacity.js: lanes × deep × levels) and the face check (generate/laneFaces.js) read the same
// object, unchanged.
//
// THE SIZE (inches, then world px at `gridSize` px per foot):
//   lane width   = pallet width + 2 × lane clearance                  (40 + 2 × 3 = 46 by default)
//   width        = lanes × lane width + (lanes + 1) × post            (the posts between and outside the lanes)
//   depth station = pallet depth + 4                                  (48 + 4 = 52 by default)
//   depth        = deep × depth station
//   overall height = first rail (beam) height + levels × level spacing, unless typed (`heightIn`)
//
// A RACK SAVED BEFORE this engine keeps its size exactly: a field it does not carry is read from what it measures —
// its lane clearance from its width, its depth station from its depth (old racks: the pallet depth, no + 4), its post
// from `uprightWidth` (4 in, the old default). Nothing is resized on load; only an edit writes the new fields.
//
// Every edit goes through `laneChange` (a field patch → the whole object patch, the size worked out again, the anchored
// corner held where it is drawn — utils/bayAnchor.js) and `laneResize` (a drag on a lane-side or depth-side handle →
// whole lanes / whole stations). Pure.
import { anchoredResize } from '../utils/bayAnchor'

export const LANE_ENGINE_TYPES = new Set(['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])
export const isLaneEngine = (o) => !!o && LANE_ENGINE_TYPES.has(o.type)

/** Each type's defaults (a new rack) — inches. `stationAddIn`: the depth station over the pallet depth. */
const BASE = { palletWIn: 40, palletDIn: 48, clearIn: 3, stationAddIn: 4, postIn: 3, spacingIn: 60 }
export const LANE_DEFAULTS = {
  rack_drive_in:      { ...BASE, lanes: 4, deep: 5, levels: 4, firstIn: 8, floorGuides: true },
  rack_drive_through: { ...BASE, lanes: 4, deep: 5, levels: 4, firstIn: 8, floorGuides: true },
  rack_pushback:      { ...BASE, lanes: 3, deep: 4, levels: 3, firstIn: 0, newFirstIn: 8, minDeep: 2, maxDeep: 6 },   // (lane-fixes) a new one: first beam 8 in, rails on it; a saved one without the field reads 0
  rack_pallet_flow:   { ...BASE, lanes: 3, deep: 4, levels: 3, firstIn: 0, pitchInPerFt: 0.375 },
}
/** Each type's name in words (the card, the BOM). */
export const LANE_NAMES = { rack_drive_in: 'Drive-in', rack_drive_through: 'Drive-through', rack_pushback: 'Push-back', rack_pallet_flow: 'Pallet flow' }

const r2 = (v) => Math.round(v * 100) / 100
const int = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? n : d }
const pos = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
const nonneg = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d)

/** The rack's properties (inches), its own or — a rack saved before — what it measures. */
export function laneSpec(o, gridSize = 40) {
  const d = LANE_DEFAULTS[o?.type] || LANE_DEFAULTS.rack_drive_in
  const lanes = int(o.lanes, 2), deep = int(o.palletDeep, d.deep)
  const postIn = pos(o.uprightWidth, 4), palletWIn = pos(o.palletWIn, 40), palletDIn = pos(o.palletDIn, 48)
  const wIn = ((o.width || 0) / gridSize) * 12, hIn = ((o.height || 0) / gridSize) * 12
  const clearIn = o.clearIn != null ? nonneg(o.clearIn, d.clearIn) : Math.max(0, r2(((wIn - (lanes + 1) * postIn) / lanes - palletWIn) / 2))
  const stationIn = o.stationIn != null ? pos(o.stationIn, palletDIn + d.stationAddIn) : (hIn > 0 ? r2(hIn / deep) : palletDIn + d.stationAddIn)
  const levels = int(o.levels, 1)
  const firstIn = nonneg(o.firstIn, d.firstIn), spacingIn = pos(o.spacingIn, d.spacingIn)
  const heightIn = o.heightIn != null ? pos(o.heightIn, firstIn + levels * spacingIn) : firstIn + levels * spacingIn
  return {
    type: o.type, lanes, deep, levels, palletWIn, palletDIn, clearIn, stationIn, postIn, firstIn, spacingIn, heightIn,
    heightTyped: o.heightIn != null, laneWIn: palletWIn + 2 * clearIn,
    floorGuides: o.floorGuides ?? !!d.floorGuides, pitchInPerFt: o.pitchInPerFt ?? d.pitchInPerFt ?? null,
  }
}
/** The footprint of spec `s` (inches). */
export const laneSizeIn = (s) => ({ w: s.lanes * (s.palletWIn + 2 * s.clearIn) + (s.lanes + 1) * s.postIn, h: s.deep * s.stationIn })

/** A new rack's fields (the library's placement): the type's defaults, its size. */
export function laneNew(type, gridSize = 40) {
  const d = LANE_DEFAULTS[type]
  const s = { lanes: d.lanes, deep: d.deep, palletWIn: d.palletWIn, palletDIn: d.palletDIn, clearIn: d.clearIn, stationIn: d.palletDIn + d.stationAddIn, postIn: d.postIn }
  const { w, h } = laneSizeIn(s)
  return {
    lanes: d.lanes, palletDeep: d.deep, levels: d.levels, levelsOwn: true, palletWIn: d.palletWIn, palletDIn: d.palletDIn,
    clearIn: d.clearIn, stationIn: s.stationIn, uprightWidth: d.postIn, firstIn: d.newFirstIn ?? d.firstIn, spacingIn: d.spacingIn,
    ...(d.floorGuides ? { floorGuides: true } : {}), ...(d.pitchInPerFt ? { pitchInPerFt: d.pitchInPerFt } : {}),
    width: (w / 12) * gridSize, height: (h / 12) * gridSize,
  }
}

/** The object patch for an edit `p` — any of lanes, deep, levels, palletWIn, palletDIn, clearIn, postIn, firstIn,
 *  spacingIn, heightIn (null: back to first + levels × spacing), floorGuides, type — with the size worked out again and
 *  the anchored corner (`anchor`, bayAnchor's: the start corner by default) held where it is drawn. A pallet depth
 *  changed: the depth station is the pallet depth + 4. Push-back: deep kept within 2 to 6. */
export function laneChange(o, p = {}, gridSize = 40, anchor = {}) {
  const type = p.type || o.type, d = LANE_DEFAULTS[type] || LANE_DEFAULTS.rack_drive_in
  const s = laneSpec(o, gridSize)
  const lanes = p.lanes != null ? int(p.lanes, s.lanes) : s.lanes
  let deep = p.deep != null ? int(p.deep, s.deep) : s.deep
  if (d.minDeep) deep = Math.max(d.minDeep, deep)
  if (d.maxDeep) deep = Math.min(d.maxDeep, deep)
  const palletWIn = p.palletWIn != null ? pos(p.palletWIn, s.palletWIn) : s.palletWIn
  const palletDIn = p.palletDIn != null ? pos(p.palletDIn, s.palletDIn) : s.palletDIn
  const stationIn = p.palletDIn != null ? palletDIn + d.stationAddIn : s.stationIn
  const clearIn = p.clearIn != null ? nonneg(p.clearIn, s.clearIn) : s.clearIn
  const postIn = p.postIn != null ? pos(p.postIn, s.postIn) : s.postIn
  const { w, h } = laneSizeIn({ lanes, deep, palletWIn, clearIn, postIn, stationIn })
  // a size that has not changed is kept exactly as saved (no float drift on a rack saved before)
  const w0 = (w / 12) * gridSize, h0 = (h / 12) * gridSize
  const width = Math.abs(w0 - o.width) < 1e-6 ? o.width : w0, height = Math.abs(h0 - o.height) < 1e-6 ? o.height : h0
  const out = { lanes, palletDeep: deep, palletWIn, palletDIn, clearIn, stationIn, uprightWidth: postIn, width, height }
  if (p.type && p.type !== o.type) out.type = p.type
  if (p.levels != null) { out.levels = int(p.levels, s.levels); out.levelsOwn = true }
  if (p.firstIn != null) out.firstIn = nonneg(p.firstIn, s.firstIn)
  if (p.spacingIn != null) out.spacingIn = pos(p.spacingIn, s.spacingIn)
  if ('heightIn' in p) out.heightIn = p.heightIn == null ? undefined : pos(p.heightIn, s.heightIn)
  if (p.floorGuides != null) out.floorGuides = !!p.floorGuides
  if (Math.abs(width - o.width) > 1e-9 || Math.abs(height - o.height) > 1e-9) Object.assign(out, anchoredResize(o, { width, height }, anchor))
  return out
}

/** A drag on a resize handle (`handle`: tl tc tr ml mr bl bc br; `dx`, `dy` local, unturned, world px from the press):
 *  the lane side (ml / mr) adds or removes whole lanes, the depth side (tc / bc) whole depth stations, a corner both —
 *  the opposite side held. → the object patch (lanes, palletDeep, width, height, x, y), {} for nothing. */
export function laneResize(o, handle, dx, dy, gridSize = 40) {
  const s = laneSpec(o, gridSize), px = (inch) => (inch / 12) * gridSize
  const laneStep = px(s.laneWIn + s.postIn), deepStep = px(s.stationIn)
  let lanes = s.lanes, deep = s.deep
  if (handle.includes('l') || handle.includes('r')) {
    const right = handle.includes('r'), dw = right ? dx : -dx
    lanes = Math.max(1, s.lanes + Math.round(dw / laneStep))
  }
  if (handle[0] === 't' || handle[0] === 'b') {
    const down = handle[0] === 'b', dh = down ? dy : -dy
    deep = Math.max(1, s.deep + Math.round(dh / deepStep))
  }
  const d = LANE_DEFAULTS[o.type]
  if (d?.minDeep) deep = Math.max(d.minDeep, deep)
  if (d?.maxDeep) deep = Math.min(d.maxDeep, deep)
  if (lanes === s.lanes && deep === s.deep) return { lanes: s.lanes, palletDeep: s.deep, width: o.width, height: o.height, x: o.x, y: o.y }
  const { w, h } = laneSizeIn({ ...s, lanes, deep })
  const width = px(w), height = px(h)
  // unturned: the caller (useCanvasInteraction) turns the held corner back for a rotated rack
  const x = handle.includes('l') ? o.x + o.width - width : o.x
  const y = handle[0] === 't' ? o.y + o.height - height : o.y
  return { lanes, palletDeep: deep, width, height, x, y }
}

/** The types the engine runs today — its card, resize handles, placement defaults and BOM section (R3: drive-in and
 *  drive-through; R4 adds push-back, R5 pallet flow). The others keep their earlier card until their round. */
export const LANE_ENGINE_ON = new Set(['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])   // (r4-push-back) + push-back; (r5-pallet-flow) + pallet flow
export const laneEngineOn = (o) => !!o && LANE_ENGINE_ON.has(o.type)
