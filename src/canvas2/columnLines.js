// canvas2/columnLines.js — a column grid's lines (STUDIO.md §7a Column), moved one at a time. A column grid is its first
// column's centre (x, y) and the gaps between its lines (spacingX, spacingY — expandColumnGrid). Moving a vertical line
// moves every column on it: the gaps on its two sides change, every other line stays put. Only on an unlocked Columns
// layer (the drag and the card's fields both ask isPickable).
//
//   - a drag on a column: the axis is decided by the first 6 px (sideways: its vertical line; up or down: its
//     horizontal line), the distances to the neighbouring lines shown live (useColumnLine → ColumnLineLabels), one undo;
//   - the card's fields (the picked column): the distance to the previous and next line in each direction, typed.

import { create } from 'zustand'
import { useColumnPick } from './columnPick'

const sum = (a) => a.reduce((t, v) => t + v, 0)

/** The grid's line positions (world px): { xs, ys } — vertical lines at xs, horizontal at ys. */
export function linesOf(g) {
  const xs = [g.x]; for (const s of g.spacingX || []) xs.push(xs[xs.length - 1] + s)
  const ys = [g.y]; for (const s of g.spacingY || []) ys.push(ys[ys.length - 1] + s)
  return { xs, ys }
}

/** The index of the line through column `col` ({ x, y, w, h }) on `axis` ('x': its vertical line, 'y': horizontal). */
export function lineIndexOf(g, col, axis) {
  const at = axis === 'x' ? col.x + col.w / 2 : col.y + col.h / 2
  const ls = axis === 'x' ? linesOf(g).xs : linesOf(g).ys
  let best = 0
  ls.forEach((v, i) => { if (Math.abs(v - at) < Math.abs(ls[best] - at)) best = i })
  return best
}

/** The gaps from line `i` on `axis` to the line before and after it (world px; null at the grid's edge). */
export function gapsOf(g, axis, i) {
  const ls = axis === 'x' ? linesOf(g).xs : linesOf(g).ys
  return { prev: i > 0 ? ls[i] - ls[i - 1] : null, next: i < ls.length - 1 ? ls[i + 1] - ls[i] : null }
}

/** The patch that puts line `i` on `axis` at `pos` (world px): the gaps either side of it change, the other lines stay.
 *  Kept a column's width clear of its neighbours, and on whole inches from the line it came from. */
export function moveLine(g, axis, i, pos, gridSize = 40) {
  const X = axis === 'x', key = X ? 'spacingX' : 'spacingY', o = X ? 'x' : 'y', size = X ? 'width' : 'height'
  const ls = X ? linesOf(g).xs : linesOf(g).ys
  const inch = gridSize / 12, room = (X ? g.columnW : g.columnH) || gridSize
  let p = ls[i] + Math.round((pos - ls[i]) / inch) * inch
  if (i > 0) p = Math.max(p, ls[i - 1] + room)
  if (i < ls.length - 1) p = Math.min(p, ls[i + 1] - room)
  const sp = [...(g[key] || [])]
  if (i > 0) sp[i - 1] = p - ls[i - 1]
  if (i < ls.length - 1) sp[i] = ls[i + 1] - p
  const patch = { [key]: sp }
  if (i === 0) patch[o] = p
  if (typeof g[size] === 'number') patch[size] = g[size] + (sum(sp) - sum(g[key] || []))
  return patch
}

/** The live line drag, for the distance labels: { gridId, axis, i } or null. */
export const useColumnLine = create(() => ({ live: null }))

/** The picked column follows its line (columnPick.js keeps its square). */
function followPick(g, patch, axis, i) {
  const p = useColumnPick.getState().pick
  if (!p || p.gridId !== g.id) return
  const before = axis === 'x' ? linesOf(g).xs[i] : linesOf(g).ys[i]
  const after = axis === 'x' ? linesOf({ ...g, ...patch }).xs[i] : linesOf({ ...g, ...patch }).ys[i]
  const k = axis === 'x' ? 'x' : 'y', size = axis === 'x' ? 'w' : 'h'
  if (Math.abs(p[k] + p[size] / 2 - before) < 1e-6) useColumnPick.setState({ pick: { ...p, [k]: p[k] + (after - before) } })
}

/** A drag frame: line `i` of grid `g0` (the grid as the drag found it) moved by `d` world px — written live, no history. */
export function dragLine(store, g0, axis, i, d) {
  const ls = axis === 'x' ? linesOf(g0).xs : linesOf(g0).ys
  const patch = moveLine(g0, axis, i, ls[i] + d, store.getState().gridSize || 40)
  const now = store.getState().objects.find(o => o.id === g0.id)
  if (now) followPick(now, patch, axis, i)
  store.getState().updateObject(g0.id, patch)
  useColumnLine.setState({ live: { gridId: g0.id, axis, i } })
}

/** The drag's end: one undo step when the line moved. */
export function endLineDrag(store, g0) {
  useColumnLine.setState({ live: null })
  const g = store.getState().objects.find(o => o.id === g0.id)
  if (g && JSON.stringify(g) !== JSON.stringify(g0)) store.getState().commitObjectUpdate(g.id, g)
}

/** A typed gap (the card): line `i` on `axis` moved so its gap to the previous (`side` 'prev') or next line is `px` —
 *  one undo step. */
export function setLineGap(store, gridId, axis, i, side, px) {
  const g = store.getState().objects.find(o => o.id === gridId)
  if (!g || !(px > 0)) return
  const ls = axis === 'x' ? linesOf(g).xs : linesOf(g).ys
  const pos = side === 'prev' ? ls[i - 1] + px : ls[i + 1] - px
  if (!Number.isFinite(pos)) return
  const patch = moveLine(g, axis, i, pos, store.getState().gridSize || 40)
  followPick(g, patch, axis, i)
  store.getState().commitObjectUpdate(gridId, patch)
}
