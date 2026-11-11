// CrossAisleBand.jsx — the Cross aisle tool on the plan and its mode bar (utils/crossAisleCut.js, STUDIO.md §7a
// Cross-aisles, xaisle-tool round): while a drag lays the band, the band (the selection green, as a picked cross-aisle)
// with its width; the bar: the tool's icon and name, what to do, the Width (typed: this tool's; empty — the equipment's
// cross-aisle width there), Done and ✕ (Esc too) back to the home tool.
import { useEffect, useState } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { HOME_TOOL } from '../utils/homeTool'
import { useCrossAisleTool, bandOf, cutWidthFt, defaultWidthFt, setCutWidth, cancelCut, CROSS_AISLE_TOOL } from '../utils/crossAisleCut'
import { isPickable } from '../utils/layers'
import { useView, useLiveObjects } from './live'
import { ftIn, sizeWords } from '../utils/bom'
import { Icon } from '../studio/Icon'
import { B, MONO, modePill, Sep, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { parseAisleFt } from './FillBar'

const SELECT = '#2E7D5B'

/** The band a drag lays now (null: none). */
export function liveBand(st, drag) {
  if (!drag) return null
  const gs = st.gridSize || 40
  return bandOf(st.objects, drag.from, drag.to, cutWidthFt(st.objects, drag.from), gs, (o) => !isPickable(st.layers, o))
}

export function CrossAisleBandPreview() {
  const drag = useCrossAisleTool(s => s.drag)
  const objects = useLiveObjects(), layers = useCanvasStore(s => s.layers), gridSize = useCanvasStore(s => s.gridSize)
  const st = { objects, layers, gridSize }
  const zoom = useView().zoom
  const b = liveBand(st, drag)
  if (!b) return null
  const gs = st.gridSize || 40
  const r = b.vert ? { x: b.c0, y: b.s0, w: b.c1 - b.c0, h: b.s1 - b.s0 } : { x: b.s0, y: b.c0, w: b.s1 - b.s0, h: b.c1 - b.c0 }
  const fs = 12 / zoom, pad = 4 / zoom
  const label = sizeWords(ftIn(((b.s1 - b.s0) / gs) * 12))
  const lw = label.length * fs * 0.6 + pad * 2, lh = fs + pad * 2
  return (
    <Group name="cross-aisle-band" listening={false}>
      <Rect name="cross-aisle-band-rect" x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(46,125,91,0.16)" stroke={SELECT} strokeWidth={1.5} dash={[6, 4]}
        strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      <Group x={r.x + r.w / 2 - lw / 2} y={r.y + r.h / 2 - lh / 2} listening={false}>
        <Rect width={lw} height={lh} fill="#1F2321" cornerRadius={3 / zoom} listening={false} />
        <Text name="cross-aisle-band-text" text={label} width={lw} height={lh} align="center" verticalAlign="middle" fontSize={fs}
          fontFamily="JetBrains Mono, monospace" fill="#F2F4F1" listening={false} />
      </Group>
    </Group>
  )
}

const valueBox = { height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }
const word = { color: B.muted, fontSize: 12 }

/* the Width: the equipment's cross-aisle width where the pointer is, until a length is typed (this tool's, until it ends) */
function WidthField() {
  const typed = useCrossAisleTool(s => s.widthFt), at = useCrossAisleTool(s => s.drag?.from || s.at)
  const objects = useLiveObjects()
  const eqFt = defaultWidthFt(objects, at)
  const shown = String(+((typed ?? eqFt)).toFixed(2))
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    const ft = text.trim() ? parseAisleFt(text) : null
    if (text.trim() && ft == null) { setText(shown); return }
    setCutWidth(ft != null && Math.abs(ft - eqFt) > 1e-6 ? ft : null)
  }
  return (
    <input aria-label="Cross aisle width (ft)" className="st-field" title={typed ? `This tool's width — the equipment's is ${+eqFt.toFixed(2)} ft` : "The equipment's cross-aisle width (its section's, else the project forklift's) — type another"}
      value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ ...valueBox, width: 52, color: typed ? B.accent : B.strong }} />
  )
}

export function CrossAisleBar() {
  const tool = useCanvasStore(s => s.activeTool)
  // the typed width goes with the tool
  useEffect(() => { if (tool !== CROSS_AISLE_TOOL) { setCutWidth(null); cancelCut() } }, [tool])
  if (tool !== CROSS_AISLE_TOOL) return null
  const close = () => { cancelCut(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  return (
    <div role="toolbar" aria-label="Cross aisle" data-mode-bar="cross-aisle" className="st-pill" style={modePill}>
      <Icon name="Aisles" active />
      <span style={{ fontWeight: 600, color: B.strong }}>Cross aisle</span>
      <span style={word}>Drag across rows where to cut</span>
      <Sep />
      <span style={word}>Width</span>
      <WidthField />
      <span style={word}>ft</span>
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Cross aisle" title="Done (Esc)" onClick={close} />
    </div>
  )
}
