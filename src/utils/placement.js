// placement.js — adding rows by hand (paste, duplicate, the left panel): the
// new row follows the mouse, faded, and snaps; a click places it, Esc
// cancels. Nothing is in the layout until the click, so the click is ONE
// action (one undo step) — after which "Copy to all sections" is offered
// (utils/copyPrompt.js).
//
// Snapping, on each axis of the building's rows, to the nearest of (within
// SNAP_PX on screen):
//   - across: an aisle EQUAL TO THE FORKLIFT AISLE from a row on either
//     side; back to back with a row; a column centred in the row (in a
//     double row's flue) or the row against a column's face;
//   - along: a row's start or end; against a column's face.
// Where it would stand is checked as it moves:
//   - hard (red outline, a click does nothing): overlapping a rack, outside
//     the building;
//   - soft (placed, with a warning): a narrow aisle, a column in the row, and
//     in a cross-aisle (orange outline) — while planning, the dealer may not
//     know yet where the cross-aisles go. Only cross-aisles between generated
//     sections count: a layout placed by hand has none to warn about.

import { create } from 'zustand'
import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { layoutColumns } from '../generate/usableCapacity'
import { isRow, generatedCrossAisleGaps, hardProblem, softProblems } from './copyChange'
import { sectionLabel } from './sectionCopy'
import { getColumnCheckView } from '../generate/columnCheckView'

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
export const SNAP_PX = 12

/** The placement in progress: { items (as they will be placed, before the
 *  move), groups, dx, dy, blocked (reason or null), warnings, fpId, snapped }. */
export const usePlacement = create(() => ({ active: null }))
export const isPlacing = () => !!usePlacement.getState().active

const boxOf = (o) => {
  if (typeof o.type === 'string' && o.type.startsWith('rack_')) { const f = rackFootprint(o); return { x: f.x, y: f.y, r: f.x + f.w, b: f.y + f.h } }
  const x = o.cx ?? o.x1 ?? o.x ?? 0, y = o.cy ?? o.y1 ?? o.y ?? 0
  return { x, y, r: o.x2 ?? x + (o.width ?? 0), b: o.y2 ?? y + (o.height ?? 0) }
}
const centreOf = (items) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const o of items) { const b = boxOf(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.r); y1 = Math.max(y1, b.b) }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}
/** An object shifted by (dx, dy). */
export function shifted(o, dx, dy) {
  const c = { ...o }
  if (c.type === 'circle') { c.cx += dx; c.cy += dy }
  else if ('x1' in c) { c.x1 += dx; c.y1 += dy; c.x2 += dx; c.y2 += dy }
  else { if ('x' in c) c.x += dx; if ('y' in c) c.y += dy; if (c.tailX !== undefined) { c.tailX += dx; c.tailY += dy } }
  if (c.fpVerts) c.fpVerts = c.fpVerts.map(v => ({ x: v.x + dx, y: v.y + dy }))
  return c
}
const buildingAt = (objects, x, y) => [...objects].reverse().find(f => FP.has(f.type) && x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height) || null

/** The snapped move for `items` with their centre at the pointer `world`:
 *  { dx, dy, snapped: { run, cross } (what caught, or null), fpId }. */
export function snapPlacement(items, objects, world, gridSize = 40, zoom = 1, profile = MHE_PROFILES.reach) {
  const c = centreOf(items)
  let dx = world.x - c.x, dy = world.y - c.y
  const ref = items.find(isRow)
  if (!ref) return { dx, dy, snapped: { run: null, cross: null }, fpId: null }
  const f0 = rackFootprint(ref), rot = f0.rotated
  const fp = buildingAt(objects, f0.x + f0.w / 2 + dx, f0.y + f0.h / 2 + dy)
  if (!fp) return { dx, dy, snapped: { run: null, cross: null }, fpId: null }
  const ids = new Set(items.map(o => o.id))
  const run = (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w]), cross = (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
  const [r0] = run(f0), [c0] = cross(f0)
  const rLen = run(f0)[1] - r0, cLen = cross(f0)[1] - c0
  const dRun = rot ? dy : dx, dCross = rot ? dx : dy
  const aisle = profile.aisleFt * gridSize
  const runC = [], crossC = []
  for (const o of objects) {
    if (ids.has(o.id) || !isRow(o) || o.parentId !== fp.id || rackFootprint(o).rotated !== rot) continue
    const g = rackFootprint(o), [s0, s1] = run(g), [d0, d1] = cross(g)
    crossC.push({ at: d1 + aisle, why: 'aisle' }, { at: d0 - aisle - cLen, why: 'aisle' }, { at: d1, why: 'back to back' }, { at: d0 - cLen, why: 'back to back' })
    runC.push({ at: s0, why: 'row start' }, { at: s1 - rLen, why: 'row end' })
  }
  for (const col of layoutColumns(objects, gridSize)) {
    const cf = { x: col.x, y: col.y, w: col.w, h: col.h }, [q0, q1] = run(cf), [e0, e1] = cross(cf)
    crossC.push({ at: (e0 + e1) / 2 - cLen / 2, why: 'column' }, { at: e1, why: 'column' }, { at: e0 - cLen, why: 'column' })
    runC.push({ at: q1, why: 'column' }, { at: q0 - rLen, why: 'column' })
  }
  const snapR = SNAP_PX / (zoom || 1)
  const pick = (cands, raw) => cands.map(q => ({ ...q, dist: Math.abs(q.at - raw) })).filter(q => q.dist <= snapR).sort((a, b) => a.dist - b.dist)[0] || null
  const pr = pick(runC, r0 + dRun), pc = pick(crossC, c0 + dCross)
  const nRun = pr ? pr.at - r0 : dRun, nCross = pc ? pc.at - c0 : dCross
  return { dx: rot ? nCross : nRun, dy: rot ? nRun : nCross, snapped: { run: pr ? pr.why : null, cross: pc ? pc.why : null }, fpId: fp.id }
}

/** The items placed at (dx, dy): racks parented to the building they land
 *  in (an item whose building comes with it keeps it). */
export function placedItems(items, objects, dx, dy) {
  const ids = new Set(items.map(o => o.id))
  return items.map(o => {
    const c = shifted(o, dx, dy)
    if (typeof c.type === 'string' && c.type.startsWith('rack_') && !(o.parentId && ids.has(o.parentId))) {
      const b = boxOf(c), home = buildingAt(objects, (b.x + b.r) / 2, (b.y + b.b) / 2)
      if (home) c.parentId = home.id; else delete c.parentId
    }
    return c
  })
}

/** Where the placed rows would stand: { blocked (first hard problem —
 *  overlapping a rack, outside the building — or null), warnings: [text],
 *  crossAisle (standing in a generated cross-aisle: a warning, not a block) }. */
export function checkPlacement(placed, objects, gridSize = 40, profile = MHE_PROFILES.reach) {
  const world = [...objects, ...placed]
  const warnings = new Set()
  let blocked = null, crossAisle = false
  const cols = layoutColumns(objects, gridSize)
  for (const r of placed.filter(isRow)) {
    const rot = rackFootprint(r).rotated
    blocked = blocked || hardProblem(r, world, [], rot, gridSize)                 // no gaps: a cross-aisle never blocks
    const f = rackFootprint(r), [r0, r1] = rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w]
    const gaps = r.parentId ? generatedCrossAisleGaps(objects, r.parentId, rot) : []
    const g = gaps.find(q => Math.min(r1, q.hi) - Math.max(r0, q.lo) > 0.5)
    if (g) { crossAisle = true; warnings.add(`In the cross-aisle between sections ${sectionLabel(g.between[0])} and ${sectionLabel(g.between[1])}`) }
    for (const t of softProblems(r, world, rot, gridSize, profile, cols)) warnings.add(t)
  }
  return { blocked, warnings: [...warnings], crossAisle }
}

/** Start placing `items` (new objects, fresh ids) at the world point `at`. */
export function startPlacement(store, items, { groups = [], at = null } = {}) {
  if (!items || !items.length) return false
  const st = store.getState()
  const c = centreOf(items)
  const p = at || c
  usePlacement.setState({ active: { items, groups, dx: p.x - c.x, dy: p.y - c.y, blocked: null, warnings: [], crossAisle: false, fpId: null, snapped: { run: null, cross: null } } })
  movePlacement(store, p, st.zoom || 1)
  return true
}

/** The pointer moved to `world`. */
export function movePlacement(store, world, zoom = 1, profile) {
  const a = usePlacement.getState().active
  if (!a) return
  const st = store.getState(), gridSize = st.gridSize || 40
  const prof = profile || safeProfile()
  const s = snapPlacement(a.items, st.objects, world, gridSize, zoom, prof)
  const placed = placedItems(a.items, st.objects, s.dx, s.dy)
  const chk = checkPlacement(placed, st.objects, gridSize, prof)
  usePlacement.setState({ active: { ...a, dx: s.dx, dy: s.dy, snapped: s.snapped, fpId: s.fpId, blocked: chk.blocked, warnings: chk.warnings, crossAisle: chk.crossAisle } })
}

/** Place where it is now: one history entry, the new objects selected.
 *  Does nothing (returns false) while blocked. */
export function commitPlacement(store, guard = null) {
  const a = usePlacement.getState().active
  if (!a || a.blocked) return false
  const st = store.getState()
  const placed = placedItems(a.items, st.objects, a.dx, a.dy)
  // a row placed in another section while changes are pending there: ask first
  if (guard && !guard(placed)) return false
  // only the new objects look selected: no other rack keeps a clicked bay
  const others = st.objects.map(o => (o.activeBayIdx != null || o.activeTowerIdx != null ? { ...o, activeBayIdx: null, ...(o.activeTowerIdx != null ? { activeTowerIdx: null } : {}) } : o))
  usePlacement.setState({ active: null })
  store.setState({ objects: [...others, ...placed], groups: [...(st.groups || []), ...a.groups], selectedIds: placed.map(o => o.id), activeBaySelection: [] })
  store.getState().commitObjectUpdate(placed[0].id, {})
  return true
}

/** Esc: nothing is placed. */
export function cancelPlacement() {
  if (!usePlacement.getState().active) return false
  usePlacement.setState({ active: null })
  return true
}

const safeProfile = () => { try { return getColumnCheckView().profile || MHE_PROFILES.reach } catch { return MHE_PROFILES.reach } }
