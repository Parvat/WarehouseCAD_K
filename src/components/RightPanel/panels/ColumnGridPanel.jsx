import { useEffect, useState } from 'react'
import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { C, MONO, fieldBox, Grid2, Note, SecLabel } from '../../../studio/cardParts'
import { gridBuilding, gridParams, gridUpdate, gridResult } from '../../../utils/columnGrid'
import { expandColumnGrid } from '../../../generate/columnCheck'
import { ftIn, sizeWords } from '../../../utils/bom'

// ── Column Grid card (col-grid round; STUDIO.md §7a Columns) ──────────────────────────────────────────────────────
// X spacing, Y spacing, X offset, Y offset (the building's wall to the first column's centre — 0: the first gridline on
// the wall), the column's Width and Depth; then the Result: columns, the gridlines A–J · 1–5, the last bay to the far
// wall each way. Typing redraws the grid live; leaving a field (Enter) is one undo step; Esc puts it back. A spacing
// that leaves no column inside the building: a warning, nothing changed for it.

/** Feet from typed text — 25, 25', 25 ft, 24' 9", 24′-9″, 9" — 0 allowed (an offset of 0: on the wall); null when not
 *  a length. */
const feetOf = (t) => {
  const s = String(t ?? '').trim().replace(/′/g, "'").replace(/″/g, '"').replace(/\s*ft\b\.?/gi, "'").replace(/\s*in\b\.?/gi, '"')
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/)
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)
  m = s.match(/^(\d+(?:\.\d+)?)\s*"$/)
  if (m) return Number(m[1]) / 12
  m = s.match(/^(\d+(?:\.\d+)?)$/)
  return m ? Number(m[1]) : null
}
const inchesOf = (t) => { const s = String(t).trim(); if (/['′"″]|ft|in/.test(s)) { const f = feetOf(s); return f == null ? null : f * 12 } const v = Number(s); return Number.isFinite(v) ? v : null }
const words = (ft) => sizeWords(ftIn(ft * 12))

/** One typed field: `show` the value as words; `parse` text → number or null; `min` the smallest it takes. */
function GridField({ aria, label, show, parse, min, onLive, onDone, onCancel }) {
  const [text, setText] = useState(show)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(show) }, [show, editing])
  const ok = (t) => { const v = parse(t); return v != null && v >= min ? v : null }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
      <input type="text" aria-label={aria} value={text} className="st-field" style={fieldBox()}
        onFocus={e => { setEditing(true); e.target.select() }}
        onChange={e => { setText(e.target.value); const v = ok(e.target.value); if (v != null) onLive(v) }}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { onCancel(); setEditing(false); setText(show); e.currentTarget.blur() } }}
        onBlur={() => { setEditing(false); onDone() }} />
    </label>
  )
}

export function ColumnGridPanel({ obj }) {
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
  const mono = { fontFamily: MONO, color: C.strong, fontSize: 12 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <Grid2>{ft('spX', 'X spacing', 'Column X spacing', 1)}{ft('spY', 'Y spacing', 'Column Y spacing', 1)}</Grid2>
      <Grid2>{ft('offX', 'X offset', 'Column X offset', 0)}{ft('offY', 'Y offset', 'Column Y offset', 0)}</Grid2>
      <Grid2>{inch('wIn', 'Width', 'Column width')}{inch('dIn', 'Depth', 'Column depth')}</Grid2>
      <div data-column-result style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
        <SecLabel>Result</SecLabel>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.muted, fontSize: 12 }}>Columns</span><span data-column-count style={mono}>{res.count}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.muted, fontSize: 12 }}>Gridlines</span><span data-column-range style={mono}>{res.range}</span></div>
        {res.lastX != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.muted, fontSize: 12 }}>Last bay to far wall</span><span data-column-last style={mono}>{words(res.lastX)} · {words(res.lastY)}</span></div>}
      </div>
      {res.none && <Note level="warning" role="alert" data-column-warning>No column inside the building at this spacing and offset — check the values.</Note>}
    </div>
  )
}
