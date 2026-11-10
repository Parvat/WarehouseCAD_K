// tally.js — the Tally drawer's state (studio/TallyDrawer.jsx, STUDIO.md §1 and §7a) and the BOM tab's remembered
// section cards. Presentation state only: zustand + localStorage, never the canvas store or the layout.
//   open     — the drawer docked at the bottom of the canvas (the BOM tab's Tally)
//   modal    — the wide modal (the drawer's Pop out; the old Full view)
//   view     — the drawer's Summary / By row switch ('rows' by default)
//   height   — the drawer's height (its top edge dragged: 200 … 70% of the window; default 330), remembered
//   hover    — the R column under the pointer (its line lit on the plan, canvas2/TallyHighlight.jsx)
//   cols     — the R columns lit by a click on a rack on the plan (scrolled into view)
//   section  — a section Total column clicked: { id, nos } — every line of that section lit on the plan
import { create } from 'zustand'
import { fitRef } from './viewPrefs'
import { positionsPerBeam } from '../utils/palletFit'
import { levelsResolver } from '../utils/elevations'
import { isEmptySide } from '../utils/bayEmpty'
import { bayLedger } from '../utils/bayLedger'
import { worldSide } from '../utils/rackLines'

export const TALLY_H = 330, TALLY_H_MIN = 200, TALLY_MAX_FRAC = 0.7
/** The drawer's place: left 16, right clear of the right card (its width + 32: 332 at 300), bottom 20 (the islands'). */
export const TALLY_LEFT = 16, TALLY_BOTTOM = 20, TALLY_GAP = 32
const H_KEY = 'trace.studio.tally.h'
const maxH = () => Math.round((typeof window !== 'undefined' ? window.innerHeight : 1000) * TALLY_MAX_FRAC)
export const clampTallyH = (h) => (Number.isFinite(h) ? Math.round(Math.min(maxH(), Math.max(TALLY_H_MIN, h))) : TALLY_H)
const readH = () => { try { const v = Number(localStorage.getItem(H_KEY)); return v ? clampTallyH(v) : TALLY_H } catch { return TALLY_H } }

export const useTally = create((set, get) => ({
  open: false, modal: false, view: 'rows', height: readH(), hover: null, cols: [], section: null,
  setView: (view) => set({ view }),
  setHover: (hover) => { if (get().hover !== hover) set({ hover }) },
  setCols: (cols) => set({ cols }),
  setSection: (section) => set({ section }),
  /** the height, clamped; `save` false while dragging (written on release) */
  setHeight: (h, { save = true } = {}) => {
    const height = clampTallyH(h)
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
export const closeTally = () => useTally.setState({ open: false, hover: null, cols: [], section: null })
/** Pop out: the wide modal in place of the drawer. */
export const popOutTally = () => useTally.setState({ open: false, modal: true, hover: null, cols: [], section: null })
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
