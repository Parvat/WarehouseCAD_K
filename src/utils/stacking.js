// stacking.js — what is drawn on top (stacking round). Two tiers above the ground (the building, then the sections):
//   - the layout: racks, zones, aisles, racking areas, doors, structure — in the store's array order;
//   - on top of it: equipment (mhe_), safety items (safety_), ops items (ops_) and drawn annotations (lines, arrows,
//     shapes, text) — in the store's array order among themselves.
// The plan (canvas2/Scene.jsx), the PDF (export/pdfExport.js) and the click (canvas2/hitTest.js pickAt) all read this,
// so what is drawn on top is what a click takes: a Forklift standing on a Drive-In rack is picked, and the rack only
// where nothing sits on it. Bring to front / Send to back (the store's own actions — the array order) move an object
// within its tier; the tiers themselves never swap (a rack never covers a Forklift).
import { isDrawn } from '../render/drawnShapes'

const TOP_PREFIXES = ['mhe_', 'safety_', 'ops_', 'annot_']
/** Whether `o` sits on top of the layout (equipment, safety, ops, drawn annotations, text). */
export function onTop(o) {
  if (!o || typeof o.type !== 'string') return false
  if (o.type === 'text' || isDrawn(o)) return true
  return TOP_PREFIXES.some(p => o.type.startsWith(p))
}
/** `list` in drawing order: the layout first, then what sits on top — each in its own array order (a stable split). */
export function inStackOrder(list, objOf = (x) => x) {
  const low = [], top = []
  for (const x of list) (onTop(objOf(x)) ? top : low).push(x)
  return top.length ? [...low, ...top] : list
}
