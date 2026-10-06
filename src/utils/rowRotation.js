// rowRotation.js — which way a rack dropped into a building should run: with the building's generated
// rows (90° for vertical rows, 0° for horizontal). Kept from the old across-sections replay engine
// (utils/rowEdits.js, removed with section copy); the left panel's toolbar and object picker use it.

import { rackFootprint } from '../generate/columnCheck'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const stamped = (r) => r.rowIndex != null && r.genSection != null

/** Whether building `fp`'s rows run vertically: most of its generated rows (else most of its racks) are turned. */
function buildingRotated(racks) {
  const gen = racks.filter(stamped)
  const pool = gen.length ? gen : racks
  const n = pool.filter(r => rackFootprint(r).rotated).length
  return n * 2 > pool.length
}

/** Rotation a beam rack dropped into this building should get so it runs with the building's generated
 *  rows (90 for vertical rows, 0 for horizontal), or null if the building has no generated rows. */
export function rowRotationFor(objects, fpId) {
  if (!objects.some(o => o.id === fpId)) return null
  const gen = objects.filter(o => BEAM.has(o.type) && o.parentId === fpId && stamped(o))
  if (!gen.length) return null
  return buildingRotated(gen) ? 90 : 0
}

/** Extra fields for a rack dropped from the left panel: a single or double row dropped into a building with
 *  generated rows is turned to run with them, so it lines up with the rows around it. */
export function dropRotation(objects, parentFp, type) {
  if (!parentFp || !BEAM.has(type)) return {}
  const rot = rowRotationFor(objects, parentFp.id)
  return rot == null ? {} : { rotation: rot }
}
