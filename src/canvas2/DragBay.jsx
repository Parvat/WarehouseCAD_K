// DragBay.jsx — typing a bay made easy to find (col-bubbles round; STUDIO.md §7 Column grid):
//   1. Drag to type: while a gridline is dragged (the line, a column on it, or its bubble — useCanvasInteraction.js), the
//      bay just before it shows live in a box at the chain. A number typed (no click) fills it; Enter applies that exact
//      bay to the grid as it was before the drag — the chain rule (utils/columnGrid.js chainEdit: the lines beyond move
//      with it, the last bay takes the difference), one undo step; Esc cancels the whole move. After the release the box
//      stays 3 s, so the number can still be typed (then it is a chain edit of the grid as dropped — its own undo step;
//      Esc then takes the move back).
//   2. The chain's hint: a value hovered is underlined, with a text cursor and a small "Click to type".

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { DIM_INK } from '../render/buildingDims'
import { useLiveObjects, useView } from './live'
import { chainSpot } from './ColumnGridAnnot'
import { applyChainEdit } from './ColumnChainEdit'
import { chainEdit, gridBuilding, gridLines } from '../utils/columnGrid'
import { buildingOutline } from '../utils/floorGeom'
import { feetOf } from '../components/RightPanel/panels/ColumnGridPanel'
import { notify } from '../utils/notice'

export const AFTER_MS = 3000

/** The bay being shown: { gridId, axis, i, g0, lo, hi0, phase: 'drag' | 'after', typed, consumed, hist } or null. */
export const useDragBay = create(() => ({ act: null }))
let timer = null
/* the drag settled by the box (Enter or Esc while dragging): kept apart from the box's own state, which closes at once —
   the drag lets go without writing until it is released */
let settled = false
const clear = () => { clearTimeout(timer); timer = null; useDragBay.setState({ act: null }) }

/** The stop before line `i` of grid `g` on `axis`: the line before it inside the building, else the near wall; null
 *  when the line is on the near wall (no bay before it). */
function stopBefore(g, fp, axis, i) {
  const ls = axis === 'x' ? gridLines(g).xs : gridLines(g).ys
  const p = fp ? buildingOutline(fp) : null, w0 = p ? Math.min(...p.map(q => (axis === 'x' ? q.x : q.y))) : ls[0]
  if (ls[i] <= w0 + 0.5) return null
  for (let k = i - 1; k >= 0; k--) if (ls[k] > w0 + 0.5) return ls[k]
  return w0
}

/** A line drag found its line (`i` on `axis` of grid `g0`, as the drag began): its bay shown. */
export function startDragBay(g0, axis, i) {
  clear(); settled = false
  const fp = gridBuilding(useCanvasStore.getState().objects, g0), lo = stopBefore(g0, fp, axis, i)
  if (lo == null) return
  const hi0 = (axis === 'x' ? gridLines(g0).xs : gridLines(g0).ys)[i]
  useDragBay.setState({ act: { gridId: g0.id, axis, i, g0, lo, hi0, phase: 'drag', typed: null, consumed: false, hist: null } })
}
/** Has the drag been settled by the box (Enter or Esc)? The drag then lets go without writing. */
export const dragBayConsumed = () => settled
/** The release: the box stays 3 s (unless a number is being typed). */
export function releaseDragBay() {
  const a = useDragBay.getState().act
  if (settled || !a) { settled = false; clear(); return }
  useDragBay.setState({ act: { ...a, phase: 'after', hist: useCanvasStore.getState().historyIndex } })
  clearTimeout(timer)
  timer = setTimeout(() => { if (useDragBay.getState().act?.typed == null) clear() }, AFTER_MS)
}

/** Enter: the typed bay applied. While dragging: to the grid as it was before the drag (one undo step); after: a chain
 *  edit of the grid as dropped. */
function applyTyped(a, text) {
  const ft = feetOf(text), st = useCanvasStore.getState(), gs = st.gridSize || 40
  if (a.phase === 'drag') {
    st.updateObject(a.gridId, a.g0)                                   // the drag's live frames undone: the grid as it was
    settled = true
    if (ft == null) return clear()
    const r = chainEdit(a.g0, gridBuilding(st.objects, a.g0), a.axis, a.lo, a.hi0, ft * gs, gs)
    if (r.error) notify(r.error)
    else st.commitObjectUpdate(a.gridId, r.patch)
    return clear()
  }
  const g = st.objects.find(o => o.id === a.gridId)
  if (g && ft != null) applyChainEdit(useCanvasStore, { gridId: a.gridId, axis: a.axis, lo: a.lo, hi: (a.axis === 'x' ? gridLines(g).xs : gridLines(g).ys)[a.i] }, ft)
  clear()
}
/** Esc: the whole move cancelled — while dragging, the grid put back; after the release, the move undone. */
function cancel(a) {
  const st = useCanvasStore.getState()
  if (a.phase === 'drag') { st.updateObject(a.gridId, a.g0); settled = true }
  else if (st.historyIndex === a.hist && st.undo) st.undo()
  clear()
}

export function DragBayBox() {
  const act = useDragBay(s => s.act)
  const objects = useLiveObjects(), view = useView(), gs = useCanvasStore(s => s.gridSize) || 40
  const ref = useRef(null)
  const g = act ? objects.find(o => o.id === act.gridId) : null
  const hi = g ? (act.axis === 'x' ? gridLines(g).xs : gridLines(g).ys)[act.i] : null
  const spot = act ? chainSpot(act.gridId, act.axis, act.lo) : null
  // the keys while it shows: a number typed fills it (no click); Enter applies, Esc cancels — the canvas's own keys wait
  useEffect(() => {
    if (!act) return
    const key = (e) => {
      const a = useDragBay.getState().act
      if (!a) return
      const inBox = document.activeElement === ref.current
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(a); return }
      if (e.key === 'Enter') { if (a.typed != null) { e.preventDefault(); e.stopPropagation(); applyTyped(a, a.typed) } return }
      if (!inBox && /^[0-9.]$/.test(e.key)) {
        e.preventDefault(); e.stopPropagation()
        clearTimeout(timer)
        // (keys that come before the box has focus add on — a quick "30" stays 30)
        useDragBay.setState({ act: { ...a, typed: (a.typed == null ? '' : a.typed) + e.key } })
        const el = ref.current
        if (el) el.focus()
        requestAnimationFrame(() => { const b = ref.current; if (b) { const k = b.value.length; b.setSelectionRange(k, k) } })
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [act?.gridId, act?.axis, act?.i])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!act || !spot || hi == null) return null
  const live = (hi - act.lo) / gs, shown = act.typed != null ? act.typed : String(+live.toFixed(2))
  const px = Math.max(12, spot.fs * view.zoom), w = Math.max(64, spot.tw * view.zoom + 28), h = px * 1.4 + 6
  const cx = (spot.x + spot.w / 2) * view.zoom + view.panX, cy = (spot.y + spot.h / 2) * view.zoom + view.panY
  return (
    <input ref={ref} aria-label="Bay before the line (ft)" data-drag-bay={act.phase} value={shown} readOnly={act.typed == null}
      onChange={e => { clearTimeout(timer); const a = useDragBay.getState().act; if (a) useDragBay.setState({ act: { ...a, typed: e.target.value } }) }}
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'absolute', zIndex: 146, left: cx - w / 2, top: cy - h / 2, width: w, height: h, boxSizing: 'border-box', padding: '0 4px',
        border: '1px solid ' + DIM_INK, borderRadius: 3, outline: 'none', background: '#FFFFFF', color: DIM_INK, textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600, fontSize: px, boxShadow: '0 2px 6px rgba(47,111,214,.25)' }} />
  )
}

/** The chain value under the pointer (useCanvasInteraction.js's hover): { gridId, axis, lo } or null. */
export const useChainHover = create(() => ({ spot: null }))
export const setChainHover = (s) => { const cur = useChainHover.getState().spot; if ((cur && s && cur.gridId === s.gridId && cur.axis === s.axis && Math.abs(cur.lo - s.lo) < 0.5) || (!cur && !s)) return; useChainHover.setState({ spot: s ? { gridId: s.gridId, axis: s.axis, lo: s.lo } : null }) }

/** 2. The hint: the hovered value underlined, and a small "Click to type" under it. */
export function ChainHint() {
  const h = useChainHover(s => s.spot), view = useView()
  useLiveObjects()                                                       // (redrawn with the chain)
  const editing = useDragBay(s => !!s.act)
  const spot = h && !editing ? chainSpot(h.gridId, h.axis, h.lo) : null
  if (!spot) return null
  const x0 = (spot.x + spot.w / 2 - spot.tw / 2) * view.zoom + view.panX, x1 = (spot.x + spot.w / 2 + spot.tw / 2) * view.zoom + view.panX
  const yb = (spot.y + spot.h) * view.zoom + view.panY
  return (
    <>
      <div data-chain-underline style={{ position: 'absolute', zIndex: 144, left: x0, top: yb - 1, width: Math.max(4, x1 - x0), height: 1.5, background: DIM_INK, pointerEvents: 'none' }} />
      <div role="tooltip" data-chain-tip style={{ position: 'absolute', zIndex: 144, left: (x0 + x1) / 2, top: yb + 6, transform: 'translateX(-50%)', padding: '3px 7px', borderRadius: 5,
        background: '#1F2321', color: '#F2F4F1', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>Click to type</div>
    </>
  )
}
