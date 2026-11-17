// DoorRow.jsx — the Door row tool's preview and mode bar (door-row round; utils/doorRowTool.js; mockup rowcard.png): the
// doors the release would place, dashed; the run from the row's base (the corner, the last door on the wall, or the drag's
// start) to its end, with a pill — Fill: "7 doors · 15′ left"; Count: "135′ needed · 12′ free", or "doesn't fit".

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
  useDoorRow(useShallow(s => ({ hover: s.hover, drag: s.drag, w: s.widthFt, g: s.gapFt, t: s.typeId, st: s.startFt, m: s.mode, n: s.count })))
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  const span = rowSpan()
  return { span, gs, ...rowDoors(objects, span, gs) }
}

export function DoorRowPreview() {
  const { span, doors, gs, mode, n, need, leftover, free, fits, base, end, stopDoor } = useRowNow()
  const lz = labelScale(useLabelPrefs(s => s.labelSize), gs)
  if (!span) return null
  const w = span.w, lo = base ?? (span.whole ? w.lo : span.lo), hi = stopDoor ? stopDoor[0] : (mode === 'count' ? Math.min(span.whole ? w.hi : span.hi, w.hi) : end ?? (span.whole ? w.hi : span.hi))
  const label = mode === 'count'
    ? (fits ? `${len(need, gs)} needed · ${len(free, gs)} free` : `${n} door${n === 1 ? '' : 's'} don't fit`)
    : `${n} door${n === 1 ? '' : 's'} · ${len(leftover, gs)} left`
  // the span: a green line just outside the doors' depth, a dot at each end; its length and count in a pill
  const side = w.inward || 1, at = w.at + side * (doors[0] ? doors[0].height : 8 * gs) + side * 14 / lz
  const P = (q, c) => (w.axis === 'x' ? [q, c] : [c, q])
  const [mx, my] = P((lo + hi) / 2, at + side * 16 / lz)
  return (
    <Group name="door-row-preview" listening={false}>
      {doors.map((d, i) => { const f = doorFoot(d); return <Rect key={i} name="door-row-door" x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill={selectTint(0.12)} stroke={SELECT_BLUE} strokeWidth={1.5} dash={[5, 3]} strokeScaleEnabled={false} listening={false} /> })}
      <Line points={[...P(lo, at), ...P(hi, at)]} stroke={GREEN} strokeWidth={2} strokeScaleEnabled={false} listening={false} />
      {[lo, hi].map((q, i) => { const [x, y] = P(q, at); return <Rect key={i} x={x - 3 / lz} y={y - 3 / lz} width={6 / lz} height={6 / lz} cornerRadius={3 / lz} fill={GREEN} listening={false} /> })}
      <LabelOps name="door-row-count" ops={pillOps(mx, my, label, 10.5 / lz, lz, { color: '#FFFFFF', bg: mode === 'count' && !fits ? '#C0392B' : GREEN, opacity: 1, padX: 7 / lz, rx: 8 / lz })} />
    </Group>
  )
}

export function DoorRowBar() {
  const close = () => { clearDoorRow(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  return (
    <div role="toolbar" aria-label="Door row" data-mode-bar="door-row" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Door row</span>
      <Sep />
      <span data-mode-hint style={{ color: B.muted, fontSize: 12 }}>Click a wall to place · or drag along it · Esc ends</span>
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Door row" title="Done (Esc)" onClick={close} />
    </div>
  )
}

