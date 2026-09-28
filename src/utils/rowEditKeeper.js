// rowEditKeeper.js — keeps the row-edit baseline usable (utils/rowEdits.js):
//   - a generated building loaded without a `rowBaseline` (an older file)
//     gets one from its rows as they are, so only edits made from now on are
//     pending — a row deleted in one section before then stays deleted;
//   - a NEW rack carrying another row's stamps (a copy-paste of a generated
//     row) loses them, so it counts as an added row instead of merging into
//     the row it was copied from. Kept: the pieces of a split row (they sit
//     inside the rack they came from) and a row coming back on undo/redo (no
//     other rack has its stamps).
// Written without a history entry, like the aisle keeper; the next commit
// records it.

import { rackFootprint } from '../generate/columnCheck'
import { makeBaseline } from './rowEdits'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const FP = new Set(['fp_rect', 'fp_l', 'fp_t', 'fp_u', 'fp_cross', 'fp_l_mirror'])
const key = (r) => r.genSection + '|' + r.rowIndex
const inside = (a, b, eps = 0.5) => a.x >= b.x - eps && a.y >= b.y - eps && a.x + a.w <= b.x + b.w + eps && a.y + a.h <= b.y + b.h + eps

/** One pass over `objects` given the previous state's objects; returns the
 *  fixed list, or null when nothing needs fixing. */
export function keepRowEdits(objects, prevObjects, gridSize = 40) {
  let out = null
  const edit = (i, patch) => { if (!out) out = [...objects]; out[i] = { ...out[i], ...patch } }
  // 1) stamps on pasted copies
  if (prevObjects) {
    const prev = new Map(prevObjects.map(o => [o.id, o]))
    const fresh = objects.map((o, i) => [o, i]).filter(([o]) => BEAM.has(o.type) && o.rowIndex != null && o.genSection != null && !prev.has(o.id))
    for (const [o, i] of fresh) {
      const k = key(o)
      const others = objects.filter(q => q !== o && q.parentId === o.parentId && BEAM.has(q.type) && q.rowIndex != null && key(q) === k)
      if (!others.length) continue                                           // a row coming back (undo/redo, generation)
      const f = rackFootprint(o)
      const pieceOf = prevObjects.some(q => q.parentId === o.parentId && BEAM.has(q.type) && q.rowIndex != null && key(q) === k && inside(f, rackFootprint(q)))
      if (pieceOf) continue                                                  // a split piece
      if (!others.some(q => prev.has(q.id))) continue                        // all of them new together (a whole layout)
      edit(i, { rowIndex: undefined, genSection: undefined, genRunFt: undefined, genCrossFt: undefined, pieceOf: undefined })
    }
  }
  // 2) a baseline for generated buildings that have none
  const cur = out || objects
  cur.forEach((o, i) => {
    if (!FP.has(o.type) || o.rowBaseline) return
    if (!cur.some(r => r.parentId === o.id && BEAM.has(r.type) && r.rowIndex != null && r.genSection != null)) return
    edit(i, { rowBaseline: makeBaseline(cur, o, gridSize) })
  })
  if (out) out = out.map(o => (o.rowIndex === undefined && 'rowIndex' in o ? (({ rowIndex, genSection, genRunFt, genCrossFt, pieceOf, ...rest }) => rest)(o) : o))
  return out
}

/** Subscribe to `store`; returns the unsubscribe. */
export function installRowEditKeeper(store) {
  let lastObjects = null, busy = false
  const check = (st) => {
    if (busy || st.objects === lastObjects) return
    const prev = lastObjects
    lastObjects = st.objects
    const fixed = keepRowEdits(st.objects, prev, st.gridSize || 40)
    if (!fixed) return
    busy = true
    try { store.setState({ objects: fixed }) } finally { busy = false }
    lastObjects = store.getState().objects
  }
  check(store.getState())
  return store.subscribe(check)
}
