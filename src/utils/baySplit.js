// baySplit.js — deleting bays from a beam rack, the way it happens on a real
// floor: bays taken out of the MIDDLE of a run leave an empty gap with the
// uprights on both sides still standing, so the rack becomes separate
// pieces; bays taken off an END just shorten the rack. Every remaining bay
// keeps its exact drawn position, at any rotation.
//
// Pure (no store import): the store's deleteSingleBay / deleteSelectedBays
// call applyBayDeletes on their own immer draft, so a delete is still ONE
// history entry and one undo brings the original rack back.

import { uprightXs } from '../render/rackOps'
import { rackFootprint } from '../generate/columnCheck'

/** Runs of consecutive KEPT bay indices, e.g. 5 bays minus {2} -> [[0,1],[3,4]]. */
export function keptRuns(bayCount, removed) {
  const runs = []
  let cur = null
  for (let i = 0; i < bayCount; i++) {
    if (removed.has(i)) { cur = null; continue }
    if (!cur) runs.push(cur = [])
    cur.push(i)
  }
  return runs
}

/** The pieces a rack becomes when `removed` bays are deleted — one per run
 *  of kept bays, each drawn exactly where those bays already were. Each
 *  piece is its run's slice of the original's LOCAL box (from the upright
 *  before its first bay to the upright after its last — both uprights stay
 *  standing), carried to world about the ORIGINAL centre and stored centred
 *  on that same world point with the same rotation, so canvas2's spin about
 *  the piece's own centre draws it in place. The first piece keeps the
 *  original id; the others get `newId()`. Returns null if nothing would be
 *  left (every bay removed). */
export function splitRackForBayDelete(obj, removed, newId, gridSize = 40) {
  const set = removed instanceof Set ? removed : new Set(removed)
  const { xs, beams } = uprightXs(obj, gridSize)
  const runs = keptRuns(beams.length, set)
  if (!runs.length) return null
  const upIn = obj.uprightWidth || 3
  const t = ((obj.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const clean = (v) => (Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-9 ? Math.round(v * 1e6) / 1e6 : v)
  return runs.map((run, k) => {
    const pieceBeams = run.map(i => beams[i])
    const width = ((upIn * (pieceBeams.length + 1) + pieceBeams.reduce((a, b) => a + b, 0)) / 12) * gridSize
    // the run's slice of the original local box, centred at (lx, ly)
    const lx = xs[run[0]] + width / 2 - cx, ly = 0
    const wx = cx + lx * c - ly * s, wy = cy + lx * s + ly * c
    return {
      ...obj,
      id: k === 0 ? obj.id : newId(),
      beams: pieceBeams,
      width,
      x: clean(wx - width / 2),
      y: clean(wy - obj.height / 2),
      activeBayIdx: null,
    }
  })
}

/** Do two racks face each other across an aisle — a positive gap on one
 *  axis and a shared stretch on the other (the same test aisleRect uses)? */
function facing(a, b) {
  const f1 = rackFootprint(a), f2 = rackFootprint(b)
  const gapY = Math.max(f2.y - (f1.y + f1.h), f1.y - (f2.y + f2.h))
  const gapX = Math.max(f2.x - (f1.x + f1.w), f1.x - (f2.x + f2.w))
  const overX = Math.min(f1.x + f1.w, f2.x + f2.w) - Math.max(f1.x, f2.x)
  const overY = Math.min(f1.y + f1.h, f2.y + f2.h) - Math.max(f1.y, f2.y)
  return gapY >= gapX ? gapY > 0 && overX > 0 : gapX > 0 && overY > 0
}

/** Apply bay deletes to a store state (or immer draft) in place.
 *  `byObj`: { rackId: [bayIdx, ...] }. For each rack: split it into its
 *  kept runs (skipped if that would remove every bay). Then keep everything
 *  that pointed at a split rack attached to the right piece:
 *   - parentId (the building) — every piece copies it from the original;
 *   - groups — every piece joins every group the original was in;
 *   - aisles (row1Id/row2Id) — an aisle is rebuilt for every pair of
 *     pieces (or unsplit racks) on its two sides that still face each other
 *     across it; the first pair keeps the original aisle's id and label,
 *     the rest are copies with new ids. An aisle whose sides no longer face
 *     at all stays on the first pieces (it draws nothing until they do). */
export function applyBayDeletes(s, byObj, newId, gridSize = 40) {
  const pieces = new Map()   // original id -> [piece, ...]
  for (const [objId, idxs] of Object.entries(byObj)) {
    const i = s.objects.findIndex(o => o.id === objId)
    if (i === -1) continue
    const obj = s.objects[i]
    if (!Array.isArray(obj.beams) || obj.beams.length <= 1) continue
    const split = splitRackForBayDelete(obj, new Set(idxs), newId, gridSize)
    if (!split) continue   // don't remove all bays
    pieces.set(objId, split)
  }
  if (!pieces.size) return pieces

  // replace each split rack with its pieces, in place (keeps draw order)
  const next = []
  for (const o of s.objects) {
    if (pieces.has(o.id)) next.push(...pieces.get(o.id).map(p => ({ ...p })))
    else next.push(o)
  }
  s.objects.splice(0, s.objects.length, ...next)

  // groups: every piece joins its original's groups
  if (Array.isArray(s.groups)) {
    for (const g of s.groups) {
      const add = []
      for (const id of g.ids) if (pieces.has(id)) add.push(...pieces.get(id).slice(1).map(p => p.id))
      if (add.length) g.ids.push(...add)
    }
  }

  // aisles: re-pair each affected aisle with the pieces that now face across it
  const byId = new Map(s.objects.map(o => [o.id, o]))
  const sideOf = (id) => (pieces.has(id) ? pieces.get(id).map(p => byId.get(p.id)) : [byId.get(id)].filter(Boolean))
  const out = []
  for (const o of s.objects) {
    if (o.type !== 'aisle' || !(pieces.has(o.row1Id) || pieces.has(o.row2Id))) { out.push(o); continue }
    const pairs = []
    for (const a of sideOf(o.row1Id)) for (const b of sideOf(o.row2Id)) if (facing(a, b)) pairs.push([a.id, b.id])
    if (!pairs.length) pairs.push([sideOf(o.row1Id)[0]?.id ?? o.row1Id, sideOf(o.row2Id)[0]?.id ?? o.row2Id])
    pairs.forEach(([r1, r2], k) => out.push(k === 0 ? Object.assign(o, { row1Id: r1, row2Id: r2 }) : { ...o, id: newId(), row1Id: r1, row2Id: r2 }))
  }
  s.objects.splice(0, s.objects.length, ...out)
  return pieces
}
