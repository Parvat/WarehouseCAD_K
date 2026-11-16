import { HOME_TOOL } from '../utils/homeTool'
import { DOOR_ROW_TOOL } from '../utils/doorRowTool'
import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useLiveObjects, useView } from './live'
import { floorUnit } from './DoorAnnot'
import { Icon } from '../studio/Icon'
import { textOwnsKey } from '../utils/typing'
import { LabelOps } from './LabelOps'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { gapOps } from '../render/doorAnnot'
import { ftIn } from '../utils/bom'
import { feetOf } from '../components/RightPanel/panels/ColumnGridPanel'
import { Rect, Line } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { useDoorTool, doorTypes, doorSpec, setDoorType, setDoorWidth, clearDoorHover, liveGap, placeTypedDoor } from '../utils/doorTool'
import { B, MONO, modePill, Sep, Seg, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { SELECT_BLUE, selectTint } from '../theme/tokens'

/* Add door's mode bar (STUDIO.md §7; the mode bars' look, C9 / C10): top 76 — "Add door", the door types in the
   library today (a segmented control), the width (the type's; typed here for the next door), Door row, Done, ✕ (Esc too)
   back to Select. The hint is one line just below the bar, in the drawings' words colour on the ground (not in the bar). */
const word = { color: B.muted, fontSize: 12 }
const HINT = '#767C74'                                         // the drawings' words (STUDIO.md) — readable on the ground
const valueBox = { height: 26, width: 52, padding: '0 8px', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }

export function DoorBar() {
  const typeId = useDoorTool(s => s.typeId)
  useDoorTool(s => s.widthFt)                                   // the width shown follows a typed one
  const [text, setText] = useState(null)
  const spec = doorSpec(), types = doorTypes()
  const close = () => { clearDoorHover(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
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
      <button type="button" aria-label="Door row" title="Door row — a row of equal dock doors along a wall" onClick={() => { clearDoorHover(); useCanvasStore.getState().setActiveTool(DOOR_ROW_TOOL) }} className={btnClass(false)}
        style={{ ...barBtn(false), display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 0 8px' }}><Icon name="Door row" size={16} />Door row</button>
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Add door" title="Done (Esc)" onClick={close} />
      <div data-mode-hint aria-live="polite" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, textAlign: 'center', fontSize: 12, color: HINT, pointerEvents: 'none' }}>
        Hover a wall · click to place · type a gap + Enter · Esc ends
      </div>
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

/** The live gap while placing (doors-edit round; STUDIO.md, Doors): the preview's gap to the last door placed on its
 *  wall (or the wall's low corner), inside the building as the gaps are (render/doorAnnot.js gapOps — plain text, no line).
 *  A number typed shows in its place with a thin text cursor; Enter drops the door exactly there; Esc ends the tool. */
export function DoorGapLive() {
  useDoorTool(s => s.hover)
  const typed = useDoorTool(s => s.typed)
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  const u = floorUnit(labelScale(useLabelPrefs(s => s.labelSize), gs), useView().zoom)
  const L = liveGap(objects, gs)
  if (!L || !(L.hi - L.lo > -0.5)) return null
  const text = typed != null ? (typed || ' ') : ftIn((Math.max(0, L.hi - L.lo) / gs) * 12)
  const { ops } = gapOps(L.w, L.lo, Math.max(L.lo, L.hi), text, u, { cursor: typed != null, objects, gridSize: gs })
  return <LabelOps ops={ops} name="door-gap-live" fit={false} />
}

/** The door tool's keys: a number typed (digits, ', ", a point, a space) goes into the live gap; Backspace takes one
 *  off; Enter drops the door that far from the last door (or the corner); Esc ends the tool. */
export function useDoorGapKeys(on) {
  useEffect(() => {
    if (!on) return
    const key = (e) => {
      if (textOwnsKey(e)) return                                   // a text being typed owns its keys (utils/typing.js)
      const s = useDoorTool.getState()
      if (/^[0-9.'"]$/.test(e.key) || (e.key === ' ' && s.typed != null)) { e.preventDefault(); e.stopPropagation(); useDoorTool.setState({ typed: (s.typed ?? '') + e.key }); return }
      if (e.key === 'Backspace' && s.typed != null) { e.preventDefault(); e.stopPropagation(); useDoorTool.setState({ typed: s.typed.slice(0, -1) || null }); return }
      if (e.key === 'Enter' && s.typed != null) {
        e.preventDefault(); e.stopPropagation()
        const ft = feetOf(s.typed)
        placeTypedDoor(useCanvasStore, nanoid, ft)
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); useDoorTool.setState({ typed: null }); clearDoorHover(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on])
}
