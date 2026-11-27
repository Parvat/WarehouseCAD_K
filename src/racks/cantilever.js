// cantilever.js — (r6-cantilever) the cantilever engine: its properties, size, card edits, resize handles, load spots and BOM.
// The drawing (render/rackOps.js rackCantileverOps / cantileverGeom), the X marks (markBoxes: one per arm bay) and the face
// check (generate/laneFaces.js facesOf: the arm side, both sides when double) read the same object and are not changed.
//
// THE OBJECT (inches; the drawing's own fields kept as they were):
//   towers           one entry per column, each the arm length (in) — the drawing reads it; columns = towers.length
//   doubleSided      Sides: Single (arms one way, the column line on the top edge) or Double (arms both ways)
//   spacingIn        column spacing, centre to centre (a new rack 96 = 8 ft)
//   armLevels        arm levels (3) · firstArmIn the first arm's height (12) · columnHeightIn (144 = 12 ft)
//   armType          'straight' | 'inclined' (Straight)
//   baseIn           the base length when typed; else arm length + 6 in (shown, editable)
//   spineDepthIn     the column line's depth on the plan (4), towerWidthIn (10), armThicknessIn (3) — drawing only
//
// THE SIZE (world px at `gridSize` px a foot): width = (columns − 1) × spacing (the drawing puts the first and last column
// centres on the box's ends); depth = sides × arm length + the column line (spineDepthIn).
//
// A CANTILEVER SAVED BEFORE keeps its size exactly: its spacing is read from its width ((width) / (columns − 1)), its arm
// from its towers, its sides from `doubleSided` (double when unset, as it has always drawn); the new fields read their
// defaults (3 levels, first arm 12 in, column 12 ft, Straight, base = arm + 6 in), none of which changes the footprint.
//
// CAPACITY: loads, not pallets — arm bays (columns − 1) × levels × sides "load spots", on the card only; never added to the
// layout's pallet positions (utils/capacity.js returns nothing for a cantilever, as before).
//
// THE BOM (per rack; C columns, V arm levels, S sides; PP's names):
//   Column   C              by column height
//   Arm      C × V × S      by arm length (and type)
//   Base     C              by base length; one base per column — a double-sided base spans both sides: 2 × base length
//   Brace    C − 1          by column spacing; one brace set per bay
//   Anchor   2 × C          2 per base (a question for PP)
// Pure.
import { anchoredResize } from '../utils/bayAnchor'

export const CANT_DEFAULTS = { doubleSided: false, columns: 4, spacingIn: 96, armIn: 48, armLevels: 3, firstArmIn: 12, columnHeightIn: 144, armType: 'straight', spineIn: 4, towerWidthIn: 10, armThicknessIn: 3, baseAddIn: 6 }
export const CANT_ARM_IN = [24, 36, 48, 60, 72], CANT_SPACING_IN = [48, 72, 96, 120], CANT_HEIGHT_IN = [96, 120, 144, 168, 192, 240]
export const ANCHORS_PER_BASE = 2
export const ARM_TYPES = [{ value: 'straight', label: 'Straight' }, { value: 'inclined', label: 'Inclined' }]

const r2 = (v) => Math.round(v * 100) / 100
const int = (v, d, min = 1) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min ? n : d }
const pos = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
const nonneg = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d)

/** Its properties (inches), its own or — a cantilever saved before — what it measures. */
export function cantSpec(o, gridSize = 40) {
  const d = CANT_DEFAULTS
  const towers = Array.isArray(o?.towers) && o.towers.length ? o.towers : [36, 36, 36, 36, 36]
  const columns = towers.length
  const wIn = ((o?.width || 0) / gridSize) * 12
  const spacingIn = o?.spacingIn > 0 ? o.spacingIn : (columns > 1 && wIn > 0 ? r2(wIn / (columns - 1)) : d.spacingIn)
  const armIn = Math.max(...towers.map(t => pos(t, 36)))
  const doubleSided = o?.doubleSided ?? true
  const sides = doubleSided ? 2 : 1
  const levels = int(o?.armLevels, d.armLevels)
  const firstArmIn = nonneg(o?.firstArmIn, d.firstArmIn)
  const columnHeightIn = pos(o?.columnHeightIn, d.columnHeightIn)
  const armType = o?.armType === 'inclined' ? 'inclined' : 'straight'
  const baseTyped = o?.baseIn > 0
  const baseIn = baseTyped ? o.baseIn : armIn + d.baseAddIn
  const spineIn = pos(o?.spineDepthIn, d.spineIn)
  return { columns, bays: Math.max(0, columns - 1), spacingIn, armIn, doubleSided, sides, levels, firstArmIn, columnHeightIn, armType, baseIn, baseTyped, spineIn }
}
/** The footprint of spec `s` (inches). */
export const cantSizeIn = (s) => ({ w: Math.max(0, s.columns - 1) * s.spacingIn, h: (s.doubleSided ? 2 : 1) * s.armIn + s.spineIn })
/** Load spots: arm bays × levels × sides. */
export const cantSpots = (s) => s.bays * s.levels * s.sides

/** A new cantilever's fields (the library's placement). */
export function cantNew(gridSize = 40) {
  const d = CANT_DEFAULTS
  const s = { columns: d.columns, spacingIn: d.spacingIn, armIn: d.armIn, doubleSided: d.doubleSided, spineIn: d.spineIn }
  const { w, h } = cantSizeIn(s)
  return {
    towers: Array(d.columns).fill(d.armIn), doubleSided: d.doubleSided, spacingIn: d.spacingIn, armLevels: d.armLevels,
    firstArmIn: d.firstArmIn, columnHeightIn: d.columnHeightIn, armType: d.armType,
    towerWidthIn: d.towerWidthIn, spineDepthIn: d.spineIn, armThicknessIn: d.armThicknessIn, activeTowerIdx: null,
    width: (w / 12) * gridSize, height: (h / 12) * gridSize,
  }
}

/** The object patch for an edit `p` — any of doubleSided, columns, spacingIn, armIn, levels, firstArmIn, columnHeightIn,
 *  armType, baseIn (null: back to arm + 6 in) — the size worked out again, the anchored corner held. A size that does
 *  not change is kept exactly as saved. */
export function cantChange(o, p = {}, gridSize = 40, anchor = {}) {
  const s = cantSpec(o, gridSize)
  const columns = p.columns != null ? Math.max(2, int(p.columns, s.columns)) : s.columns
  const spacingIn = p.spacingIn != null ? pos(p.spacingIn, s.spacingIn) : s.spacingIn
  const armIn = p.armIn != null ? pos(p.armIn, s.armIn) : s.armIn
  const doubleSided = p.doubleSided != null ? !!p.doubleSided : s.doubleSided
  const { w, h } = cantSizeIn({ columns, spacingIn, armIn, doubleSided, spineIn: s.spineIn })
  const w0 = (w / 12) * gridSize, h0 = (h / 12) * gridSize
  const width = Math.abs(w0 - o.width) < 1e-6 ? o.width : w0, height = Math.abs(h0 - o.height) < 1e-6 ? o.height : h0
  const same = columns === s.columns && armIn === s.armIn
  const out = { towers: same ? o.towers || Array(columns).fill(armIn) : Array(columns).fill(armIn), doubleSided, spacingIn, width, height }
  if (p.levels != null) out.armLevels = int(p.levels, s.levels)
  if (p.firstArmIn != null) out.firstArmIn = nonneg(p.firstArmIn, s.firstArmIn)
  if (p.columnHeightIn != null) out.columnHeightIn = pos(p.columnHeightIn, s.columnHeightIn)
  if (p.armType != null) out.armType = p.armType === 'inclined' ? 'inclined' : 'straight'
  if ('baseIn' in p) out.baseIn = p.baseIn == null ? undefined : pos(p.baseIn, s.baseIn)
  if (p.columns != null && columns !== s.columns) out.activeTowerIdx = null
  if (Math.abs(width - o.width) > 1e-9 || Math.abs(height - o.height) > 1e-9) Object.assign(out, anchoredResize(o, { width, height }, anchor))
  return out
}

/** A drag on a resize handle (local, unturned world px from the press): the end sides (ml / mr, a corner too) add or remove
 *  whole columns — one bay each, at its spacing — the opposite end held; the depth sides change nothing (the depth is the
 *  arms'). → the object patch, the size kept for nothing. */
export function cantResize(o, handle, dx, dy, gridSize = 40) {
  const s = cantSpec(o, gridSize), step = (s.spacingIn / 12) * gridSize
  let columns = s.columns
  if (handle.includes('l') || handle.includes('r')) {
    const dw = handle.includes('r') ? dx : -dx
    columns = Math.max(2, s.columns + Math.round(dw / step))
  }
  if (columns === s.columns) return { width: o.width, height: o.height, x: o.x, y: o.y }
  const width = (Math.max(0, columns - 1) * s.spacingIn / 12) * gridSize
  const x = handle.includes('l') ? o.x + o.width - width : o.x
  return { towers: Array(columns).fill(s.armIn), spacingIn: s.spacingIn, width, height: o.height, x, y: o.y, activeTowerIdx: null }
}

const ftIn = (v) => { const t = Math.round(v), f = Math.floor(t / 12), i = t - f * 12; return f ? (i ? `${f} ft ${i} in` : `${f} ft`) : `${i} in` }
/** One cantilever's parts: [{ part, size, qty }] (the formulas above). */
export function cantParts(o, gridSize = 40) {
  const s = cantSpec(o, gridSize), C = s.columns, V = s.levels, S = s.sides
  return [
    { part: 'Column', size: ftIn(s.columnHeightIn), qty: C },
    { part: 'Arm', size: `${ftIn(s.armIn)} · ${s.armType === 'inclined' ? 'Inclined' : 'Straight'}`, qty: C * V * S },
    { part: 'Base', size: ftIn(s.doubleSided ? 2 * s.baseIn : s.baseIn), qty: C },
    { part: 'Brace', size: ftIn(s.spacingIn), qty: Math.max(0, C - 1) },
    { part: 'Anchor', size: '', qty: ANCHORS_PER_BASE * C },
  ]
}

/** "C1 · 4 columns · 3 bays · 3 levels · single-sided". */
export function cantHeadline(o, tag = '', gridSize = 40) {
  const s = cantSpec(o, gridSize), pl = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`
  return [tag || null, pl(s.columns, 'column'), pl(s.bays, 'bay'), pl(s.levels, 'level'), s.doubleSided ? 'double-sided' : 'single-sided'].filter(Boolean).join(' · ')
}
