// usableCapacity.js
// ─────────────────────────────────────────────────────────────────────────────
// Gross vs usable pallet positions for a set of placed objects. Gross is
// getLayoutCapacity's count of every position the racks hold. Usable takes
// off what the column check says is lost: positions a column sits in, and
// positions whose every pick zone a column blocks (checkColumns counts each
// once). The Column Check panel, the capacity headline and the orientation
// auto-pick all read these same helpers, so the three can't disagree.
// ─────────────────────────────────────────────────────────────────────────────

import { bayLedger } from '../utils/bayLedger'
import { getLayoutCapacity } from '../utils/capacity'
import { checkColumns, expandColumnGrid, MHE_PROFILES } from './columnCheck'
import { DEFAULT_RULES } from '../rules/defaults'

const GS = 40

export const isRack = o => typeof o?.type === 'string' && o.type.startsWith('rack_')

/** Column footprints from every visible column grid. */
export function layoutColumns(objects, gridSize = GS) {
  return objects
    .filter(o => o.type === 'column_grid' && o.showGrid !== false)
    .flatMap(g => expandColumnGrid(g, gridSize))
}

/** Building outlines (world polygons) — fpVerts already carries any rotation. */
export function layoutFloors(objects) {
  return objects
    .filter(o => typeof o.type === 'string' && o.type.startsWith('fp_') && Array.isArray(o.fpVerts))
    .map(o => o.fpVerts)
}

/** The truck profile the column check tests with: the rules table's entry,
 *  falling back to the shipped profile (same order useColumnCheck uses). */
export function mheProfile(key = 'reach', rules = DEFAULT_RULES) {
  const m = rules?.mhe?.[key]
  const base = MHE_PROFILES[key] || MHE_PROFILES.reach
  return m ? { ...base, key, ...m } : base
}

/** The column check over a set of objects, or null when there is nothing
 *  to check (no racks or no columns). */
export function runColumnCheck(objects, { profile = MHE_PROFILES.reach, gridSize = GS, pickBothSides = false } = {}) {
  const racks = objects.filter(isRack)
  const columns = layoutColumns(objects, gridSize)
  if (!racks.length || !columns.length) return null
  return checkColumns({ racks, columns, profile, gridSize, pickBothSides, floors: layoutFloors(objects) })
}

/** usable = gross − in-rack losses − pick-zone losses. `check` lets a caller
 *  that already ran the column check pass its result instead of rerunning it; `ledger` likewise the bay
 *  ledger. Gross counts an overlapped bay once (utils/bayLedger.js), so a loss on a bay the ledger leaves
 *  out isn't taken off — the usable figure never goes below what is really there, nor above gross. */
export function usableCapacity(objects, { profile, gridSize = GS, rules = DEFAULT_RULES, check, ledger } = {}) {
  const L = ledger || bayLedger(objects, gridSize)
  const gross = getLayoutCapacity(objects, rules, L).total
  const res = check !== undefined ? check : runColumnCheck(objects, { profile, gridSize })
  const counts = (c) => { const e = L.racks.get(c.rackId); return !e || c.bayIndex == null || e.counted[c.bayIndex] !== false }
  const inRackLost = res ? (res.rackConflicts || []).filter(counts).reduce((t, c) => t + (c.positionsLost || 0), 0) : 0
  const pickZoneLost = res ? (res.pickBlocks || []).filter(counts).reduce((t, c) => t + (c.positionsLost || 0), 0) : 0
  return { gross, usable: gross - inRackLost - pickZoneLost, inRackLost, pickZoneLost }
}
