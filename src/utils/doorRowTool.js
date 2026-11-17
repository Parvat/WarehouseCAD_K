// doorRowTool.js — the Door row tool (door-row round; STUDIO.md, Doors; mockup rowcard.png): a row of equal doors along one
// wall, of any door type. Its card (studio/doorRowCard.jsx): a Type switch (Man, Dock, Drive-in — opening on the type picked
// in the Add door bar), Door width and Height (the type's until typed), Gap between, Start gap; How many — Fill the rest, or
// Count (a typed number). The row starts at its BASE — a click on a wall: the end of the last door already on it, else its
// low corner; a drag along it: where the drag starts — then the Start gap, then door, gap, door … .
//   - Fill the rest: as many as fit before the end — the wall's far corner, the drag's end, or (a door already further
//     along) one Gap before the first of those: it stops there, never skips over a door. The card: doors that fit, the
//     length left at the end.
//   - Count: that many; the card: the length they need, the free length after the last one — refused with a notice when
//     they do not fit (or would overlap a door already on the wall).
// The release places them all — ONE undo step; doors already on the wall are never overlapped. Their clear spaces follow
// the door rule (utils/doorClear.js). Presentation state lives here, never in the store.

import { create } from 'zustand'
import { doorAt, doorObject, doorTypes, DOOR_HEIGHT_FT } from './doorTool'
import { doorWall, spanOf, doorsOnWall, doorPlaced } from './doorWall'
import { notify } from './notice'
import { ftIn } from './bom'

export const DOOR_ROW_TOOL = 'door_row'
export const ROW_TYPES = ['struct_egress', 'struct_loading_dock', 'struct_drive_in']
const specOf = (id) => doorTypes().find(t => t.id === id) || doorTypes().find(t => t.id === 'struct_loading_dock')

/* the card's values (ft) and the gesture: `hover` the wall under the pointer and where on it, `drag` the span dragged.
   widthTyped / heightTyped: typed — a Type switch then keeps them (else they follow the type's) */
export const useDoorRow = create(() => ({ typeId: 'struct_loading_dock', widthFt: 9, heightFt: 10, widthTyped: false, heightTyped: false,
  gapFt: 12, startFt: 12, mode: 'fill', count: 4, hover: null, drag: null }))
export const setDoorRow = (patch) => useDoorRow.setState(patch)
export const clearDoorRow = () => useDoorRow.setState({ hover: null, drag: null })
/** The Type switch: the type, and its width and height unless typed. */
export function setRowType(id) {
  if (!ROW_TYPES.includes(id)) return
  const s = useDoorRow.getState(), spec = specOf(id)
  useDoorRow.setState({ typeId: id, ...(s.widthTyped ? null : { widthFt: spec.widthFt }), ...(s.heightTyped ? null : { heightFt: DOOR_HEIGHT_FT[id] ?? s.heightFt }) })
}
/** The tool opened (the Add door bar's Door row, a building's bar): on type `id` (the Add door bar's), its width and height. */
export function openDoorRow(id) {
  const t = ROW_TYPES.includes(id) ? id : useDoorRow.getState().typeId
  useDoorRow.setState({ widthTyped: false, heightTyped: false, hover: null, drag: null })
  setRowType(t)
}

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

/** The span the gesture covers now: { w, lo, hi, whole (a click — the whole wall), ref } — the drag's (along its wall),
 *  else the whole hovered wall. */
export function rowSpan() {
  const s = useDoorRow.getState()
  if (s.drag) return { w: s.drag.w, lo: Math.min(s.drag.p0, s.drag.p1), hi: Math.max(s.drag.p0, s.drag.p1), whole: Math.abs(s.drag.p1 - s.drag.p0) < 1e-6, ref: s.drag.ref }
  if (s.hover) return { w: s.hover.w, lo: s.hover.w.lo, hi: s.hover.w.hi, whole: true, ref: s.hover.d }
  return null
}

/**
 * The row the gesture would place on `span` (rowSpan): { doors (world objects, before ids), mode, base (where the Start
 * gap is measured from), start (the first door's low end), end (where the row must stop), stopDoor (the door it stops
 * before, or null), n, need (the length the doors take), leftover (Fill: the length left at the end), free (Count: after
 * the last door), fits, why (a Count that does not fit: its notice), spec, W, D, lay (the card's: { length, leftover }) }.
 */
export function rowDoors(objects, span, gridSize = 40) {
  const s = useDoorRow.getState(), spec = specOf(s.typeId)
  const none = { doors: [], n: 0, need: 0, leftover: 0, free: 0, fits: false, mode: s.mode, lay: { length: 0, leftover: 0 } }
  if (!span || !spec) return none
  const gs = gridSize, W = s.widthFt * gs, G = s.gapFt * gs, D = spec.depthFt * gs, w = span.w
  const taken = doorsOnWall(objects, w, gs).map(spanOf).sort((p, q) => p[0] - q[0])
  // the base: a click — the last door on the wall (its far end), else the corner; a drag — where it starts
  const base = span.whole ? (taken.length ? Math.max(...taken.map(t => t[1])) : w.lo) : span.lo
  const start = base + s.startFt * gs
  // the end: the far corner (a click) or the drag's end — or one Gap before the first door further along (never skipped over)
  const span1 = span.whole ? w.hi : span.hi
  const next = taken.find(t => t[0] >= start - 0.5 && t[0] < span1)
  const end = next ? next[0] - G : span1
  const at = (k) => start + k * (W + G)
  const place = (k) => ({ ...span.ref, ...doorPlaced(span.ref, w, at(k), W, D), type: spec.type })
  const over = (s0) => taken.some(([p, q]) => s0 < q - 0.5 && s0 + W > p + 0.5)
  if (s.mode === 'count') {
    const n = Math.max(0, Math.floor(s.count || 0)), need = n ? n * W + (n - 1) * G : 0
    const free = Math.min(span1, w.hi) - (start + need)
    const clash = Array.from({ length: n }, (_, k) => at(k)).some(over)
    const fits = n > 0 && start >= w.lo - 0.5 && free >= -0.5 && !clash
    const why = !n ? 'Type how many doors.' : clash ? 'Those doors would overlap a door already on this wall.' : !fits
      ? `${n} door${n === 1 ? '' : 's'} need ${ftIn((need / gs) * 12)}; only ${ftIn((Math.max(0, Math.min(span1, w.hi) - start) / gs) * 12)} is free after the start gap.` : null
    return { doors: fits ? Array.from({ length: n }, (_, k) => place(k)) : [], mode: 'count', base, start, end: span1, stopDoor: null, n, need, free, leftover: 0, fits, why, spec, W, D,
      lay: { length: Math.max(0, span1 - base), leftover: Math.max(0, free) } }
  }
  // Fill the rest: as many as fit between the start and the end
  const L = end - start, n = W > 0 && L >= W - 0.5 ? Math.floor((L + G + 0.5) / (W + G)) : 0
  const need = n ? n * W + (n - 1) * G : 0
  const doors = Array.from({ length: n }, (_, k) => place(k))
  const leftover = Math.max(0, (next ? next[0] : span1) - (n ? at(n - 1) + W : base))
  return { doors, mode: 'fill', base, start, end, stopDoor: next || null, n, need, leftover, free: 0, fits: n > 0, why: n ? null : 'No door fits there at this width, gap and start gap.', spec, W, D,
    lay: { length: Math.max(0, (next ? next[0] : span1) - base), leftover } }
}

/** The release: the row placed — ONE undo step. → the doors placed. */
export function placeDoorRow(store, newId) {
  const st = store.getState(), gs = st.gridSize || 40, span = rowSpan(), r = rowDoors(st.objects, span, gs), s = useDoorRow.getState()
  useDoorRow.setState({ drag: null })
  if (!span || !r.doors.length) { if (span) notify(r.why || 'No door fits there at this width and gap.'); return [] }
  const made = r.doors.map(d => {
    const at = { x: d.x, y: d.y, width: d.width, height: d.height, rotation: d.rotation, fpId: d.parentId, ...(d.sectionId ? { sectionId: d.sectionId } : {}) }
    const o = doorObject(at, { ...r.spec, widthFt: s.widthFt }, newId)
    return { ...o, meta: { ...(o.meta || {}), heightFt: s.heightFt } }
  })
  store.setState({ objects: [...st.objects, ...made.map(o => ({ id: o.id, layerId: st.activeLayerId, strokeWidth: 1.5, opacity: 1, rotation: 0, noFill: false, ...o }))] })
  store.getState().commitObjectUpdate(made[0].id, {})
  return made
}
