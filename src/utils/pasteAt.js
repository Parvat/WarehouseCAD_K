// pasteAt.js — paste at the mouse cursor (Ctrl+V, the top bar's Paste) or
// in place (Ctrl+Shift+V). The protected store's paste() nudges each paste
// 20 px down-right; this builds the same copies (new ids, parentId and group
// remapping) placed where the user wants them, writes them without a history
// entry and makes ONE commit: one undo per paste. Duplicate (Ctrl+D) is the
// same with the store's 20 px nudge ('nudge').
//
// After any paste or duplicate ONLY the new objects are selected: no other
// rack keeps its clicked bay (activeBayIdx), whose blue outline is drawn
// whether or not the rack is selected and made the original look selected.
//
// A pasted rack is a NEW row: it loses the generator's row stamps
// (rowIndex / genSection / genRunFt / genCrossFt) and any split-piece link
// (pieceOf), so it is an added row ("Copy to all sections",
// utils/rowGroup.js) and never a move of the row it was copied from. It is
// parented to the building it lands in.
//
// Pasting or duplicating ROWS (beam racks) does not drop them straight in:
// they follow the mouse, faded, and snap until a click places them
// (utils/placement.js) — Esc cancels. Paste in place still lands exactly
// where the originals are.

import { startPlacement } from './placement'
import { isRow } from './copyChange'

const STAMPS = ['rowIndex', 'genSection', 'genRunFt', 'genCrossFt', 'pieceOf']
const FP = new Set(['fp_rect', 'fp_l', 'fp_t', 'fp_u', 'fp_cross', 'fp_l_mirror'])

let lastPointer = null   // last pointer position over the canvas, px inside the canvas container

/** Remember where the pointer last was over the canvas. Returns the unsubscribe. */
export function trackCanvasPointer(win = window) {
  const onMove = (e) => {
    const el = win.document.getElementById('canvas2-container')
    if (!el) return
    const r = el.getBoundingClientRect()
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
  }
  win.addEventListener('pointermove', onMove)
  return () => win.removeEventListener('pointermove', onMove)
}
/** For tests: set the pointer (px inside the canvas container). */
export function setCanvasPointer(p) { lastPointer = p }
/** The pointer in world coordinates for the store's current view, or null. */
export function pointerWorld(st) {
  if (!lastPointer) return null
  return { x: (lastPointer.x - (st.panX || 0)) / (st.zoom || 1), y: (lastPointer.y - (st.panY || 0)) / (st.zoom || 1) }
}

const boxOf = (o) => {
  const x = o.cx ?? o.x1 ?? o.x ?? 0
  const y = o.cy ?? o.y1 ?? o.y ?? 0
  const r = o.cx ? o.cx + (o.rx ?? 0) : o.x2 ?? ((o.x ?? 0) + (o.width ?? 0))
  const b = o.cy ? o.cy + (o.ry ?? 0) : o.y2 ?? ((o.y ?? 0) + (o.height ?? 0))
  return { x, y, r, b }
}

/** The pasted objects for `mode` 'cursor' (the clipboard's centre on
 *  `at`, a world point; with no pointer yet, the store's usual 20 px nudge),
 *  'inPlace' (exactly where the originals are) or 'nudge' (20 px down-right:
 *  Duplicate). Returns { objects,
 *  groups, selectedIds } for the whole scene, or null with nothing to paste. */
export function planPaste(state, mode, at, newId) {
  const clip = state.clipboard || []
  if (!clip.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const o of clip) { const b = boxOf(o); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.r); maxY = Math.max(maxY, b.b) }
  let dx = 0, dy = 0
  if (mode === 'cursor') {
    if (at) { dx = at.x - (minX + maxX) / 2; dy = at.y - (minY + maxY) / 2 } else { dx = 20; dy = 20 }
  }
  if (mode === 'nudge') { dx = 20; dy = 20 }
  const idMap = {}
  for (const o of clip) idMap[o.id] = newId()
  const clipIds = new Set(clip.map(o => o.id))
  const buildings = state.objects.filter(o => FP.has(o.type))
  const pasted = clip.map(o => {
    const c = { ...o, id: idMap[o.id] }
    const parent = o.parentId ? (idMap[o.parentId] ?? o.parentId) : undefined
    if (parent) c.parentId = parent; else delete c.parentId
    if (c.type === 'circle') { c.cx += dx; c.cy += dy }
    else if ('x1' in c) { c.x1 += dx; c.y1 += dy; c.x2 += dx; c.y2 += dy }
    else {
      if ('x' in c) c.x += dx
      if ('y' in c) c.y += dy
      if (c.tailX !== undefined) { c.tailX += dx; c.tailY += dy }
    }
    if (c.fpVerts) c.fpVerts = c.fpVerts.map(v => ({ x: v.x + dx, y: v.y + dy }))
    if (typeof c.type === 'string' && c.type.startsWith('rack_')) {
      for (const k of STAMPS) delete c[k]
      c.activeBayIdx = null
      if (c.activeTowerIdx != null) c.activeTowerIdx = null
      // parented to the building it lands in (unless its building was pasted with it)
      if (!(o.parentId && clipIds.has(o.parentId))) {
        const b = boxOf(c), cx = (b.x + b.r) / 2, cy = (b.y + b.b) / 2
        const home = [...buildings].reverse().find(f => cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height)
        if (home) c.parentId = home.id; else delete c.parentId
      }
    }
    return c
  })
  const pastedGroups = (state.groups || [])
    .filter(g => g.ids.every(id => clipIds.has(id)))
    .map(g => ({ id: newId(), ids: g.ids.map(id => idMap[id]).filter(Boolean) }))
    .filter(g => g.ids.length >= 2)
  // only the new objects are selected: no other rack keeps a clicked bay
  const others = state.objects.map(o => (o.activeBayIdx != null || o.activeTowerIdx != null ? { ...o, activeBayIdx: null, ...(o.activeTowerIdx != null ? { activeTowerIdx: null } : {}) } : o))
  return { objects: [...others, ...pasted], groups: [...(state.groups || []), ...pastedGroups], selectedIds: pasted.map(o => o.id) }
}

/** Paste now: 'cursor', 'inPlace' or 'nudge'. One history entry — or, for
 *  rows (not in place), a placement that follows the mouse until a click. */
export function pasteAt(store, mode, newId) {
  const st = store.getState()
  const at = pointerWorld(st)
  const r = planPaste(st, mode, mode === 'cursor' ? at : null, newId)
  if (!r) return false
  if (mode !== 'inPlace') {
    const ids = new Set(r.selectedIds)
    const items = r.objects.filter(o => ids.has(o.id))
    if (items.some(isRow)) return startPlacement(store, items, { groups: r.groups.slice((st.groups || []).length), at })
  }
  store.setState({ objects: r.objects, groups: r.groups, selectedIds: r.selectedIds, activeBaySelection: [] })
  store.getState().commitObjectUpdate(r.selectedIds[0], {})
  return true
}
