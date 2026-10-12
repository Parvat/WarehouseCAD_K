// elevationDraw.js — how elevation types are drawn (ELEVATIONS_PLAN.md §4–5): the "Show colours" toggle, each bay
// band's colour on the plan, and the dimensioned side view of a type — one SVG string, shown in the Elevations panel
// and printed on the PDF's elevations sheet, so the two can never differ.

import { create } from 'zustand'
import { tableOf, typeAt, sidesOf, isBeamRack } from './elevations'
import { bayRectForIndex } from '../render/bayGeom'

const LS_KEY = 'trace.elev.v1'
const read = () => { try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { showColors: v.showColors !== false } } catch { return { showColors: true } } }
/** Presentation state: whether bays are filled with their type's colour (canvas and PDF). Per browser. */
export const useElevView = create(() => read())
export function setShowColors(on) {
  useElevView.setState({ showColors: !!on })
  try { localStorage.setItem(LS_KEY, JSON.stringify({ showColors: !!on })) } catch { /* private window */ }
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
      if (r && t) out.push({ ...r, color: t.color, typeId: t.id, bay: b, side: s })
    }
  })
  return out
}
export const bandRectsIn = (objects, rack, gridSize) => bandRects(rack, tableOf(objects), gridSize)

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export const ftIn = (inches) => { const v = Math.round(inches); const f = Math.floor(v / 12), i = v - f * 12; return i ? `${f}' ${i}"` : `${f}'` }

/** The side view of type `t`: a front elevation of one bay (a nominal `bayIn` beam, two pallets a level) — the
 *  uprights, the beams at their heights, the pallets with their load, the clearance above each, every beam height
 *  and the upright height dimensioned, the frame depth noted. An SVG string, `width` px wide. */
export function sideViewSVG(t, { width = 240, bayIn = 96, palletWIn = 40 } = {}) {
  const upW = 3, H = Math.max(t.uprightHeightIn, ...t.levels.map(l => l.beamIn + (l.palletHeightIn || 0) + (t.clearanceIn || 0)))
  const left = 46, right = 40, top = 22, bottom = 26               // margins, inches of drawing
  const W = bayIn + 2 * upW, vbW = W + left + right, vbH = H + top + bottom
  const fs = Math.max(7, vbW / 30), line = Math.max(0.8, vbW / 260)
  const y = (inches) => top + H - inches                          // floor at the bottom
  const parts = []
  parts.push(`<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#ffffff"/>`)
  parts.push(`<text x="${left}" y="${fs * 1.2}" font-size="${fs * 1.15}" font-family="Arial" font-weight="700" fill="#111">${esc(t.name)}</text>`)
  parts.push(`<rect x="${left + W - fs * 1.1}" y="${fs * 0.3}" width="${fs}" height="${fs}" fill="${esc(t.color)}" stroke="#333" stroke-width="${line / 2}"/>`)
  // floor
  parts.push(`<line x1="${left - 8}" y1="${y(0)}" x2="${left + W + 8}" y2="${y(0)}" stroke="#555" stroke-width="${line * 1.5}"/>`)
  // uprights
  for (const x of [left, left + W - upW]) parts.push(`<rect x="${x}" y="${y(t.uprightHeightIn)}" width="${upW}" height="${t.uprightHeightIn}" fill="#2f5d8a"/>`)
  const L = [...t.levels].sort((a, b) => a.beamIn - b.beamIn)
  const gap = (bayIn - 2 * palletWIn) / 3
  L.forEach((lv, k) => {
    const base = lv.beamIn
    if (base > 0) parts.push(`<rect x="${left + upW}" y="${y(base)}" width="${bayIn}" height="${4}" fill="#e07a1f"/>`)
    const ph = lv.palletHeightIn || 0
    for (let p = 0; p < 2; p++) {
      const px = left + upW + gap + p * (palletWIn + gap)
      parts.push(`<rect x="${px}" y="${y(base + (base > 0 ? 4 : 0) + ph)}" width="${palletWIn}" height="${ph}" fill="#f3e2c3" stroke="#8a6a3a" stroke-width="${line}"/>`)
    }
    // clearance above the pallet
    const cTop = base + (base > 0 ? 4 : 0) + ph + (t.clearanceIn || 0)
    parts.push(`<line x1="${left + upW}" y1="${y(cTop)}" x2="${left + upW + bayIn}" y2="${y(cTop)}" stroke="#9aa" stroke-width="${line}" stroke-dasharray="${line * 3} ${line * 2}"/>`)
    parts.push(`<text x="${left + upW + bayIn / 2}" y="${y(base + (base > 0 ? 4 : 0) + ph / 2) + fs * 0.35}" font-size="${fs * 0.8}" font-family="Arial" text-anchor="middle" fill="#5a4320">${esc((lv.loadLb || 0).toLocaleString('en-US'))} lb</text>`)
    // the beam height, dimensioned on the left
    parts.push(`<line x1="${left - 4}" y1="${y(base)}" x2="${left}" y2="${y(base)}" stroke="#333" stroke-width="${line}"/>`)
    parts.push(`<text x="${left - 6}" y="${y(base) + fs * 0.35}" font-size="${fs * 0.85}" font-family="Arial" text-anchor="end" fill="#222">L${k + 1} ${base ? ftIn(base) : 'floor'}</text>`)
  })
  // the upright height, on the right
  const dx = left + W + 12
  parts.push(`<line x1="${dx}" y1="${y(0)}" x2="${dx}" y2="${y(t.uprightHeightIn)}" stroke="#333" stroke-width="${line}"/>`)
  for (const v of [0, t.uprightHeightIn]) parts.push(`<line x1="${dx - 4}" y1="${y(v)}" x2="${dx + 4}" y2="${y(v)}" stroke="#333" stroke-width="${line}"/>`)
  parts.push(`<text x="${dx + 3}" y="${y(t.uprightHeightIn / 2)}" font-size="${fs * 0.85}" font-family="Arial" fill="#222" transform="rotate(-90 ${dx + 3} ${y(t.uprightHeightIn / 2)})" text-anchor="middle">${ftIn(t.uprightHeightIn)}</text>`)
  parts.push(`<text x="${left}" y="${vbH - fs * 0.5}" font-size="${fs * 0.8}" font-family="Arial" fill="#444">Frame depth ${ftIn(t.frameDepthIn)} · pallet ${L[0]?.palletHeightIn ?? 0}" + ${t.clearanceIn}" clearance · bay shown at ${ftIn(bayIn)}</text>`)
  const h = Math.round((width * vbH) / vbW)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${vbW} ${vbH}">${parts.join('')}</svg>`
}
