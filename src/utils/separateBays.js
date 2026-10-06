// separateBays.js — "Separate bays" (the rack panel): one bay, or a run of adjacent bays of one rack, becomes
// its own rack, in place — the reverse of the in-line snap's join.
//
//   - The rest of the rack stays one rack on each side: up to three racks. Nothing moves, no bay is lost:
//     each cut upright is shared — one rack ends on it, the next starts on it, the end-to-end shared frame
//     the join itself needs (bayBeam.sharesFrame) — so the drawing, Check layout (a shared end frame is no
//     overlap) and the bay ledger's counts are what they were.
//   - Every rack keeps the original's fields and its row / section stamps (so it stays in the same row and
//     the same Row group row); all but the first along the run carry `pieceOf` (the rack they came from,
//     as a bay-delete split's pieces do — the row-edit keeper keeps a stamped piece inside its rack), and
//     `genRunFt` follows each one's start, as the join does. The first along the run keeps the id.
//   - One history entry (separateSelectedBays: one store write, one commit), aisles re-paired in it.
//   - Not offered for the whole rack, for bays in more than one rack, or for bays that aren't adjacent.
//   The Row group sees a separation as no change (every upright where it was, no bay added or removed) and
//   offers nothing; a separated rack dragged straight back onto its shared upright joins again (in-line snap).

import { geom, uprightsOf, withRun } from './rowGroup'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const reversed = (o) => { const t = ((((o.rotation || 0) % 360) + 360) % 360); return t === 180 || t === 270 }

/** Whether `entries` ([{ objId, bayIdx }]) can be separated in `objects`: { ok, rackId, from, to } (stored bay
 *  indices, inclusive) or { ok: false, reason }. */
export function separationOf(objects, entries) {
  if (!entries || !entries.length) return { ok: false, reason: 'no bay selected' }
  const ids = new Set(entries.map(e => e.objId))
  if (ids.size !== 1) return { ok: false, reason: 'bays in more than one rack' }
  const rack = objects.find(o => o.id === entries[0].objId)
  if (!rack || !BEAM.has(rack.type) || !Array.isArray(rack.beams)) return { ok: false, reason: 'not a rack with bays' }
  const idx = [...new Set(entries.map(e => e.bayIdx))].sort((a, b) => a - b)
  if (idx.some((v, i) => i && v !== idx[i - 1] + 1)) return { ok: false, reason: 'the bays aren\'t next to each other' }
  if (idx.length >= rack.beams.length) return { ok: false, reason: 'that is the whole rack' }
  if (idx[0] < 0 || idx[idx.length - 1] >= rack.beams.length) return { ok: false, reason: 'no such bay' }
  return { ok: true, rackId: rack.id, from: idx[0], to: idx[idx.length - 1] }
}

/** The rack split at the uprights either side of bays `from`..`to` (stored indices): its racks in run order,
 *  the first keeping the id. Returns { racks, separated } — `separated` is the id of the one holding the bays. */
export function separateBays(rack, from, to, gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12)) {
  const g = geom(rack), n = rack.beams.length, up = ((rack.uprightWidth || 3) / 12) * gridSize
  const ups = uprightsOf(g.r0, g.beams, up, gridSize)
  // run order: a 180° / 270° rack's stored bays run the other way
  const [a, b] = reversed(rack) ? [n - 1 - to, n - 1 - from] : [from, to]
  const spans = [[0, a - 1], [a, b], [b + 1, n - 1]].filter(([s, e]) => e >= s)
  const root = rack.pieceOf || rack.id
  const racks = spans.map(([s, e], k) => {
    const base = k === 0 ? rack : { ...rack, id: newId(), pieceOf: root }
    const out = { ...withRun(base, ups[s], g.beams.slice(s, e + 1), gridSize), activeBayIdx: null }
    if (rack.genRunFt != null) out.genRunFt = rack.genRunFt + (ups[s] - ups[0]) / gridSize
    return out
  })
  return { racks, separated: racks[spans.findIndex(([s]) => s === a)].id }
}

/** The rack panel's button: the selected bays (the bay selection, else the selected rack's clicked bay)
 *  separated, as ONE history entry, the separated rack selected. Returns the separated rack's id, or null. */
export function separateSelectedBays(store, { newId, rebuildAisles } = {}) {
  const st = store.getState()
  const entries = st.activeBaySelection && st.activeBaySelection.length
    ? st.activeBaySelection
    : st.objects.filter(o => st.selectedIds.includes(o.id) && BEAM.has(o.type) && o.activeBayIdx != null).map(o => ({ objId: o.id, bayIdx: o.activeBayIdx }))
  const sep = separationOf(st.objects, entries)
  if (!sep.ok) return null
  const rack = st.objects.find(o => o.id === sep.rackId)
  const { racks, separated } = separateBays(rack, sep.from, sep.to, st.gridSize || 40, newId)
  const i = st.objects.indexOf(rack)
  let objects = [...st.objects.slice(0, i), ...racks, ...st.objects.slice(i + 1)]
  if (rebuildAisles) objects = rebuildAisles(objects, newId).objects
  store.setState({ objects, selectedIds: [separated], activeBaySelection: [] })
  store.getState().commitObjectUpdate(separated, {})
  return separated
}
