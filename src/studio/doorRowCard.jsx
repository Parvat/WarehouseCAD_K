// doorRowCard.jsx — the Door row tool's card (door-row round; mockup rowcard.png; utils/doorRowTool.js): a Type switch (Man,
// Dock, Drive-in — opening on the Add door bar's type), Door width and Height (the type's until typed), Gap between, Start
// gap (from the corner, or from the last door already on the wall); How many — Fill the rest or Count; then what the wall
// under the pointer holds: Fill — the doors that fit and the length left at the end; Count — the length needed and the free
// length after the last door (or why they do not fit). (No Konva here: Properties imports it.)

import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useDoorRow, setDoorRow, setRowType, rowSpan, rowDoors, ROW_TYPES } from '../utils/doorRowTool'
import { ftIn } from '../utils/bom'
import { Head, Sec, Grid2, Field, TextInput, Seg, C, MONO } from './cardParts'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'

const NAMES = { struct_egress: 'Man', struct_loading_dock: 'Dock', struct_drive_in: 'Drive-in' }
const feet = (t) => parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"'))
const len = (px, gs) => ftIn((px / gs) * 12)

function useRowNow() {
  useDoorRow(useShallow(s => ({ hover: s.hover, drag: s.drag, w: s.widthFt, g: s.gapFt, t: s.typeId, st: s.startFt, m: s.mode, n: s.count })))
  const { objects, gs } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40 })))
  const span = rowSpan()
  return { span, gs, r: rowDoors(objects, span, gs) }
}

/** A summary row: its name, its value (mono). */
function Line({ name, value, attr, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
      <span style={{ color: C.muted }}>{name}</span>
      <span {...{ [attr]: '' }} style={{ fontFamily: MONO, color: warn ? '#E5484D' : C.strong, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function DoorRowCard() {
  const s = useDoorRow(q => q)
  const { gs, span, r } = useRowNow()
  const num = (k, extra) => (t) => { const v = feet(t); if (v != null && v > 0) setDoorRow({ [k]: v, ...extra }) }
  const gapIn = (k) => (t) => { const v = feet(t); if (v != null && v >= 0) setDoorRow({ [k]: v }) }
  const fromDoor = !!span && span.whole && Math.abs(r.base - span.w.lo) > 0.5
  return (
    <>
      <Head>
        <span style={{ color: C.strong, fontSize: 15, fontWeight: 600 }}>Door row</span>
        <span style={{ color: C.muted, fontSize: 12 }}>Click a wall to place, or drag along it.</span>
      </Head>
      <Sec aria-label="Door row type">
        <Seg aria="Row door type" options={ROW_TYPES.map(id => ({ value: id, label: NAMES[id], on: s.typeId === id, onClick: () => setRowType(id) }))} />
      </Sec>
      <Sec aria-label="Door row settings">
        <Grid2>
          <Field label="Door width"><TextInput aria="Row door width" value={len(s.widthFt * gs, gs)} onCommit={num('widthFt', { widthTyped: true })} /></Field>
          <Field label="Height"><TextInput aria="Row door height" value={len(s.heightFt * gs, gs)} onCommit={num('heightFt', { heightTyped: true })} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Gap between"><TextInput aria="Row gap between" value={len(s.gapFt * gs, gs)} onCommit={gapIn('gapFt')} /></Field>
          <Field label="Start gap" title="From the corner — or from the last door already on that wall"><TextInput aria="Row start gap" value={len(s.startFt * gs, gs)} onCommit={gapIn('startFt')} /></Field>
        </Grid2>
      </Sec>
      <Sec aria-label="How many">
        {/* (a plain heading, not a <label>: a label would name its first button after itself) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>How many</span>
          <Seg aria="Row how many" options={[
            { value: 'fill', label: 'Fill the rest', on: s.mode === 'fill', onClick: () => setDoorRow({ mode: 'fill' }) },
            { value: 'count', label: 'Count', on: s.mode === 'count', onClick: () => setDoorRow({ mode: 'count' }) },
          ]} />
        </div>
        {s.mode === 'count' && (
          <Field label="Doors"><TextInput aria="Row door count" value={String(s.count)} onCommit={(t) => { const v = Math.floor(Number(t)); if (v >= 1 && v <= 500) setDoorRow({ count: v }) }} /></Field>
        )}
      </Sec>
      <Sec aria-label="Door row result">
        <Line name="Start" value={span ? (fromDoor ? 'after the last door' : 'from the corner') : '—'} attr="data-row-from" />
        {s.mode === 'fill' ? (
          <>
            <Line name="Doors that fit" value={span ? `${r.n} door${r.n === 1 ? '' : 's'}` : '—'} attr="data-row-count" />
            <Line name={r.stopDoor ? 'Left before the next door' : 'Left at the end'} value={span ? len(r.leftover, gs) : '—'} attr="data-row-leftover" />
          </>
        ) : (
          <>
            <Line name="Length needed" value={span ? len(r.need, gs) : len(Math.max(0, s.count * s.widthFt + Math.max(0, s.count - 1) * s.gapFt) * gs, gs)} attr="data-row-need" />
            <Line name="Free after the last door" value={span ? (r.fits ? len(r.free, gs) : '—') : '—'} attr="data-row-free" />
            {span && !r.fits && r.why && <div data-row-refuse style={{ color: '#E5484D', fontSize: 12 }}>{r.why}</div>}
          </>
        )}
      </Sec>
    </>
  )
}
