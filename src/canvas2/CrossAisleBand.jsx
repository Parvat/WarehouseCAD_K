// CrossAisleBand.jsx — the Cross aisle tool on the plan and its mode bar (utils/crossAisleCut.js, utils/tunnel.js; STUDIO.md
// §7a Cross-aisles): while a drag lays the band, the band (the selection green, as a picked cross-aisle) with its width —
// in Tunnel, the levels it takes out — and every row along a wall it passes by drawn over it as not cut (the wall-row
// rule); the bar: the tool's icon, Cross aisle | Tunnel, what to do, the Width (typed: this tool's; empty — the
// equipment's cross-aisle width there), in Tunnel its Levels removed (typed, 2 by default) and the result live
// ("Removes L1–L2 · keeps 2 levels"), Done and ✕ (Esc too) back to the home tool.
import { useEffect, useState } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { HOME_TOOL } from '../utils/homeTool'
import { useCrossAisleTool, bandOf, cutWidthFt, defaultWidthFt, setCutWidth, cancelCut, setCutMode, setTunnelRemove, setTunnelWidthFt, planCut, CROSS_AISLE_TOOL } from '../utils/crossAisleCut'
import { tunnelSummary, tunnelWords, standardBayIn } from '../utils/tunnel'
import { isPickable } from '../utils/layers'
import { useView, useLiveObjects } from './live'
import { ftIn, sizeWords } from '../utils/bom'
import { Icon } from '../studio/Icon'
import { B, MONO, modePill, Sep, Seg, CloseBtn, barBtn, btnClass } from '../studio/barParts'
import { parseAisleFt } from './FillBar'

const SELECT = '#2E7D5B'

/** Tunnel's width now (ft): typed, else the standard bay (tunnel fixes). */
export const tunnelBandFt = () => useCrossAisleTool.getState().tunnelWidthFt ?? standardBayIn() / 12
/** The band a drag lays now (null: none) — in Tunnel as wide as the tunnel. */
export function liveBand(st, drag) {
  if (!drag) return null
  const gs = st.gridSize || 40
  const w = useCrossAisleTool.getState().mode === 'tunnel' ? tunnelBandFt() : cutWidthFt(st.objects, drag.from)
  return bandOf(st.objects, drag.from, drag.to, w, gs, (o) => !isPickable(st.layers, o))
}

export function CrossAisleBandPreview() {
  const drag = useCrossAisleTool(s => s.drag), mode = useCrossAisleTool(s => s.mode), levels = useCrossAisleTool(s => s.levels)
  const objects = useLiveObjects(), layers = useCanvasStore(s => s.layers), gridSize = useCanvasStore(s => s.gridSize)
  const st = { objects, layers, gridSize }
  const zoom = useView().zoom
  const b = liveBand(st, drag)
  if (!b) return null
  const gs = st.gridSize || 40
  const rectOf = (c0, c1) => (b.vert ? { x: c0, y: b.s0, w: c1 - c0, h: b.s1 - b.s0 } : { x: b.s0, y: c0, w: b.s1 - b.s0, h: c1 - c0 })
  const r = rectOf(b.c0, b.c1)
  const fs = 12 / zoom, pad = 4 / zoom
  /* fixes-x 2: before the release, what the cut would do that loses a row's run — a run of 1 or 2 bays that goes (red, its
     reason), a row too short to cut (red: it stays whole) */
  const report = mode === 'tunnel' ? [] : (planCut(objects, b, { gridSize: gs, newId: () => 'preview' })?.report || [])
  const RED = '#C0392B'
  const label = mode === 'tunnel' ? `Tunnel · ${levels > 1 ? `L1–L${levels}` : 'L1'}` : sizeWords(ftIn(((b.s1 - b.s0) / gs) * 12))
  const lw = label.length * fs * 0.6 + pad * 2, lh = fs + pad * 2
  return (
    <Group name="cross-aisle-band" listening={false}>
      <Rect name="cross-aisle-band-rect" x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(46,125,91,0.16)" stroke={SELECT} strokeWidth={1.5} dash={[6, 4]}
        strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      {/* a row along a wall: passed by — drawn over the band as the row it stays, "not cut" */}
      {b.walls.map(w => { const q = rectOf(w.s0, w.s1); return (
        <Group key={w.id} name="cross-aisle-band-wall" listening={false}>
          <Rect x={q.x} y={q.y} width={q.w} height={q.h} fill="#F2F4F1" stroke="#7E8680" strokeWidth={1} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
          <Text name="cross-aisle-band-wall-text" text="not cut" x={q.x} y={q.y} width={q.w} height={q.h} align="center" verticalAlign="middle" fontSize={Math.min(10 / zoom, q.h * 0.8, q.w / (7 * 0.62))} wrap="none"
            fontFamily="JetBrains Mono, monospace" fill="#41483F" listening={false} />
        </Group>
      ) })}
      {report.map((q, i) => {
        const text = q.kind === 'whole' ? 'Row too short to cut' : `${q.n} bay${q.n === 1 ? '' : 's'} — removed (a run is 3 bays or more)`
        const fz = Math.min(10 / zoom, Math.max(q.rect.h, q.rect.w) * 0.6)
        return (
          <Group key={q.id + ':' + i} name={q.kind === 'whole' ? 'cross-aisle-band-whole' : 'cross-aisle-band-short'} listening={false}>
            <Rect x={q.rect.x} y={q.rect.y} width={q.rect.w} height={q.rect.h} fill="rgba(192,57,43,0.22)" stroke={RED} strokeWidth={1.5} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
            <Text name="cross-aisle-band-red-text" text={text} x={q.rect.x} y={q.rect.y + q.rect.h + 2 / zoom} fontSize={fz} wrap="none" fontFamily="JetBrains Mono, monospace" fill={RED} listening={false} />
          </Group>
        )
      })}
      <Group x={r.x + r.w / 2 - lw / 2} y={r.y + r.h / 2 - lh / 2} listening={false}>
        <Rect width={lw} height={lh} fill="#1F2321" cornerRadius={3 / zoom} listening={false} />
        <Text name="cross-aisle-band-text" text={label} width={lw} height={lh} align="center" verticalAlign="middle" fontSize={fs}
          fontFamily="JetBrains Mono, monospace" fill="#F2F4F1" listening={false} />
      </Group>
    </Group>
  )
}

const valueBox = { height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }
const word = { color: B.muted, fontSize: 12 }

/* the Width: the equipment's cross-aisle width where the pointer is, until a length is typed (this tool's, until it ends) */
function WidthField() {
  const typed = useCrossAisleTool(s => s.widthFt), at = useCrossAisleTool(s => s.drag?.from || s.at)
  const objects = useLiveObjects()
  const eqFt = defaultWidthFt(objects, at)
  const shown = String(+((typed ?? eqFt)).toFixed(2))
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    const ft = text.trim() ? parseAisleFt(text) : null
    if (text.trim() && ft == null) { setText(shown); return }
    setCutWidth(ft != null && Math.abs(ft - eqFt) > 1e-6 ? ft : null)
  }
  return (
    <input aria-label="Cross aisle width (ft)" className="st-field" title={typed ? `This tool's width — the equipment's is ${+eqFt.toFixed(2)} ft` : "The equipment's cross-aisle width (its section's, else the project forklift's) — type another"}
      value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ ...valueBox, width: 52, color: typed ? B.accent : B.strong }} />
  )
}

/* Tunnel's Width (tunnel fixes): its bay's beam length — typed; empty, the standard bay */
function TunnelWidthField() {
  const typed = useCrossAisleTool(s => s.tunnelWidthFt)
  const std = standardBayIn() / 12
  const shown = String(+((typed ?? std)).toFixed(2))
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    const ft = text.trim() ? parseAisleFt(text) : null
    if (text.trim() && ft == null) { setText(shown); return }
    setTunnelWidthFt(ft != null && Math.abs(ft - std) > 1e-6 ? ft : null)
  }
  return (
    <input aria-label="Tunnel width (ft)" className="st-field" title={typed ? `The tunnel bay's beam length — the standard bay is ${+std.toFixed(2)} ft` : 'The standard bay — type another: the tunnel bay takes that beam length'}
      value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ ...valueBox, width: 52, color: typed ? B.accent : B.strong }} />
  )
}

/* Tunnel's Levels removed: typed, whole levels from the bottom (2 by default) */
function LevelsField() {
  const n = useCrossAisleTool(s => s.levels)
  const [text, setText] = useState(String(n))
  useEffect(() => setText(String(n)), [n])
  const commit = () => { const v = Number(text); if (Number.isFinite(v) && v >= 1) setTunnelRemove(v); else setText(String(n)) }
  return (
    <input aria-label="Levels removed" className="st-field" title="The bottom levels the tunnel takes out (L1 up)" value={text} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }} style={{ ...valueBox, width: 36 }} />
  )
}
/* the result live: what the band's bays (before a drag: the layout's default type) lose and keep */
function TunnelResult() {
  const n = useCrossAisleTool(s => s.levels), drag = useCrossAisleTool(s => s.drag)
  const objects = useLiveObjects(), layers = useCanvasStore(s => s.layers), gridSize = useCanvasStore(s => s.gridSize), T = useCanvasStore(s => s.elevations)
  const band = liveBand({ objects, layers, gridSize }, drag)
  return <span aria-label="Tunnel result" data-tunnel-result style={{ ...word, color: B.text, whiteSpace: 'nowrap' }}>{tunnelWords(tunnelSummary(objects, T, band, n, gridSize || 40))}</span>
}

export function CrossAisleBar() {
  const tool = useCanvasStore(s => s.activeTool)
  const mode = useCrossAisleTool(s => s.mode)
  // the typed width goes with the tool (the mode and the levels stay for the next time)
  useEffect(() => { if (tool !== CROSS_AISLE_TOOL) { setCutWidth(null); cancelCut() } }, [tool])
  if (tool !== CROSS_AISLE_TOOL) return null
  const close = () => { cancelCut(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  const tunnel = mode === 'tunnel'
  return (
    <div role="toolbar" aria-label="Cross aisle" data-mode-bar="cross-aisle" className="st-pill" style={modePill}>
      <Icon name="Aisles" active />
      <Seg aria="Cross aisle or tunnel" options={[
        { value: 'cross', label: 'Cross aisle', aria: 'Cross aisle', title: 'Cut the rows the band crosses', on: !tunnel, onClick: () => setCutMode('cross') },
        { value: 'tunnel', label: 'Tunnel', aria: 'Tunnel', title: 'Keep the rows: take the bottom levels out of the bays under the band', on: tunnel, onClick: () => setCutMode('tunnel') },
      ]} />
      <span style={word}>{tunnel ? 'Drag across rows where to tunnel' : 'Drag across rows where to cut'}</span>
      <Sep />
      <span style={word}>Width</span>
      {tunnel ? <TunnelWidthField /> : <WidthField />}
      <span style={word}>ft</span>
      {tunnel && <><Sep /><span style={word}>Levels removed</span><LevelsField /><TunnelResult /></>}
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Cross aisle" title="Done (Esc)" onClick={close} />
    </div>
  )
}
