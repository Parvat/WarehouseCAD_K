// doorRowCard.jsx — the Dock door row tool's card (doors-edit round; mockup doors2.png §3; utils/doorRowTool.js): Door
// width, Gap between, Type, Height typed; then what the span under the pointer holds — Fits in, Leftover. (No Konva here:
// Properties imports it.)

import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useDoorRow, setDoorRow, rowSpan, rowDoors, ROW_TYPES } from '../utils/doorRowTool'
import { doorTypes } from '../utils/doorTool'
import { ftIn } from '../utils/bom'
import { Head, Sec, Grid2, Field, TextInput, SelectField, C, MONO } from './cardParts'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'

const NAMES = { struct_loading_dock: 'Dock', struct_drive_in: 'Drive-in' }
const feet = (t) => parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"'))
const len = (px, gs) => ftIn((px / gs) * 12)

function useRowNow() {
  useDoorRow(useShallow(s => ({ hover: s.hover, drag: s.drag, w: s.widthFt, g: s.gapFt, t: s.typeId })))
  const { objects, gs } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40 })))
  const span = rowSpan()
  return { span, gs, ...rowDoors(objects, span, gs) }
}

/** The card (the mockup's "Dock door row"): its four values typed, then what the span holds. */
export function DoorRowCard() {
  const s = useDoorRow(q => q)
  const { doors, lay, gs, span } = useRowNow()
  const num = (k) => (t) => { const v = feet(t); if (v != null && v > 0) setDoorRow({ [k]: v }) }
  const types = doorTypes().filter(t => ROW_TYPES.includes(t.id))
  return (
    <>
      <Head>
        <span style={{ color: C.strong, fontSize: 15, fontWeight: 600 }}>Dock door row</span>
        <span style={{ color: C.muted, fontSize: 12 }}>Drag along a wall, or click a wall to fill it.</span>
      </Head>
      <Sec aria-label="Dock door row settings">
        <Grid2>
          <Field label="Door width"><TextInput aria="Row door width" value={len(s.widthFt * gs, gs)} onCommit={num('widthFt')} /></Field>
          <Field label="Gap between"><TextInput aria="Row gap between" value={len(s.gapFt * gs, gs)} onCommit={num('gapFt')} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Type">
            <SelectField words chevron aria="Row door type" value={s.typeId} onChange={e => setDoorRow({ typeId: e.target.value })}>
              {types.map(t => <option key={t.id} value={t.id}>{NAMES[t.id] || t.short}</option>)}
            </SelectField>
          </Field>
          <Field label="Height"><TextInput aria="Row door height" value={len(s.heightFt * gs, gs)} onCommit={num('heightFt')} /></Field>
        </Grid2>
      </Sec>
      <Sec aria-label="Dock door row result">
        {[['Fits in', span ? len(lay.length, gs) : '—', `${doors.length} door${doors.length === 1 ? '' : 's'}`, 'data-row-count'], ['Leftover', '', span ? len(Math.max(0, lay.leftover), gs) : '—', 'data-row-leftover']].map(([a, b, v, attr]) => (
          <div key={a} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: C.muted }}>{a}{b ? ` ${b}` : ''}</span>
            <span {...{ [attr]: '' }} style={{ fontFamily: MONO, color: C.strong, fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </Sec>
    </>
  )
}
