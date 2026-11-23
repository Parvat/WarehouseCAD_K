import { HOME_TOOL } from '../utils/homeTool'
import { rowNow, rowFill, rowCountOn, dropRow, rowLen } from '../utils/doorRowTool'
import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useLiveObjects, useView } from './live'
import { floorUnit } from './DoorAnnot'
import { Icon } from '../studio/Icon'
import { textOwnsKey } from '../utils/typing'
import { LabelOps } from './LabelOps'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { gapOps } from '../render/doorAnnot'
import { useTextSizes, textLz } from '../utils/textSizes'
import { ftIn } from '../utils/bom'
import { feetOf } from '../components/RightPanel/panels/ColumnGridPanel'
import { Rect, Line, Group, Text } from 'react-konva'
import { pillOps } from '../render/labelOps'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { useDoorTool, doorTypes, doorSpec, setDoorType, setDoorWidth, clearDoorHover, liveGap, placeTypedDoor } from '../utils/doorTool'
import { B, MONO, modePill, Sep, Seg, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { SELECT_BLUE, selectTint } from '../theme/tokens'
import { parseLengthAs, showLengthAs, useUnits, isDefaultUnits } from '../utils/units'   // (units-2)

/* Add door's mode bar (STUDIO.md §7; the mode bars' look, C9 / C10; design/doorbar.png): top 76 — "Add door", the door
   types in the library today (a segmented control), the width (the type's; typed here for the next door), the Row toggle —
   on, Gap (ft) and Count slide in beside it (nothing else opens; utils/doorRowTool.js) — Done, ✕ (Esc too) back to Select.
   The hint is one line just below the bar, in the drawings' words colour on the ground (not in the bar). */
const word = { color: B.muted, fontSize: 12 }
const HINT = '#767C74'                                         // the drawings' words (STUDIO.md) — readable on the ground
const valueBox = { height: 26, width: 52, padding: '0 8px', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }

export function DoorBar() {
  const typeId = useDoorTool(s => s.typeId)
  useDoorTool(s => s.widthFt)                                   // the width shown follows a typed one
  const row = useDoorTool(s => s.row), rowGap = useDoorTool(s => s.rowGapFt), rowCount = useDoorTool(s => s.rowCount)
  const [text, setText] = useState(null), [gapText, setGapText] = useState(null), [countText, setCountText] = useState(null)
  const commitGap = () => { const v = String(gapText ?? '').trim() === '0' ? 0 : parseLengthAs(gapText ?? '', 'ft'); setGapText(null); if (v != null && v >= 0) useDoorTool.setState({ rowGapFt: v }) }   // (units-2)
  const commitCount = () => { const t = String(countText ?? '').trim(); setCountText(null); if (t === '') { useDoorTool.setState({ rowCount: null }); return } const v = Math.floor(Number(t)); if (v >= 1 && v <= 500) useDoorTool.setState({ rowCount: v }) }
  const fieldKeys = (reset) => (e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { reset(null); e.currentTarget.blur() } }
  const spec = doorSpec(), types = doorTypes()
  const close = () => { clearDoorHover(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  // (units-2) every form typed (3' 6, 1 m, 900 mm, a bare number in the project unit); shown in the project's units
  const commit = () => { const v = parseLengthAs(text ?? '', 'ft'); setText(null); if (v != null && v > 0) setDoorWidth(v) }
  const U = useUnits(), ftWord = U.metric || !isDefaultUnits(U) ? '' : 'ft'
  return (
    <div role="toolbar" aria-label="Add door" data-mode-bar="door" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Add door</span>
      <Sep />
      <Seg aria="Door type" options={types.map(t => ({ value: t.id, label: t.short, aria: t.label, title: `${t.label} — ${t.widthFt}′ wide`, on: t.id === typeId, onClick: () => setDoorType(t.id) }))} />
      <span style={word}>Width</span>
      <input aria-label="Door width (ft)" className="st-field" style={{ ...valueBox, ...(ftWord ? null : { width: 72 }) }} value={text ?? showLengthAs(spec?.widthFt ?? '', 'ft', U)}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(null); e.currentTarget.blur() } }} />
      {ftWord && <span style={word}>{ftWord}</span>}
      <Sep />
      {/* Row: a row of doors (design/doorbar.png) — on, its Gap and Count slide in */}
      <button type="button" aria-label="Row" aria-pressed={row} title="Row — a row of equal doors along a wall" onClick={() => { useDoorTool.setState({ row: !row, typed: null, rowDrag: null }) }} className={btnClass(row)}
        style={{ ...barBtn(row), display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 0 8px' }}><Icon name="Door row" size={16} active={row} />Row</button>
      {row && (
        <span data-row-fields style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid #3A403C', animation: 'st-slide-in .16s ease-out' }}>
          <span style={word}>Gap</span>
          <input aria-label="Row gap (ft)" className="st-field" style={{ ...valueBox, ...(ftWord ? null : { width: 72 }) }} value={gapText ?? showLengthAs(rowGap, 'ft', U)}
            onChange={e => setGapText(e.target.value)} onBlur={commitGap} onKeyDown={fieldKeys(setGapText)} />
          {ftWord && <span style={word}>{ftWord}</span>}
          <span style={word}>Count</span>
          <input aria-label="Row count" className="st-field" placeholder="all" style={{ ...valueBox, width: 48 }} value={countText ?? (rowCount > 0 ? String(rowCount) : '')}
            onChange={e => setCountText(e.target.value)} onBlur={commitCount} onKeyDown={fieldKeys(setCountText)} />
        </span>
      )}
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Add door" title="Done (Esc)" onClick={close} />
      <div data-mode-hint aria-live="polite" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, textAlign: 'center', fontSize: 12, color: HINT, pointerEvents: 'none' }}>
        {!row ? 'Hover a wall · click to place · type a gap + Enter · Esc ends'
          : rowCount > 0 ? `Count ${rowCount}: the ${rowCount} doors follow the mouse along any wall · click to drop · or drag an area to fill it (Count empty = as many as fit)`
          : 'Count empty: drag along a wall to fill it with as many doors as fit · Esc ends'}
      </div>
    </div>
  )
}

/** The door preview on the hovered wall: the door's footprint against the inner face, the face line strong. */
export function DoorPreview() {
  const at = useDoorTool(s => s.hover)
  if (!at) return null
  const cx = at.x + at.width / 2, cy = at.y + at.height / 2
  return (
    <>
      <Rect name="door-preview" x={cx} y={cy} offsetX={at.width / 2} offsetY={at.height / 2} width={at.width} height={at.height} rotation={at.rotation}
        fill={selectTint(0.18)} stroke={SELECT_BLUE} strokeWidth={1.5} dash={[5, 3]} strokeScaleEnabled={false} listening={false} />
      <Line points={at.line} stroke={SELECT_BLUE} strokeWidth={3} strokeScaleEnabled={false} listening={false} />
    </>
  )
}

/** The live gap while placing (doors-edit round; STUDIO.md, Doors): the preview's gap to the last door placed on its
 *  wall (or the wall's low corner), inside the building as the gaps are (render/doorAnnot.js gapOps — plain text, no line).
 *  A number typed shows in its place with a thin text cursor; Enter drops the door exactly there; Esc ends the tool. */
export function DoorGapLive() {
  useDoorTool(s => s.hover)
  const typed = useDoorTool(s => s.typed)
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  // (CLAUDE.md Rule 8 — the CAD text model) the live gap at the door chain's real text height
  const u = 1 / textLz('doorValue', gs, null, useTextSizes(s => s.sizes))
  const L = liveGap(objects, gs)
  if (!L || !(L.hi - L.lo > -0.5)) return null
  const text = typed != null ? (typed || ' ') : ftIn((Math.max(0, L.hi - L.lo) / gs) * 12)
  const { ops } = gapOps(L.w, L.lo, Math.max(L.lo, L.hi), text, u, { cursor: typed != null, objects, gridSize: gs })
  return <LabelOps ops={ops} name="door-gap-live" fit={false} />
}

/** Row on (door-row round, design/doorbar.png): with a Count, the whole row following the pointer — its doors dashed (red
 *  when refused: over a door, past a corner), dotted lines from its ends to the corner or the nearest door each side with
 *  their distances (the left one as typed), and a pill: "3 doors · 51′ · click". A drag along a wall (any Count): the
 *  doors that fill it, with their count. */
export function RowPreview() {
  useDoorTool(s => s.hover); useDoorTool(s => s.typed); useDoorTool(s => s.rowGapFt); useDoorTool(s => s.rowCount); useDoorTool(s => s.widthFt); useDoorTool(s => s.typeId)
  const drag = useDoorTool(s => s.rowDrag)
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  const sizes = useTextSizes(s => s.sizes), lz = labelScale(useLabelPrefs(s => s.labelSize), gs)
  const u = 1 / textLz('doorValue', gs, null, sizes)
  const zoom = useView().zoom || 1
  const moved = drag && Math.abs(drag.p1 - drag.p0) * zoom >= 6
  const F = moved ? rowFill(objects, drag, gs) : null
  const R = !moved ? rowNow(objects, gs) : null
  const box = (w, s0, W, D, red, key) => {
    const inward = w.inward || 1, a0 = w.at, a1 = w.at + inward * D
    const p = w.axis === 'x' ? { x: s0, y: Math.min(a0, a1), w: W, h: Math.abs(a1 - a0) } : { x: Math.min(a0, a1), y: s0, w: Math.abs(a1 - a0), h: W }
    return <Rect key={key} name={red ? 'door-row-door-refused' : 'door-row-door'} x={p.x} y={p.y} width={p.w} height={p.h} fill={red ? 'rgba(229,72,77,0.14)' : selectTint(0.14)} stroke={red ? '#E5484D' : SELECT_BLUE} strokeWidth={1.5} dash={[5, 3]} strokeScaleEnabled={false} listening={false} />
  }
  const pill = (w, s0, s1, D, text, red) => {
    const inward = w.inward || 1, c = (s0 + s1) / 2, across = w.at + inward * (D + 2.2 * gs)
    const [x, y] = w.axis === 'x' ? [c, across] : [across, c]
    return <LabelOps name="door-row-count" ops={pillOps(x, y, text, 10.5 / lz, lz, { color: '#FFFFFF', bg: red ? '#C0392B' : '#2E7D5B', opacity: 1, padX: 7 / lz, rx: 8 / lz })} />
  }
  if (F && F.n >= 0) {
    const D = F.spec.depthFt * gs, lo = Math.min(...F.starts, drag.p0), hi = Math.max(...F.starts.map(v => v + F.W), drag.p0)
    return (
      <Group name="door-row-preview" listening={false}>
        {F.starts.map((s0, i) => box(F.w, s0, F.W, D, false, i))}
        {pill(F.w, lo, hi, D, `${F.n} door${F.n === 1 ? '' : 's'}`, !F.n)}
      </Group>
    )
  }
  if (!R) return null
  const D = R.spec.depthFt * gs, w = R.w, inward = w.inward || 1, along = w.at + inward * D * 0.5
  const P = (q, c) => (w.axis === 'x' ? [q, c] : [c, q])
  const dist = (a, b, text, key) => {
    if (!(b - a > 0.5)) return null
    // (the value just outside the row's own end — left of the first door, right of the last — so it moves with the row and
    //  stays on screen at any zoom; the dotted line still runs the whole distance)
    const fs = DOOR_FS_ROW * u, tw = String(text).length * fs * 0.6 + fs * 0.4, th = fs * 1.4, ext = w.axis === 'x' ? tw : th, pad = fs * 0.4
    const m = key === 'left' ? b - pad - ext / 2 : a + pad + ext / 2
    const [x0, y0] = P(a, along), [x1, y1] = P(b, along), [tx, ty] = P(m, along - inward * 0.9 * gs)
    return (
      <Group key={key} name={'door-row-distance:' + key} listening={false}>
        <Line points={[x0, y0, x1, y1]} stroke="#2F6FD6" strokeWidth={1} dash={[2, 3]} strokeScaleEnabled={false} listening={false} />
        <Text x={tx - tw / 2} y={ty - th / 2} width={tw} height={th} align="center" verticalAlign="middle" text={text} fontSize={fs} fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill="#2F6FD6" listening={false} />
      </Group>
    )
  }
  const typedText = R.typed != null ? useDoorTool.getState().typed : null
  return (
    <Group name="door-row-preview" listening={false}>
      {R.starts.map((s0, i) => box(w, s0, R.W, D, R.refused, i))}
      {dist(R.left, R.s0, typedText != null ? typedText + '▏' : ftIn((Math.max(0, R.leftDist) / gs) * 12), 'left')}
      {dist(R.s1, R.right, ftIn((Math.max(0, R.rightDist) / gs) * 12), 'right')}
      {pill(w, R.s0, R.s1, D, R.refused ? `${R.count} doors · won't fit` : `${R.count} door${R.count === 1 ? '' : 's'} · ${rowLen(R.s1 - R.s0, gs)} · click`, R.refused)}
    </Group>
  )
}
const DOOR_FS_ROW = 10

/** The door tool's keys: a number typed (digits, ', ", a point, a space) goes into the live gap; Backspace takes one
 *  off; Enter drops the door that far from the last door (or the corner); Esc ends the tool. */
export function useDoorGapKeys(on) {
  useEffect(() => {
    if (!on) return
    const key = (e) => {
      if (textOwnsKey(e)) return                                   // a text being typed owns its keys (utils/typing.js)
      const s = useDoorTool.getState()
      if (/^[0-9.'"]$/.test(e.key) || (e.key === ' ' && s.typed != null)) { e.preventDefault(); e.stopPropagation(); useDoorTool.setState({ typed: (s.typed ?? '') + e.key }); return }
      if (e.key === 'Backspace' && s.typed != null) { e.preventDefault(); e.stopPropagation(); useDoorTool.setState({ typed: s.typed.slice(0, -1) || null }); return }
      if (e.key === 'Enter' && s.typed != null) {
        e.preventDefault(); e.stopPropagation()
        const ft = feetOf(s.typed)
        // (Row on, a Count: the left distance typed — the row dropped there)
        if (rowCountOn()) dropRow(useCanvasStore, nanoid)
        else placeTypedDoor(useCanvasStore, nanoid, ft)
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); useDoorTool.setState({ typed: null }); clearDoorHover(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on])
}
