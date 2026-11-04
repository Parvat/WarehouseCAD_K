// doorTool.js — Add door (STUDIO.md §7): a tool. Hover any wall of a building, on any side: a door preview snaps to
// the wall's INNER face where the pointer is; a click places the door there (one undo step); the tool stays on for
// the next one; Esc ends it. Its mode bar (canvas2/DoorBar.jsx): Add door · the door types in the library today ·
// the width (the type's, or typed).
//
// The door types are the library's own (constants/warehouseObjects.js, the Structural section), in this order: Man
// door (3′), Dock door (9′), Drive-in door (12′, overhead) — their default width, their depth into the building and
// their look come from there. Presentation
// state (the type, the width, the hover) lives here, never in the store.

import { create } from 'zustand'
import { WAREHOUSE_CATEGORIES } from '../constants/warehouseObjects'
import { innerOutline } from './floorGeom'
import { layerForType } from './layers'

export const DOOR_TOOL = 'door'
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

/* the tool's segmented, in order, and what it calls each */
const DOOR_IDS = ['struct_egress', 'struct_loading_dock', 'struct_drive_in']
const DOOR_NAMES = { struct_egress: 'Man door', struct_loading_dock: 'Dock door', struct_drive_in: 'Drive-in door' }

/** The door types in the library today: { id, type, label, short, widthFt, depthFt, color, snapType, meta }. */
export function doorTypes() {
  const cat = WAREHOUSE_CATEGORIES.find(c => c.id === 'structural'), items = cat ? cat.objects.map(o => ({ ...o, color: o.color || cat.color })) : []
  return DOOR_IDS.map(id => items.find(i => i.id === id)).filter(Boolean).map(i => ({
    id: i.id, type: i.type, label: i.label, short: DOOR_NAMES[i.id],
    widthFt: i.w, depthFt: i.h, color: i.color, snapType: i.snapType, meta: i.meta,
  }))
}

export const useDoorTool = create(() => ({ typeId: 'struct_loading_dock', widthFt: null, hover: null }))
/** The type picked, and the width the next door gets (typed, else the type's). */
export function doorSpec() {
  const s = useDoorTool.getState(), types = doorTypes()
  const t = types.find(x => x.id === s.typeId) || types[0]
  return t ? { ...t, widthFt: s.widthFt ?? t.widthFt } : null
}
export const setDoorType = (typeId) => useDoorTool.setState({ typeId, widthFt: null })
export const setDoorWidth = (ft) => { if (Number.isFinite(ft) && ft > 0) useDoorTool.setState({ widthFt: ft }) }
export const clearDoorHover = () => { if (useDoorTool.getState().hover) useDoorTool.setState({ hover: null }) }

const inside = (poly, p) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Where a door goes for the pointer at world `w`: the inner wall face nearest it, within `reach` (world px) of that
 *  face — on either side of the wall — the door `widthFt` wide along it (centred on the pointer, kept on that wall)
 *  and `depthFt` deep into the building. → { fpId, x, y, width, height, rotation, line: [x1, y1, x2, y2] } or null. */
export function doorAt(objects, w, spec, gridSize = 40, reach = 0) {
  if (!spec) return null
  let best = null
  for (const fp of objects.filter(o => o && FP.has(o.type))) {
    const poly = innerOutline(fp, gridSize)
    if (!poly || poly.length < 3) continue
    const wt = (fp.wallThicknessFt || 0.25) * gridSize
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1e-6) continue
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
      const t = (w.x - a.x) * ux + (w.y - a.y) * uy
      if (t < -wt || t > len + wt) continue
      const px = a.x + ux * Math.max(0, Math.min(len, t)), py = a.y + uy * Math.max(0, Math.min(len, t))
      const d = Math.hypot(w.x - px, w.y - py)
      if (d > wt + reach || (best && d >= best.d)) continue
      // the inward normal: the side the floor is on
      let nx = -uy, ny = ux
      const probe = { x: (a.x + b.x) / 2 + nx * 2, y: (a.y + b.y) / 2 + ny * 2 }
      if (!inside(poly, probe)) { nx = -nx; ny = -ny }
      const W = spec.widthFt * gridSize, D = spec.depthFt * gridSize
      if (W > len) continue
      const c = Math.max(W / 2, Math.min(len - W / 2, t))
      const fx = a.x + ux * c, fy = a.y + uy * c                         // on the inner face
      const cx = fx + nx * D / 2, cy = fy + ny * D / 2
      const rotation = ((Math.round((Math.atan2(uy, ux) * 180) / Math.PI / 90) * 90) % 360 + 360) % 360
      best = { d, fpId: fp.id, x: cx - W / 2, y: cy - D / 2, width: W, height: D, rotation, line: [fx - ux * W / 2, fy - uy * W / 2, fx + ux * W / 2, fy + uy * W / 2] }
    }
  }
  if (!best) return null
  const { d, ...door } = best
  return door
}

/** The door object placed for `at` (doorAt) — the library's own fields for that type. */
export function doorObject(at, spec, newId) {
  const color = spec.color || '#6366f1'
  return {
    id: newId(), type: spec.type, x: at.x, y: at.y, width: at.width, height: at.height, rotation: at.rotation,
    fill: color + '22', stroke: color, strokeWidth: 1.5, opacity: 1, noFill: false, label: spec.label,
    snapType: spec.snapType, meta: { ...(spec.meta || {}), doorWidth: spec.widthFt }, parentId: at.fpId, layerId: layerForType(spec.type),
  }
}

/** The pointer moved with the tool on. */
export function hoverDoor(objects, w, gridSize, zoom) {
  const at = doorAt(objects, w, doorSpec(), gridSize, 16 / zoom)
  useDoorTool.setState({ hover: at })
  return at
}
/** A click with the tool on: the door placed where the preview is (one undo step). Returns the new door or null. */
export function placeDoor(store, w, newId, zoom) {
  const st = store.getState(), spec = doorSpec(), at = doorAt(st.objects, w, spec, st.gridSize || 40, 16 / zoom)
  if (!at) return null
  const door = doorObject(at, spec, newId)
  st.addObject(door)
  return door
}
