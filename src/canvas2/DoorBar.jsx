import { useState } from 'react'
import { Rect, Line } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { useDoorTool, doorTypes, doorSpec, setDoorType, setDoorWidth, clearDoorHover } from '../utils/doorTool'
import { B, MONO, modePill, Sep, Seg, CloseBtn } from '../studio/barParts'
import { SELECT_BLUE, selectTint } from '../theme/tokens'

/* Add door's mode bar (STUDIO.md §7; the mode bars' look, C9 / C10): top 76 — "Add door", the door types in the
   library today (a segmented control), the width (the type's; typed here for the next door), the hint, ✕ (Esc too)
   back to Select. */
const word = { color: B.muted, fontSize: 12 }
const valueBox = { height: 26, width: 52, padding: '0 8px', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }

export function DoorBar() {
  const typeId = useDoorTool(s => s.typeId)
  useDoorTool(s => s.widthFt)                                   // the width shown follows a typed one
  const [text, setText] = useState(null)
  const spec = doorSpec(), types = doorTypes()
  const close = () => { clearDoorHover(); useCanvasStore.getState().setActiveTool(TOOLS.SELECT) }
  const commit = () => { const v = parseFloat(String(text ?? '').replace(/[′']/g, '')); setText(null); if (Number.isFinite(v) && v > 0) setDoorWidth(v) }
  return (
    <div role="toolbar" aria-label="Add door" data-mode-bar="door" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Add door</span>
      <Sep />
      <Seg aria="Door type" options={types.map(t => ({ value: t.id, label: t.short, aria: t.label, title: `${t.label} — ${t.widthFt}′ wide`, on: t.id === typeId, onClick: () => setDoorType(t.id) }))} />
      <span style={word}>Width</span>
      <input aria-label="Door width (ft)" className="st-field" style={valueBox} value={text ?? String(spec?.widthFt ?? '')}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(null); e.currentTarget.blur() } }} />
      <span style={word}>ft</span>
      <Sep />
      <span data-mode-hint style={word}>Hover a wall · click to place · Esc ends</span>
      <CloseBtn label="Close Add door" title="Done (Esc)" onClick={close} />
    </div>
  )
}

/** The door preview on the hovered wall: the door's footprint against the inner face, the face line strong. */
export function DoorPreview() {
  const at = useDoorTool(s => s.hover)
  if (!at) return null
  const cx = at.x + at.width / 2, cy = at.y + at.height / 2
  return (
    <>
      <Rect name="door-preview" x={cx} y={cy} offsetX={at.width / 2} offsetY={at.height / 2} width={at.width} height={at.height} rotation={at.rotation}
        fill={selectTint(0.18)} stroke={SELECT_BLUE} strokeWidth={1.5} dash={[5, 3]} strokeScaleEnabled={false} listening={false} />
      <Line points={at.line} stroke={SELECT_BLUE} strokeWidth={3} strokeScaleEnabled={false} listening={false} />
    </>
  )
}
