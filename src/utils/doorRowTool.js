// doorRowTool.js — a row of doors, in the Add door bar (door-row round; STUDIO.md, Doors; design/doorbar.png — the source of
// truth; was a Door row tool with its own card). The bar keeps the door type and its Width, and gets a **Row** toggle; Row
// on, Gap (ft) and Count slide into the bar — nothing else opens. Height follows the type (utils/doorTool.js DOOR_HEIGHT_FT).
//   - Row with a Count: the whole row — Count doors of Width, Gap apart — follows the pointer along any wall (centred on it,
//     kept on the wall), with live distances from its ends to the corner or the nearest door on each side; a number typed
//     sets the LEFT distance (Enter drops it there); a click drops the row. A row over a door already on the wall is
//     refused: drawn red, never dropped.
//   - Row with Count empty: a drag along a wall fills that span with as many doors as fit at Width and Gap, starting at
//     the drag's start (toward its end) — it stops before a door already there, never skips over or overlaps it.
// Every row is ONE undo step. Pure state and layout; the canvas wiring is canvas2/Canvas2.jsx, the bar and the preview
// canvas2/DoorBar.jsx.

import { doorAt, doorObject, doorSpec, useDoorTool, isDoor } from './doorTool'
import { doorWall, spanOf, doorsOnWall, doorPlaced } from './doorWall'
import { notify } from './notice'
import { ftIn } from './bom'

/** The wall under world point `p` (the door tool's own wall finding — building walls and section Fence / Wall edges) →
 *  { w, along (the pointer along it, world px), a (doorAt's), d (a stand-in door on it) } or null. */
export function rowWallAt(objects, p, gridSize = 40, reach = 0, only = null) {
  const spec = { widthFt: 0.05, depthFt: 1, type: 'struct_loading_dock' }
  const a = doorAt(objects, p, spec, gridSize, reach, only)
  if (!a) return null
  const d = { id: '__row', type: spec.type, x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation, parentId: a.fpId, ...(a.sectionId ? { sectionId: a.sectionId } : {}) }
  const w = doorWall(d, objects, gridSize)
  if (!w) return null
  const [s0, s1] = spanOf(d)
  return { w, along: (s0 + s1) / 2, a, d }
}

/** The row's settings now: { on, count (null: empty), gapFt, spec (the type, its width), W, G (world px), len (a Count row's
 *  length, world px) }. */
export function rowSettings(gridSize = 40) {
  const s = useDoorTool.getState(), spec = doorSpec(), gs = gridSize
  const count = s.rowCount > 0 ? Math.floor(s.rowCount) : null
  const W = (spec?.widthFt || 0) * gs, G = (s.rowGapFt ?? 12) * gs
  return { on: !!s.row, count, gapFt: s.rowGapFt ?? 12, spec, W, G, len: count ? count * W + (count - 1) * G : 0 }
}
export const rowCountOn = () => { const s = useDoorTool.getState(); return !!s.row && s.rowCount > 0 }

/** The pointer moved with Row on and a Count: the whole row's box on the wall under it (centred on the pointer, kept on the
 *  wall) as the tool's hover. */
export function hoverRow(objects, w, gridSize, zoom) {
  const r = rowSettings(gridSize)
  if (!r.spec || !r.count) return null
  const at = doorAt(objects, w, { ...r.spec, widthFt: r.len / gridSize }, gridSize, 16 / zoom, useDoorTool.getState().onlySection)
  useDoorTool.setState({ hover: at })
  return at
}

/** The obstacles either side of [s0, s1] on wall `w`: the corner or the nearest door's end. */
function sides(objects, w, s0, s1, gridSize) {
  const taken = doorsOnWall(objects, w, gridSize).map(spanOf)
  let left = w.lo, right = w.hi, leftDoor = false, rightDoor = false
  for (const [a, b] of taken) {
    if (b <= s0 + 0.5 && b > left) { left = b; leftDoor = true }
    if (a >= s1 - 0.5 && a < right) { right = a; rightDoor = true }
  }
  return { left, right, leftDoor, rightDoor, taken }
}

/**
 * The Count row as it would drop now → { w, ref (a stand-in door on the wall), s0, s1 (its ends along the wall), starts
 * ([s0 …] each door's low end), left, right (the corner or nearest door each side), leftDist, rightDist, refused, why,
 * typed (the left distance typed, ft — the row placed by it) } or null.
 */
export function rowNow(objects, gridSize = 40) {
  const t = useDoorTool.getState(), r = rowSettings(gridSize), at = t.hover
  if (!r.on || !r.count || !at || !r.spec) return null
  const ref = { id: '__row', type: r.spec.type, x: at.x, y: at.y, width: at.width, height: at.height, rotation: at.rotation, parentId: at.fpId, ...(at.sectionId ? { sectionId: at.sectionId } : {}) }
  const w = doorWall(ref, objects, gridSize)
  if (!w) return null
  let [s0, s1] = spanOf(ref)
  const sd = sides(objects, w, s0, s1, gridSize)
  // a left distance typed: the row's left end that far from the corner or the door on its left
  let typed = null
  if (t.typed != null && t.typed !== '') {
    const v = parseFloat(String(t.typed).replace(/[′']/g, ''))
    if (Number.isFinite(v) && v >= 0) { typed = v; s0 = sd.left + v * gridSize; s1 = s0 + r.len }
  }
  const starts = Array.from({ length: r.count }, (_, k) => s0 + k * (r.W + r.G))
  const over = sd.taken.some(([a, b]) => s0 < b - 0.5 && s1 > a + 0.5)
  const off = s0 < w.lo - 0.5 || s1 > w.hi + 0.5
  const refused = over || off
  const why = over ? 'The row would overlap a door already on this wall — not placed.' : off ? 'The row would pass the corner — not placed.' : null
  const S = typed != null ? sides(objects, w, s0, s1, gridSize) : sd
  return { w, ref, s0, s1, starts, left: S.left, right: S.right, leftDist: s0 - S.left, rightDist: S.right - s1, refused, why, typed, spec: r.spec, W: r.W, G: r.G, count: r.count }
}

/**
 * A drag along a wall with Row on → the doors that fill it: from the drag's start toward its end, as many as fit at Width
 * and Gap (at most the Count, when there is one), stopping before a door already there → { w, ref, starts, n, dir } or null.
 */
export function rowFill(objects, drag, gridSize = 40) {
  const r = rowSettings(gridSize)
  if (!drag || !r.spec || !(r.W > 0)) return null
  const { w, p0, p1 } = drag, dir = p1 >= p0 ? 1 : -1, end = p1
  const taken = doorsOnWall(objects, w, gridSize).map(spanOf)
  const starts = []
  for (let k = 0; ; k++) {
    if (r.count && starts.length >= r.count) break
    const s0 = dir > 0 ? p0 + k * (r.W + r.G) : p0 - r.W - k * (r.W + r.G)
    if (dir > 0 ? s0 + r.W > end + 0.5 : s0 < end - 0.5) break
    if (s0 < w.lo - 0.5 || s0 + r.W > w.hi + 0.5) break
    if (taken.some(([a, b]) => s0 < b - 0.5 && s0 + r.W > a + 0.5)) break      // a door already there: stop before it
    starts.push(s0)
  }
  return { w, ref: drag.ref, starts, n: starts.length, dir, spec: r.spec, W: r.W }
}

/** The doors for `starts` along wall `w` (low ends), placed — ONE undo step. → the doors placed. */
export function placeRowDoors(store, w, ref, starts, newId) {
  const st = store.getState(), gs = st.gridSize || 40, spec = doorSpec()
  if (!spec || !starts.length) return []
  const W = spec.widthFt * gs, D = spec.depthFt * gs
  const made = starts.map(s0 => {
    const g = doorPlaced(ref, w, s0, W, D)
    const at = { ...g, rotation: ref.rotation, fpId: ref.parentId, ...(ref.sectionId ? { sectionId: ref.sectionId } : {}) }
    return doorObject(at, spec, newId)
  })
  store.setState({ objects: [...st.objects, ...made.map(o => ({ layerId: st.activeLayerId, ...o }))] })
  store.getState().commitObjectUpdate(made[made.length - 1].id, {})
  useDoorTool.setState({ anchorId: made[made.length - 1].id, typed: null })
  return made
}

/** A click (or Enter with a left distance typed) with a Count: the row dropped where it is shown — refused with a notice
 *  when it would overlap a door or pass the corner. → the doors placed. */
export function dropRow(store, newId) {
  const st = store.getState(), gs = st.gridSize || 40, R = rowNow(st.objects, gs)
  useDoorTool.setState({ typed: null })
  if (!R) return []
  if (R.refused) { notify(R.why); return [] }
  return placeRowDoors(store, R.w, R.ref, R.starts, newId)
}

/** The release of a drag with Row on: the span filled. */
export function fillRow(store, drag, newId) {
  const st = store.getState(), gs = st.gridSize || 40, F = rowFill(st.objects, drag, gs)
  if (!F || !F.n) { notify('No door fits there at this width and gap.'); return [] }
  return placeRowDoors(store, F.w, F.ref, [...F.starts].sort((a, b) => a - b), newId)
}

/** A length in feet and inches (the row's labels). */
export const rowLen = (px, gridSize = 40) => ftIn((px / gridSize) * 12)
void isDoor
