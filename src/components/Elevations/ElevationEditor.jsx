import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, beamFace, holePitch, isBeamRack, sprinklerClearance } from '../../utils/elevations'
import { elevationLayout, lengthsByType, buildingOf, ftInDash, parseFtIn } from '../../utils/elevationDrawing'
import { useElevEditor, setPane, moveBeam, addLevelAt, removeLevel, setUpright, setDimension, setField, commitType, commitTable, paneFontPx } from '../../utils/elevEditor'
import { rackDepthUpdate } from '../../utils/rackDepth'

/* ── The elevation editor — in the right panel's Elevations tab, under the types list (Elevations v2 §B–E) ──────────
   The type picked in the list, at one of the beam lengths its bays use; Simple / Detailed; the drawing; then the
   settings in the Properties field style (pallet height, clearance, beam face, hole pitch, depth, sprinkler clearance).
   Linked to the canvas: a bay or rack selected shows its type and beam length here.
   On the drawing: drag a beam up or down (snapping to the type's hole pitch, its elevation live); drag it off the
   ends of the bay, or click it and press Delete, to remove its level; click an empty upright to add a level there;
   drag the top of the upright to change its height; double-click a dimension to type it exactly. Every drag or typed
   edit is ONE undo step. Frames and beams take the theme's --elev-frame, the ground --elev-ink, the dimensions
   --elev-dim, the clearances --elev-clr, so a dark panel keeps them readable (the PDF prints the reference's own colours). */

const store = useCanvasStore
const seg = (on) => ({ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })
const segGroup = { display: 'flex', gap: 2, padding: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }
/* the Properties panel's field look (PropertiesPanel.jsx S.label / S.input), the label wide enough for "Sprinkler clr" on one line */
const F = {
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 86, flexShrink: 0, whiteSpace: 'nowrap' },
  input: { flex: 1, minWidth: 0, borderRadius: 6, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none', transition: 'border-color 0.15s' },
  unit: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 14 },
}

/** One setting, Properties style: written on Enter / blur. */
function Field({ label, value, onCommit, aria, unit = 'in', title }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (Number.isFinite(v) && v >= 0 && v !== value) onCommit(v); else setText(String(value)) }
  return (
    <label style={F.row} title={title}>
      <span style={F.label}>{label}</span>
      <input aria-label={aria} type="number" min={0} value={text} style={F.input} onChange={e => setText(e.target.value)}
        onFocus={e => { e.target.style.borderColor = 'var(--accent)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; done() }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      <span style={F.unit}>{unit}</span>
    </label>
  )
}

export function ElevationEditor() {
  const { typeId, beamIn, sel, detail } = useElevEditor()
  const objects = useCanvasStore(s => s.objects), T = useCanvasStore(s => s.elevations)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const t = T ? typeById(T, typeId) || typeById(T, T.defaultId) : null
  const lengths = useMemo(() => (T ? lengthsByType(objects, T, typeIdAt) : new Map()), [objects, T])
  const used = t ? lengths.get(t.id) || [] : []
  const entry = used.find(u => u.beamIn === beamIn) || used[0] || { beamIn: 96, depthIn: 42, pair: false, flueIn: 9, palletWIn: 40, parentId: null }
  const building = useMemo(() => buildingOf(objects, entry.parentId), [objects, entry.parentId])
  /* Depth: the selected rack's own frame depth, editable (utils/rackDepth.js — one undo step, the aisles follow, the Row
     group replays it); with no rack selected, read-only: the depth the drawing shows */
  const selRack = selectedIds.length === 1 ? objects.find(o => o.id === selectedIds[0] && isBeamRack(o)) : null

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

  if (!t) return null
  return (
    <div aria-label="Elevation editor" data-pane="open" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* the beam lengths this type's bays use */}
        <div role="group" aria-label="Beam length" style={segGroup}>
          {(used.length ? used : [entry]).map(u => <button key={u.beamIn} type="button" aria-pressed={u.beamIn === entry.beamIn} style={seg(u.beamIn === entry.beamIn)} title={`${u.bays} bay${u.bays === 1 ? '' : 's'}`} onClick={() => setPane({ beamIn: u.beamIn })}>{ftInDash(u.beamIn)}</button>)}
        </div>
        {/* Simple (the reference sheet) or Detailed (beam elevations, each level's pallet and gap, the sprinkler line) — the PDF prints it */}
        <div role="group" aria-label="Drawing detail" style={{ ...segGroup, marginLeft: 'auto' }}>
          {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={detail === k} style={seg(detail === k)} onClick={() => setPane({ detail: k })}>{label}</button>)}
        </div>
      </div>
      <Drawing t={t} entry={entry} building={building} sel={sel} sprClr={sprinklerClearance(T)} detail={detail} />
      {sel != null && <button type="button" aria-label="Remove level" title="Remove the selected beam's level (Delete)" onClick={() => { commitType(store, t.id, x => removeLevel(x, sel)); setPane({ sel: null }) }}
        style={{ alignSelf: 'flex-start', padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid var(--red-bdr, #e8b4ae)', background: 'var(--red-dim, #fdecea)', color: 'var(--red, #c0392b)' }}>Remove level</button>}
      <div role="group" aria-label="Elevation settings" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
        <Field label="Pallet" aria="Pallet height" value={t.levels[0]?.palletHeightIn ?? 48} onCommit={v => commitType(store, t.id, x => setField(x, 'palletHeightIn', v))} />
        <Field label="Clearance" aria="Clearance" value={t.clearanceIn ?? 6} onCommit={v => commitType(store, t.id, x => setField(x, 'clearanceIn', v))} />
        <Field label="Beam face" aria="Beam face height" value={beamFace(t)} onCommit={v => commitType(store, t.id, x => setField(x, 'beamFaceIn', v))} />
        <Field label="Pitch" aria="Hole pitch" value={holePitch(t)} onCommit={v => commitType(store, t.id, x => setField(x, 'holePitchIn', v))} />
        {selRack
          ? <Field label="Depth" aria="Rack depth" value={selRack.depthIn ?? 42} onCommit={v => { const u = rackDepthUpdate(selRack, v, store.getState().gridSize || 40); if (u) store.getState().commitObjectUpdate(selRack.id, u) }} />
          : <div style={F.row} title="select a rack to change its depth">
              <span style={F.label}>Depth</span>
              <span aria-label="Rack depth (read-only)" style={{ ...F.input, background: 'transparent', borderColor: 'transparent', color: 'var(--text2)' }}>{entry.depthIn}" <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-ui)' }}>· select a rack to change its depth</span></span>
            </div>}
        {/* the clearance the top load keeps under the sprinkler heads (Check layout, the drawing) — the layout's setting */}
        <Field label="Sprinkler clr" aria="Sprinkler clearance" value={sprinklerClearance(T)} title="The top of the top load must stay at least this far under the building's sprinkler heads"
          onCommit={v => commitTable(store, tb => ({ ...tb, sprinklerClearanceIn: v }))} />
      </div>
    </div>
  )
}

/** The drawing, interactive. */
function Drawing({ t, entry, building, sel, sprClr, detail }) {
  const host = useRef(null)
  const [box, setBox] = useState({ w: 454, h: 431 })
  const stacked = box.w < 400
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    // the height follows the width: side by side when there is room, the side view under the front view when narrow
    const read = () => { const w = el.clientWidth; setBox(w < 400 ? { w, h: Math.round(Math.min(900, Math.max(480, w * 1.7))) } : { w, h: Math.round(Math.min(640, Math.max(340, w * 0.95))) }) }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [draft, setDraft] = useState(null)          // { type, active, removing } while dragging
  const [editing, setEditing] = useState(null)      // a dimension being typed: { id, k, x, y, value }
  const shown = draft ? draft.type : t
  // centred and fitted to the pane (elevationLayout centres it in the box), labels in proportion with a readable minimum
  const fontPx = paneFontPx(box)
  const d = useMemo(() => elevationLayout(shown, entry.beamIn, box, { palletWIn: entry.palletWIn, depthIn: entry.depthIn, pair: entry.pair, flueIn: entry.flueIn, building, fontPx, stacked, sprinklerClearanceIn: sprClr, detail, bg: 'var(--surface)', frame: 'var(--elev-frame)', ink: 'var(--elev-ink)', blue: 'var(--elev-dim)', red: 'var(--elev-clr)', active: draft?.active || (sel != null ? 'beam:' + sel : null), removing: draft?.removing ?? null }), [shown, entry, box, building, fontPx, draft, sel, stacked, sprClr, detail])

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
        const off = p.x < d.Xf(0) - fontPx * 1.5 || p.x > d.Xf(d.frontW) + fontPx * 1.5      // dragged past the end of the bay
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
  /* a picked beam: Delete / Backspace removes its level even when the focus has left the pane for the page itself
     (taken before the canvas's own Delete, which would delete the selected racks) */
  useEffect(() => {
    if (sel == null) return
    const onWin = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const a = document.activeElement
      if (a && a !== document.body && !a.closest?.('[data-pane="open"]')) return
      if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return            // typing in a field
      e.preventDefault(); e.stopImmediatePropagation()
      commitType(store, t.id, x => removeLevel(x, sel)); setPane({ sel: null })
    }
    // a press anywhere outside the editor un-picks the beam, so a Delete meant for the canvas reaches it
    const onDown = (e) => { if (!(e.target instanceof Element && e.target.closest('[data-pane="open"]'))) setPane({ sel: null }) }
    window.addEventListener('keydown', onWin, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => { window.removeEventListener('keydown', onWin, true); window.removeEventListener('pointerdown', onDown, true) }
  }, [sel, t.id])
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
    if (i.t === 'line') return <line key={n} x1={i.x1} y1={i.y1} x2={i.x2} y2={i.y2} stroke={i.stroke} strokeWidth={i.sw} strokeDasharray={i.dash} opacity={i.opacity} pointerEvents="none" />
    if (i.t === 'path') return <path key={n} d={i.d} fill="none" stroke={i.stroke} strokeWidth={i.sw} opacity={i.opacity} pointerEvents="none" />
    if (i.t === 'polygon') return <polygon key={n} points={i.points.map(q => q.join(',')).join(' ')} fill={i.fill} pointerEvents="none" />
    if (i.t === 'circle') return <circle key={n} cx={i.cx} cy={i.cy} r={i.r} fill={i.fill} stroke={i.stroke} strokeWidth={i.sw} pointerEvents="none" />
    if (i.t === 'poly') return <polyline key={n} points={i.points.map(q => q.join(',')).join(' ')} fill="none" stroke={i.stroke} strokeWidth={i.sw} pointerEvents="none" />
    if (i.t === 'text') return <text key={n} data-role={role} x={i.x} y={i.y} fontSize={i.size} fontFamily={i.font || 'Arial, sans-serif'} textAnchor={i.anchor} fill={i.fill} fontWeight={i.weight} transform={i.rot ? `rotate(${i.rot} ${i.x} ${i.y})` : undefined} style={{ userSelect: 'none', ...(i.halo ? { stroke: i.haloColor || 'var(--surface)', strokeWidth: i.halo, paintOrder: 'stroke', strokeLinejoin: 'round' } : {}), ...(handlers.style || {}) }} onDoubleClick={handlers.onDoubleClick}>{i.s}</text>
    return null
  }
  return (
    <div ref={host} tabIndex={0} onKeyDown={onKey} aria-label="Elevation drawing" style={{ height: box.h, flexShrink: 0, position: 'relative', outline: 'none', overflow: 'hidden', background: 'var(--surface)' }}>
      <svg width={box.w} height={box.h} style={{ display: 'block' }} onPointerDown={() => host.current.focus()}>
        {d.items.map(render)}
        {/* the beams and the upright tops grabbed first: a transparent strip over each, drawn last, so a label lying on a
            beam at a small scale never takes its drag */}
        {d.items.filter(i => i.t === 'rect' && (i.role?.kind === 'beam' || i.role?.kind === 'top')).map((i, n) => {
          const h = Math.max(8, i.h), y = i.y + i.h / 2 - h / 2
          return <rect key={'grab' + n} data-grab={i.role.kind + ':' + (i.role.k ?? '')} x={i.x} y={y} width={i.w} height={h} fill="transparent" style={{ cursor: 'ns-resize' }} onPointerDown={(e) => startDrag(e, i.role)} />
        })}
      </svg>
      {editing && (
        <input autoFocus aria-label="Dimension" value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}
          onBlur={commitTyping} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitTyping(); if (e.key === 'Escape') setEditing(null) }}
          style={{ position: 'absolute', left: Math.max(4, editing.x - 34), top: Math.max(4, editing.y - 11), width: 68, fontSize: 12, fontFamily: 'var(--font-mono)', padding: '2px 4px', border: '1px solid var(--accent, #2F7BD8)', borderRadius: 3, zIndex: 3 }} />
      )}
    </div>
  )
}
