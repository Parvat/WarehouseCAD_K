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
//     rack. Nothing is committed until then: the cut and the placement are ONE history entry.
//   - Both pieces keep the original's fields and its row / section stamps (the same row, the same Row
//     group row — the row-edit keeper is told to keep the moved piece's: keepStampsOnce); the piece that
//     stays keeps the id, the other carries `pieceOf`; `genRunFt` follows each one's start. The Row group
//     passes the action over (skipNextAction). A piece dragged straight back onto the shared upright joins
//     again (the in-line snap).

import { create } from 'zustand'
import { geom, uprightsOf, withRun, isRowRack } from './rowGroup'
import { startPlacement } from './placement'
import { skipNextAction } from './rowGroupTool'
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
 *  named by `keep` keeps the id; the other gets a new id and `pieceOf`. */
export function cutRack(rack, k, gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12), keep = 'first') {
  const g = geom(rack), up = ((rack.uprightWidth || 3) / 12) * gridSize
  const ups = uprightsOf(g.r0, g.beams, up, gridSize)
  const root = rack.pieceOf || rack.id
  const piece = (s, e, own) => {
    const out = withRun(own ? rack : { ...rack, id: newId(), pieceOf: root }, ups[s], g.beams.slice(s, e), gridSize)
    if (rack.genRunFt != null) out.genRunFt = rack.genRunFt + (ups[s] - ups[0]) / gridSize
    return out
  }
  return [piece(0, k, keep === 'first'), piece(k, g.beams.length, keep === 'second')]
}

/** The pointer moved over `hitId` (or nothing) with the Split tool. */
export function hoverSplit(objects, world, hitId, gridSize = 40) {
  const rack = hitId ? objects.find(o => o.id === hitId) : null
  const c = rack ? cutOf(rack, world, gridSize) : null
  const prev = useSplit.getState().hover
  const next = c ? { rackId: rack.id, ...c } : null
  if (prev === next || (prev && next && prev.rackId === next.rackId && prev.k === next.k && prev.side === next.side && prev.line.every((v, i) => v === next.line[i]))) return
  useSplit.setState({ hover: next })
}

/** The Split tool's click on `rackId` at `world`: the rack cut, the cursor's piece following the mouse.
 *  Returns true when it cut. `rebuildAisles` re-pairs the aisles when Esc puts the piece back. */
export function splitAt(store, world, rackId, { newId, rebuildAisles } = {}) {
  const st = store.getState(), gridSize = st.gridSize || 40
  const rack = st.objects.find(o => o.id === rackId)
  const c = rack ? cutOf(rack, world, gridSize) : null
  useSplit.setState({ hover: null })
  st.setActiveTool(TOOLS.SELECT)
  if (!c) return false
  const movesFirst = c.side === 'first'
  const [a, b] = cutRack(rack, c.k, gridSize, newId, movesFirst ? 'second' : 'first')
  const stay = movesFirst ? b : a, moving = movesFirst ? a : b
  const i = st.objects.indexOf(rack)
  keepStampsOnce(moving.id)
  // the piece that moves is out of the layout while it follows the mouse — nothing committed yet
  store.setState({ objects: [...st.objects.slice(0, i), stay, ...st.objects.slice(i + 1)], selectedIds: [], activeBaySelection: [] })
  // an undo while it follows the mouse brought the rack back: the placement is over, nothing to put back
  const gone = (s) => !s.objects.some(o => o.id === stay.id && o.width === stay.width && o.beams?.length === stay.beams.length) || s.objects.some(o => o.id === moving.id)
  startPlacement(store, [moving], {
    at: world, grab: true, abandonIf: gone, escHint: 'Esc leaves it where it was',
    finish: (placed) => {
      skipNextAction()
      if (moving.genRunFt == null) return placed
      const d = (geom(placed[0]).r0 - geom(moving).r0) / gridSize
      return [{ ...placed[0], genRunFt: moving.genRunFt + d }]
    },
    onCancel: () => {
      const s = store.getState()
      if (gone(s)) return
      const j = s.objects.findIndex(o => o.id === stay.id)
      let objects = [...s.objects.slice(0, j + 1), moving, ...s.objects.slice(j + 1)]
      if (rebuildAisles) objects = rebuildAisles(objects, newId).objects
      skipNextAction()
      store.setState({ objects, selectedIds: [moving.id], activeBaySelection: [] })
      store.getState().commitObjectUpdate(moving.id, {})
    },
  })
  return true
}
