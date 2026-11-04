// canvas2/selectionLevel.js — one selection rule for the whole app (STUDIO.md §7): a selection is ROWS or BAYS,
// never both.
//   - rows: selectedIds (a rack's whole section — canvas2/sections.js), no bay picked anywhere;
//   - bays: the bays picked (one: the rack's activeBayIdx / activeBaySide; several: activeBaySelection entries
//     { objId, bayIdx, side }), selectedIds the racks that own them — the panels read both as before.
// Every write here replaces the whole selection, so the two levels can never mix.

import { sectionIds, withSections } from './sections'

const BAY_TYPES = new Set(['rack_row', 'rack_double_row'])
export const isBayRack = (o) => !!o && BAY_TYPES.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0
const sideOf = (s) => (s === 0 || s === 1 ? s : null)

/** The bays picked in store state `st`, as entries { objId, bayIdx, side } (side null: both sides of a pair). */
export function pickedBays(st) {
  if (st.activeBaySelection?.length) return st.activeBaySelection.map(e => ({ objId: e.objId, bayIdx: e.bayIdx, side: sideOf(e.side) }))
  const out = []
  for (const o of st.objects || []) if (isBayRack(o) && o.activeBayIdx != null && (st.selectedIds || []).includes(o.id)) out.push({ objId: o.id, bayIdx: o.activeBayIdx, side: sideOf(o.activeBaySide) })
  return out
}
/** 'bays' | 'rows' | 'none'. */
export function selectionLevel(st) {
  if (pickedBays(st).length) return 'bays'
  return (st.selectedIds || []).length ? 'rows' : 'none'
}
/** The racks owning the picked bays. */
export const bayOwners = (st) => [...new Set(pickedBays(st).map(e => e.objId))]

/** The objects with no bay or tower picked (only those that had one are copied). */
const unpicked = (objects) => (objects.some(o => o.activeBayIdx != null || o.activeTowerIdx != null)
  ? objects.map(o => (o.activeBayIdx != null || o.activeTowerIdx != null ? { ...o, activeBayIdx: null, activeBaySide: null, activeTowerIdx: null } : o))
  : objects)

/** Rows: `ids` selected (each rack with its whole section), every bay unpicked. No history entry. */
export function selectRows(store, ids) {
  const st = store.getState()
  store.setState({ selectedIds: withSections(st.objects, ids, st.gridSize || 40), activeBaySelection: [], objects: unpicked(st.objects) })
}
/** Bays: exactly `entries` picked (one: on its rack; several: activeBaySelection), their racks selected. */
export function selectBays(store, entriesIn) {
  const st = store.getState(), entries = bayKeySet(entriesIn, st.objects)
  if (!entries.length) { store.setState({ selectedIds: [], activeBaySelection: [], objects: unpicked(st.objects) }); return }
  const owners = [...new Set(entries.map(e => e.objId))]
  let objects = unpicked(st.objects)
  if (entries.length === 1) {
    const e = entries[0]
    objects = objects.map(o => (o.id === e.objId ? { ...o, activeBayIdx: e.bayIdx, activeBaySide: e.side ?? null } : o))
    store.setState({ selectedIds: owners, activeBaySelection: [], objects })
  } else {
    store.setState({ selectedIds: owners, activeBaySelection: entries.map(e => ({ objId: e.objId, bayIdx: e.bayIdx, ...(e.side === 0 || e.side === 1 ? { side: e.side } : {}) })), objects })
  }
}
/** The bay selection is a SET of bay positions: one entry per bay (side 0, side 1, or null — both sides / a single
 *  row), never the same bay twice. Two entries for one bay (both halves, or a half and "both") read as one. */
export function bayKeySet(entries, objects = []) {
  const out = new Map()
  for (const e of entries || []) {
    const k = e.objId + '|' + e.bayIdx, s = sideOf(e.side), o = objects.find(x => x.id === e.objId)
    const pair = !o || o.type === 'rack_double_row'
    const prev = out.get(k)
    const sides = new Set(prev ? prev.sides : [])
    if (s == null || !pair) { sides.add(0); sides.add(1) } else sides.add(s)
    out.set(k, { objId: e.objId, bayIdx: e.bayIdx, sides })
  }
  return [...out.values()].map(x => ({ objId: x.objId, bayIdx: x.bayIdx, side: x.sides.size === 2 ? null : [...x.sides][0] }))
}
/** Bay `e` in or out of the bay selection (Shift+click at the bay level): a bay already picked where it is clicked —
 *  on that half, or on both — comes off; one picked on the other half only becomes both; else it is added. */
export function toggleBay(store, e) {
  const st = store.getState(), cur = bayKeySet(pickedBays(st), st.objects), side = sideOf(e.side)
  const i = cur.findIndex(x => x.objId === e.objId && x.bayIdx === e.bayIdx)
  if (i < 0) { selectBays(store, [...cur, { objId: e.objId, bayIdx: e.bayIdx, side }]); return }
  const x = cur[i], covered = x.side == null || side == null || x.side === side
  selectBays(store, covered ? cur.filter((_, j) => j !== i) : cur.map((y, j) => (j === i ? { ...y, side: null } : y)))
}
/** Esc: from bays up to their rows; from rows, nothing selected. Returns the level it left ('bays' | 'rows' | null). */
export function stepUp(store) {
  const st = store.getState(), level = selectionLevel(st)
  if (level === 'bays') { selectRows(store, bayOwners(st)); return 'bays' }
  if (level === 'rows') { store.getState().clearSelection(); store.getState().setActiveWall?.(null); return 'rows' }
  return null
}
/** The racks (with their sections) the rows level shows for state `st` — the picked bays' rows at the bay level. */
export const rowsOfSelection = (st) => withSections(st.objects, selectionLevel(st) === 'bays' ? bayOwners(st) : st.selectedIds, st.gridSize || 40)
export { sectionIds }
