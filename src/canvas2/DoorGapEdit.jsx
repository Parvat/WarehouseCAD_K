// DoorGapEdit.jsx — a value of a door wall's chain typed (doors-edit round; STUDIO.md, Doors), as a column chain value is
// (ColumnChainEdit.jsx): a click on a value (shown while a door on that wall is selected — DoorAnnot.jsx) opens a box over
// it; Enter or leaving writes it, Esc drops it — one undo step. A gap: the door after it and every door beyond it on the
// wall move together (the gap to the far corner: all of them, keeping their gaps — utils/doorWall.js gapEdit). A door's
// width: that door resized from its low end, the doors beyond it moving with its far end so their gaps hold (widthEdit).
// A value that would put a door past the corner or overlap two doors is refused with a notice.

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { DIM_INK } from '../render/buildingDims'
import { useView } from './live'
import { doorGapSpot } from './DoorAnnot'
import { gapEdit, wallGaps, widthEdit } from '../utils/doorWall'
import { feetOf } from '../components/RightPanel/panels/ColumnGridPanel'
import { notify } from '../utils/notice'

/** The value being typed: { key (its wall), w, kind: 'gap', after (the door after it; null — the far corner's), before }
 *  or { key, w, kind: 'door', id } — or null. */
export const useDoorGapEdit = create(() => ({ edit: null }))

/** Several doors patched as ONE undo step. */
export function commitDoorPatches(store, patches) {
  if (!patches?.length) return
  const st = store.getState(), by = new Map(patches)
  store.setState({ objects: st.objects.map(o => (by.has(o.id) ? { ...o, ...by.get(o.id) } : o)) })
  store.getState().commitObjectUpdate(patches[0][0], {})
}

/** Apply a typed gap (ft) to the gap of wall `w` before door `after` (null: the gap after door `before` to the far
 *  corner) — one undo step; refused with a notice. */
export function applyDoorGap(store, w, after, ft, before = null) {
  const st = store.getState(), gs = st.gridSize || 40
  if (ft == null) return false
  const g = wallGaps(st.objects, w, { gs, withEnd: true }).find(q => q.after === after && (after != null || q.before === before))
  if (!g || Math.abs(ft * gs - (g.hi - g.lo)) < 0.01) return false
  const r = gapEdit(st.objects, w, g, ft * gs, gs)
  if (r.error) { notify(r.error); return false }
  commitDoorPatches(store, r.patches)
  return true
}

/** Apply a typed width (ft) to door `id` on wall `w` — one undo step; refused with a notice. */
export function applyDoorWidth(store, w, id, ft) {
  const st = store.getState(), gs = st.gridSize || 40, d = st.objects.find(o => o.id === id)
  if (ft == null || !d) return false
  const r = widthEdit(st.objects, w, id, ft * gs, gs)
  if (r.error) { notify(r.error); return false }
  if (Math.abs(r.patches[0][1].width - d.width) < 0.01 && Math.abs(r.patches[0][1].height - d.height) < 0.01 && Math.abs(r.patches[0][1].x - d.x) < 0.01 && Math.abs(r.patches[0][1].y - d.y) < 0.01) return false
  commitDoorPatches(store, r.patches)
  return true
}

export function DoorGapEdit() {
  const edit = useDoorGapEdit(s => s.edit)
  const view = useView(), gs = useCanvasStore(s => s.gridSize) || 40
  const spot = edit ? doorGapSpot(edit.key, edit) : null
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!edit || !spot) return
    setText(String(+((spot.stop.hi - spot.stop.lo) / gs).toFixed(2)))
    requestAnimationFrame(() => ref.current?.select())
  }, [edit?.key, edit?.after, edit?.id, edit?.kind])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!edit || !spot) return null
  const done = (save) => {
    const e = useDoorGapEdit.getState().edit
    useDoorGapEdit.setState({ edit: null })
    if (save && e) { if (e.kind === 'door') applyDoorWidth(useCanvasStore, e.w, e.id, feetOf(text)); else applyDoorGap(useCanvasStore, e.w, e.after, feetOf(text), e.before) }
  }
  const fs = spot.box.h / 1.4, px = Math.max(12, fs * view.zoom), w = Math.max(72, spot.box.w * view.zoom + 24), h = px * 1.4 + 6
  const cx = (spot.box.x + spot.box.w / 2) * view.zoom + view.panX, cy = (spot.box.y + spot.box.h / 2) * view.zoom + view.panY
  return (
    <input ref={ref} aria-label={edit.kind === 'door' ? 'Door width on the wall (ft)' : 'Door gap (ft)'} value={text} onChange={e => setText(e.target.value)} autoFocus
      onBlur={() => done(true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      style={{ position: 'absolute', zIndex: 145, left: cx - w / 2, top: cy - h / 2, width: w, height: h, boxSizing: 'border-box', padding: '0 4px',
        border: '1px solid ' + DIM_INK, borderRadius: 3, outline: 'none', background: '#FFFFFF', color: DIM_INK, textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: edit.kind === 'door' ? 700 : 400, fontSize: px }} />
  )
}
