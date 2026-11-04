// canvas2/selectionLevel.js — one selection rule for the whole app (STUDIO.md §7): a selection is ROWS or BAYS,
// never both.
//   - rows: selectedIds (a rack's whole section — canvas2/sections.js), no bay picked anywhere;
//   - bays: the bays picked (one: the rack's activeBayIdx / activeBaySide; several: activeBaySelection entries
//     { objId, bayIdx, side }), selectedIds the racks that own them — the panels read both as before.
// Every write here replaces the whole selection, so the two levels can never mix.

import { sectionIds, withSections } from './sections'
import { isDoor } from '../utils/doorTool'

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
/** The kind an object is selected as (STUDIO.md §7a Levels): building, rows, column, zones, doors — else its type. */
export function kindOf(o) {
  const t = (o && typeof o.type === 'string') ? o.type : ''
  if (!t) return null
  if (FP_TYPES.has(t)) return 'building'
  if (t.startsWith('rack_')) return 'rows'
  if (t === 'column_grid') return 'column'
  if (t.startsWith('zone_')) return 'zones'
  if (isDoor(o)) return 'doors'
  return t
}
/** The one kind the selection in `st` is (bays at the bay level), or null when nothing is selected. */
export function selectionKind(st) {
  if (selectionLevel(st) === 'bays') return 'bays'
  const ks = new Set((st.selectedIds || []).map(id => kindOf((st.objects || []).find(o => o.id === id))).filter(Boolean))
  return ks.size ? (ks.size === 1 ? [...ks][0] : 'mixed') : null
}

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
/** The bay selection is a SET of bays: one entry per bay picked — in a pair, per side (side 0, side 1), or null (the
 *  flue's both sides at once / a single row) — never the same bay twice. A pair's two facing bays picked one by one
 *  are two items (STUDIO.md §7a); a half picked again, or a half with its bay's "both", reads as one. */
export function bayKeySet(entries, objects = []) {
  const out = new Map()
  for (const e of entries || []) {
    const k = e.objId + '|' + e.bayIdx, s = sideOf(e.side), o = objects.find(x => x.id === e.objId)
    const pair = !o || o.type === 'rack_double_row'
    const prev = out.get(k)
    const sides = prev ? prev.sides : { both: false, one: new Set() }
    if (s == null || !pair) sides.both = true; else sides.one.add(s)
    if (!prev) out.set(k, { objId: e.objId, bayIdx: e.bayIdx, sides })
  }
  return [...out.values()].flatMap(x => (x.sides.both ? [{ objId: x.objId, bayIdx: x.bayIdx, side: null }]
    : [...x.sides.one].sort().map(s => ({ objId: x.objId, bayIdx: x.bayIdx, side: s }))))
}
/** Bay `e` in or out of the bay selection (Shift+click at the bay level): only the bay clicked changes — a half
 *  picked comes off (its facing half stays); a bay picked on both sides at once, clicked on one half, keeps the other
 *  half; a single row's bay comes off whole; else it is added. */
export function toggleBay(store, e) {
  const st = store.getState(), cur = bayKeySet(pickedBays(st), st.objects), side = sideOf(e.side)
  const same = (x) => x.objId === e.objId && x.bayIdx === e.bayIdx
  const both = cur.findIndex(x => same(x) && x.side == null)
  if (both >= 0) {
    // the flue's both sides: a click on one half leaves the other; a click in the flue again takes both off
    selectBays(store, side == null ? cur.filter((_, j) => j !== both) : cur.map((y, j) => (j === both ? { ...y, side: 1 - side } : y)))
    return
  }
  const i = cur.findIndex(x => same(x) && (side == null || x.side === side))
  if (i < 0) { selectBays(store, [...cur, { objId: e.objId, bayIdx: e.bayIdx, side }]); return }
  selectBays(store, side == null ? cur.filter(x => !same(x)) : cur.filter((_, j) => j !== i))
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
