// doorRowTool.js — the Dock door row tool (doors-edit round; STUDIO.md, Doors; mockup doors2.png §3): a row of equal doors
// along one wall. Door width, Gap between, Type (Dock / Drive-in) and Height are set in its card; a drag along a wall (or
// a section's Fence or Wall edge) previews the doors with their count; the release places them all — ONE undo step. A
// click on a wall (no drag) fills the whole of it. As many doors as fit; the length left over split evenly at both ends.
// Their clear spaces follow the door rule (utils/doorClear.js). Presentation state lives here, never in the store.

import { create } from 'zustand'
import { doorAt, doorObject, doorTypes } from './doorTool'
import { doorWall, spanOf, doorsOnWall, doorPlaced } from './doorWall'
import { notify } from './notice'

export const DOOR_ROW_TOOL = 'door_row'
export const ROW_TYPES = ['struct_loading_dock', 'struct_drive_in']

/* the card's values (ft) and the gesture: `hover` the wall under the pointer and where on it, `drag` the span dragged */
export const useDoorRow = create(() => ({ widthFt: 9, gapFt: 12, typeId: 'struct_loading_dock', heightFt: 10, hover: null, drag: null }))
export const setDoorRow = (patch) => useDoorRow.setState(patch)
export const clearDoorRow = () => useDoorRow.setState({ hover: null, drag: null })

/** The wall under world point `p` (doorTool's own wall finding — building walls and section Fence / Wall edges) →
 *  { w, at (along it), at0 (the preview's placement, for its side) } or null. */
export function rowWallAt(objects, p, gridSize = 40, reach = 0) {
  const spec = { widthFt: 0.05, depthFt: 1, type: 'struct_loading_dock' }
  const a = doorAt(objects, p, spec, gridSize, reach)
  if (!a) return null
  const d = { id: '__row', type: spec.type, x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation, parentId: a.fpId, ...(a.sectionId ? { sectionId: a.sectionId } : {}) }
  const w = doorWall(d, objects, gridSize)
  if (!w) return null
  const [s0, s1] = spanOf(d)
  return { w, along: (s0 + s1) / 2, a, d }
}

/** The row for the span [lo, hi] of wall `w` (world px): { n, used, leftover, starts: [s0 …] (each door's low end), W }. */
export function rowLayout(lo, hi, W, G) {
  const L = Math.max(0, hi - lo)
  const n = W > 0 ? Math.max(0, Math.floor((L + G + 1e-6) / (W + G))) : 0
  const used = n ? n * W + (n - 1) * G : 0, start = lo + (L - used) / 2
  return { n, used, leftover: L - used, length: L, starts: Array.from({ length: n }, (_, k) => start + k * (W + G)), W }
}

/** The span the gesture covers now: { w, lo, hi } — the drag's (along its wall), else the whole hovered wall. */
export function rowSpan() {
  const s = useDoorRow.getState()
  if (s.drag) return { w: s.drag.w, lo: Math.min(s.drag.p0, s.drag.p1), hi: Math.max(s.drag.p0, s.drag.p1), whole: Math.abs(s.drag.p1 - s.drag.p0) < 1e-6, ref: s.drag.ref }
  if (s.hover) return { w: s.hover.w, lo: s.hover.w.lo, hi: s.hover.w.hi, whole: true, ref: s.hover.d }
  return null
}

/** The doors the row would place on `span` (rowSpan): world objects, before ids. Spots overlapping a door already on the
 *  wall are left out. */
export function rowDoors(objects, span, gridSize = 40) {
  const s = useDoorRow.getState(), spec = doorTypes().find(t => t.id === s.typeId) || doorTypes()[1]
  if (!span || !spec) return { doors: [], lay: rowLayout(0, 0, 1, 0) }
  const W = s.widthFt * gridSize, G = s.gapFt * gridSize, D = spec.depthFt * gridSize
  const lo = span.whole ? span.w.lo : span.lo, hi = span.whole ? span.w.hi : span.hi
  const lay = rowLayout(lo, hi, W, G)
  const taken = doorsOnWall(objects, span.w, gridSize).map(spanOf)
  const doors = []
  for (const s0 of lay.starts) {
    if (taken.some(([a, b]) => s0 < b - 0.5 && s0 + W > a + 0.5)) continue
    const g = doorPlaced(span.ref, span.w, s0, W, D)
    doors.push({ ...span.ref, ...g, type: spec.type })
  }
  return { doors, lay, spec, W, D }
}

/** The release: the row placed — ONE undo step. → the doors placed. */
export function placeDoorRow(store, newId) {
  const st = store.getState(), gs = st.gridSize || 40, span = rowSpan(), r = rowDoors(st.objects, span, gs), s = useDoorRow.getState()
  useDoorRow.setState({ drag: null })
  if (!span || !r.doors.length) { if (span) notify('No door fits there at this width and gap.'); return [] }
  const made = r.doors.map(d => {
    const at = { x: d.x, y: d.y, width: d.width, height: d.height, rotation: d.rotation, fpId: d.parentId, ...(d.sectionId ? { sectionId: d.sectionId } : {}) }
    const o = doorObject(at, { ...r.spec, widthFt: s.widthFt }, newId)
    return { ...o, meta: { ...(o.meta || {}), heightFt: s.heightFt } }
  })
  store.setState({ objects: [...st.objects, ...made.map(o => ({ id: o.id, layerId: st.activeLayerId, strokeWidth: 1.5, opacity: 1, rotation: 0, noFill: false, ...o }))] })
  store.getState().commitObjectUpdate(made[0].id, {})
  return made
}
