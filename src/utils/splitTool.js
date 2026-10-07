// splitTool.js — the Split tool (the drawing toolbar, next to Row group): cut a rack in two at an upright.
//
//   - Hovering a rack shows the cut line at its nearest interior upright (useSplit.hover, SplitPreview.jsx).
//   - A click cuts it there: all the bays on each side stay together, one rack each. The cut upright is
//     shared — one rack ends on it, the next starts on it, the end-to-end shared frame the in-line snap's
//     join needs (bayBeam.sharesFrame) — so nothing moves, no bay is lost, and the drawing, Check layout
//     (a shared end frame is no overlap) and the bay ledger's counts are what they were. The tool goes
//     back to Select.
//   - The piece on the cursor's side of the line then follows the mouse, held where it was grabbed
//     (utils/placement.js, as a paste does) until a click places it; Esc leaves it where it was, its own
//     rack. While it follows, live distances show where it would land (placementDistances, drawn at
//     screen size): the gap to the rack it was cut from, and to the nearest rack or wall in each
//     direction. After the drop, either way, NOTHING is selected, so no tag is left on the piece or at the
//     cut. Nothing is committed until then: the cut and the placement are ONE history entry.
//   - Both pieces keep the original's fields and its row / section stamps (the same row, the same Row
//     group row — the row-edit keeper is told to keep the moved piece's: keepStampsOnce); the piece that
//     stays keeps the id, the other carries `pieceOf` and `splitOf` (the original rack's id, kept through
//     further splits: no label is drawn in the gap between a split family's racks — crossAisles.js);
//     `genRunFt` follows each one's start. The Row group
//     passes the action over (skipNextAction). A piece dragged straight back onto the shared upright joins
//     again (the in-line snap).
//   - In a Row group (groupCuts): when the cut rack's row is in the group, every other group row is cut
//     at the same position along the run — the rack spanning it, at an interior upright within ½" (the
//     replay's own rule) — and its piece on the same side follows too. A row whose racks already meet at
//     that upright is not cut: its rack on that side moves with the others. A row with a rack there but
//     no upright within ½" is skipped, with the offset; a row with no rack there is left alone. All of it
//     happens at the first click, in Ask and Auto apply alike (the pieces must move together): one
//     placement, one click places them all by the same move, Esc puts them all back, ONE history entry.
//     The live distances are the piece under the cursor's. The bar reports it: "Split 3 rows · 1 moved
//     without a cut · 1 skipped", the skipped rows listed.

import { create } from 'zustand'
import { geom, uprightsOf, withRun, isRowRack, rowsOf, rowOfRack, resolveKey, UP_TOL_FT, fmtIn } from './rowGroup'
import { startPlacement } from './placement'
import { skipNextAction, useRowGroup } from './rowGroupTool'
import { keepStampsOnce } from './rowEditKeeper'
import { TOOLS } from '../constants'

export const SPLIT_TOOL = 'split'

/** The hovered cut: { rackId, k, at, line: [x1, y1, x2, y2], side } or null. */
export const useSplit = create(() => ({ hover: null }))

/** Where `rack` would be cut for the pointer at `world`: its interior upright nearest the pointer —
 *  { k (the upright's index in run order, 1..bays-1), at (its centre along the run, world px),
 *    line (across the rack at that centre), side ('first' / 'second': the pointer's side along the run) },
 *  or null (not a rack with bays, or a single bay: nothing to cut). */
export function cutOf(rack, world, gridSize = 40) {
  if (!isRowRack(rack) || rack.beams.length < 2) return null
  const g = geom(rack), up = ((rack.uprightWidth || 3) / 12) * gridSize
  const ups = uprightsOf(g.r0, g.beams, up, gridSize)
  const along = g.vert ? world.y : world.x
  let k = 1
  for (let i = 2; i < ups.length - 1; i++) if (Math.abs(ups[i] + up / 2 - along) < Math.abs(ups[k] + up / 2 - along)) k = i
  const at = ups[k] + up / 2
  return { k, at, line: g.vert ? [g.s0, at, g.s1, at] : [at, g.s0, at, g.s1], side: along < at ? 'first' : 'second' }
}

/** `rack` cut at upright `k` (run order): [first, second] along the run, sharing that upright. The one
 *  named by `keep` keeps the id; the other gets a new id, `pieceOf` and `splitOf` (the original rack). */
export function cutRack(rack, k, gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12), keep = 'first') {
  const g = geom(rack), up = ((rack.uprightWidth || 3) / 12) * gridSize
  const ups = uprightsOf(g.r0, g.beams, up, gridSize)
  const root = rack.pieceOf || rack.id
  const piece = (s, e, own) => {
    const out = withRun(own ? rack : { ...rack, id: newId(), pieceOf: root, splitOf: rack.splitOf || rack.id }, ups[s], g.beams.slice(s, e), gridSize)
    if (rack.genRunFt != null) out.genRunFt = rack.genRunFt + (ups[s] - ups[0]) / gridSize
    return out
  }
  return [piece(0, k, keep === 'first'), piece(k, g.beams.length, keep === 'second')]
}

const upPx = (o, gridSize) => ((o.uprightWidth || 3) / 12) * gridSize
/** A rack's upright centres along the run (world px), in run order. */
const centres = (o, gridSize) => { const g = geom(o), up = upPx(o, gridSize); return uprightsOf(g.r0, g.beams, up, gridSize).map(u => u + up / 2) }

/** What a cut of `rack` (`c` from cutOf) does to the OTHER rows of the Row group (`keys`), or null when the
 *  rack's row is not in the group: { cuts: [{ rack, k }] (k: the interior upright, run order), moves: [rack]
 *  (racks already meeting there, on the moving side: they move uncut), skipped: [{ key, reason }], rowsCut }. */
export function groupCuts(objects, rack, c, keys, gridSize = 40) {
  if (!keys || !keys.length) return null
  const rows = rowsOf(objects, gridSize), src = rowOfRack(rows, rack.id)
  if (!src || !keys.some(k => resolveKey(rows, k) === src)) return null
  const tol = UP_TOL_FT * gridSize, vert = geom(rack).vert, first = c.side === 'first'
  const byId = new Map(objects.map(o => [o.id, o]))
  const out = { cuts: [], moves: [], skipped: [], rowsCut: 0 }, seen = new Set([src])
  for (const key of keys) {
    const rk = resolveKey(rows, key)
    if (!rk || seen.has(rk)) continue
    seen.add(rk)
    const racks = rows.get(rk).ids.map(id => byId.get(id)).filter(o => isRowRack(o) && geom(o).vert === vert)
    // racks the cut position falls inside (past their end uprights)
    const spanning = racks.filter(o => { const cs = centres(o, gridSize); return cs[0] + tol < c.at && c.at < cs[cs.length - 1] - tol })
    if (spanning.length) {
      const hits = spanning.map(o => ({ rack: o, k: centres(o, gridSize).findIndex(u => Math.abs(u - c.at) <= tol) }))
      if (hits.every(h => h.k > 0)) { out.cuts.push(...hits); out.rowsCut++; continue }
      let off = Infinity
      for (const o of spanning) for (const u of centres(o, gridSize)) off = Math.min(off, Math.abs(u - c.at))
      out.skipped.push({ key: rk, reason: `uprights don't line up (${fmtIn(off / gridSize * 12)} off)` })
      continue
    }
    // racks already meeting at that upright: the one on the moving side moves, uncut
    const mover = racks.find(o => { const cs = centres(o, gridSize); return Math.abs((first ? cs[cs.length - 1] : cs[0]) - c.at) <= tol })
    if (!mover) continue
    const gm = geom(mover), up = upPx(mover, gridSize)
    const meets = racks.some(o => {
      if (o === mover) return false
      const g = geom(o)
      return first ? g.r0 >= gm.r1 - up - tol && g.r0 <= gm.r1 + tol : g.r1 <= gm.r0 + up + tol && g.r1 >= gm.r0 - tol
    })
    if (meets) out.moves.push(mover)
  }
  return out
}

/** The pointer moved over `hitId` (or nothing) with the Split tool. */
export function hoverSplit(objects, world, hitId, gridSize = 40) {
  const rack = hitId ? objects.find(o => o.id === hitId) : null
  const c = rack ? cutOf(rack, world, gridSize) : null
  const prev = useSplit.getState().hover
  const next = c ? { rackId: rack.id, ...c } : null
  if (prev === next || (prev && next && prev.rackId === next.rackId && prev.k === next.k && prev.side === next.side && prev.line.every((v, i) => v === next.line[i]))) return
  if (next) next.group = groupHover(objects, rack, c, gridSize)
  useSplit.setState({ hover: next })
}

/** What the hover shows on the other group rows: { cuts: [{ rackId, k, line, side }], moves: [rackId], skipped: [rackId] }. */
function groupHover(objects, rack, c, gridSize) {
  const g = groupCuts(objects, rack, c, useRowGroup.getState().keys, gridSize)
  if (!g) return null
  const rows = rowsOf(objects, gridSize), byId = new Map(objects.map(o => [o.id, o]))
  return {
    cuts: g.cuts.map(({ rack: o, k }) => { const t = cutOf(o, geom(o).vert ? { x: 0, y: c.at } : { x: c.at, y: 0 }, gridSize); return { rackId: o.id, k, line: t.line, at: t.at, side: c.side } }),
    moves: g.moves.map(o => o.id),
    skipped: g.skipped.flatMap(sk => (rows.get(sk.key)?.ids || []).filter(id => byId.has(id))),
  }
}

/** The Split tool's click on `rackId` at `world`: the rack cut — and, when its row is in the Row group, every
 *  other group row that lines up (groupCuts) — the pieces on the cursor's side following the mouse together.
 *  Returns true when it cut. `rebuildAisles` re-pairs the aisles when Esc puts the pieces back. */
export function splitAt(store, world, rackId, { newId, rebuildAisles } = {}) {
  const st = store.getState(), gridSize = st.gridSize || 40
  const rack = st.objects.find(o => o.id === rackId)
  const c = rack ? cutOf(rack, world, gridSize) : null
  useSplit.setState({ hover: null })
  st.setActiveTool(TOOLS.SELECT)
  if (!c) return false
  const movesFirst = c.side === 'first'
  const group = groupCuts(st.objects, rack, c, useRowGroup.getState().keys, gridSize)
  const pieces = [{ rack, k: c.k }, ...(group ? group.cuts : [])].map(j => {
    const [a, b] = cutRack(j.rack, j.k, gridSize, newId, movesFirst ? 'second' : 'first')
    return { from: j.rack, stay: movesFirst ? b : a, moving: movesFirst ? a : b }
  })
  const moved = group ? group.moves : []
  const items = [...pieces.map(p => p.moving), ...moved]                // the piece under the cursor first
  const swap = new Map(pieces.map(p => [p.from.id, p.stay])), out = new Set(moved.map(o => o.id))
  const movedAt = moved.map(o => st.objects.indexOf(o))
  items.forEach(o => keepStampsOnce(o.id))
  // what moves is out of the layout while it follows the mouse — nothing committed yet
  store.setState({ objects: st.objects.filter(o => !out.has(o.id)).map(o => swap.get(o.id) || o), selectedIds: [], activeBaySelection: [] })
  // an undo while they follow the mouse brought the racks back: the placement is over, nothing to put back
  const gone = (s) => pieces.some(p => !s.objects.some(o => o.id === p.stay.id && o.width === p.stay.width && o.beams?.length === p.stay.beams.length))
    || items.some(m => s.objects.some(o => o.id === m.id))
  const say = () => {
    if (!group) return
    const parts = [`Split ${1 + group.rowsCut} row${group.rowsCut ? 's' : ''}`]
    if (group.moves.length) parts.push(`${group.moves.length} moved without a cut`)
    if (group.skipped.length) parts.push(`${group.skipped.length} skipped`)
    useRowGroup.setState({ message: parts.join(' · '), report: group.skipped.length ? { warned: [], skipped: group.skipped } : null })
  }
  startPlacement(store, items, {
    at: world, grab: true, abandonIf: gone, escHint: `Esc leaves ${items.length > 1 ? 'them' : 'it'} where ${items.length > 1 ? 'they were' : 'it was'}`, measure: { fromId: pieces[0].stay.id }, select: false,
    finish: (placed) => {
      skipNextAction()
      const was = new Map(items.map(o => [o.id, o]))
      return placed.map(p => { const m = was.get(p.id); return m && m.genRunFt != null ? { ...p, genRunFt: m.genRunFt + (geom(p).r0 - geom(m).r0) / gridSize } : p })
    },
    onCancel: () => {
      const s = store.getState()
      if (gone(s)) return
      let objects = [...s.objects]
      moved.map((o, i) => [movedAt[i], o]).sort((x, y) => x[0] - y[0]).forEach(([at, o]) => objects.splice(Math.min(at, objects.length), 0, o))
      for (const p of pieces) { const j = objects.findIndex(o => o.id === p.stay.id); objects.splice(j + 1, 0, p.moving) }
      if (rebuildAisles) objects = rebuildAisles(objects, newId).objects
      skipNextAction()
      store.setState({ objects, selectedIds: [], activeBaySelection: [] })
      store.getState().commitObjectUpdate(items[0].id, {})
      say()
    },
  })
  say()
  return true
}
