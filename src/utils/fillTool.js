// fillTool.js — the "Fill racking" tool's state: the box being dragged, its
// live plan (generate/fillRacking.js), the Racking settings it fills with,
// and the one-undo-step commit. The box becomes a racking area
// (generate/rackingArea.js) that remembers its settings and racks. Presentation state, never the canvas store —
// until the fill itself is committed.

import { create } from 'zustand'
import { isSection, contains, polygonOf, pointInPolygon, onOutline } from './sectionAreas'
import { rackFootprint } from '../generate/rackFootprint'
import { getRackCapacity } from './capacity'
import { DEFAULT_FILL_SETTINGS } from '../generate/fillRacking'
import { planAreaCreate } from '../generate/rackingArea'
import { clearFromOutline } from '../generate/wallClear'
import { legacyWallClearanceIn } from '../rules/storage'
import { nanoid } from 'nanoid'
import { mheProfiles, sectionProfile, CUSTOM } from './equipment'
import { drawnRect } from './sectionEdit'
import { snapshotOf } from './elevations'
import { autoSave, serializeScene } from './saveLoad'

export const FILL_TOOL = 'fill_racking'

const LS_KEY = 'trace.racking.v1'
const readSettings = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    /* the wall clearance before BUG 76 (`wallClearanceIn`, from the building's outline — the Generate field):
       read as inches from the wall's inner face, the old value less the default 3" wall, never below 0 */
    const { wallClearanceIn, ...rest } = v || {}
    if (!Number.isFinite(rest.wallClearIn) && Number.isFinite(wallClearanceIn)) rest.wallClearIn = clearFromOutline(wallClearanceIn)
    /* none here: the rules table's old "Wall clear" (rules/storage.js), converted the same way, once —
       stored at once, since the rules table drops it */
    if (!Number.isFinite(rest.wallClearIn)) {
      const legacy = legacyWallClearanceIn()
      if (legacy != null) {
        rest.wallClearIn = clearFromOutline(legacy)
        try { localStorage.setItem(LS_KEY, JSON.stringify({ ...DEFAULT_FILL_SETTINGS, ...rest })) } catch { /* private window */ }
      }
    }
    return { ...DEFAULT_FILL_SETTINGS, ...rest }
  } catch { return { ...DEFAULT_FILL_SETTINGS } }
}

/** The Racking settings (orientation, beam, pallet, forklift / aisle, max rack
 *  run, wall clearance): the fill tool's options bar edits them, the Generate
 *  panel keeps them in step with its own fields. Remembered per browser. */
export const useRackingSettings = create((set, get) => ({
  ...readSettings(),
  setSetting: (k, v) => {
    set({ [k]: v })
    try { const { setSetting, ...plain } = get(); void setSetting; localStorage.setItem(LS_KEY, JSON.stringify(plain)) } catch { /* private window */ }
  },
}))
export const rackingSettings = () => { const { setSetting, ...plain } = useRackingSettings.getState(); void setSetting; return plain }

/** The box being dragged ({ from, to } world px), its live plan, and the
 *  racking area it would create (the plan's racks, stamped with its id).
 *  `aisleFt`: an aisle typed in the bar — this fill only (cleared when it is placed, cancelled or the tool ends); null:
 *  the forklift's (the Racking settings', kept in step with Project settings — never written from here). */
/* `at`: the pointer over the plan while no box is dragged — where a fill would start (the bar shows a section's aisle there) */
export const useFillTool = create(() => ({ drag: null, plan: null, created: null, aisleFt: null, at: null }))
/** The pointer moved with no box dragged: where the next fill would start. */
export const hoverFill = (world) => { const a = useFillTool.getState().at; if (!a || a.x !== world.x || a.y !== world.y) useFillTool.setState({ at: world }) }
/** The section a fill started (or would start) at `from` works in, or null — its aisle is that section's (one source). */
export const fillSection = (objects, from) => (objects && from ? sectionAt(objects, from) : null)
/** The aisle typed in the bar for this fill (ft, > 0), or null for the forklift's. */
export const setFillAisle = (ft) => useFillTool.setState({ aisleFt: Number.isFinite(ft) && ft > 0 ? ft : null })
/** The equipment a fill works to (aisle-equip): the equipment of the section the drag starts in (utils/equipment.js —
 *  its own, else the project's forklift), else the project's forklift (the Racking settings' `mhe`, kept in step with
 *  Project settings). → a profile { key, label, aisleFt, minAisleFt, travelFt, crossAisleFt }. */
export function fillEquipment(objects = null, from = null) {
  const s = rackingSettings(), P = mheProfiles()
  const project = { ...(P[s.mhe] || P.reach), aisleFt: s.aisleFt ?? (P[s.mhe] || P.reach).aisleFt }
  const sec = objects && from ? sectionAt(objects, from) : null
  return sectionProfile(sec, P) || project        // a section's own (Custom: its two widths), else the project's
}
/** The settings this fill uses: the Racking settings, on the equipment of the section the drag starts in (its aisle,
 *  its truck), with the bar's typed aisle over them. */
/* (ui-polish-3: the aisle has one source — a fill inside a section takes the section's equipment and its width, the typed
   aisle never; outside every section, the typed aisle, else the project's forklift) */
export const fillSettings = (objects = null, from = null) => {
  const s = rackingSettings(), e = fillEquipment(objects, from), a = fillSection(objects, from) ? null : useFillTool.getState().aisleFt
  return { ...s, mhe: e.key, aisleFt: a || e.aisleFt }
}
/** A typed aisle under the equipment's minimum → { aisleFt, equipment (profile) }, else null: the bar's amber line. */
export function aisleUnderMinimum(objects = null, from = null) {
  if (fillSection(objects, from)) return null                            // inside a section: its own aisle, nothing typed
  const a = useFillTool.getState().aisleFt, e = fillEquipment(objects, from)
  return a && Number.isFinite(e.minAisleFt) && a < e.minAisleFt - 1e-9 ? { aisleFt: a, equipment: e } : null
}

/* ── a fill outside every section with an aisle under the project forklift's minimum (aisle-equip): its racks are
   placed, then the notice asks "Make this a section?" with an Equipment picker; Make section adds a section of the
   fill's box with that equipment, folded into the fill's own undo step. Dismissed, the racks stay (Check layout shows
   the narrow aisles). ── */
export const useSectionAsk = create(() => ({ ask: null }))     // { box, under, at; under: aisleFt, equipment (the project's), pick (key) }
/** The equipment the question offers first: the one the typed aisle fits best — the greatest minimum it meets. */
export function equipmentFor(aisleFt, profiles = mheProfiles()) {
  const fits = Object.values(profiles).filter(p => Number.isFinite(p.minAisleFt) && p.minAisleFt <= aisleFt + 1e-9)
  return fits.sort((a, b) => b.minAisleFt - a.minAisleFt)[0] || null
}
export const dismissSectionAsk = () => useSectionAsk.setState({ ask: null })
/** Make section: a section of the fill's box (kept inside the building, off every other section) with equipment
 *  `key` (Custom: `custom` — { pickFt, moveFt }), written into the fill's history entry — one Ctrl+Z takes the fill and
 *  the section together. → its id or null. */
export function makeFillSection(store, key, custom = null) {
  const ask = useSectionAsk.getState().ask
  useSectionAsk.setState({ ask: null })
  if (!ask) return null
  const st = store.getState(), b = ask.box
  const sec = drawnRect(st.objects, { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { gridSize: st.gridSize || 40 })
  if (!sec) return null
  const obj = { ...sec, id: nanoid(), equipment: key || null, ...(key === CUSTOM && custom ? { custom: { pickFt: Number(custom.pickFt), moveFt: Number(custom.moveFt) } } : {}) }
  const objects = [...st.objects, obj], full = { objects }
  if (st.historyIndex >= 0 && st.history?.length > st.historyIndex) {
    const history = st.history.slice()
    history[st.historyIndex] = snapshotOf(st, objects, st.elevations)
    full.history = history
  }
  store.setState(full)
  try { autoSave(serializeScene(store.getState())) } catch { /* storage full */ }
  return obj.id
}

export const boxOfDrag = (d) => d && ({ x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) })

/* ── a fill inside a section (STUDIO.md §7a Sections) ── */
const sectionAt = (objects, p) => (objects || []).find(o => isSection(o) && contains(o, p.x, p.y)) || null
/** The drag box cut to the section's box (a rectangle: exactly the section), or null when nothing is left. */
function clipToSection(b, s) {
  const x0 = Math.max(b.x, s.x), y0 = Math.max(b.y, s.y), x1 = Math.min(b.x + b.w, s.x + s.width), y1 = Math.min(b.y + b.h, s.y + s.height)
  return x1 - x0 > 0 && y1 - y0 > 0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}
/** A custom shape: only the racks wholly inside it, and the aisles between them; the counts follow. */
function keepInside(plan, s) {
  const poly = polygonOf(s)
  const inside = (r) => { const f = rackFootprint(r); return [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]].every(([x, y]) => pointInPolygon(poly, x, y) || onOutline(s, x, y, 0.5)) }
  const racks = plan.racks.filter(inside), ids = new Set(racks.map(r => r.id))
  const aisles = plan.aisles.filter(a => ids.has(a.row1Id) && ids.has(a.row2Id))
  const positions = racks.reduce((t, r) => t + (getRackCapacity(r)?.total || 0), 0)
  return { ...plan, racks, aisles, rows: new Set(racks.map(r => r.rowIndex ?? r.id)).size, positions }
}

/** The press: the box starts here. */
export function startFill(world) { useFillTool.setState({ drag: { from: world, to: world }, plan: null, created: null }) }

/** The drag: the box grows; the plan (and its estimate) follows. */
export function moveFill(world, objects, gridSize = 40, elevations = null) {
  const d = useFillTool.getState().drag
  if (!d) return null
  const drag = { ...d, to: world }
  // a fill that starts inside a section is clipped to it: its racks never cross the section's edge (utils/sectionAreas.js)
  const sec = sectionAt(objects, drag.from), box = sec ? clipToSection(boxOfDrag(drag), sec) : boxOfDrag(drag)
  let created = box ? planAreaCreate(objects, box, fillSettings(objects, drag.from), { gridSize, from: drag.from, newId: nanoid, elevations }) : null
  if (created && sec && sec.shape === 'poly') created = { ...created, plan: keepInside(created.plan, sec) }
  const plan = created ? created.plan : { racks: [], aisles: [], rows: 0, positions: 0, rects: [] }
  useFillTool.setState({ drag, plan, created })
  return plan
}

/** The release: the racking area, its racks and aisles go in as ONE undo
 *  step. Returns how many racks were placed. */
export function commitFill(store) {
  const { created, drag } = useFillTool.getState()
  // outside every section, under the project forklift's minimum: ask to make it a section, once the racks are placed
  // outside every section: a notice after every fill (Racks placed · Make section); under the project forklift's minimum
  // it gives the reason and an Equipment picker and stays until answered (fill-section)
  const outside = !!drag && !sectionAt(store.getState().objects, drag.from)
  const under = outside ? aisleUnderMinimum(store.getState().objects, drag.from) : null
  useFillTool.setState({ drag: null, plan: null, created: null, aisleFt: null })        // a typed aisle was for this fill
  if (!created || !created.plan.racks.length) return 0
  const { area, plan } = created
  const st = store.getState()
  store.setState({ objects: [...st.objects, area, ...plan.racks, ...plan.aisles] })
  store.getState().commitObjectUpdate(area.id, {})
  if (under) useSectionAsk.setState({ ask: { box: boxOfDrag(drag), aisleFt: under.aisleFt, equipment: under.equipment, pick: equipmentFor(under.aisleFt)?.key || null, under: true, at: Date.now() } })
  else if (outside) useSectionAsk.setState({ ask: { box: boxOfDrag(drag), under: false, at: Date.now() } })   // a normal aisle: the section on the project's forklift
  return plan.racks.length
}

/** Esc: the box goes, nothing is placed. */
export function cancelFill() {
  if (!useFillTool.getState().drag) return false
  useFillTool.setState({ drag: null, plan: null, created: null })
  return true
}
