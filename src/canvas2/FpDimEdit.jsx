// FpDimEdit.jsx — a building's dimension label typed (building-size fix; STUDIO.md §7). A click on one of the selected
// building's wall dimensions (DimensionLabels.jsx FpDimLabels — the blue pills) opens a box over it with the wall's
// length; Enter or leaving writes it (utils/buildingSize.js: the walls past its far end move, the opposite corner held,
// the handle resize's shrink rules in the same undo step, its notice), Esc drops it. Typing stays the box's.
//
// (It existed on the SVG canvas — CanvasArea's WallInputOverlay, opened by a selected wall — and was lost when the SVG
// canvas was retired, cb9220f; this brings it back on the label itself.)

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { buildingDims, DIM_INK } from '../render/buildingDims'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { useLiveObjects, useView } from './live'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { wallLengthUpdate, setBuildingSize } from '../utils/buildingSize'

/** The label being typed: { fpId, wallIdx } or null. */
export const useDimEdit = create(() => ({ edit: null }))
export const closeDimEdit = () => { if (useDimEdit.getState().edit) useDimEdit.setState({ edit: null }) }

/** Building `fp`'s size values as drawn (render/buildingDims.js — a rectangle's bottom and right, an L's every wall):
 *  [{ wallIdx, x, y, w, h (the value's box), text, fs, tw, lenFt }] (world px). */
export function fpDimBoxes(fp, gridSize = 40) {
  const lz = labelScale(useLabelPrefs.getState().labelSize, gridSize)
  return buildingDims(fp, gridSize, lz).map(d => ({ wallIdx: d.wallIdx, ...d.box, text: d.text, fs: d.fs, tw: d.tw, lenFt: d.lenFt }))
}
/** The wall whose dimension pill holds world point `w` (a few screen px of slack at `zoom`), or null. */
export function fpDimHit(fp, w, gridSize = 40, zoom = 1) {
  const pad = 3 / zoom
  const b = fpDimBoxes(fp, gridSize).find(q => w.x >= q.x - pad && w.x <= q.x + q.w + pad && w.y >= q.y - pad && w.y <= q.y + q.h + pad)
  return b ? b.wallIdx : null
}

const feetOf = (t) => parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"').replace(/\s*ft\s*/g, "'").replace(/\s*in\s*/g, '"'))

export function FpDimEdit() {
  const edit = useDimEdit(s => s.edit)
  const objects = useLiveObjects(), view = useView(), gs = useCanvasStore(s => s.gridSize) || 40
  const fp = edit ? objects.find(o => o.id === edit.fpId) || null : null
  const box = fp ? fpDimBoxes(fp, gs).find(b => b.wallIdx === edit.wallIdx) || null : null
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (box) { setText(String(+box.lenFt.toFixed(2))); requestAnimationFrame(() => ref.current?.select()) } }, [edit?.fpId, edit?.wallIdx])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!fp || !box) return null
  const done = (save) => {
    const e = useDimEdit.getState().edit
    useDimEdit.setState({ edit: null })
    if (!save || !e) return
    const ft = feetOf(text)
    if (!(ft > 0) || Math.abs(ft - box.lenFt) < 1e-6) return
    const cur = useCanvasStore.getState().objects.find(o => o.id === e.fpId)
    if (cur) setBuildingSize(useCanvasStore, cur.id, wallLengthUpdate(cur, e.wallIdx, ft, gs))
  }
  const px = Math.max(12, box.fs * view.zoom), w = Math.max(84, box.tw * view.zoom + 24), h = px * 1.4 + 6
  const cx = (box.x + box.w / 2) * view.zoom + view.panX, cy = (box.y + box.h / 2) * view.zoom + view.panY
  return (
    <input ref={ref} aria-label="Building wall length (ft)" value={text} onChange={e => setText(e.target.value)} autoFocus
      onBlur={() => done(true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      style={{ position: 'absolute', zIndex: 145, left: cx - w / 2, top: cy - h / 2, width: w, height: h, boxSizing: 'border-box', padding: '0 4px',
        border: '1px solid ' + DIM_INK, borderRadius: 3, outline: 'none', background: '#FFFFFF', color: DIM_INK, textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 700, fontSize: px }} />
  )
}
