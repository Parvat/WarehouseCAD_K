// ColumnChainEdit.jsx — a value of a column grid's dimension chain typed (col-bubbles round; STUDIO.md §7 Column grid), as
// a building's size labels are (FpDimEdit.jsx): a click on a value of the chain (top or left, shown while the grid is
// selected — ColumnGridAnnot.jsx) opens a box over it with that bay's length; Enter or leaving writes it, Esc drops it,
// one undo step. A bay typed moves the gridline at its far end and every line beyond it (their bays kept; the last bay to
// the far wall takes the difference); the last bay typed moves the last line (utils/columnGrid.js chainEdit). A value that
// puts a line past a wall or makes a bay zero or less is refused, with a notice — nothing changed.

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { DIM_INK } from '../render/buildingDims'
import { useView } from './live'
import { chainSpot } from './ColumnGridAnnot'
import { chainEdit, gridBuilding } from '../utils/columnGrid'
import { feetOf } from '../components/RightPanel/panels/ColumnGridPanel'
import { notify } from '../utils/notice'

/** The value being typed: { gridId, axis, lo, hi } (world px — the segment as it was clicked) or null. */
export const useChainEdit = create(() => ({ edit: null }))
export const closeChainEdit = () => { if (useChainEdit.getState().edit) useChainEdit.setState({ edit: null }) }

/** Apply a typed length (ft) to the segment `e` of its grid — one undo step; refused with a notice. → true when written. */
export function applyChainEdit(store, e, ft) {
  const st = store.getState(), gs = st.gridSize || 40, g = st.objects.find(o => o.id === e.gridId)
  if (!g || ft == null) return false
  if (Math.abs(ft * gs - (e.hi - e.lo)) < 0.01) return false
  const r = chainEdit(g, gridBuilding(st.objects, g), e.axis, e.lo, e.hi, ft * gs, gs)
  if (r.error) { notify(r.error); return false }
  st.commitObjectUpdate(g.id, r.patch)
  return true
}

export function ColumnChainEdit() {
  const edit = useChainEdit(s => s.edit)
  const view = useView(), gs = useCanvasStore(s => s.gridSize) || 40
  const spot = edit ? chainSpot(edit.gridId, edit.axis, edit.lo) : null
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!edit) return
    setText(String(+((edit.hi - edit.lo) / gs).toFixed(2)))
    requestAnimationFrame(() => ref.current?.select())
  }, [edit?.gridId, edit?.axis, edit?.lo])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!edit || !spot) return null
  const done = (save) => {
    const e = useChainEdit.getState().edit
    useChainEdit.setState({ edit: null })
    if (save && e) applyChainEdit(useCanvasStore, e, feetOf(text))
  }
  const px = Math.max(12, spot.fs * view.zoom), w = Math.max(72, spot.tw * view.zoom + 24), h = px * 1.4 + 6
  const cx = (spot.x + spot.w / 2) * view.zoom + view.panX, cy = (spot.y + spot.h / 2) * view.zoom + view.panY
  return (
    <input ref={ref} aria-label="Column bay length (ft)" value={text} onChange={e => setText(e.target.value)} autoFocus
      onBlur={() => done(true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      style={{ position: 'absolute', zIndex: 145, left: cx - w / 2, top: cy - h / 2, width: w, height: h, boxSizing: 'border-box', padding: '0 4px',
        border: '1px solid ' + DIM_INK, borderRadius: 3, outline: 'none', background: '#FFFFFF', color: DIM_INK, textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600, fontSize: px }} />
  )
}
