// DoorGapEdit.jsx — a gap of a door's wall typed (doors-edit round; STUDIO.md, Doors), as a column chain value is
// (ColumnChainEdit.jsx): a click on a gap value (shown while a door on that wall is selected — DoorAnnot.jsx) opens a box
// over it; Enter or leaving writes it, Esc drops it — one undo step. The door after the gap and every door beyond it on
// the wall move together (utils/doorWall.js gapEdit); a value that would put a door past the corner or overlap two doors
// is refused with a notice.

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { DIM_INK } from '../render/buildingDims'
import { useView } from './live'
import { doorGapSpot } from './DoorAnnot'
import { gapEdit, wallGaps } from '../utils/doorWall'
import { feetOf } from '../components/RightPanel/panels/ColumnGridPanel'
import { notify } from '../utils/notice'

/** The gap being typed: { key (its wall), w, after (the door after it) } or null. */
export const useDoorGapEdit = create(() => ({ edit: null }))

/** Several doors patched as ONE undo step. */
export function commitDoorPatches(store, patches) {
  if (!patches?.length) return
  const st = store.getState(), by = new Map(patches)
  store.setState({ objects: st.objects.map(o => (by.has(o.id) ? { ...o, ...by.get(o.id) } : o)) })
  store.getState().commitObjectUpdate(patches[0][0], {})
}

/** Apply a typed gap (ft) to the gap of wall `w` before door `after` — one undo step; refused with a notice. */
export function applyDoorGap(store, w, after, ft) {
  const st = store.getState(), gs = st.gridSize || 40
  if (ft == null) return false
  const g = wallGaps(st.objects, w, { gs }).find(q => q.after === after)
  if (!g || Math.abs(ft * gs - (g.hi - g.lo)) < 0.01) return false
  const r = gapEdit(st.objects, w, g, ft * gs, gs)
  if (r.error) { notify(r.error); return false }
  commitDoorPatches(store, r.patches)
  return true
}

export function DoorGapEdit() {
  const edit = useDoorGapEdit(s => s.edit)
  const view = useView(), gs = useCanvasStore(s => s.gridSize) || 40
  const spot = edit ? doorGapSpot(edit.key, edit.after) : null
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!edit || !spot) return
    setText(String(+((spot.gap.hi - spot.gap.lo) / gs).toFixed(2)))
    requestAnimationFrame(() => ref.current?.select())
  }, [edit?.key, edit?.after])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!edit || !spot) return null
  const done = (save) => {
    const e = useDoorGapEdit.getState().edit
    useDoorGapEdit.setState({ edit: null })
    if (save && e) applyDoorGap(useCanvasStore, e.w, e.after, feetOf(text))
  }
  const fs = spot.box.h / 1.4, px = Math.max(12, fs * view.zoom), w = Math.max(72, spot.box.w * view.zoom + 24), h = px * 1.4 + 6
  const cx = (spot.box.x + spot.box.w / 2) * view.zoom + view.panX, cy = (spot.box.y + spot.box.h / 2) * view.zoom + view.panY
  return (
    <input ref={ref} aria-label="Door gap (ft)" value={text} onChange={e => setText(e.target.value)} autoFocus
      onBlur={() => done(true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      style={{ position: 'absolute', zIndex: 145, left: cx - w / 2, top: cy - h / 2, width: w, height: h, boxSizing: 'border-box', padding: '0 4px',
        border: '1px solid ' + DIM_INK, borderRadius: 3, outline: 'none', background: '#FFFFFF', color: DIM_INK, textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600, fontSize: px }} />
  )
}
