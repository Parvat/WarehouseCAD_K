// DrawBar.jsx — the drawing tools' bars and previews (D1, design/drawbar.png; utils/drawTool.js):
//   DrawBar      "Draw": the shape switch (Line · Polyline · Rectangle · Circle · Polygon), Stroke colour and width (px),
//                Fill, Solid | Dashed, Close (a polyline), Done, ✕ — in the Add door bar's place (top 76), its hint below
//   TextBar      "Text": Size (the real text height, inches — the Text panel's numbers), B, I, Colour, Left · Centre ·
//                Right, Done, ✕
//   DrawPreview  the shape being drawn, its live length on each segment (a typed one in its place), the snap guides
//   TextEditor   the text being typed, over the canvas where it was clicked (Enter: a new line; Esc finishes)
//   useDrawKeys  a length typed + Enter, Backspace (the last point / digit), Enter (finish), Esc (end)

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Line, Group, Text, Circle } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { HOME_TOOL } from '../utils/homeTool'
import { textOwnsKey } from '../utils/typing'
import { ftIn } from '../utils/bom'
import { useTextSizes, textLz } from '../utils/textSizes'
import { layoutText, fontSpec } from '../utils/textLayout'
import { SELECT_BLUE } from '../theme/tokens'
import { B, MONO, modePill, Sep, Seg, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { SizeInput } from '../studio/textSizeCard'
import { useView, toScreen } from './live'
import {
  DRAW_SHAPES, DRAW_COLORS, useDrawTool, shapeOfTool, toolOfShape, twoPoint, typedPoint, commitShape, endDraw, cancelDraw,
  commitText, textFields,
} from '../utils/drawTool'

const word = { color: B.muted, fontSize: 12 }
const HINT = '#767C74'
const valueBox = { height: 26, width: 44, padding: '0 8px', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }
const HATCH = 'repeating-linear-gradient(45deg, #5A615C 0 2px, transparent 2px 5px)'

/** A colour swatch that opens the colours (and None, for a fill): DRAW_COLORS, any colour picked. */
function Swatch({ label, value, onPick, none = false }) {
  const [open, setOpen] = useState(false), ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true) }
  }, [open])
  const face = (v) => (v ? { background: v } : { background: HATCH })
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label} onClick={() => setOpen(o => !o)} data-swatch={value || 'none'}
        style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #5A615C', padding: 0, cursor: 'pointer', ...face(value) }} />
      {open && (
        <div role="dialog" aria-label={label + ' colours'} data-card-dark
          style={{ position: 'absolute', top: 30, left: -8, zIndex: 400, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5, 22px)', gap: 6,
            background: B.island, border: `1px solid ${B.line}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(15,18,16,.28)' }}>
          {none && <button type="button" aria-label="None" title="None" onClick={() => { onPick(null); setOpen(false) }}
            style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${!value ? B.accent : '#5A615C'}`, padding: 0, background: HATCH, cursor: 'pointer' }} />}
          {DRAW_COLORS.map(c => (
            <button key={c} type="button" aria-label={c} title={c} onClick={() => { onPick(c); setOpen(false) }}
              style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${value === c ? B.accent : '#5A615C'}`, padding: 0, background: c, cursor: 'pointer' }} />
          ))}
          <input type="color" aria-label={label + ' (any colour)'} value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#1F2321'} onChange={e => onPick(e.target.value)}
            style={{ width: 22, height: 22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }} />
        </div>
      )}
    </span>
  )
}

const HINTS = {
  line: 'Drag or click two points · Shift keeps 0/45/90° · type a length + Enter · Esc ends',
  rect: 'Drag or click two corners · Shift makes a square · type W x H + Enter · Esc ends',
  circle: 'Drag or click the centre, then the radius · type a radius + Enter · Esc ends',
  polyline: 'Click each point · double-click or Enter to finish · Backspace removes the last point · live length on each segment',
  polygon: 'Click each point · double-click or Enter to finish · Backspace removes the last point · live length on each segment',
}

/** The Draw bar (design/drawbar.png): opens when a shape tool is picked, in the Add door bar's place and style. */
export function DrawBar() {
  const tool = useCanvasStore(s => s.activeTool), shape = shapeOfTool(tool)
  const s = useDrawTool()
  const [w, setW] = useState(null)
  const commitW = () => { const v = Number(String(w ?? '').trim()); setW(null); if (Number.isFinite(v) && v > 0 && v <= 48) useDrawTool.setState({ strokeWidth: v }) }
  const done = () => endDraw(useCanvasStore, shape, useCanvasStore.getState().zoom)
  if (!shape) return null
  return (
    <div role="toolbar" aria-label="Draw" data-mode-bar="draw" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Draw</span>
      <Sep />
      <Seg aria="Shape" options={DRAW_SHAPES.map(d => ({ value: d.id, label: d.label, aria: d.label, on: d.id === shape, onClick: () => { cancelDraw(); useCanvasStore.getState().setActiveTool(toolOfShape(d.id)) } }))} />
      <Sep />
      <span style={word}>Stroke</span>
      <Swatch label="Stroke colour" value={s.stroke} onPick={(c) => useDrawTool.setState({ stroke: c || '#1F2321' })} />
      <input aria-label="Stroke width (px)" className="st-field" style={valueBox} value={w ?? String(s.strokeWidth)}
        onChange={e => setW(e.target.value)} onBlur={commitW} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setW(null); e.currentTarget.blur() } }} />
      <span style={word}>px</span>
      <span style={word}>Fill</span>
      <Swatch label="Fill" value={s.fill} none onPick={(c) => useDrawTool.setState({ fill: c })} />
      <Seg aria="Line style" options={[
        { value: 'solid', label: 'Solid', on: !s.dashed, onClick: () => useDrawTool.setState({ dashed: false }) },
        { value: 'dashed', label: 'Dashed', on: s.dashed, onClick: () => useDrawTool.setState({ dashed: true }) },
      ]} />
      {shape === 'polyline' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: B.text, cursor: 'pointer' }}>
          <input type="checkbox" aria-label="Close" checked={!!s.closed} onChange={e => useDrawTool.setState({ closed: e.target.checked })}
            style={{ width: 14, height: 14, accentColor: B.accent, margin: 0 }} />Close
        </label>
      )}
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={done} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Draw" title="Done (Esc)" onClick={done} />
      <div data-mode-hint aria-live="polite" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, textAlign: 'center', fontSize: 12, color: HINT, pointerEvents: 'none' }}>
        {HINTS[shape]}
      </div>
    </div>
  )
}

/** The Text bar (design/drawbar.png): Size, B, I, Colour, alignment. */
export function TextBar() {
  const s = useDrawTool()
  const done = () => { commitText(useCanvasStore, nanoid); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  const tog = (on, label, key, extra) => (
    <button type="button" aria-label={label} aria-pressed={on} title={label} onClick={() => useDrawTool.setState({ [key]: !on })}
      style={{ height: 28, minWidth: 28, padding: '0 8px', border: 0, borderRadius: 6, fontSize: 12, background: on ? B.active : 'transparent', color: on ? B.accent : B.muted, ...extra }}>{label[0]}</button>
  )
  return (
    <div role="toolbar" aria-label="Text" data-mode-bar="text" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Text</span>
      <Sep />
      <span style={word}>Size</span>
      <SizeInput inches={s.textIn} aria="Text size" onCommit={(v) => { if (v > 0) useDrawTool.setState({ textIn: v }) }} />
      <div role="group" aria-label="Style" style={{ display: 'flex', padding: 2, borderRadius: 6, background: B.inset }}>
        {tog(s.bold, 'Bold', 'bold', { fontWeight: 700 })}
        {tog(s.italic, 'Italic', 'italic', { fontStyle: 'italic' })}
      </div>
      <span style={word}>Colour</span>
      <Swatch label="Text colour" value={s.color} onPick={(c) => useDrawTool.setState({ color: c || '#1F2321' })} />
      <Seg aria="Alignment" options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(([v, l]) => ({ value: v, label: l, on: s.align === v, onClick: () => useDrawTool.setState({ align: v }) }))} />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={done} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Text" title="Done (Esc)" onClick={done} />
      <div data-mode-hint aria-live="polite" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, textAlign: 'center', fontSize: 12, color: HINT, pointerEvents: 'none' }}>
        Click to place · type · Enter for a new line · Esc finishes · size is real text height (18 = 1′-6″)
      </div>
    </div>
  )
}

const LEN_FS = 10
/** The shape being drawn: its outline as it will be (its own stroke and fill), the points placed, a live length on each
 *  segment (a rectangle: its width and height; a circle: its radius) — a length being typed in its place, with a thin
 *  cursor — and the snap guides. Lengths at the door chain's real text height (CLAUDE.md Rule 8). */
export function DrawPreview() {
  const tool = useCanvasStore(s => s.activeTool), shape = shapeOfTool(tool)
  const s = useDrawTool(), gs = useCanvasStore(st => st.gridSize) || 40
  const u = 1 / textLz('doorValue', gs, null, useTextSizes(t => t.sizes))
  const z = useView().zoom || 1
  if (!shape) return null
  const pts = s.at ? [...s.pts, s.at] : s.pts
  const live = s.typed != null && s.pts.length ? (typedPoint(shape, s.pts[s.pts.length - 1], s.at, s.typed, gs) || s.at) : s.at
  const all = live && s.pts.length ? [...s.pts, live] : pts
  const fs = LEN_FS * u
  const words = (len) => ftIn((len / gs) * 12)
  const label = (a, b, text, key, side = 1) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = (-(b.y - a.y) / L) * side, ny = ((b.x - a.x) / L) * side, off = fs * 1.1
    const tw = String(text).length * fs * 0.6 + fs * 0.4, th = fs * 1.4
    return <Text key={key} name={'draw-length:' + key} x={mx + nx * off - tw / 2} y={my + ny * off - th / 2} width={tw} height={th} align="center" verticalAlign="middle"
      text={text} fontSize={fs} fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill={SELECT_BLUE} listening={false} />
  }
  const typedText = s.typed != null ? s.typed + '▏' : null
  const stroke = { stroke: s.stroke, strokeWidth: s.strokeWidth, dash: s.dashed ? [Math.max(4, s.strokeWidth * 3), Math.max(3, s.strokeWidth * 2)] : undefined, strokeScaleEnabled: false, listening: false, lineJoin: 'round', lineCap: 'round' }
  const fill = s.fill || undefined
  const parts = []
  if (all.length >= 2) {
    if (shape === 'rect') {
      const [a, b] = all, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
      parts.push(<Line key="r" name="draw-draft" points={[x, y, x + w, y, x + w, y + h, x, y + h]} closed fill={fill} opacity={0.9} {...stroke} />)
      parts.push(label({ x, y }, { x: x + w, y }, typedText ?? words(w), 'w', -1))
      parts.push(label({ x: x + w, y }, { x: x + w, y: y + h }, words(h), 'h', -1))
    } else if (shape === 'circle') {
      const [c, e] = all, r = Math.hypot(e.x - c.x, e.y - c.y)
      parts.push(<Circle key="c" name="draw-draft" x={c.x} y={c.y} radius={r} fill={fill} opacity={0.9} {...stroke} />)
      parts.push(<Line key="rad" points={[c.x, c.y, e.x, e.y]} stroke={SELECT_BLUE} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />)
      parts.push(label(c, e, typedText ?? words(r), 'r'))
    } else {
      const closed = shape === 'polygon' || (shape === 'polyline' && s.closed)
      parts.push(<Line key="p" name="draw-draft" points={all.flatMap(p => [p.x, p.y])} closed={closed && all.length >= 3} fill={closed ? fill : undefined} opacity={0.9} {...stroke} />)
      for (let i = 1; i < all.length; i++) {
        const last = i === all.length - 1
        parts.push(label(all[i - 1], all[i], last && typedText != null ? typedText : words(Math.hypot(all[i].x - all[i - 1].x, all[i].y - all[i - 1].y)), 'seg' + i))
      }
      if (closed && all.length >= 3) parts.push(<Line key="close" points={[all[all.length - 1].x, all[all.length - 1].y, all[0].x, all[0].y]} stroke={SELECT_BLUE} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />)
    }
  }
  return (
    <Group name="draw-preview" listening={false}>
      {parts}
      {s.pts.map((p, i) => <Circle key={'pt' + i} name="draw-point" x={p.x} y={p.y} radius={3 / z} fill="#FFFFFF" stroke={SELECT_BLUE} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />)}
      {s.at && !s.pts.length && <Circle name="draw-cursor" x={s.at.x} y={s.at.y} radius={3 / z} fill={SELECT_BLUE} listening={false} />}
      {s.guides.map((g, i) => <Line key={'g' + i} name="draw-snap-guide" points={g.axis === 'x' ? [g.val, g.from, g.val, g.to] : [g.from, g.val, g.to, g.val]} stroke="#22c55e" strokeWidth={1} dash={[6, 3]} opacity={0.9} strokeScaleEnabled={false} listening={false} />)}
    </Group>
  )
}

/** The text being typed: a field over the canvas where the click was, at the text's real size on screen and in its
 *  style; Enter starts a new line, Esc (useDrawKeys) finishes it. */
export function TextEditor() {
  const t = useDrawTool(s => s.text), s = useDrawTool()
  const view = useView(), gs = useCanvasStore(st => st.gridSize) || 40
  const ref = useRef(null)
  useEffect(() => {
    if (!t) return
    const go = () => ref.current && document.activeElement !== ref.current && ref.current.focus()
    go(); const r = requestAnimationFrame(go)
    return () => cancelAnimationFrame(r)
  }, [!!t, t?.x, t?.y])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null
  const f = textFields(s, gs), z = view.zoom || 1
  const L = layoutText({ ...f, text: t.value || ' ' })
  const w = Math.max(L.width, f.fontSize) * z + 8, h = Math.max(1, L.lines.length) * L.lineH * z + 4
  const top = toScreen(view, { x: t.x, y: t.y - f.fontSize })
  const shift = s.align === 'center' ? '-50%' : s.align === 'right' ? '-100%' : '0'
  return (
    <textarea ref={ref} aria-label="Text being typed" data-text-editor value={t.value} spellCheck={false} wrap="off"
      onChange={e => useDrawTool.setState({ text: { ...useDrawTool.getState().text, value: e.target.value } })}
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'absolute', left: top.x, top: top.y - 2, width: w, height: h, transform: `translateX(${shift})`, zIndex: 120, resize: 'none', overflow: 'hidden',
        padding: 0, margin: 0, border: `1px dashed ${SELECT_BLUE}`, outline: 'none', background: 'rgba(255,255,255,0.6)', color: f.fill,
        font: fontSpec({ ...f, fontSize: f.fontSize * z, fontFamily: `'${f.fontFamily}', sans-serif` }), lineHeight: L.lineH * z + 'px', textAlign: s.align, whiteSpace: 'pre' }} />
  )
}

/** The drawing tools' keys (capture, before the app's shortcuts): a length typed (digits, ', ", a point; a rectangle's
 *  x or a comma) into the segment being drawn, Backspace (a digit typed, else the last point), Enter (the typed length;
 *  else a polyline / polygon finished), Esc (the text finished / the tool ended). */
export function useDrawKeys(on, textOn) {
  useEffect(() => {
    if (!on && !textOn) return
    const key = (e) => {
      const st = useCanvasStore.getState(), s = useDrawTool.getState()
      if (textOn || s.text) {
        // the text tool: Esc finishes the text and ends the tool (Enter is the text's own new line)
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const made = commitText(useCanvasStore, nanoid); st.setActiveTool(HOME_TOOL); if (made) useCanvasStore.getState().selectObject(made.id, false) }
        return
      }
      if (textOwnsKey(e)) return                                   // a field of the bar being typed in owns its keys
      const shape = shapeOfTool(st.activeTool)
      if (!shape) return
      const gs = st.gridSize || 40, last = s.pts[s.pts.length - 1]
      if (last && (/^[0-9.'"]$/.test(e.key) || (s.typed != null && /^[ x,×*]$/i.test(e.key)))) { e.preventDefault(); e.stopPropagation(); useDrawTool.setState({ typed: (s.typed ?? '') + e.key }); return }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (s.typed != null) { e.preventDefault(); e.stopPropagation(); useDrawTool.setState({ typed: s.typed.slice(0, -1) || null }); return }
        if (s.pts.length) { e.preventDefault(); e.stopPropagation(); useDrawTool.setState({ pts: s.pts.slice(0, -1), press: null }); return }
        return
      }
      if (e.key === 'Enter') {
        if (s.typed != null && last) {
          e.preventDefault(); e.stopPropagation()
          const p = typedPoint(shape, last, s.at, s.typed, gs)
          if (!p) { useDrawTool.setState({ typed: null }); return }
          if (twoPoint(shape)) commitShape(useCanvasStore, shape, [last, p], st.zoom, nanoid)
          else useDrawTool.setState({ pts: [...s.pts, p], typed: null })
          return
        }
        if (!twoPoint(shape) && s.pts.length) { e.preventDefault(); e.stopPropagation(); commitShape(useCanvasStore, shape, s.pts, st.zoom, nanoid) }
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endDraw(useCanvasStore, shape, st.zoom) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on, textOn])
}

