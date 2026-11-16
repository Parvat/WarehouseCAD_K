// doorClear.js — a door's clear space (fill-doors round; STUDIO.md, Door clear spaces): the floor kept open in front of
// a door.
//   - Dock and drive-in doors: the door's width plus 2 ft each side, as deep as the travel width of the equipment in
//     force there (utils/fillTool.js fillEquipment — the section's truck, else the project's).
//   - Man doors: the door's width plus 1 ft each side, 44 in deep.
//   - A door in a building wall: one clear space, from the wall's inner face into the building.
//   - A door in a section's Fence or Wall (it straddles the edge): one on each side of the edge, each as deep as the
//     travel width of the equipment on that side (a man door: 44 in both).
// Fill keeps them clear (generate/fillRacking.js patternFill: a row breaks around one and carries on past it); Check
// flags a rack inside one (utils/layoutCheck.js, kind 'door'); the plan draws them dashed (canvas only). Pure.

import { innerOutline } from './floorGeom'
import { isDoor } from './doorTool'
import { fillEquipment } from './fillTool'

export const DOCK_DOORS = new Set(['struct_loading_dock', 'struct_drive_in'])
export const DOCK_SIDE_FT = 2
export const MAN_SIDE_FT = 1
export const MAN_DEPTH_IN = 44
export const DOOR_NAMES = { struct_egress: 'Man door', struct_loading_dock: 'Dock door', struct_drive_in: 'Drive-in door' }

const FP = /^fp_/
/* a door's footprint, world box (a door turned 90° / 270° is stored wide and drawn tall, as a rack is) */
const footOf = (o) => {
  const rot = ((((o.rotation || 0) % 180) + 180) % 180)
  if (rot === 90) { const cx = o.x + o.width / 2, cy = o.y + o.height / 2; return { x0: cx - o.height / 2, y0: cy - o.width / 2, x1: cx + o.height / 2, y1: cy + o.width / 2 } }
  return { x0: o.x, y0: o.y, x1: o.x + o.width, y1: o.y + o.height }
}
const inside = (poly, x, y) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}
/** The travel width (px) of the equipment in force at world point `p`. */
const travelAt = (objects, p, gridSize) => (fillEquipment(objects, p)?.travelFt || 8) * gridSize

/** Door `d`'s clear spaces (world px): [{ x, y, w, h, doorId, dock }] — none when no wall is found behind it. */
export function doorClearOf(d, objects, gridSize = 40) {
  if (!isDoor(d)) return []
  const f = footOf(d), dock = DOCK_DOORS.has(d.type), r = { doorId: d.id, dock }
  const side = (dock ? DOCK_SIDE_FT : MAN_SIDE_FT) * gridSize, man = (MAN_DEPTH_IN / 12) * gridSize
  const along = ((((d.rotation || 0) % 180) + 180) % 180) !== 90           // the door runs along x (a horizontal wall)
  if (d.sectionId) {
    // in a section's edge: centred on the edge line — a clear space each side, each side's own depth
    const e = along ? (f.y0 + f.y1) / 2 : (f.x0 + f.x1) / 2, cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, probe = 2
    const dLo = dock ? travelAt(objects, along ? { x: cx, y: e - probe } : { x: e - probe, y: cy }, gridSize) : man
    const dHi = dock ? travelAt(objects, along ? { x: cx, y: e + probe } : { x: e + probe, y: cy }, gridSize) : man
    return along
      ? [{ ...r, x: f.x0 - side, y: e - dLo, w: f.x1 - f.x0 + 2 * side, h: dLo }, { ...r, x: f.x0 - side, y: e, w: f.x1 - f.x0 + 2 * side, h: dHi }]
      : [{ ...r, x: e - dLo, y: f.y0 - side, w: dLo, h: f.y1 - f.y0 + 2 * side }, { ...r, x: e, y: f.y0 - side, w: dHi, h: f.y1 - f.y0 + 2 * side }]
  }
  const fp = (objects || []).find(o => o.id === d.parentId && FP.test(o.type || '')) || (objects || []).find(o => FP.test(o.type || ''))
  if (!fp) return []
  const poly = innerOutline(fp, gridSize), e = 2
  // the side of the door on the wall: just past it is outside the floor
  const sides = [
    { k: 'top', out: [(f.x0 + f.x1) / 2, f.y0 - e] }, { k: 'bottom', out: [(f.x0 + f.x1) / 2, f.y1 + e] },
    { k: 'left', out: [f.x0 - e, (f.y0 + f.y1) / 2] }, { k: 'right', out: [f.x1 + e, (f.y0 + f.y1) / 2] },
  ]
  const wall = sides.find(s => !inside(poly, ...s.out))
  if (!wall) return []
  const depth = dock ? travelAt(objects, { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }, gridSize) : man
  if (wall.k === 'top') return [{ ...r, x: f.x0 - side, y: f.y0, w: f.x1 - f.x0 + 2 * side, h: depth }]
  if (wall.k === 'bottom') return [{ ...r, x: f.x0 - side, y: f.y1 - depth, w: f.x1 - f.x0 + 2 * side, h: depth }]
  if (wall.k === 'left') return [{ ...r, x: f.x0, y: f.y0 - side, w: depth, h: f.y1 - f.y0 + 2 * side }]
  return [{ ...r, x: f.x1 - depth, y: f.y0 - side, w: depth, h: f.y1 - f.y0 + 2 * side }]
}

/** Every door's clear spaces in `objects` (world px). */
export function doorClearRects(objects, gridSize = 40) {
  return (objects || []).filter(isDoor).flatMap(d => doorClearOf(d, objects, gridSize))
}
