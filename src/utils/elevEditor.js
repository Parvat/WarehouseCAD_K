// elevEditor.js — the elevation editor's state and its edits (Elevations v2 §B–C, §E).
//
// The editor is the Elevations tab (components/Elevations/ElevationsTab.jsx, utils/elevTab.js): the drawing shows the
// active elevation. The edits below are pure — a type in, a type out; the tab writes the result to that elevation
// everywhere it is used, ONE undo step. Never the floor plan.
// Simple / Detailed is presentation state, per browser (localStorage); the PDF prints the one chosen.

import { create } from 'zustand'
import { beamFace, holePitch, editTable, updateType, typeById } from './elevations'

const LS_KEY = 'trace.elevpane.v1'
const read = () => { try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { detail: v.detail === 'detailed' ? 'detailed' : 'simple' } } catch { return { detail: 'simple' } } }
const save = (s) => { try { localStorage.setItem(LS_KEY, JSON.stringify({ detail: s.detail })) } catch { /* private window */ } }

/** { typeId (the tab shown), detail ('simple' | 'detailed': what the drawing — and the PDF — dimensions), sel (a level
 *  index picked on the drawing), hint (what the last edit was saved as) } */
export const useElevEditor = create(() => ({ typeId: null, sel: null, hint: null, ...read() }))
export function setPane(patch) { useElevEditor.setState(patch); save(useElevEditor.getState()) }

/* ── the edits: a type in, a type out (pure) ─────────────────────────────── */

const sorted = (t) => [...t.levels].map((l, k) => ({ ...l, k })).sort((a, b) => a.beamIn - b.beamIn)
export const snapTo = (z, pitch) => Math.round(z / pitch) * pitch

/** Level `k`'s beam moved to `z` (to its top), snapped to the hole pitch unless `exact`, kept between its neighbours
 *  (a beam face clear of the one below, the next beam's face clear above) and under the top of the upright. */
export function moveBeam(t, k, z, { exact = false } = {}) {
  const face = beamFace(t), pitch = holePitch(t), L = sorted(t), i = L.findIndex(l => l.k === k)
  if (i < 0) return t
  const lo = i > 0 ? L[i - 1].beamIn + face : 0
  const hi = i + 1 < L.length ? L[i + 1].beamIn - face : t.uprightHeightIn
  let v = exact ? z : snapTo(z, pitch)
  v = Math.max(lo, Math.min(hi, v))
  if (i === 0 && v < face && v > 0 && !exact) v = 0                         // near the floor: on the floor
  return { ...t, levels: t.levels.map((l, j) => (j === k ? { ...l, beamIn: Math.round(v * 1000) / 1000 } : l)) }
}
/** A level added at `z` (snapped), with the pallet and load of the level below it. Null when a beam is already
 *  within a face height of there, or it is past the top of the upright. */
export function addLevelAt(t, z) {
  const face = beamFace(t), v = snapTo(z, holePitch(t))
  if (v <= 0 || v > t.uprightHeightIn - face || t.levels.some(l => Math.abs(l.beamIn - v) < face * 2)) return null
  const below = sorted(t).filter(l => l.beamIn < v).pop() || t.levels[0]
  const levels = [...t.levels, { beamIn: v, palletHeightIn: below.palletHeightIn, loadLb: below.loadLb }].sort((a, b) => a.beamIn - b.beamIn)
  return { ...t, levels }
}
/** Level `k` removed (never the last one). */
export const removeLevel = (t, k) => (t.levels.length <= 1 ? t : { ...t, levels: t.levels.filter((_, j) => j !== k) })
/** The upright's height, snapped unless exact, never under the top beam. */
export function setUpright(t, z, { exact = false } = {}) {
  const topBeam = Math.max(...t.levels.map(l => l.beamIn))
  const v = Math.max(topBeam + beamFace(t), exact ? z : snapTo(z, holePitch(t)))
  return { ...t, uprightHeightIn: Math.round(v * 1000) / 1000 }
}
/** A typed dimension (the drawing's role ids) → the type: 'elev' level k's beam top; 'open' the clear opening under
 *  level k's beam (it moves to the lower beam's top + the opening + its face); 'chain' level k's load + clearance
 *  (its pallet height follows; the top level: its load); 'upright' the upright height; 'face' the beam face height;
 *  'pallet' level k's pallet height; 'gap' the gap over level k's pallet (the beam above moves). */
export function setDimension(t, id, k, inches) {
  if (!(inches >= 0)) return t
  if (id === 'elev') return moveBeam(t, k, inches, { exact: true })
  if (id === 'upright') return setUpright(t, inches, { exact: true })
  if (id === 'face') return inches > 0 ? { ...t, beamFaceIn: inches } : t
  // the chain: a pallet height (that level's), a gap (moves the beam above: pallet + gap + face over this beam)
  if (id === 'pallet') return inches > 0 ? { ...t, levels: t.levels.map((l, j) => (j === k ? { ...l, palletHeightIn: inches } : l)) } : t
  if (id === 'gap') { const L2 = sorted(t), i2 = L2.findIndex(l => l.k === k); if (i2 < 0 || i2 + 1 >= L2.length) return t; return moveBeam(t, L2[i2 + 1].k, L2[i2].beamIn + (L2[i2].palletHeightIn || 0) + inches + beamFace(t), { exact: true }) }
  const L = sorted(t), i = L.findIndex(l => l.k === k)
  if (id === 'open' && i > 0) return moveBeam(t, k, L[i - 1].beamIn + inches + beamFace(t), { exact: true })
  if (id === 'chain' && i >= 0) {
    const ph = Math.max(1, inches - (i + 1 < L.length ? t.clearanceIn || 0 : 0))
    return { ...t, levels: t.levels.map((l, j) => (j === k ? { ...l, palletHeightIn: ph } : l)) }
  }
  return t
}
/** The small fields: pallet height (every level), clearance, beam face height, hole pitch. */
export function setField(t, field, v) {
  if (!(v > 0) && field !== 'clearanceIn') return t
  if (field === 'palletHeightIn') return { ...t, levels: t.levels.map(l => ({ ...l, palletHeightIn: v })) }
  return { ...t, [field]: v }
}

/** The base label size for a pane of `box` px: in proportion to it, never under a readable 9 px nor over 14. */
export const paneFontPx = (box) => Math.max(9, Math.min(14, Math.min(box.w / 78, box.h / 26)))

/** Write type `id` as `fn(type)` into the store: ONE undo step (the racks' levels mirror following). */
export function commitType(store, id, fn) {
  const st = store.getState(), t = typeById(st.elevations, id)
  if (!t) return false
  const next = fn(t)
  if (!next || JSON.stringify(next) === JSON.stringify(t)) return false
  const r = editTable(st.objects, st.elevations, tb => updateType(tb, id, next))
  st.commitElevations(r.table, r.objects === st.objects ? null : r.objects)
  return true
}
/** Write the whole table as `fn(table)`: ONE undo step. */
export function commitTable(store, fn) {
  const st = store.getState(), r = editTable(st.objects, st.elevations, fn)
  if (r.table === st.elevations && r.objects === st.objects) return false
  st.commitElevations(r.table, r.objects === st.objects ? null : r.objects)
  return true
}
