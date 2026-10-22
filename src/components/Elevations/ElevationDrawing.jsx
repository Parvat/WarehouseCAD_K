import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../studio/Icon'   // the Studio icon set (STUDIO.md §9)
import { elevationLayout, ftInDash, parseFtIn } from '../../utils/elevationDrawing'
import { setPane, moveBeam, addLevelAt, removeLevel, setUpright, setDimension, paneFontPx } from '../../utils/elevEditor'

/* ── The elevation drawing, interactive — the Elevations tab (ElevationsTab.jsx) ─────────────────────────────────────
   Drag a beam up or down (snapping to the type's hole pitch, its elevation live); drag it off the ends of the bay, or
   click it and press Delete, to remove its level; click an empty upright to add a level there; drag the top of the
   upright to change its height; double-click a dimension to type it exactly. Each gesture hands the edited type to
   `onCommit` once (the section saves it for the selection — ONE undo step). Only the vertical design changes.
   Frames and beams take the theme's --elev-frame, the ground --elev-ink, the dimensions --elev-dim, the clearances
   --elev-clr, so a dark panel keeps them readable (the PDF prints the reference's own colours).
   Crisp on screen: the SVG sits on the device-pixel grid (a half-pixel offset from the panel's 0.5 px rules blurred
   every line on a scaled display), straight lines and rects draw with crisp edges, labels with geometric precision. */

/** The drawing of type `t` at `entry` (beam length, depth, pair, flue, pallet width); `onCommit(nextType)` per gesture.
 *  `view`: 'both' | 'front' | 'side' (one view, fitted alone); `height`: a fixed height (px) — else it follows the width;
 *  `fill`: the height its container gives it. Zoom: the wheel or a pinch around the cursor, a drag on empty space pans
 *  (a beam still drags), Fit or a double-click on empty space fits, labels keep their screen size; ⤢ opens it full
 *  screen (Esc closes). */
export function ElevationDrawing(props) {
  const [full, setFull] = useState(false)
  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.querySelector('[data-theme]') || document.body) }, [])
  // the tab's own ⤢ (its toolbar): a new signal opens full screen
  useEffect(() => { if (props.fullSignal) setFull(true) }, [props.fullSignal])
  useEffect(() => { if (!full) return; const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setFull(false) } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [full])
  return <>
    <DrawingCore {...props} onFull={() => setFull(true)} />
    {full && host && createPortal(
      <div role="dialog" aria-label="Elevation full screen" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{props.title || props.t?.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Esc closes</span>
          {/* Simple | Detailed — the full-size view is where the detailed dimensions are read */}
          <div role="group" aria-label="Drawing detail" style={{ display: 'flex', gap: 2, padding: 2, marginLeft: 12, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={props.detail === k} onClick={() => setPane({ detail: k })} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 2, border: 'none', cursor: 'pointer', background: props.detail === k ? 'var(--accent-solid, #0B101D)' : 'transparent', color: props.detail === k ? 'var(--accent-fg, #fff)' : 'var(--text2)' }}>{label}</button>)}
          </div>
          <button type="button" aria-label="Close full screen" onClick={() => setFull(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex' }}><Icon name="Close" color="currentColor" /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}><DrawingCore {...props} fill height={null} controls paper={false} fitSignal={0} /></div>
      </div>, host)}
  </>
}

/* the sheet the drawing sits on in the Elevations tab: plain white */
const PAPER = '#FFFFFF'

function DrawingCore({ t, entry, building, sel, sprClr, detail, onCommit, view = 'both', height = null, fill = false, onFull = null, readOnly = false, controls = true, paper = false, fitSignal = 0 }) {
  // controls false: Fit and ⤢ are the host's (the Elevations tab's toolbar — `fitSignal`); paper: the white sheet
  // readOnly (the list's drawing — choosing and assigning only): zoom, pan and Fit, no beam, upright or dimension edit
  const commit = (fn) => { if (readOnly) return; const next = fn(t); if (next && JSON.stringify(next) !== JSON.stringify(t)) onCommit(next) }
  const host = useRef(null)
  const [box, setBox] = useState({ w: 454, h: 431 })
  const [snap, setSnap] = useState({ x: 0, y: 0 })
  const stacked = box.w < 400
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    // the height follows the width: side by side when there is room, the side view under the front view when narrow
    const read = () => {
      const w = el.clientWidth
      setBox(b => { const n = fill ? { w, h: Math.max(200, el.parentElement?.clientHeight || el.clientHeight || 400) } : height ? { w, h: Math.round(height) } : w < 400 ? { w, h: Math.round(Math.min(900, Math.max(480, w * 1.7))) } : { w, h: Math.round(Math.min(640, Math.max(340, w * 0.95))) }; return n.w === b.w && n.h === b.h ? b : n })
      // onto the device-pixel grid: the host can sit at a fraction of a pixel (the panel's 0.5 px rules, a scaled display)
      const r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
      const fx = (Math.round(r.left * dpr) - r.left * dpr) / dpr, fy = (Math.round(r.top * dpr) - r.top * dpr) / dpr
      setSnap(o => (Math.abs(o.x - fx) < 1e-3 && Math.abs(o.y - fy) < 1e-3 ? o : { x: fx, y: fy }))
    }
    read()
    window.addEventListener('scroll', read, true); window.addEventListener('resize', read)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    // filling: the container's height is the one that changes (the chips' + Add form opening below it) — the host's own
    // size is fixed by the last read, so it alone never notices
    if (fill && el.parentElement) ro?.observe(el.parentElement)
    return () => { ro?.disconnect(); window.removeEventListener('scroll', read, true); window.removeEventListener('resize', read) }
  }, [height, fill])
  /* zoom about the cursor, pan by dragging empty space — the layout is redrawn at the zoomed scale, so the labels keep
     their screen size and every gesture keeps working at any zoom */
  const [zv, setZv] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  useEffect(() => { setZv({ zoom: 1, pan: { x: 0, y: 0 } }) }, [t?.id, view, entry?.beamIn])
  const zvRef = useRef(zv); zvRef.current = zv
  const fit = () => setZv({ zoom: 1, pan: { x: 0, y: 0 } })
  useEffect(() => { if (fitSignal) fit() }, [fitSignal])
  const [draft, setDraft] = useState(null)          // { type, active, removing } while dragging
  const [editing, setEditing] = useState(null)      // a dimension being typed: { id, k, x, y, value }
  const shown = draft ? draft.type : t
  // centred and fitted to the pane (elevationLayout centres it in the box), labels in proportion with a readable minimum
  const fontPx = paneFontPx(box)
  const d = useMemo(() => elevationLayout(shown, entry.beamIn, box, { palletWIn: entry.palletWIn, palletDIn: entry.palletDIn, depthIn: entry.depthIn, pair: entry.pair, flueIn: entry.flueIn, building, fontPx, stacked, sprinklerClearanceIn: sprClr, detail, view, zoom: zv.zoom, pan: zv.pan, bg: paper ? '#FFFFFF' : 'var(--surface)', frame: 'var(--elev-frame)', ink: 'var(--elev-ink)', blue: 'var(--elev-dim)', red: 'var(--elev-clr)', active: draft?.active || (sel != null ? 'beam:' + sel : null), removing: draft?.removing ?? null }), [shown, entry, box, building, fontPx, draft, sel, stacked, sprClr, detail, view, zv])

  const at = (ev) => { const r = host.current.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top } }
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), q = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
      const { zoom, pan } = zvRef.current, z2 = Math.min(16, Math.max(0.5, zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))))
      // the point under the cursor stays under it
      setZv({ zoom: z2, pan: { x: q.x - (q.x - pan.x) * (z2 / zoom), y: q.y - (q.y - pan.y) * (z2 / zoom) } })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  /* a press on empty space (not a beam, the upright top, an upright or a dimension) pans */
  const empty = (e) => { const tg = e.target; return tg === e.currentTarget || (tg instanceof Element && !tg.getAttribute('data-role') && !tg.getAttribute('data-grab')) }
  const startPan = (e) => {
    if (e.button !== 0 || !empty(e)) return
    const x0 = e.clientX, y0 = e.clientY, p0 = zvRef.current.pan
    const move = (ev) => setZv(v => ({ ...v, pan: { x: p0.x + ev.clientX - x0, y: p0.y + ev.clientY - y0 } }))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const zAt = (p) => (d.floor - p.y) / d.scale

  /* a drag on a beam or on the top of the upright: the type follows live; the release writes it once */
  const startDrag = (ev, role) => {
    ev.preventDefault(); ev.stopPropagation()
    host.current.focus({ preventScroll: true })   // (a plain focus scrolls the panel to show the whole drawing — under the pointer mid-drag)
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
      if (last.removing != null) { commit(x => removeLevel(x, last.removing)); setPane({ sel: null }) }
      else commit(() => last.type)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const onUprightClick = (ev) => {
    const z = zAt(at(ev))
    const next = addLevelAt(t, z)
    if (next) commit(() => next)
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
      commit(x => removeLevel(x, sel)); setPane({ sel: null })
    }
    // a press anywhere outside the editor un-picks the beam, so a Delete meant for the canvas reaches it
    const onDown = (e) => { if (!(e.target instanceof Element && e.target.closest('[data-pane="open"]'))) setPane({ sel: null }) }
    window.addEventListener('keydown', onWin, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => { window.removeEventListener('keydown', onWin, true); window.removeEventListener('pointerdown', onDown, true) }
  }, [sel, t, onCommit])
  const onKey = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null) { e.preventDefault(); e.stopPropagation(); commit(x => removeLevel(x, sel)); setPane({ sel: null }) }
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
    if (Number.isFinite(v)) commit(x => setDimension(x, e.id, e.k, v))
  }

  const render = (i, n) => {
    const r = i.role
    const handlers = {}
    if (!readOnly && (r?.kind === 'beam' || r?.kind === 'top')) handlers.onPointerDown = (e) => startDrag(e, r)
    if (!readOnly && r?.kind === 'upright') handlers.onClick = onUprightClick
    if (!readOnly && r?.kind === 'dim') { handlers.onDoubleClick = (e) => startTyping(e, r); handlers.style = { cursor: 'text' } }
    const role = r ? (r.kind + ':' + (r.id ?? '') + ':' + (r.k ?? '')) : undefined
    if (i.t === 'rect') return <rect key={n} data-role={role} shapeRendering="crispEdges" x={i.x} y={i.y} width={Math.max(0, i.w)} height={Math.max(0, i.h)} fill={i.fill || 'none'} stroke={i.stroke} strokeWidth={i.sw} opacity={i.opacity} style={{ cursor: readOnly ? undefined : i.cursor || (r?.kind === 'upright' ? 'copy' : undefined) }} {...handlers} />
    if (i.t === 'line') return <line key={n} shapeRendering={i.x1 === i.x2 || i.y1 === i.y2 ? 'crispEdges' : undefined} x1={i.x1} y1={i.y1} x2={i.x2} y2={i.y2} stroke={i.stroke} strokeWidth={i.sw} strokeDasharray={i.dash} opacity={i.opacity} pointerEvents="none" />
    if (i.t === 'path') return <path key={n} d={i.d} fill="none" stroke={i.stroke} strokeWidth={i.sw} opacity={i.opacity} pointerEvents="none" />
    if (i.t === 'polygon') return <polygon key={n} points={i.points.map(q => q.join(',')).join(' ')} fill={i.fill} pointerEvents="none" />
    if (i.t === 'circle') return <circle key={n} cx={i.cx} cy={i.cy} r={i.r} fill={i.fill} stroke={i.stroke} strokeWidth={i.sw} pointerEvents="none" />
    if (i.t === 'poly') return <polyline key={n} points={i.points.map(q => q.join(',')).join(' ')} fill="none" stroke={i.stroke} strokeWidth={i.sw} pointerEvents="none" />
    if (i.t === 'text') return <text key={n} data-role={role} textRendering="geometricPrecision" x={i.x} y={i.y} fontSize={i.size} fontFamily={i.font || 'Arial, sans-serif'} textAnchor={i.anchor} fill={i.fill} fontWeight={i.weight} transform={i.rot ? `rotate(${i.rot} ${i.x} ${i.y})` : undefined} style={{ userSelect: 'none', ...(i.halo ? { stroke: i.haloColor || 'var(--surface)', strokeWidth: i.halo, paintOrder: 'stroke', strokeLinejoin: 'round' } : {}), ...(handlers.style || {}) }} onDoubleClick={handlers.onDoubleClick}>{i.s}</text>
    return null
  }
  return (
    <div ref={host} tabIndex={0} onKeyDown={onKey} aria-label="Elevation drawing" data-readonly={readOnly ? 'true' : undefined} data-zoom={Math.round(zv.zoom * 100) / 100} style={{ height: box.h, flexShrink: 0, position: 'relative', outline: 'none', overflow: 'hidden', background: paper ? PAPER : 'var(--surface)', cursor: 'grab' }}>
      <svg width={box.w} height={box.h} style={{ display: 'block', position: 'relative', left: snap.x, top: snap.y }}
        onPointerDown={(e) => { host.current.focus({ preventScroll: true }); startPan(e) }} onDoubleClick={(e) => { if (empty(e)) fit() }}>
        {d.items.map(render)}
        {/* the beams and the upright tops grabbed first: a transparent strip over each, drawn last, so a label lying on a
            beam at a small scale never takes its drag */}
        {!readOnly && d.items.filter(i => i.t === 'rect' && (i.role?.kind === 'beam' || i.role?.kind === 'top')).map((i, n) => {
          const h = Math.max(8, i.h), y = i.y + i.h / 2 - h / 2
          return <rect key={'grab' + n} data-grab={i.role.kind + ':' + (i.role.k ?? '')} x={i.x} y={y} width={i.w} height={h} fill="transparent" style={{ cursor: 'ns-resize' }} onPointerDown={(e) => startDrag(e, i.role)} />
        })}
      </svg>
      {/* Fit, and full screen */}
      {controls && <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, zIndex: 2 }}>
        <button type="button" onClick={fit} title="Fit (double-click empty space)" style={{ padding: '3px 9px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer' }}>Fit</button>
        {onFull && <button type="button" aria-label="Full screen" onClick={onFull} title="Full screen (Esc closes)" style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', display: 'flex' }}><Icon name="Full screen" color="currentColor" /></button>}
      </div>}
      {editing && (
        <input autoFocus aria-label="Dimension" value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}
          onBlur={commitTyping} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitTyping(); if (e.key === 'Escape') setEditing(null) }}
          style={{ position: 'absolute', left: Math.max(4, editing.x - 34), top: Math.max(4, editing.y - 11), width: 68, fontSize: 12, fontFamily: 'var(--font-mono)', padding: '2px 4px', border: '1px solid var(--accent, #2F7BD8)', borderRadius: 3, zIndex: 3 }} />
      )}
    </div>
  )
}
