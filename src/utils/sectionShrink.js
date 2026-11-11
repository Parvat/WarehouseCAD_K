// sectionShrink.js — a section made smaller (STUDIO.md §7a Sections, shrink-fill): its handles, a custom shape's point,
// or its Width / Length typed. The rows that stood in it (the rack's centre inside it, as membership reads it) lose
// every bay that no longer fits inside it — whole bays, from the row ends (as a building shrink takes them,
// buildingResize.js); a row with no bay left goes. In the resize's own undo step, with a notice "N bays removed" and
// Undo. A section made bigger adds nothing (Fill section does that).

import { nanoid } from 'nanoid'
import { bayBoxes } from './buildingResize'
import { polygonOf, pointInPolygon } from './sectionAreas'
import { piecesFromStates } from '../generate/faceReach'
import { rebuildAisles } from './aisleRebuild'
import { snapshotOf } from './elevations'
import { rackFootprint } from '../generate/rackFootprint'
import { notify } from './notice'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const E = 0.5
/** Box `b` wholly inside polygon `poly` (its corners, a hair in). */
const fitsIn = (poly, b) => [[b.x + E, b.y + E], [b.x + b.w - E, b.y + E], [b.x + b.w - E, b.y + b.h - E], [b.x + E, b.y + b.h - E]].every(([x, y]) => pointInPolygon(poly, x, y))

/** `objects` after section `before` became `after` (same id): the bays of its rows that fit before and no longer fit,
 *  taken off the row ends → { objects, removed (bays) }. Pure. */
export function planSectionShrink(objects, before, after, { gridSize = 40, newId = nanoid } = {}) {
  const was = polygonOf(before), now = polygonOf(after)
  let removed = 0
  const out = []
  for (const o of objects) {
    if (!(o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length)) { out.push(o); continue }
    // its rows: the rack's centre in the section as it was
    const f = rackFootprint(o)
    if (!pointInPolygon(was, f.x + f.w / 2, f.y + f.h / 2)) { out.push(o); continue }
    const boxes = bayBoxes(o, gridSize)
    const okNow = boxes.map(b => fitsIn(now, b)), okWas = boxes.map(b => fitsIn(was, b))
    if (okNow.every(Boolean) || !okWas.some(Boolean)) { out.push(o); continue }
    if (!okNow.some(Boolean)) { removed += o.beams.length; continue }
    // whole bays from the ends: each end bay that fit before and no longer fits, until one fits
    let lo = 0, hi = o.beams.length - 1
    while (lo <= hi && !okNow[lo] && okWas[lo]) lo++
    while (hi >= lo && !okNow[hi] && okWas[hi]) hi--
    if (lo === 0 && hi === o.beams.length - 1) { out.push(o); continue }
    removed += lo + (o.beams.length - 1 - hi)
    out.push(...piecesFromStates(o, o.beams.map((_, i) => (i >= lo && i <= hi ? 'D' : '-')), { gridSize, newId }))
  }
  return { objects: removed ? rebuildAisles(out, newId).objects : objects, removed }
}

/** After section `before` was resized — its change committed as the store's top history entry: the bays that no longer
 *  fit go in that SAME entry (one undo step), and the notice says how many. */
export function afterSectionResize(store, before) {
  const st = store.getState(), after = st.objects.find(o => o.id === before?.id)
  if (!after) return null
  const plan = planSectionShrink(st.objects, before, after, { gridSize: st.gridSize || 40 })
  if (!plan.removed) return plan
  const history = st.history.slice(0, st.historyIndex + 1)
  history[history.length - 1] = snapshotOf(st, plan.objects)
  store.setState({ objects: plan.objects, history, historyIndex: history.length - 1, selectedIds: st.selectedIds.filter(id => plan.objects.some(o => o.id === id)) })
  notify(`${plan.removed} bay${plan.removed === 1 ? '' : 's'} removed`, 'they no longer fit inside the section', { undo: true })
  return plan
}
