// elevationDraw.js — how elevation types are drawn (ELEVATIONS_PLAN.md §4–5): the "Show colours" toggle, each bay
// band's colour on the plan, and the dimensioned side view of a type — one SVG string, shown in the Elevations panel
// and printed on the PDF's elevations sheet, so the two can never differ.

import { create } from 'zustand'
import { typeAt, sidesOf, isBeamRack, PALETTE, OLD_PALETTE } from './elevations'
import { bayRectForIndex } from '../render/bayGeom'

const LS_KEY = 'trace.elev.v1'
const read = () => { try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { showColors: v.showColors !== false } } catch { return { showColors: true } } }
/** Presentation state: whether bays are filled with their type's colour (canvas and PDF). Per browser. */
export const useElevView = create(() => read())
export function setShowColors(on) {
  useElevView.setState({ showColors: !!on })
  try { localStorage.setItem(LS_KEY, JSON.stringify({ showColors: !!on })) } catch { /* private window */ }
}

/* ── the tint: every elevation clearly visible when the layout has two or more, none with only one ───────────── */

/** The bay fill's opacity — the canvas, the PDF and every swatch that stands for it (the legends, the workspace list). */
export const ELEV_FILL_OPACITY = 0.6
/** Bays are tinted only when the layout has 2+ elevations: with one, every bay is the same — no tint. */
export const tintOn = (table) => (table?.types?.length || 0) >= 2
/** A type's tint colour: its own, the old pale palette drawn as the new one at the same place. */
export function tint(color) {
  const i = OLD_PALETTE.findIndex(c => c.toLowerCase() === String(color || '').toLowerCase())
  return i >= 0 ? PALETTE[i] : color
}

/** Each bay band of `rack` in its own (unrotated) frame with its type's colour: [{ x, y, width, height, color,
 *  typeId, bay, side }] — each side of a pair separately. Empty with no table. */
export function bandRects(rack, table, gridSize = 40) {
  if (!table || !isBeamRack(rack)) return []
  const out = []
  rack.beams.forEach((_, b) => {
    const rects = bayRectForIndex(rack, gridSize, b)
    for (let s = 0; s < sidesOf(rack); s++) {
      const r = rects[sidesOf(rack) === 2 && rects.length === 2 ? s : 0]
      const t = typeAt(rack, b, s, table)
      if (r && t) out.push({ ...r, color: tint(t.color), typeId: t.id, bay: b, side: s })
    }
  })
  return out
}

export const ftIn = (inches) => { const v = Math.round(inches); const f = Math.floor(v / 12), i = v - f * 12; return i ? `${f}' ${i}"` : `${f}'` }
