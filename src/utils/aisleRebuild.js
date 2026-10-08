// aisleRebuild.js — aisle labels only ever pair two directly facing rows.
//
// An `aisle` object is just a pair of rack ids (row1Id/row2Id); its label is
// measured live between the two. So when rows are deleted, split, recreated
// or copied in, the PAIRS go stale: an aisle can end up pointing at a deleted
// row, or spanning a row that has come back between its two rows (a 28' 6"
// label running straight through it). `rebuildAisles` re-derives the pairs:
//
//   - rows = lines across the aisles (syncSections' rowLines: the pieces of
//     a split row are one row), grouped by building, run direction and
//     overlapping run (the rows between the same two cross-aisles);
//   - neighbours = two consecutive lines, and the pieces of each that share
//     some of the run with a gap between them across the aisles. Pieces of a
//     line that are end to end (sharing an upright, touching — a cut, an
//     in-line settle) are one STRETCH: two facing stretches get ONE aisle per
//     width between them, between the two pieces that face each other the
//     most at it, so a cut never adds labels to an aisle and no width loses its
//     label. Pieces with a real gap between them (a
//     deleted bay) are separate stretches, each with its own aisle;
//   - an existing aisle whose pair is still neighbours is KEPT (id, label);
//   - an aisle with a row between its two rows, a duplicate, or one pointing
//     at a rack that no longer exists is REMOVED;
//   - a neighbour pair with no aisle gets a NEW one.
//
// Only rows the app manages are touched: sections holding a generated
// (stamped) rack or a rack some aisle already points at. A hand-drawn
// layout with no aisles gets none added. Aisles between other rack types
// (lane racks) are left as they are.

import { rackFootprint } from '../generate/rackFootprint'
// the pairing itself lives in rowAisles.js, shared with Check layout, the column check and Generate
import { neighbourPairs } from '../generate/rowAisles'
import { layerForType } from './layers'   // a new aisle goes on the Aisles layer, not its rack's
export { neighbourPairs }

const BEAM = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6
const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a)



/** Rebuild aisle pairings so every aisle is between two directly facing
 *  rows. Returns { objects, changed, removed, added }. Keeps objects in
 *  order; new aisles are appended. */
export function rebuildAisles(objects, newId = () => Math.random().toString(36).slice(2, 12)) {
  const racks = objects.filter(o => BEAM.has(o.type) && rightAngle(o) && o.width > 0 && o.height > 0)
  const rackIds = new Set(racks.map(r => r.id))
  const allIds = new Set(objects.map(o => o.id))
  const { pairs, sectionOf } = neighbourPairs(racks)

  // sections the app manages: a generated (stamped) rack, or a rack an aisle points at
  const managed = new Set()
  for (const r of racks) if (r.rowIndex != null || r.genSection != null) managed.add(sectionOf.get(r.id))
  for (const o of objects) {
    if (o.type !== 'aisle') continue
    for (const id of [o.row1Id, o.row2Id]) if (rackIds.has(id)) managed.add(sectionOf.get(id))
  }
  const isManaged = (id) => managed.has(sectionOf.get(id))

  const byId = new Map(racks.map(r => [r.id, r]))
  const out = [], used = new Set(), removed = [], added = []
  const template = new Map()   // parentId -> an aisle to copy base fields from
  for (const o of objects) {
    if (o.type !== 'aisle') { out.push(o); continue }
    const a = o.row1Id, b = o.row2Id
    if (!allIds.has(a) || !allIds.has(b)) { removed.push(o.id); continue }            // points at a deleted rack
    if (!rackIds.has(a) || !rackIds.has(b)) { out.push(o); continue }                   // not between beam racks: untouched
    const k = pairKey(a, b)
    if (pairs.has(k) && !used.has(k)) {
      used.add(k); out.push(o)
      const pid = byId.get(a)?.parentId || ''
      if (!template.has(pid)) template.set(pid, o)
      continue
    }
    if (isManaged(a) || isManaged(b)) { removed.push(o.id); continue }                  // a row between them, or a duplicate
    out.push(o)
  }
  for (const [k, [a, b]] of pairs) {
    if (used.has(k) || !isManaged(a)) continue
    const ra = byId.get(a)
    const t = template.get(ra.parentId || '')
    const base = t
      ? (({ id, row1Id, row2Id, label, ...rest }) => rest)(t)
      : { type: 'aisle', layerId: layerForType('aisle'), parentId: ra.parentId, strokeWidth: 1.5, opacity: 1, rotation: 0, noFill: false }
    const aisle = { ...base, type: 'aisle', id: newId(), row1Id: a, row2Id: b, label: '' }
    if (!ra.parentId) delete aisle.parentId
    out.push(aisle)
    added.push(aisle.id)
  }
  return { objects: out, changed: removed.length > 0 || added.length > 0, removed, added }
}
