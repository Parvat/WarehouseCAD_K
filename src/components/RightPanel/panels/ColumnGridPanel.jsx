import { useEffect, useState } from 'react'
import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { C, fieldBox, Grid2, Note, Sec, Caption, LockedFields, IconBtn } from '../../../studio/cardParts'
import { toggleLock } from '../../../utils/layers'
import { gridBuilding, gridParams, gridUpdate, gridResult } from '../../../utils/columnGrid'
import { expandColumnGrid } from '../../../generate/columnCheck'
import { ftIn } from '../../../utils/bom'

// ── Column Grid card (col-grid round; STUDIO.md §7a Columns) ──────────────────────────────────────────────────────
// As the colgrid mockup draws it: the head (Column grid, what it is), then SPACING (X, Y), OFFSET FROM WALL (TO FIRST
// COLUMN CENTRE) (X, Y — the building's wall to the first column's centre; 0: the first gridline on the wall), COLUMN
// (Width, Depth), each its own block, values in feet-inches (50′, 12″); then RESULT: Columns 4 × 3 = 12, Gridlines
// A–D · 1–3, Last bay (to far wall) X 60′ · Y 50′. Typing redraws the grid live; leaving a field (Enter) is one undo
// step; Esc puts it back. A spacing that leaves no column inside the building: a warning, nothing changed for it.

/** Feet from typed text — 25, 25', 25 ft, 24' 9", 24′-9″, 9" — 0 allowed (an offset of 0: on the wall); null when not
 *  a length. */
export const feetOf = (t) => {
  const s = String(t ?? '').trim().replace(/′/g, "'").replace(/″/g, '"').replace(/\s*ft\b\.?/gi, "'").replace(/\s*in\b\.?/gi, '"')
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/)
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)
  m = s.match(/^(\d+(?:\.\d+)?)\s*"$/)
  if (m) return Number(m[1]) / 12
  m = s.match(/^(\d+(?:\.\d+)?)$/)
  return m ? Number(m[1]) : null
}
export const inchesOf = (t) => { const s = String(t).trim(); if (/['′"″]|ft|in/.test(s)) { const f = feetOf(s); return f == null ? null : f * 12 } const v = Number(s); return Number.isFinite(v) ? v : null }
const words = (ft) => ftIn(ft * 12)

/** One typed field: `show` the value; `parse` text → number or null; `min` the smallest it takes. */
function GridField({ aria, label, show, parse, min, onLive, onDone, onCancel }) {
  const [text, setText] = useState(show)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(show) }, [show, editing])
  const ok = (t) => { const v = parse(t); return v != null && v >= min ? v : null }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
      <input type="text" aria-label={aria} value={text} className="st-field" style={fieldBox(true)}
        onFocus={e => { setEditing(true); e.target.select() }}
        onChange={e => { setText(e.target.value); const v = ok(e.target.value); if (v != null) onLive(v) }}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { onCancel(); setEditing(false); setText(show); e.currentTarget.blur() } }}
        onBlur={() => { setEditing(false); onDone() }} />
    </label>
  )
}

/** The card's head (colgrid mockup): the title with the Columns layer's padlock at its right (icon only — col-card round),
 *  and what the grid is. */
export function ColumnGridHead() {
  const colsLocked = useCanvasStore(s => !!s.layers.find(l => l.id === 'columns')?.locked)
  const tip = colsLocked ? 'Columns layer locked — Unlock (Ctrl+L)' : 'Lock the Columns layer (Ctrl+L)'
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span data-column-title style={{ flex: 1, color: C.strong, fontSize: 15, fontWeight: 600 }}>Column grid</span>
        <IconBtn name="Lock" label={colsLocked ? 'Unlock' : 'Lock'} title={tip} active={colsLocked} onClick={() => toggleLock(useCanvasStore)} />
      </div>
      <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>Fixed structure. Resizing the building adds or removes columns, never re-spaces them.</span>
    </>
  )
}

/** The card's blocks after the head: Spacing, Offset, Column, Result. */
export function ColumnGridPanel({ obj, locked = false }) {
  const { objects, gridSize: gsRaw } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize })))
  const gs = gsRaw || 40
  const fp = gridBuilding(objects, obj)
  const p = gridParams(obj, fp, gs)
  const res = gridResult(obj, objects, gs, expandColumnGrid)
  // live: the store written as typed (no undo step); the field left: one undo step, or none when nothing changed
  const [start, setStart] = useState(null)
  const live = (k) => (v) => {
    const st = useCanvasStore.getState(), cur = st.objects.find(o => o.id === obj.id)
    if (!cur) return
    if (!start) setStart(cur)
    st.updateObject(obj.id, gridUpdate(cur, gridBuilding(st.objects, cur), { ...gridParams(cur, gridBuilding(st.objects, cur), gs), [k]: v }, gs))
  }
  const done = () => {
    const st = useCanvasStore.getState(), cur = st.objects.find(o => o.id === obj.id)
    if (start && cur && JSON.stringify(start) !== JSON.stringify(cur)) st.commitObjectUpdate(obj.id, {})
    setStart(null)
  }
  const cancel = () => { if (start) useCanvasStore.getState().updateObject(obj.id, start); setStart(null) }
  const ft = (k, label, aria, min) => <GridField key={k} aria={aria} label={label} show={words(p[k])} parse={feetOf} min={min} onLive={live(k)} onDone={done} onCancel={cancel} />
  const inch = (k, label, aria) => <GridField key={k} aria={aria} label={label} show={`${Math.round(p[k] * 100) / 100}″`} parse={inchesOf} min={1} onLive={live(k)} onDone={done} onCancel={cancel} />
  const pair = (a, b) => <LockedFields locked={locked}><Grid2>{a}{b}</Grid2></LockedFields>
  const row = (label, value, data) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: C.icon, fontSize: 12 }}>{label}</span>
      <span {...{ [data]: '' }} style={{ color: C.strong, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right', marginLeft: 'auto' }}>{value}</span>
    </div>
  )
  return (
    <>
      <Sec label={<Caption>Spacing</Caption>}>{pair(ft('spX', 'X spacing', 'Column X spacing', 1), ft('spY', 'Y spacing', 'Column Y spacing', 1))}</Sec>
      <Sec label={<Caption>Offset from wall (to first column centre)</Caption>}>{pair(ft('offX', 'X offset', 'Column X offset', 0), ft('offY', 'Y offset', 'Column Y offset', 0))}</Sec>
      <Sec label={<Caption>Column</Caption>}>{pair(inch('wIn', 'Width', 'Column width'), inch('dIn', 'Depth', 'Column depth'))}</Sec>
      <Sec data-column-result gap={6} label={<Caption>Result</Caption>}>
        {row('Columns', res.nx * res.ny === res.count ? `${res.nx} × ${res.ny} = ${res.count}` : String(res.count), 'data-column-count')}
        {row('Gridlines', res.range, 'data-column-range')}
        {/* the last bay each way, its own row (col-card round: one row overflowed) */}
        {res.lastX != null && row('Last bay X', words(res.lastX), 'data-column-last-x')}
        {res.lastY != null && row('Last bay Y', words(res.lastY), 'data-column-last-y')}
        {res.none && <Note level="warning" role="alert" data-column-warning>No column inside the building at this spacing and offset — check the values.</Note>}
      </Sec>
    </>
  )
}
