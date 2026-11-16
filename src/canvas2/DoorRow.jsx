// DoorRow.jsx — the Dock door row tool's preview, mode bar and card (doors-edit round; utils/doorRowTool.js; mockup
// doors2.png §3): the doors the release would place, dashed; the span under them with its length and count in a pill
// ("135′ · 7 doors"); the card — Door width, Gap between, Type, Height, then Fits in / Leftover.

import { Group, Rect, Line } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects } from './live'
import { useDoorRow, rowSpan, rowDoors, clearDoorRow } from '../utils/doorRowTool'
import { doorFoot } from '../utils/doorWall'
import { LabelOps } from './LabelOps'
import { pillOps } from '../render/labelOps'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { ftIn } from '../utils/bom'
import { HOME_TOOL } from '../utils/homeTool'
import { B, modePill, Sep, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { SELECT_BLUE, selectTint } from '../theme/tokens'

const GREEN = '#2E7D5B'
const len = (px, gs) => ftIn((px / gs) * 12)

/** The row the gesture would place now: { span, doors, lay } (live). */
function useRowNow() {
  useDoorRow(useShallow(s => ({ hover: s.hover, drag: s.drag, w: s.widthFt, g: s.gapFt, t: s.typeId })))
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  const span = rowSpan()
  return { span, gs, ...rowDoors(objects, span, gs) }
}

export function DoorRowPreview() {
  const { span, doors, lay, gs } = useRowNow()
  const lz = labelScale(useLabelPrefs(s => s.labelSize), gs)
  if (!span) return null
  const w = span.w, lo = span.whole ? w.lo : span.lo, hi = span.whole ? w.hi : span.hi
  // the span: a green line just outside the doors' depth, a dot at each end; its length and count in a pill
  const side = w.inward || 1, at = w.at + side * (doors[0] ? doors[0].height : 8 * gs) + side * 14 / lz
  const P = (q, c) => (w.axis === 'x' ? [q, c] : [c, q])
  const [mx, my] = P((lo + hi) / 2, at + side * 16 / lz)
  return (
    <Group name="door-row-preview" listening={false}>
      {doors.map((d, i) => { const f = doorFoot(d); return <Rect key={i} name="door-row-door" x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill={selectTint(0.12)} stroke={SELECT_BLUE} strokeWidth={1.5} dash={[5, 3]} strokeScaleEnabled={false} listening={false} /> })}
      <Line points={[...P(lo, at), ...P(hi, at)]} stroke={GREEN} strokeWidth={2} strokeScaleEnabled={false} listening={false} />
      {[lo, hi].map((q, i) => { const [x, y] = P(q, at); return <Rect key={i} x={x - 3 / lz} y={y - 3 / lz} width={6 / lz} height={6 / lz} cornerRadius={3 / lz} fill={GREEN} listening={false} /> })}
      <LabelOps name="door-row-count" ops={pillOps(mx, my, `${len(lay.length, gs)} · ${doors.length} door${doors.length === 1 ? '' : 's'}`, 10.5 / lz, lz, { color: '#FFFFFF', bg: GREEN, opacity: 1, padX: 7 / lz, rx: 8 / lz })} />
    </Group>
  )
}

export function DoorRowBar() {
  const close = () => { clearDoorRow(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  return (
    <div role="toolbar" aria-label="Dock door row" data-mode-bar="door-row" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Dock door row</span>
      <Sep />
      <span data-mode-hint style={{ color: B.muted, fontSize: 12 }}>Drag along a wall · or click a wall to fill it · Esc ends</span>
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Dock door row" title="Done (Esc)" onClick={close} />
    </div>
  )
}

