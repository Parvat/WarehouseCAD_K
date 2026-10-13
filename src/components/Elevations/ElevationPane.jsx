import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, beamFace, holePitch, isBeamRack } from '../../utils/elevations'
import { elevationLayout, lengthsByType, buildingOf, ftInDash, parseFtIn } from '../../utils/elevationDrawing'
import { useElevEditor, setPane, PANE_MIN, PANE_BAR, moveBeam, addLevelAt, removeLevel, setUpright, setDimension, setField, commitType } from '../../utils/elevEditor'
import { startPainting } from '../../utils/elevPaint'

/* ── The elevation editor — docked under the canvas (Elevations v2 §B–E) ──────────────────────────────────────
   A split pane, never a floating window: the canvas above shrinks to make room (its own ResizeObserver), nothing is
   covered, and pan, zoom, select and paint keep working there. A divider to drag (the height remembered per browser),
   a collapse / expand button. Linked to the canvas: a bay or rack selected shows its type and beam length here;
   choosing a type here arms paint mode.
   On the drawing: drag a beam up or down (snapping to the type's hole pitch, its elevation live); drag it off the
   ends of the bay, or click it and press Delete, to remove its level; click an empty upright to add a level there;
   drag the top of the upright to change its height; double-click a dimension to type it exactly. Small fields:
   pallet height, clearance, beam face height, hole pitch. Every drag or typed edit is ONE undo step. */

const store = useCanvasStore
const bar = { display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: PANE_BAR, borderBottom: '0.5px solid var(--border)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text)', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }
const lab = { fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const inp = { width: 46, padding: '2px 4px', fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 2, background: 'var(--surface)', color: 'var(--text)' }
const seg = (on) => ({ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })

/** A small inch field written on Enter / blur. */
function Field({ label, value, onCommit, aria }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (Number.isFinite(v) && v !== value) onCommit(v); else setText(String(value)) }
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={lab}>{label}</span>
      <input aria-label={aria} type="number" min={0} value={text} style={inp} onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    </label>
  )
}

export function ElevationPane() {
  const { open, height, typeId, beamIn, sel } = useElevEditor()
  const objects = useCanvasStore(s => s.objects), T = useCanvasStore(s => s.elevations)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const t = T ? typeById(T, typeId) || typeById(T, T.defaultId) : null
  const lengths = useMemo(() => (T ? lengthsByType(objects, T, typeIdAt) : new Map()), [objects, T])
  const used = t ? lengths.get(t.id) || [] : []
  const entry = used.find(u => u.beamIn === beamIn) || used[0] || { beamIn: 96, depthIn: 42, pair: false, flueIn: 9, palletWIn: 40, parentId: null }
  const building = useMemo(() => buildingOf(objects, entry.parentId), [objects, entry.parentId])

  /* linked: the bay (or rack) selected on the canvas → its type and beam length */
  const selKey = useCanvasStore(s => { if (s.selectedIds.length !== 1) return ''; const o = s.objects.find(x => x.id === s.selectedIds[0]); return isBeamRack(o) ? `${o.id}|${o.activeBayIdx ?? ''}|${o.activeBaySide ?? ''}` : '' })
  useEffect(() => {
    if (!selKey) return
    const st = store.getState(), r = st.objects.find(o => o.id === st.selectedIds[0])
    if (!r || !st.elevations) return
    const bay = r.activeBayIdx ?? null, side = r.activeBaySide ?? 0
    const pickBay = bay != null ? bay : (() => { const n = new Map(); r.beams.forEach(b => n.set(b, (n.get(b) || 0) + 1)); const len = [...n].sort((a, b) => b[1] - a[1])[0][0]; return r.beams.indexOf(len) })()
    setPane({ typeId: typeIdAt(r, pickBay, side, st.elevations), beamIn: r.beams[pickBay], sel: null })
  }, [selKey, selectedIds])

  /* the divider: drag to resize (rAF-coalesced), remembered per browser */
  const [drag, setDrag] = useState(false)
  const startResize = (e) => {
    e.preventDefault()
    const y0 = e.clientY, h0 = height, max = () => Math.max(PANE_MIN, window.innerHeight * 0.7)
    let raf = 0, h = h0
    setDrag(true)
    const move = (ev) => { h = Math.max(PANE_MIN, Math.min(max(), h0 - (ev.clientY - y0))); if (!raf) raf = requestAnimationFrame(() => { raf = 0; useElevEditor.setState({ height: h }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (raf) cancelAnimationFrame(raf); setPane({ height: h }); setDrag(false) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const title = t ? `${t.name} · ${ftInDash(entry.beamIn)} bay` : 'No elevation types'
  if (!open) {
    return (
      <div aria-label="Elevation editor" data-pane="collapsed" style={{ ...bar, borderTop: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }} onClick={() => setPane({ open: true })}>
        <span style={lab}>Elevation editor</span>
        {t && <><span style={{ width: 11, height: 11, borderRadius: 3, background: t.color, border: '1px solid rgba(0,0,0,0.25)' }} /><span>{title}</span></>}
        <button type="button" aria-label="Expand elevation editor" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex' }}><ChevronUp size={15} /></button>
      </div>
    )
  }
  return (
    <div aria-label="Elevation editor" data-pane="open" style={{ height, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderTop: '1px solid var(--border)', position: 'relative', minHeight: PANE_MIN }}>
      {/* the divider: a thin line you can see inside a strip you can hit */}
      <div role="separator" aria-orientation="horizontal" aria-label="Resize elevation editor" onPointerDown={startResize}
        style={{ position: 'absolute', left: 0, right: 0, top: -6, height: 12, cursor: 'row-resize', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: drag ? 'var(--text2)' : 'var(--border)' }} />
      </div>
      <div style={bar}>
        <span style={lab}>Elevation</span>
        {T && (
          <select aria-label="Elevation type" value={t ? t.id : ''} title="Choosing a type arms paint mode"
            onChange={e => { setPane({ typeId: e.target.value, beamIn: null, sel: null }); startPainting(store, e.target.value) }}
            style={{ fontSize: 12, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 2, background: 'var(--surface)', color: 'var(--text)' }}>
            {T.types.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        {t && <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color, border: '1px solid rgba(0,0,0,0.25)' }} />}
        {/* the beam lengths this type's bays use */}
        {t && (
          <div role="group" aria-label="Beam length" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {(used.length ? used : [entry]).map(u => <button key={u.beamIn} type="button" aria-pressed={u.beamIn === entry.beamIn} style={seg(u.beamIn === entry.beamIn)} title={`${u.bays} bay${u.bays === 1 ? '' : 's'}`} onClick={() => setPane({ beamIn: u.beamIn })}>{ftInDash(u.beamIn)}</button>)}
          </div>
        )}
        {t && <>
          <Field label="Pallet" aria="Pallet height" value={t.levels[0]?.palletHeightIn ?? 48} onCommit={v => commitType(store, t.id, x => setField(x, 'palletHeightIn', v))} />
          <Field label="Clear" aria="Clearance" value={t.clearanceIn ?? 6} onCommit={v => commitType(store, t.id, x => setField(x, 'clearanceIn', v))} />
          <Field label="Face" aria="Beam face height" value={beamFace(t)} onCommit={v => commitType(store, t.id, x => setField(x, 'beamFaceIn', v))} />
          <Field label="Pitch" aria="Hole pitch" value={holePitch(t)} onCommit={v => commitType(store, t.id, x => setField(x, 'holePitchIn', v))} />
        </>}
        <button type="button" aria-label="Collapse elevation editor" onClick={() => setPane({ open: false })} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex' }}><ChevronDown size={15} /></button>
      </div>
      {t ? <Drawing t={t} entry={entry} building={building} sel={sel} /> : <div style={{ padding: 12, fontSize: 12, color: 'var(--text3)' }}>No elevation types yet.</div>}
    </div>
  )
}

/** The drawing, interactive. */
function Drawing({ t, entry, building, sel }) {
  const host = useRef(null)
  const [box, setBox] = useState({ w: 600, h: 240 })
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [draft, setDraft] = useState(null)          // { type, active, removing } while dragging
  const [editing, setEditing] = useState(null)      // a dimension being typed: { id, k, x, y, value }
  const shown = draft ? draft.type : t
  const fontPx = Math.max(9, Math.min(12, box.h / 26))
  const d = useMemo(() => elevationLayout(shown, entry.beamIn, box, { palletWIn: entry.palletWIn, depthIn: entry.depthIn, pair: entry.pair, flueIn: entry.flueIn, building, fontPx, active: draft?.active || (sel != null ? 'beam:' + sel : null), removing: draft?.removing ?? null }), [shown, entry, box, building, fontPx, draft, sel])

  const at = (ev) => { const r = host.current.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top } }
  const zAt = (p) => (d.floor - p.y) / d.scale

  /* a drag on a beam or on the top of the upright: the type follows live; the release writes it once */
  const startDrag = (ev, role) => {
    ev.preventDefault(); ev.stopPropagation()
    host.current.focus()
    const p0 = at(ev)
    let moved = false, last = null
    const move = (e) => {
      const p = at(e)
      if (Math.hypot(p.x - p0.x, p.y - p0.y) > 3) moved = true
      if (!moved) return
      if (role.kind === 'beam') {
        const off = p.x < d.Xf(0) - fontPx * 3 || p.x > d.Xf(d.frontW) + fontPx * 3
        last = off ? { type: t, active: null, removing: role.k } : { type: moveBeam(t, role.k, zAt(p)), active: 'dim:elev', removing: null, k: role.k }
        if (!off) last.active = 'beam:' + role.k
      } else last = { type: setUpright(t, zAt(p)), active: 'top:' }
      setDraft(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDraft(null)
      if (!moved) { if (role.kind === 'beam') setPane({ sel: role.k }); return }
      if (!last) return
      if (last.removing != null) { commitType(store, t.id, x => removeLevel(x, last.removing)); setPane({ sel: null }) }
      else commitType(store, t.id, () => last.type)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const onUprightClick = (ev) => {
    const z = zAt(at(ev))
    const next = addLevelAt(t, z)
    if (next) commitType(store, t.id, () => next)
  }
  const onKey = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null) { e.preventDefault(); e.stopPropagation(); commitType(store, t.id, x => removeLevel(x, sel)); setPane({ sel: null }) }
    if (e.key === 'Escape' && sel != null) { e.stopPropagation(); setPane({ sel: null }) }
  }
  const startTyping = (ev, role) => {
    ev.stopPropagation()
    const p = at(ev)
    setEditing({ id: role.id, k: role.k, x: p.x, y: p.y, text: ftInDash(role.value) })
  }
  const commitTyping = () => {
    const e = editing; setEditing(null)
    if (!e) return
    const v = parseFtIn(e.text)
    if (Number.isFinite(v)) commitType(store, t.id, x => setDimension(x, e.id, e.k, v))
  }

  const render = (i, n) => {
    const r = i.role
    const handlers = {}
    if (r?.kind === 'beam' || r?.kind === 'top') handlers.onPointerDown = (e) => startDrag(e, r)
    if (r?.kind === 'upright') handlers.onClick = onUprightClick
    if (r?.kind === 'dim') { handlers.onDoubleClick = (e) => startTyping(e, r); handlers.style = { cursor: 'text' } }
    const role = r ? (r.kind + ':' + (r.id ?? '') + ':' + (r.k ?? '')) : undefined
    if (i.t === 'rect') return <rect key={n} data-role={role} x={i.x} y={i.y} width={Math.max(0, i.w)} height={Math.max(0, i.h)} fill={i.fill || 'none'} stroke={i.stroke} strokeWidth={i.sw} opacity={i.opacity} style={{ cursor: i.cursor || (r?.kind === 'upright' ? 'copy' : undefined) }} {...handlers} />
    if (i.t === 'line') return <line key={n} x1={i.x1} y1={i.y1} x2={i.x2} y2={i.y2} stroke={i.stroke} strokeWidth={i.sw} strokeDasharray={i.dash} pointerEvents="none" />
    if (i.t === 'poly') return <polyline key={n} points={i.points.map(q => q.join(',')).join(' ')} fill="none" stroke={i.stroke} strokeWidth={i.sw} pointerEvents="none" />
    if (i.t === 'text') return <text key={n} data-role={role} x={i.x} y={i.y} fontSize={i.size} fontFamily="Arial, sans-serif" textAnchor={i.anchor} fill={i.fill} fontWeight={i.weight} transform={i.rot ? `rotate(${i.rot} ${i.x} ${i.y})` : undefined} style={{ userSelect: 'none', ...(handlers.style || {}) }} onDoubleClick={handlers.onDoubleClick}>{i.s}</text>
    return null
  }
  return (
    <div ref={host} tabIndex={0} onKeyDown={onKey} aria-label="Elevation drawing" style={{ flex: 1, minHeight: 0, position: 'relative', outline: 'none', overflow: 'hidden', background: '#fff' }}>
      <svg width={box.w} height={box.h} style={{ display: 'block' }} onPointerDown={() => host.current.focus()}>
        {d.items.map(render)}
      </svg>
      {editing && (
        <input autoFocus aria-label="Dimension" value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}
          onBlur={commitTyping} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitTyping(); if (e.key === 'Escape') setEditing(null) }}
          style={{ position: 'absolute', left: Math.max(4, editing.x - 34), top: Math.max(4, editing.y - 11), width: 68, fontSize: 12, fontFamily: 'var(--font-mono)', padding: '2px 4px', border: '1px solid var(--accent, #2F7BD8)', borderRadius: 3, zIndex: 3 }} />
      )}
    </div>
  )
}
