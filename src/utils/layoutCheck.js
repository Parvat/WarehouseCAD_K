// layoutCheck.js — "Check layout": every problem in the layout, listed.
//
// It only REPORTS — nothing is blocked or moved. Every rule is an existing
// one, asked here, never copied:
//   aisles       rowGaps + aisleLevel (generate/columnCheck.js) — the column
//                check's and the copy warnings' own width rule
//   columns      runColumnCheck (the Column Check): upright hits, columns in
//                an aisle, positions lost in the rack and in pick zones
//   overlap/wall rackIssues (utils/bayBeam.js)
//   reach        rackReachable (the pick-zone test, at the travel width)
//   bays         oversizedBayIndices (utils/capacity.js)
//
// ERRORS (can't be built or reached): an aisle a truck can't drive, racks
// overlapping, a rack past a wall or outside the building, a column on an
// upright frame, a rack nobody can reach.
// WARNINGS (cost positions, or need a look): an aisle it can drive but not
// pick from, columns blocking pallets, a bay too short for a pallet, angled
// racks whose column losses weren't checked.
//
// Each item: { severity, kind, text, ids (to select), box (world rect to zoom
// to) }. The last result, the export question and "go to it" live in the
// small store below.

import { create } from 'zustand'
import { rackFootprint, rowGaps, aisleLevel, rackReachable, MHE_PROFILES } from '../generate/columnCheck'
import { runColumnCheck, layoutColumns, layoutFloors, isRack } from '../generate/usableCapacity'
import { rackIssues } from './bayBeam'
import { oversizedBayIndices } from './capacity'
import { fmtLen } from './copyChange'
import { sectionLabel } from './sectionCopy'
import { getColumnCheckView } from '../generate/columnCheckView'

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const TYPE_NAMES = {
  rack_row: 'Single row', rack_double_row: 'Double row', rack_cantilever: 'Cantilever rack', rack_drive_in: 'Drive-in rack',
  rack_drive_through: 'Drive-through rack', rack_pushback: 'Pushback rack', rack_pallet_flow: 'Pallet flow rack',
  rack_mezzanine: 'Mezzanine', rack_shelving: 'Shelving unit',
}
const AISLE_MIN_PX = (gridSize) => 2 * gridSize   // narrower than this is racks set back to back, not an aisle

/** "Row 5, section 3" for a generated row; "Double row 4" (its place among
 *  the racks) for one placed by hand. */
export function rackName(r, racks) {
  if (r.rowIndex != null) return `Row ${r.rowIndex}${r.genSection != null ? `, section ${sectionLabel(r.genSection)}` : ''}`
  const same = racks.filter(o => o.type === r.type)
  return `${TYPE_NAMES[r.type] || 'Rack'} ${same.indexOf(r) + 1}`
}
/** Two racks as one phrase: "rows 4 and 5, section 3" when they share a section. */
function pairName(a, b, racks) {
  if (a.rowIndex != null && b.rowIndex != null && a.genSection === b.genSection) {
    const [p, q] = [a.rowIndex, b.rowIndex].sort((x, y) => x - y)
    return `rows ${p} and ${q}${a.genSection != null ? `, section ${sectionLabel(a.genSection)}` : ''}`
  }
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1)
  return `${lc(rackName(a, racks))} and ${lc(rackName(b, racks))}`
}
const boxOf = (f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })
const union = (boxes) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Every problem in \`objects\`: { errors: [item], warnings: [item] }. */
export function checkLayout(objects, { profile = MHE_PROFILES.reach, gridSize = 40, pickBothSides = false } = {}) {
  const errors = [], warnings = []
  const racks = objects.filter(isRack)
  const byId = new Map(objects.map(o => [o.id, o]))
  const foot = new Map(racks.map(r => [r.id, rackFootprint(r)]))
  const name = (r) => rackName(r, racks)
  const len = (px) => fmtLen(px, gridSize)
  const travelPx = (profile.travelFt ?? 8) * gridSize, aislePx = profile.aisleFt * gridSize

  // ── aisles between neighbouring rows ──
  const pinchedPairs = new Set()
  for (const g of rowGaps(racks.filter(r => ((r.rotation || 0) % 90) === 0))) {
    if (g.gapLen <= AISLE_MIN_PX(gridSize)) continue
    const lvl = aisleLevel(g.gapLen, profile, gridSize)
    if (lvl === 3) continue
    const where = `Aisle between ${pairName(g.top, g.bot, racks)}`
    const item = { kind: lvl === 1 ? 'aisle-drive' : 'aisle-pick', ids: [g.top.id, g.bot.id], box: g.box }
    if (lvl === 1) { pinchedPairs.add(g.top.id + '|' + g.bot.id); errors.push({ ...item, severity: 'error', text: `${where}: ${len(g.gapLen)}, needs ${len(travelPx)} to drive` }) }
    else warnings.push({ ...item, severity: 'warning', text: `${where}: ${len(g.gapLen)}, needs ${len(aislePx)} to pick` })
  }

  // ── the column check ──
  const cols = layoutColumns(objects, gridSize)
  const res = runColumnCheck(objects, { profile, gridSize, pickBothSides })
  if (res) {
    // a column in an aisle leaving less than the travel width
    for (const b of res.aisleBlocks) {
      if (b.level !== 1) continue
      const [t, u] = b.betweenRows.map(id => byId.get(id))
      if (!t || !u || pinchedPairs.has(t.id + '|' + u.id)) continue
      pinchedPairs.add(t.id + '|' + u.id)
      const col = cols[b.columnIndex]
      errors.push({ severity: 'error', kind: 'aisle-drive', ids: [t.id, u.id],
        box: col ? union([col, b.axis === 'x' ? { x: b.gapStart, y: col.y, w: b.gapEnd - b.gapStart, h: col.h } : { x: col.x, y: b.gapStart, w: col.w, h: b.gapEnd - b.gapStart }]) : boxOf(foot.get(t.id)),
        text: `Aisle between ${pairName(t, u, racks)}: a column leaves ${len(b.clearFt * gridSize)}, needs ${len(travelPx)} to drive` })
    }
    // columns on upright frames: one item per rack
    const onRack = new Map()
    for (const h of res.uprightHits) {
      if (!onRack.has(h.rackId)) onRack.set(h.rackId, new Set())
      onRack.get(h.rackId).add(h.columnIndex)
    }
    for (const [id, set] of onRack) {
      const r = byId.get(id)
      if (!r) continue
      const n = set.size, boxes = [...set].map(ci => cols[ci]).filter(Boolean)
      errors.push({ severity: 'error', kind: 'upright', ids: [id], box: boxes.length ? union(boxes) : boxOf(foot.get(id)),
        text: `${name(r)}: ${n === 1 ? 'a column stands' : `${n} columns stand`} on ${n === 1 ? 'an upright frame' : 'upright frames'}` })
    }
    // pallet positions lost to columns (in the rack and in its pick zones): one item per
    // section (generated) or per building (placed by hand), with every row it touches
    const lostBy = new Map()
    for (const c of [...res.rackConflicts, ...res.pickBlocks]) {
      const r = byId.get(c.rackId)
      if (!r || !c.positionsLost) continue
      const key = r.genSection != null ? 's' + r.genSection : 'b' + (r.parentId || '')
      if (!lostBy.has(key)) lostBy.set(key, { section: r.genSection, n: 0, ids: new Set() })
      const g = lostBy.get(key)
      g.n += c.positionsLost; g.ids.add(r.id)
    }
    for (const g of lostBy.values()) {
      const ids = [...g.ids], rows = ids.length
      const where = g.section != null ? `Section ${sectionLabel(g.section)}` : rows === 1 ? name(byId.get(ids[0])) : 'Racks placed by hand'
      warnings.push({ severity: 'warning', kind: 'columns-lost', ids, box: union(ids.map(id => foot.get(id))), positions: g.n,
        text: `${where}: columns block ${g.n} pallet position${g.n === 1 ? '' : 's'}${rows > 1 ? ` on ${rows} rows` : ''}` })
    }
  }

  // ── each rack: overlap, wall, reach, bays, angle ──
  const floors = layoutFloors(objects)
  const hasBuilding = objects.some(o => FP.has(o.type))
  const pairs = new Set()
  for (const r of racks) {
    const f = foot.get(r.id)
    const iss = rackIssues(r, objects, gridSize)
    for (const oid of iss.overlaps) {
      const k = [r.id, oid].sort().join('|')
      if (pairs.has(k)) continue
      pairs.add(k)
      const o = byId.get(oid), g = foot.get(oid)
      const by = Math.min(Math.min(f.x + f.w, g.x + g.w) - Math.max(f.x, g.x), Math.min(f.y + f.h, g.y + g.h) - Math.max(f.y, g.y))
      errors.push({ severity: 'error', kind: 'overlap', ids: [r.id, oid], box: union([f, g]), text: `${name(r)} overlaps ${name(o).charAt(0).toLowerCase() + name(o).slice(1)} by ${len(by)}` })
    }
    const fp = r.parentId ? byId.get(r.parentId) : null
    if (iss.wallOutIn > 0) errors.push({ severity: 'error', kind: 'outside', ids: [r.id], box: boxOf(f), text: `${name(r)}: past the wall by ${len((iss.wallOutIn / 12) * gridSize)}` })
    else if (hasBuilding && !(fp && FP.has(fp.type))) errors.push({ severity: 'error', kind: 'outside', ids: [r.id], box: boxOf(f), text: `${name(r)}: outside the building` })
    if (!rackReachable(r, racks, { gridSize, floors, depthPx: travelPx })) {
      errors.push({ severity: 'error', kind: 'unreachable', ids: [r.id], box: boxOf(f), text: `${name(r)}: no aisle on any pick side — nobody can reach it` })
    }
    if (Array.isArray(r.beams) && (r.type === 'rack_row' || r.type === 'rack_double_row')) {
      const bad = oversizedBayIndices(r.beams, r.palletWIn || 40)
      if (bad.length) warnings.push({ severity: 'warning', kind: 'oversized', ids: [r.id], box: boxOf(f),
        text: `${name(r)}: bay${bad.length > 1 ? 's' : ''} ${bad.map(i => `${i + 1} (${r.beams[i]}")`).join(', ')} too short for a ${r.palletWIn || 40}" pallet — hold${bad.length > 1 ? '' : 's'} nothing` })
    }
    if (((r.rotation || 0) % 90) !== 0 && cols.length) {
      warnings.push({ severity: 'warning', kind: 'angled', ids: [r.id], box: boxOf(f), text: `${name(r)}: angled ${Math.round(r.rotation)}° — its column losses weren't checked` })
    }
  }
  const order = ['aisle-drive', 'overlap', 'outside', 'upright', 'unreachable', 'aisle-pick', 'columns-lost', 'oversized', 'angled']
  const byKind = (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
  return { errors: errors.sort(byKind), warnings: warnings.sort(byKind) }
}

/** "Check layout · 3 errors" / "· 2 warnings" / "· no issues". */
export function checkLabel(result) {
  if (!result) return 'Check layout'
  const e = result.errors.length, w = result.warnings.length
  if (e) return `Check layout · ${e} error${e === 1 ? '' : 's'}`
  if (w) return `Check layout · ${w} warning${w === 1 ? '' : 's'}`
  return 'Check layout · no issues'
}

/* ── the last check, the export question ─────────────────────────────────────
   result: { errors, warnings, at } or null; open: the panel shows it;
   askExport: { errors: n } while "N errors found. Export anyway?" is asked. */
export const useLayoutCheck = create((set) => ({
  result: null,
  open: false,
  askExport: null,
  close: () => set({ open: false }),
}))

/* the truck and "pick both sides" the Column Check panel is set to */
const viewOpts = () => { try { const v = getColumnCheckView(); return { profile: v.profile || MHE_PROFILES.reach, pickBothSides: !!v.pickBothSides } } catch { return {} } }

/** Run the check on the store's layout now; the panel opens. */
export function runLayoutCheck(store, opts = {}) {
  const st = store.getState()
  const result = { ...checkLayout(st.objects, { ...viewOpts(), gridSize: st.gridSize || 40, ...opts }), at: Date.now() }
  useLayoutCheck.setState({ result, open: true })
  return result
}

/** The zoom that fits \`box\` (world px) in a canvas of \`size\`, with a margin. */
export function fitBox(box, size, margin = 0.25) {
  const w = Math.max(box.w, 1), h = Math.max(box.h, 1)
  const pad = 1 - margin * 2
  const zoom = Math.max(0.01, Math.min(4, Math.min((size.w * pad) / w, (size.h * pad) / h)))
  return { zoom, panX: size.w / 2 - (box.x + w / 2) * zoom, panY: size.h / 2 - (box.y + h / 2) * zoom }
}

/** Clicking an item: select its object(s) and zoom to the spot. */
export function goToIssue(store, item, size) {
  const st = store.getState()
  const ids = item.ids.filter(id => st.objects.some(o => o.id === id))
  if (ids.length) st.selectGroup(ids)
  if (size && item.box) { const v = fitBox(item.box, size); st.setViewport(v.zoom, v.panX, v.panY) }
  return ids
}

/** Export: with errors, ask first (never block); otherwise export. */
export function exportWithCheck(store, exportFn, opts = {}) {
  const result = checkLayout(store.getState().objects, { ...viewOpts(), gridSize: store.getState().gridSize || 40, ...opts })
  if (result.errors.length) {
    useLayoutCheck.setState({ result: { ...result, at: Date.now() }, askExport: { errors: result.errors.length } })
    return false
  }
  exportFn()
  return true
}
/** The question's answers. */
export function exportAnyway(exportFn) { useLayoutCheck.setState({ askExport: null }); exportFn() }
export function showIssues() { useLayoutCheck.setState({ askExport: null, open: true }) }
