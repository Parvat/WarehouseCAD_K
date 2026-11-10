// tally.js — the Tally drawer's state (studio/TallyDrawer.jsx, STUDIO.md §1 and §7a) and the BOM tab's remembered
// section cards. Presentation state only: zustand + localStorage, never the canvas store or the layout.
//   open     — the drawer docked at the bottom of the canvas (the BOM tab's Tally)
//   modal    — the wide modal (the drawer's Pop out; the old Full view)
//   view     — the drawer's Summary / By row switch ('rows' by default)
//   height   — the drawer's height (its top edge dragged: 200 … 70% of the window; default 330), remembered
//   hover    — the R column under the pointer (its line lit on the plan, canvas2/TallyHighlight.jsx)
//   cols     — the R columns lit by a click on a rack on the plan (scrolled into view)
//   section  — a section Total column clicked: { id, nos } — every line of that section lit on the plan
//   focus    — the drawer's Focus (tally-2): the rail, the tool pill, the top islands and the right card hidden, the plan
//              refitted above the drawer, the drawer up to 85% of the window high; Esc or Focus again restores all
// The tallied marks (tally-2) are the layout's, not presentation: saved on its elevation table (`tallied`), below.
import { create } from 'zustand'
import { fitRef } from './viewPrefs'
import { positionsPerBeam } from '../utils/palletFit'
import { levelsResolver } from '../utils/elevations'
import { isEmptySide } from '../utils/bayEmpty'
import { bayLedger } from '../utils/bayLedger'
import { worldSide, rackLinesNow as rackLinesFor } from '../utils/rackLines'

export const TALLY_H = 330, TALLY_H_MIN = 200, TALLY_MAX_FRAC = 0.7, TALLY_FOCUS_FRAC = 0.85
/** The drawer's place: full width, left 16 to right 16, bottom 20 (the islands'). While it is open the bottom-right
 *  island stands 12 above it (at the right) and the right card ends 12 above that island. */
export const TALLY_LEFT = 16, TALLY_RIGHT = 16, TALLY_BOTTOM = 20, TALLY_ISLAND_GAP = 12, ISLAND_H = 40, TALLY_CARD_GAP = 12
const H_KEY = 'trace.studio.tally.h'
const maxH = (focus) => Math.round((typeof window !== 'undefined' ? window.innerHeight : 1000) * (focus ? TALLY_FOCUS_FRAC : TALLY_MAX_FRAC))
export const clampTallyH = (h, focus = false) => (Number.isFinite(h) ? Math.round(Math.min(maxH(focus), Math.max(TALLY_H_MIN, h))) : TALLY_H)
const readH = () => { try { const v = Number(localStorage.getItem(H_KEY)); return v ? clampTallyH(v) : TALLY_H } catch { return TALLY_H } }

export const useTally = create((set, get) => ({
  open: false, modal: false, view: 'rows', height: readH(), hover: null, cols: [], section: null, focus: false,
  setView: (view) => set({ view }),
  setHover: (hover) => { if (get().hover !== hover) set({ hover }) },
  setCols: (cols) => set({ cols }),
  setSection: (section) => set({ section }),
  /** the height, clamped; `save` false while dragging (written on release) */
  setHeight: (h, { save = true } = {}) => {
    const height = clampTallyH(h, get().focus)
    set({ height })
    if (save) { try { localStorage.setItem(H_KEY, String(height)) } catch { /* private window */ } }
  },
}))

/** Room the drawer takes off the bottom of the canvas (px; 0 while it is closed). */
export const tallyInset = () => { const s = useTally.getState(); return { bottom: s.open ? TALLY_BOTTOM + s.height : 0 } }

/** Open the drawer; the plan fits into the space above it. */
export function openTally() {
  useTally.setState({ open: true, modal: false, hover: null, cols: [], section: null })
  requestAnimationFrame(() => fitRef.current?.(tallyInset()))
}
export const closeTally = () => { setTallyFocus(false, false); useTally.setState({ open: false, hover: null, cols: [], section: null }) }
/** Pop out: the wide modal in place of the drawer. */
export const popOutTally = () => { setTallyFocus(false, false); useTally.setState({ open: false, modal: true, hover: null, cols: [], section: null }) }
/** Focus on (or off): the chrome hidden but the drawer and the bottom islands; the plan refitted above the drawer. Off,
 *  a height past the drawer's usual 70% comes back to it. */
export function setTallyFocus(on, refit = true) {
  const s = useTally.getState()
  if (s.focus === !!on) return
  useTally.setState({ focus: !!on })
  if (!on && s.height > clampTallyH(s.height)) s.setHeight(s.height)
  if (refit && s.open) requestAnimationFrame(() => fitRef.current?.(tallyInset()))
}
export const closeTallyModal = () => useTally.setState({ modal: false })

/* ── the BOM tab's section cards: open or collapsed, remembered per layout (its name) ── */
const CARDS_KEY = 'trace.studio.bomCards.v1'
const readCards = () => { try { return JSON.parse(localStorage.getItem(CARDS_KEY) || '{}') || {} } catch { return {} } }
export const useBomCards = create((set, get) => ({
  cards: readCards(),
  /** card `id` of layout `layout` open / collapsed */
  setOpen: (layout, id, on) => {
    const cards = { ...get().cards, [layout]: { ...(get().cards[layout] || {}), [id]: !!on } }
    try { localStorage.setItem(CARDS_KEY, JSON.stringify(cards)) } catch { /* private window */ }
    set({ cards })
  },
}))
/** Is card `id` open: as remembered, else the first section open and the rest collapsed. */
export const cardOpen = (cards, layout, id, first) => { const v = cards[layout]?.[id]; return v == null ? !!first : v }

/* ── a rack line's figures for the plan's tag: "R6 · 12 bays · 48 positions" ── */
/** Bays and pallet positions of rack line `line` (rackLines.js): the counted bays on its side (a pair's empty side
 *  bays left out), each bay's positions as the ledger counts them. */
export function lineFigures(objects, line, gridSize = 40, elevations = null) {
  const ledger = bayLedger(objects, gridSize, elevations), lv = levelsResolver(elevations)
  let bays = 0, positions = 0
  for (const id of line.ids) {
    const r = objects.find(o => o.id === id), e = ledger.racks.get(id)
    if (!r || !e) continue
    const sides = r.type === 'rack_double_row' ? [0, 1].filter(s => worldSide(r, s) === line.ws) : [0]
    r.beams.forEach((b, bi) => {
      if (!e.counted[bi]) return
      for (const s of sides) {
        if (isEmptySide(r, bi, s)) continue
        bays++
        positions += lv ? (lv.face ? positionsPerBeam(b, lv.face(r, bi, s)) : positionsPerBeam(b, r.palletWIn || 40)) * lv(r, bi, s)
          : positionsPerBeam(b, r.palletWIn || 40) * (r.levels || 1)
      }
    })
  }
  return { bays, positions }
}
/** A rack line's band in world px: { x, y, w, h }. */
export const lineRect = (l) => (l.vert ? { x: l.s0, y: l.r0, w: l.s1 - l.s0, h: l.r1 - l.r0 } : { x: l.r0, y: l.s0, w: l.r1 - l.r0, h: l.s1 - l.s0 })

/** The R numbers of the racks selected on the plan: a pair's bay picked on one side, that side's line; else every line
 *  the rack stands in. */
export function selectedLineNos(state, lines) {
  const ids = new Set(state.selectedIds || []), out = new Set()
  for (const o of state.objects || []) {
    if (!ids.has(o.id)) continue
    const ws = o.type === 'rack_double_row' && (o.activeBaySide === 0 || o.activeBaySide === 1) ? worldSide(o, o.activeBaySide) : null
    for (const l of lines) if (l.ids.includes(o.id) && (ws == null || l.ws === ws)) out.add(l.no)
  }
  return [...out].sort((a, b) => a - b)
}

/* ── tallied marks (tally-2): a rack line checked off in By row, saved with the layout on its elevation table
   (`tallied`: { [line key]: the line's signature }), so they are saved, loaded and undone with it. A line's mark
   holds only while the line is what was checked: its racks' bays, beams, levels (each bay side's) and depth — any
   change and the mark is gone (it no longer matches; the next write drops it). ── */
/** A rack line's signature: what its mark depends on. */
export function lineSig(objects, line, elevations = null) {
  const lv = levelsResolver(elevations)
  const byId = new Map((objects || []).map(o => [o.id, o]))
  return JSON.stringify(line.ids.map(id => {
    const r = byId.get(id)
    if (!r) return null
    const sides = r.type === 'rack_double_row' ? [0, 1].filter(s => worldSide(r, s) === line.ws) : [0]
    // each bay side's levels — 0 for a side deleted (a pair's empty side, utils/bayEmpty.js): its bays changed
    const levels = r.beams.map((_, bi) => sides.map(s => (isEmptySide(r, bi, s) ? 0 : lv ? lv(r, bi, s) : r.levels || 1)))
    return [r.id, r.beams, r.depthIn ?? 42, levels]
  }))
}
/** The marks as saved: { key: sig }. */
export const talliedOf = (T) => (T && T.tallied && typeof T.tallied === 'object' ? T.tallied : {})
/** The line numbers checked now (a mark whose line still matches). */
export function checkedNos(objects, lines, elevations) {
  const m = talliedOf(elevations), out = new Set()
  for (const l of lines) if (m[l.key] && m[l.key] === lineSig(objects, l, elevations)) out.add(l.no)
  return out
}
/** Check (or uncheck) line `line`: one undo step, saved with the layout; stale marks dropped. */
export function setTallied(store, line, on) {
  const st = store.getState(), T = st.elevations || { version: 3, types: [], defaultId: null }
  const lines = rackLinesFor(st.objects, st.gridSize || 40)
  const live = new Map(lines.map(l => [l.key, l]))
  const next = {}
  for (const [k, sig] of Object.entries(talliedOf(T))) { const l = live.get(k); if (l && lineSig(st.objects, l, T) === sig) next[k] = sig }
  if (on) next[line.key] = lineSig(st.objects, line, T); else delete next[line.key]
  store.setState({ elevations: { ...T, tallied: next } })
  const anchor = line.ids.find(id => st.objects.some(o => o.id === id))
  if (anchor) store.getState().commitObjectUpdate(anchor, {})          // the history entry (it carries the table)
}
/** Clear every mark: one undo step. */
export function clearTallied(store) {
  const st = store.getState(), T = st.elevations
  if (!T || !Object.keys(talliedOf(T)).length) return
  store.setState({ elevations: { ...T, tallied: {} } })
  const anchor = st.objects.find(o => /^rack_/.test(o.type || ''))?.id
  if (anchor) store.getState().commitObjectUpdate(anchor, {})
}
