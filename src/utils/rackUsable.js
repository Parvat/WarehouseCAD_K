// rackUsable.js — (r6-cantilever) a rack's usable boxes, for the racks that hold no pallet positions (a cantilever's arm
// bays): each box with a red X comes off — covered by a zone or another rack (render/overlapOps.js overlapMarks) or lost to
// a short face (generate/coverLost.js faceLostMarks, with the plan's truck `profile`). The same marks the plan and the PDF
// draw. The boxes: render/rackOps.js markBoxes. → { boxes, lost, usable }. Pure.
import { markBoxes } from '../render/rackOps'
import { overlapMarks } from '../render/overlapOps'
import { faceLostMarks } from '../generate/coverLost'
import { walkwayInNow } from './zoneCheck'

export function rackUsable(objects, o, gridSize = 40, profile = null) {
  const boxes = o ? markBoxes(o, gridSize).length : 0
  if (!o || !Array.isArray(objects)) return { boxes, lost: 0, usable: boxes }
  const seen = new Set(), key = (m) => `${Math.round(m.x * 100)},${Math.round(m.y * 100)}`
  for (const m of overlapMarks(objects, gridSize)) if (m.rackId === o.id) seen.add(key(m))
  if (profile) { let w = 44; try { w = walkwayInNow() } catch { /* the default */ } for (const m of faceLostMarks(objects, { gridSize, profile, walkwayIn: w })) if (m.rackId === o.id) seen.add(key(m)) }
  const lost = Math.min(boxes, seen.size)
  return { boxes, lost, usable: boxes - lost }
}
