// canvas2/inlineSnap.js
// ─────────────────────────────────────────────────────────────────────────────
// Racks in one line: a dragged rack snaps end to end onto another rack in its
// line (same orientation, lined up across), the two SHARING the upright where
// they meet; on the drop it never stays overlapping a rack in its line (it
// settles at that rack's nearest free end); and a single dragged rack that
// ends up sharing an end upright with a rack that matches it in every respect
// that makes them one rack is joined into it — one rack, its bays in order.
//
// The SVG engine had end snapping (utils/warehouseSnap.js findEndSnap) but it
// is not wired into canvas2, reads the unturned box with a fixed x axis (a
// vertical rack snapped on the wrong axis), meets edge to edge (two uprights,
// not one shared) and has no overlap rule or join — so this is written fresh,
// on the shared-frame rule the code already has (utils/bayBeam.js sharesFrame:
// ends overlapping by exactly one upright).
//
// Pure geometry plus one store write (applyInlineDrop); the mousemove snap and
// the drop are wired in useCanvasInteraction.js.
// ─────────────────────────────────────────────────────────────────────────────

import { rackFootprint } from '../generate/columnCheck'
import { sharesFrame, beamsUpdate } from '../utils/bayBeam'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6

/** A rack with bays (a single or a back-to-back pair), drawn. */
export const isBeamRack = (o) => BEAM.has(o?.type) && Array.isArray(o.beams) && o.beams.length > 0 && o.width > 0
const turn180 = (o) => ((((o.rotation || 0) % 180) + 180) % 180)
const turn360 = (o) => ((((o.rotation || 0) % 360) + 360) % 360)

/** A rack's run (along its length) and its extent across, in world px. */
export function lineOf(o) {
  const f = rackFootprint(o), vert = !!f.rotated
  return { vert, r0: vert ? f.y : f.x, r1: vert ? f.y + f.h : f.x + f.w, s0: vert ? f.x : f.y, s1: vert ? f.x + f.w : f.y + f.h }
}

/** Two racks in one line's orientation: both with bays, turned the same way (0° or 90°, either end). */
const sameLine = (a, b) => isBeamRack(a) && isBeamRack(b) && turn180(a) % 90 === 0 && turn180(a) === turn180(b)
/** The upright two racks share where they meet (the wider of the two). */
const upPx = (a, b, gridSize) => ((Math.max(a.uprightWidth || 3, b.uprightWidth || 3)) / 12) * gridSize

/** In-line snap while dragging: `moved` is the grabbed rack where the drag has it now. When one of its
 *  ends comes within `reach` of an end of another rack in its line — the two lined up across within
 *  `reach` too — the nudge { ddx, ddy } that puts them end to end on one shared upright and lined up
 *  across, with a guide line on that upright; else null. The nearest such end wins. */
export function inlineSnap(moved, others, gridSize, reach) {
  if (!isBeamRack(moved)) return null
  const m = lineOf(moved), mc = (m.s0 + m.s1) / 2
  let best = null
  for (const o of others) {
    if (o.id === moved.id || !sameLine(moved, o)) continue
    const q = lineOf(o), dAcross = (q.s0 + q.s1) / 2 - mc
    if (Math.abs(dAcross) > reach + EPS) continue
    const up = upPx(moved, o, gridSize)
    // its start near the other's far end, or its far end near the other's start (measured end to end),
    // put onto that end's upright, shared
    for (const [from, end, to, upright] of [[m.r0, q.r1, q.r1 - up, q.r1 - up / 2], [m.r1, q.r0, q.r0 + up, q.r0 + up / 2]]) {
      if (Math.abs(end - from) > reach + EPS) continue
      const dAlong = to - from
      const d = Math.hypot(end - from, dAcross)
      if (!best || d < best.d) best = { d, dAlong, dAcross, upright, s0: Math.min(m.s0 + dAcross, q.s0), s1: Math.max(m.s1 + dAcross, q.s1) }
    }
  }
  if (!best) return null
  return {
    ddx: m.vert ? best.dAcross : best.dAlong,
    ddy: m.vert ? best.dAlong : best.dAcross,
    guide: { axis: m.vert ? 'y' : 'x', val: best.upright, from: best.s0 - 20, to: best.s1 + 20, isWall: false },
  }
}

/** Whether `moved` overlaps a rack in its line (across at all, along by more than a shared upright). */
const clashesIn = (line, moved, gridSize) => (r0, r1) =>
  line.some(({ o, q }) => Math.min(q.r1, r1) - Math.max(q.r0, r0) > upPx(moved, o, gridSize) + EPS)

/** No overlap in a line: where `moved` (at its drop) overlaps a rack in its line, the shift along its
 *  run to the nearest free end of a rack there — ending on that rack's first upright or starting on
 *  its last, clear of every rack in the line. { dAlong } (0 when it overlaps nothing), or null when no
 *  end is free. */
export function settleAlong(moved, others, gridSize) {
  if (!isBeamRack(moved)) return { dAlong: 0 }
  const m = lineOf(moved), L = m.r1 - m.r0
  const line = others.filter(o => o.id !== moved.id && sameLine(moved, o)).map(o => ({ o, q: lineOf(o) }))
    .filter(({ q }) => Math.min(q.s1, m.s1) - Math.max(q.s0, m.s0) > EPS)
  const clashes = clashesIn(line, moved, gridSize)
  if (!clashes(m.r0, m.r1)) return { dAlong: 0 }
  let best = null
  for (const { o, q } of line) {
    const up = upPx(moved, o, gridSize)
    for (const r0 of [q.r0 + up - L, q.r1 - up]) {
      if (clashes(r0, r0 + L)) continue
      const d = r0 - m.r0
      if (best == null || Math.abs(d) < Math.abs(best) - EPS) best = d
    }
  }
  return best == null ? null : { dAlong: best }
}

/** The join condition: two racks end to end on one shared upright that are the same in every respect
 *  that makes them one rack — type, depth (and flue), levels, upright, pallet, turned the same way
 *  (bays count from the same end), in the same building, layer and racking area, with the same row and
 *  section stamps. Anything else only snaps. */
const SAME = ['type', 'depthIn', 'levels', 'uprightWidth', 'palletWIn', 'palletDIn', 'parentId', 'layerId', 'areaId', 'rowIndex', 'genSection']
export function canJoin(a, b, gridSize) {
  if (!sameLine(a, b) || turn360(a) !== turn360(b)) return false
  if (Math.abs(a.height - b.height) > EPS) return false
  if (a.type === 'rack_double_row' && (a.flueSpaceIn ?? null) !== (b.flueSpaceIn ?? null)) return false
  if (!SAME.every(k => (a[k] ?? null) === (b[k] ?? null))) return false
  return sharesFrame(a, b, gridSize)
}

/** The two joined: one rack with the stationary rack's id and fields, its bays the first rack's then the
 *  second's (in the rack's own run direction), starting where the first starts. Its geometry is new, so
 *  everything cached per rack (the column check) is worked out again for it. */
export function joinRacks(stationary, moved, gridSize) {
  const t = ((stationary.rotation || 0) * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t)
  const along = (o) => (o.x + o.width / 2) * ux + (o.y + o.height / 2) * uy
  const first = along(moved) < along(stationary) ? moved : stationary
  const second = first === moved ? stationary : moved
  const base = { ...stationary, x: first.x, y: first.y, width: first.width, height: first.height }
  const out = { ...base, ...beamsUpdate(base, [...first.beams, ...second.beams], gridSize), activeBayIdx: null }
  // the stamp of where it was generated follows its start
  if (stationary.genRunFt != null) {
    const r = (o) => lineOf(o).r0
    out.genRunFt = stationary.genRunFt + (r(out) - r(stationary)) / gridSize
  }
  return out
}

/** The drop of a drag: the moved set (`ids`, grabbed by `grabbedId`) by (dx, dy). The grabbed rack
 *  settles off any rack it overlaps in its line, the whole set by the same shift; none of the set may
 *  then overlap a rack in its line, or the drag goes back (null). A single dragged rack sharing an end
 *  upright with a rack it can join is joined into it. Returns { dx, dy, join: { keep, drop, merged } | null }. */
export function planInlineDrop(objects, ids, grabbedId, dx, dy, gridSize) {
  const moving = new Set(ids)
  const grabbed = objects.find(o => o.id === grabbedId)
  if (!isBeamRack(grabbed)) return { dx, dy, join: null }
  const at = (o, ddx, ddy) => ({ ...o, x: o.x + ddx, y: o.y + ddy })
  const others = objects.filter(o => !moving.has(o.id))
  const s = settleAlong(at(grabbed, dx, dy), others, gridSize)
  if (!s) return null
  const vert = lineOf(grabbed).vert
  const ndx = dx + (vert ? 0 : s.dAlong), ndy = dy + (vert ? s.dAlong : 0)
  for (const id of ids) {
    const o = objects.find(x => x.id === id)
    if (!isBeamRack(o)) continue
    const r = settleAlong(at(o, ndx, ndy), others, gridSize)
    if (!r || Math.abs(r.dAlong) > EPS) return null
  }
  let join = null
  if (ids.length === 1) {
    const final = at(grabbed, ndx, ndy)
    const mate = others.find(o => canJoin(final, o, gridSize))
    if (mate) join = { keep: mate.id, drop: grabbed.id, merged: joinRacks(mate, final, gridSize) }
  }
  return { dx: ndx, dy: ndy, join }
}

/** Write a join as ONE history entry: the dragged rack gone, the stationary one replaced by the joined
 *  rack, the aisles rebuilt, the joined rack selected. Not a bay edit — the copy-to-sections watcher
 *  skips it (`skipNextAction`), as it does a racking area's refit. `rebuildAisles` and `skipNextAction`
 *  are passed in so this stays free of the store's own modules. */
export function applyJoin(store, join, { rebuildAisles, skipNextAction, newId }) {
  const objects = store.getState().objects.filter(o => o.id !== join.drop).map(o => (o.id === join.keep ? join.merged : o))
  skipNextAction?.()
  store.setState({ objects: rebuildAisles ? rebuildAisles(objects, newId).objects : objects, selectedIds: [join.keep] })
  store.getState().commitObjectUpdate(join.keep, {})
}
