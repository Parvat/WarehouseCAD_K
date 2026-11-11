import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useTunnelPick, pickedTunnel, setTunnelLevels, deleteTunnel, tunnelWords } from '../utils/tunnel'
import { typeAt } from '../utils/elevations'
import { elevationLayout, toSVG } from '../utils/elevationDrawing'
import { Head, Sec, Field, NumInput, Row, Hint, Btn, C, MONO } from './cardParts'

/* A picked tunnel in the right card (utils/tunnel.js, STUDIO.md §7a Cross-aisles, tunnel round): its Levels removed —
   typed, one undo — what it keeps, its rows and bays, its elevation (the opening under the kept levels, drawn hatched)
   and Delete: the levels back (Delete or Backspace too). */
export function TunnelCard() {
  const pick = useTunnelPick(s => s.pick)
  const { objects, gs, T } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40, T: s.elevations })))
  const t = pickedTunnel(objects, pick, gs)
  if (!t) return null
  const s0 = t.segs[0], r = s0.rack, i = r.beams.length && (() => { const j = s0.runIdx[0]; const tt = ((((r.rotation || 0) % 360) + 360) % 360); return tt === 180 || tt === 270 ? r.beams.length - 1 - j : j })()
  const type = typeAt(r, i, 0, T)
  const keeps = type ? type.levels.length : Math.max(0, (r.levels || 1) - t.n)
  const bays = t.segs.reduce((n, s) => n + s.runIdx.length, 0), rows = new Set(t.segs.map(s => s.rack.id)).size
  const svg = type ? toSVG(elevationLayout(type, r.beams[i] || 96, { w: 240, h: 260 }, { palletWIn: r.palletWIn || 40, depthIn: r.depthIn || 42, fontPx: 9, view: 'front' })) : null
  return (
    <>
      <Head caption="Tunnel" />
      <Sec aria-label="Tunnel settings">
        <Field label="Levels removed" title="The bottom levels it takes out of every bay of it (L1 up)">
          <NumInput aria="Tunnel levels removed" value={t.n} min={1} onCommit={v => setTunnelLevels(useCanvasStore, t, v)} />
        </Field>
        <Row label="Result"><span data-tunnel-keeps style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{tunnelWords({ n: t.n, keeps })}</span></Row>
        <Row label="Rows"><span data-tunnel-rows style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{rows} rows · {bays} bays</span></Row>
        {svg && <div aria-label="Tunnel elevation" data-tunnel-elevation style={{ background: '#FFFFFF', borderRadius: 8, padding: 4 }} dangerouslySetInnerHTML={{ __html: svg }} />}
        <Hint>Drag it along the run to move it a bay at a time. Its frames stay; the levels above it are kept.</Hint>
        <Btn kind="ghost" aria-label="Delete tunnel" title="Delete (Del) — the levels come back" onClick={() => deleteTunnel(useCanvasStore, t)}>Delete</Btn>
      </Sec>
    </>
  )
}
