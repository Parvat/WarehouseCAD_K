// rowEditKeeper.js — keeps the generator's row stamps meaning one row:
// a NEW rack carrying another row's stamps (a copy-paste of a generated row
// that did not go through utils/pasteAt.js) loses them, so it is an added
// row (utils/rowGroup.js) instead of merging into
// the row it was copied from. Kept: the pieces of a split row (they sit
// inside the rack they came from), a row coming back on undo/redo (no
// other rack has its stamps), and a racking area's own racks (recorded in its
// `placed`: their stamps are the area's pattern rows and runs), and the
// piece the Split tool cut off, wherever it is placed (keepStampsOnce).
// Written without a history entry, like the aisle keeper; the next commit
// records it.

import { rackFootprint } from '../generate/columnCheck'

const BEAM = new Set(['rack_row', 'rack_double_row'])

// racks whose stamps are kept the first time they appear (utils/splitTool.js: a cut-off piece is the same row)
const keepOnce = new Set()
export const keepStampsOnce = (id) => { keepOnce.add(id) }
const key = (r) => r.genSection + '|' + r.rowIndex
const inside = (a, b, eps = 0.5) => a.x >= b.x - eps && a.y >= b.y - eps && a.x + a.w <= b.x + b.w + eps && a.y + a.h <= b.y + b.h + eps

/** One pass over `objects` given the previous state's objects; returns the
 *  fixed list, or null when nothing needs fixing. */
export function keepRowEdits(objects, prevObjects, gridSize = 40) {
  let out = null
  const edit = (i, patch) => { if (!out) out = [...objects]; out[i] = { ...out[i], ...patch } }
  if (prevObjects) {
    const prev = new Map(prevObjects.map(o => [o.id, o]))
    // a racking area's own racks (it recorded them as placed): their stamps are its pattern's
    const areaOwned = new Set(objects.filter(o => o.type === 'racking_area' && o.placed).flatMap(o => Object.keys(o.placed)))
    const fresh = objects.map((o, i) => [o, i]).filter(([o]) => BEAM.has(o.type) && o.rowIndex != null && o.genSection != null && !prev.has(o.id) && !areaOwned.has(o.id))
    for (const [o, i] of fresh) {
      if (keepOnce.delete(o.id)) continue                                    // a cut-off piece (the Split tool)
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
