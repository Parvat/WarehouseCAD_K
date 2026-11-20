// DrawBar.jsx — the drawing tools' previews (d1-polish: the Draw bar and the Text bar are gone; the name stays) (D1, design/drawbar.png; utils/drawTool.js):
//   DrawBar      "Draw": the shape switch (Line · Polyline · Rectangle · Circle · Polygon), Stroke colour and width (px),
//                Fill, Solid | Dashed, Close (a polyline), Done, ✕ — in the Add door bar's place (top 76), its hint below
//   TextBar      "Text": Size (the real text height, inches — the Text panel's numbers), B, I, Colour, Left · Centre ·
//                Right, Done, ✕
//   DrawPreview  the shape being drawn, its live length on each segment (a typed one in its place), the snap guides
//   TextEditor   the text being typed, over the canvas where it was clicked (Enter: a new line; Esc finishes)
//   useDrawKeys  a length typed + Enter, Backspace (the last point / digit), Enter (finish), Esc (end)

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Line, Group, Text, Circle, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { HOME_TOOL } from '../utils/homeTool'
import { textOwnsKey } from '../utils/typing'
import { ftIn } from '../utils/bom'
import { useTextSizes, textLz } from '../utils/textSizes'
import { layoutText, fontSpec } from '../utils/textLayout'
import { SELECT_BLUE } from '../theme/tokens'
import { B, MONO, modePill, Sep, Seg, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { SizeInput } from '../studio/textSizeCard'
import { useView, toScreen, useLiveObjects } from './live'
import { Swatch } from '../studio/Swatch'
export { Swatch }
import { isPointShape, shapePoints, drawnGeom, elbowBendAt, lengthLabelAt, drawnLength } from '../render/drawnShapes'
import { styleFor } from '../utils/drawStyles'
import { DrawnBody } from './shapes'
import { angleOf, angleShown, useShapePoint, useLengthEdit, setDrawnLength, feetOf, kindOfShape } from '../utils/drawTool'
import { POINT_HANDLE_PX } from './SectionShape'
import {
  DRAW_SHAPES, DRAW_COLORS, useDrawTool, shapeOfTool, toolOfShape, twoPoint, typedPoint, commitShape, endDraw, cancelDraw,
  commitText, textFields, pickDrawTool, shapeObject,
} from '../utils/drawTool'
import { TOOLS } from '../constants'

/** (d1-fixes) A text finished (Esc, Done, a click elsewhere): Select with it selected; nothing typed — the home tool. */
export function finishText(store) {
  const made = commitText(store, nanoid)
  useDrawTool.setState({ keep: false })
  if (made) { store.getState().setActiveTool(TOOLS.SELECT); store.getState().selectObject(made.id, false) }
  else store.getState().setActiveTool(HOME_TOOL)
  return made
}

const word = { color: B.muted, fontSize: 12 }
const HINT = '#767C74'
const valueBox = { height: 26, width: 44, padding: '0 8px', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }

/* (d1-polish) no Draw bar and no Text bar: nothing shows while a draw tool is on — a new shape or text starts with its
   kind's last used style (utils/drawStyles.js) and is styled on the selection bar once drawn (it is selected). */

const LEN_FS = 10
/* (the mockups) the green of a snap ring, the close ring and the typing pill; the angle's brown */
const SNAP_GREEN = '#2E7D5B', ANGLE = '#9A5B13'
/** A pill on the canvas, screen-size (it is chrome, not drawing — CLAUDE.md Rule 8): green, white words. */
function Pill({ x, y, text, name, z, color = SNAP_GREEN }) {
  const fs = 11 / z, padX = 8 / z, h = 20 / z, w = String(text).length * fs * 0.58 + 2 * padX
  return (
    <Group name={name} listening={false}>
      <Rect x={x} y={y} width={w} height={h} cornerRadius={h / 2} fill={color} listening={false} />
      <Text name={name + '-text'} x={x} y={y} width={w} height={h} align="center" verticalAlign="middle" text={text} fontSize={fs} fontStyle="600" fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill="#FFFFFF" listening={false} />
    </Group>
  )
}
/** The shape being drawn (the d1-final mockups): its outline as it will be (its own stroke and fill) — the segment to the
 *  pointer a dashed rubber band — the points placed (small squares), a live length on each segment (a rectangle: its
 *  width and height; a circle: its radius), the angle at the pointer (a line, a polyline), a length being typed in a
 *  green pill by the pointer ("30x14 | typing…"), the snap guides and ring with what it snapped to ("wall face"), and at
 *  the first point a green ring and "close". Lengths at the door chain's real text height (CLAUDE.md Rule 8). */
export function DrawPreview() {
  const tool = useCanvasStore(s => s.activeTool), shape = shapeOfTool(tool)
  const s = useDrawTool(), gs = useCanvasStore(st => st.gridSize) || 40
  const u = 1 / textLz('doorValue', gs, null, useTextSizes(t => t.sizes))
  const z = useView().zoom || 1
  if (!shape) return null
  const live = s.typed != null && s.pts.length ? (typedPoint(shape, s.pts[s.pts.length - 1], s.at, s.typed, gs) || s.at) : s.at
  const all = live && s.pts.length ? [...s.pts, live] : (s.at ? [...s.pts, s.at] : s.pts)
  const fs = LEN_FS * u
  const words = (len) => ftIn((len / gs) * 12)
  const label = (a, b, text, key, side = 1, color = SELECT_BLUE) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = (-(b.y - a.y) / L) * side, ny = ((b.x - a.x) / L) * side, off = fs * 1.1
    const tw = String(text).length * fs * 0.6 + fs * 0.4, th = fs * 1.4
    return <Text key={key} name={'draw-length:' + key} x={mx + nx * off - tw / 2} y={my + ny * off - th / 2} width={tw} height={th} align="center" verticalAlign="middle"
      text={text} fontSize={fs} fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill={color} listening={false} />
  }
  // (d1-polish) as it will be: its kind's last used style
  const ks = styleFor(kindOfShape(shape)), sw = ks.strokeWidth || 2
  const stroke = { stroke: ks.stroke, strokeWidth: sw, dash: ks.dashed ? [Math.max(4, sw * 3), Math.max(3, sw * 2)] : undefined, strokeScaleEnabled: false, listening: false, lineJoin: 'round', lineCap: 'round' }
  const fill = ks.fill && !ks.noFill ? ks.fill : undefined
  const parts = []
  const end = all.length ? all[all.length - 1] : null
  const angleAt = (a, b, key) => <Text key={key} name="draw-angle" x={b.x + 10 / z} y={b.y - fs * 0.7} text={angleShown(a, b) + '°'} fontSize={fs} fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill={ANGLE} listening={false} />
  if (all.length >= 2) {
    if (shape === 'rect') {
      const [a, b] = all, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
      parts.push(<Line key="r" name="draw-draft" points={[x, y, x + w, y, x + w, y + h, x, y + h]} closed fill={fill} opacity={0.9} {...stroke} dash={stroke.dash || [6, 4]} />)
      parts.push(label({ x, y }, { x: x + w, y }, words(w), 'w', -1))
      parts.push(label({ x: x + w, y }, { x: x + w, y: y + h }, words(h), 'h', -1))
    } else if (shape === 'arrow' || shape === 'elbow' || shape === 'block') {
      const tmp = shapeObject(shape, [all[0], end], s, z, gs)
      if (tmp) {
        parts.push(<Group key="a" name="draw-draft" opacity={0.9} listening={false}><DrawnBody obj={{ ...tmp, id: 'draft' }} gs={gs} /></Group>)
        const P = shape === 'elbow' ? drawnGeom(tmp).pts.map(([x, y]) => ({ x, y })) : [all[0], end]
        for (let i = 1; i < P.length; i++) parts.push(label(P[i - 1], P[i], words(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y)), 'seg' + i))
      }
      if (shape !== 'elbow') parts.push(angleAt(all[0], end, 'ang'))
    } else if (shape === 'circle') {
      const [c, e] = all, r = Math.hypot(e.x - c.x, e.y - c.y)
      parts.push(<Circle key="c" name="draw-draft" x={c.x} y={c.y} radius={r} fill={fill} opacity={0.9} {...stroke} />)
      parts.push(<Line key="rad" points={[c.x, c.y, e.x, e.y]} stroke={SELECT_BLUE} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />)
      parts.push(label(c, e, 'R ' + words(r), 'r'))
    } else {
      const closed = shape === 'polyline' && s.closed
      // the placed segments solid; the one to the pointer a dashed rubber band
      const placed = all.slice(0, -1)
      if (shape === 'line') parts.push(<Line key="l" name="draw-draft" points={[all[0].x, all[0].y, end.x, end.y]} {...stroke} />)
      else {
        if (placed.length >= 2) parts.push(<Line key="p" name="draw-draft" points={placed.flatMap(p => [p.x, p.y])} closed={false} {...stroke} />)
        parts.push(<Line key="band" name="draw-band" points={[all[all.length - 2].x, all[all.length - 2].y, end.x, end.y]} stroke={ks.stroke} strokeWidth={sw} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />)
      }
      for (let i = 1; i < all.length; i++) parts.push(label(all[i - 1], all[i], words(Math.hypot(all[i].x - all[i - 1].x, all[i].y - all[i - 1].y)), 'seg' + i))
      parts.push(angleAt(all[all.length - 2], end, 'ang'))
      if (closed && all.length >= 3) parts.push(<Line key="close" points={[end.x, end.y, all[0].x, all[0].y]} stroke={SELECT_BLUE} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />)
    }
  }
  const sq = 6 / z
  const ringAt = s.closing && s.pts.length ? s.pts[0] : (s.snap && s.at ? s.at : null)
  return (
    <Group name="draw-preview" listening={false}>
      {parts}
      {s.pts.map((p, i) => <Rect key={'pt' + i} name="draw-point" x={p.x - sq / 2} y={p.y - sq / 2} width={sq} height={sq} fill="#FFFFFF" stroke="#5A615C" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)}
      {s.at && !s.pts.length && !s.snap && <Circle name="draw-cursor" x={s.at.x} y={s.at.y} radius={3 / z} fill={SELECT_BLUE} listening={false} />}
      {s.guides.map((g, i) => <Line key={'g' + i} name="draw-snap-guide" points={g.axis === 'x' ? [g.val, g.from, g.val, g.to] : [g.from, g.val, g.to, g.val]} stroke="#22c55e" strokeWidth={1} dash={[6, 3]} opacity={0.9} strokeScaleEnabled={false} listening={false} />)}
      {/* the snap: a green ring on the point, and what it snapped to; at the first point: "close" (d1-fixes: draw-close) */}
      {ringAt && <Circle name={s.closing ? 'draw-close' : 'draw-snap-ring'} x={ringAt.x} y={ringAt.y} radius={7 / z} stroke={SNAP_GREEN} strokeWidth={2} strokeScaleEnabled={false} listening={false} />}
      {ringAt && <Pill name={s.closing ? 'draw-close-pill' : 'draw-snap-pill'} x={ringAt.x + 12 / z} y={ringAt.y - 30 / z} text={s.closing ? 'close' : s.snap} z={z} />}
      {/* a length being typed: the green pill by the pointer */}
      {s.typed != null && end && <Pill name="draw-typing" x={end.x + 10 / z} y={end.y + 10 / z} text={s.typed} z={z} />}
    </Group>
  )
}

/** (d1-final) The Text tool's box being dragged: its wrap width (a dashed frame). */
export function TextBoxDraft() {
  const b = useDrawTool(s => s.textPress)
  if (!b) return null
  return <Rect name="text-box-draft" x={Math.min(b.x0, b.x1)} y={Math.min(b.y0, b.y1)} width={Math.abs(b.x1 - b.x0)} height={Math.abs(b.y1 - b.y0)} stroke={SELECT_BLUE} strokeWidth={1} dash={[5, 4]} strokeScaleEnabled={false} listening={false} />
}

/** A selected shape's marks (d1-fixes, d1-final mockups): a polyline's points — white squares (the one picked filled)
 *  — and its sides' middles, blue dots (a press on a point drags it, on a side drags that side, a double-click on a
 *  side adds a point: useCanvasInteraction.js, Canvas2.jsx); a line's length · angle along it (two end handles, no box). */
export function ShapePointHandles({ obj: picked }) {
  const zoom = useView().zoom || 1, gs = useCanvasStore(st => st.gridSize) || 40
  const u = 1 / textLz('doorValue', gs, null, useTextSizes(t => t.sizes))
  const pickedPt = useShapePoint()
  const live = useLiveObjects(), obj = live.find(o => o.id === picked?.id) || picked     // where it is drawn now (live.js)
  const editing = useLengthEdit(e => e.id)
  /* a line's (an arrow's) length · angle, an elbow's length: (d1-polish) a click on it types a new length (LengthEditor) */
  const measure = (o) => {
    if (editing === o.id) return null
    const fs = LEN_FS * u, text = lengthText(o, gs), g = lengthLabelAt(o, fs, text)
    return <Text name="line-measure label-pill" x={g.x} y={g.y} offsetX={g.w / 2} offsetY={fs * 0.7} width={g.w} align="center" rotation={g.rot} text={text} fontSize={fs} fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill={SELECT_BLUE} listening={false} />
  }
  if (obj && obj.type === 'line' && Number.isFinite(obj.x1)) return measure(obj)
  // (d2-arrows) an elbow's bend: a blue dot on its middle segment (a drag moves the bend); its length
  if (obj && obj.type === 'elbow' && Number.isFinite(obj.x1)) { const d = elbowBendAt(obj); return <Group listening={false}>{measure(obj)}<Circle name="elbow-bend" x={d.x} y={d.y} radius={4 / zoom} fill={SELECT_BLUE} listening={false} /></Group> }
  if (!isPointShape(obj)) return null
  const s = POINT_HANDLE_PX / zoom, P = shapePoints(obj), n = P.length, closed = obj.type === 'polygon' || !!obj.closed
  return (
    <Group name="shape-points" listening={false}>
      {P.slice(0, closed ? n : n - 1).map((a, i) => { const b = P[(i + 1) % n]; return <Circle key={'m' + i} name="shape-side" x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} radius={3.5 / zoom} fill={SELECT_BLUE} listening={false} /> })}
      {P.map(([x, y], i) => { const on = pickedPt.id === obj.id && pickedPt.i === i; return <Rect key={i} name={on ? 'shape-point-picked' : 'shape-point'} x={x - s / 2} y={y - s / 2} width={s} height={s} fill={on ? SELECT_BLUE : '#FFFFFF'} stroke={SELECT_BLUE} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} /> })}
    </Group>
  )
}

/** (d1-polish) What a length label reads: a line's (an arrow's) length · angle, an elbow's length. */
export function lengthText(o, gs = 40) {
  const L = ftIn((drawnLength(o) / gs) * 12)
  return o.type === 'line' ? L + ' · ' + angleShown({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) + '°' : L
}
/** (d1-polish) A length label clicked: a field on it, the length (feet and inches) selected — Enter sets it (the start stays
 *  put, the end moves along the same direction — drawTool.js setDrawnLength), Esc or a click away leaves it as it was. */
export function LengthEditor() {
  const id = useLengthEdit(e => e.id)
  const view = useView(), gs = useCanvasStore(st => st.gridSize) || 40, sizes = useTextSizes(t => t.sizes)
  const o = useCanvasStore(st => (id ? st.objects.find(q => q.id === id) : null))
  const ref = useRef(null)
  useEffect(() => {
    if (!id) return
    const go = () => { const el = ref.current; if (el && document.activeElement !== el) { el.focus(); el.select() } }
    const r = requestAnimationFrame(go)   // (after the press that opened it — focusing during it, the press would blur it)
    return () => cancelAnimationFrame(r)
  }, [id])
  if (!id || !o) return null
  const start = ftIn((drawnLength(o) / gs) * 12).replace(/′/g, "'").replace(/″/g, '"')
  const fs = LEN_FS / textLz('doorValue', gs, null, sizes), g = lengthLabelAt(o, fs, lengthText(o, gs)), c = toScreen(view, { x: g.x, y: g.y }), z = view.zoom || 1
  const close = () => useLengthEdit.setState({ id: null })
  const apply = () => { const ft = feetOf(ref.current?.value); close(); if (ft > 0) setDrawnLength(useCanvasStore, id, ft) }
  return (
    <input ref={ref} key={id} aria-label="Length" data-length-editor defaultValue={start} onFocus={e => e.target.select()} onBlur={close} spellCheck={false}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); apply() } else if (e.key === 'Escape') { e.preventDefault(); close() } }}
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'absolute', left: c.x, top: c.y, transform: 'translate(-50%, -50%)', zIndex: 125, width: Math.max(64, g.w * z * 0.8), height: Math.max(20, g.h * z),
        boxSizing: 'border-box', padding: '0 6px', border: `1px solid ${SELECT_BLUE}`, borderRadius: 4, outline: 'none', background: '#FFFFFF', color: SELECT_BLUE,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: Math.max(11, fs * z), textAlign: 'center' }} />
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
  // a text edited again (d1-final): its own style; a new one: the bar's
  const own = t.id ? useCanvasStore.getState().objects.find(o => o.id === t.id) : null
  const f = own ? { fontSize: own.fontSize, textIn: own.textIn, bold: own.bold, italic: own.italic, fill: own.fill, align: own.align || 'left', lineHeight: own.lineHeight ?? 1.25, fontFamily: own.fontFamily || textFields(s, gs).fontFamily } : textFields(s, gs)
  const z = view.zoom || 1
  const L = layoutText({ ...f, text: t.value || ' ', ...(t.width ? { width: t.width } : {}) })
  const w = (t.width ? t.width : Math.max(L.width, f.fontSize)) * z + 8, h = Math.max(1, L.lines.length) * L.lineH * z + 4
  const top = toScreen(view, { x: t.x, y: t.y - f.fontSize })
  const shift = f.align === 'center' ? '-50%' : f.align === 'right' ? '-100%' : '0'
  // (d1-final) pasted words keep their lines (Windows' CR LF read as one new line)
  const paste = (e) => {
    const txt = e.clipboardData?.getData('text/plain')
    if (txt == null) return
    e.preventDefault()
    const el = e.currentTarget, v = String(t.value ?? ''), a = el.selectionStart ?? v.length, b = el.selectionEnd ?? v.length
    const ins = txt.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)).split(String.fromCharCode(13)).join(String.fromCharCode(10))
    useDrawTool.setState({ text: { ...useDrawTool.getState().text, value: v.slice(0, a) + ins + v.slice(b) } })
  }
  return (
    <textarea ref={ref} aria-label="Text being typed" data-text-editor value={t.value} spellCheck={false} wrap={t.width ? 'soft' : 'off'} onPaste={paste}
      onChange={e => useDrawTool.setState({ text: { ...useDrawTool.getState().text, value: e.target.value } })}
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'absolute', left: top.x, top: top.y - 2, width: w, height: h, transform: `translateX(${shift})`, zIndex: 120, resize: 'none', overflow: 'hidden',
        padding: 0, margin: 0, border: `1px dashed ${SELECT_BLUE}`, outline: 'none', background: 'rgba(255,255,255,0.6)', color: f.fill,
        font: fontSpec({ ...f, fontSize: f.fontSize * z, fontFamily: `'${f.fontFamily}', sans-serif` }), lineHeight: L.lineH * z + 'px', textAlign: f.align, whiteSpace: t.width ? 'pre-wrap' : 'pre' }} />
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
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishText(useCanvasStore) }
        return
      }
      if (textOwnsKey(e)) return                                   // a field of the bar being typed in owns its keys
      const shape = shapeOfTool(st.activeTool)
      if (!shape) return
      const gs = st.gridSize || 40, last = s.pts[s.pts.length - 1]
      if (last && (/^[0-9.'"]$/.test(e.key) || (s.typed != null && /^[ x,×*<]$/i.test(e.key)) || (shape === 'circle' && s.typed == null && /^[rd]$/i.test(e.key)))) { e.preventDefault(); e.stopPropagation(); useDrawTool.setState({ typed: (s.typed ?? '') + e.key }); return }
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

