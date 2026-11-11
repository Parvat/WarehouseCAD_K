// TunnelMarks.jsx — tunnels on the plan (utils/tunnel.js, STUDIO.md §7a Cross-aisles, tunnel round): every tunnel bay
// hatched over the rack, one TUNNEL label per tunnel; the picked one outlined in the selection green, and while it is
// dragged where it goes (whole bays). Pure paint.
import { Group, Rect, Shape, Text } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { tunnelsNow, useTunnelPick, pickedTunnel, tunnelPitch } from '../utils/tunnel'
import { useView, useLiveObjects } from './live'

const SELECT = '#2E7D5B', HATCH = '#8A7A55'

export function TunnelMarks() {
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  const pick = useTunnelPick(s => s.pick), drag = useTunnelPick(s => s.drag)
  const zoom = useView().zoom
  const all = tunnelsNow(objects, gs)
  if (!all.length) return null
  const picked = pick ? pickedTunnel(objects, pick, gs) : null
  const rectOf = (t, s, shift = 0) => (t.rot ? { x: s.s0, y: s.lo + shift, w: s.s1 - s.s0, h: s.hi - s.lo } : { x: s.lo + shift, y: s.s0, w: s.hi - s.lo, h: s.s1 - s.s0 })
  const fs = 11 / zoom, step = 6 / zoom
  return (
    <Group name="tunnel-marks" listening={false}>
      {all.map(t => (
        <Group key={t.key} name="tunnel" listening={false}>
          {t.segs.map((s, i) => { const r = rectOf(t, s); return (
            <Shape key={i} name="tunnel-bay" x={r.x} y={r.y} width={r.w} height={r.h} listening={false} perfectDrawEnabled={false}
              sceneFunc={(ctx, shape) => {
                const w = shape.width(), h = shape.height()
                ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip()
                ctx.fillStyle = 'rgba(244,243,239,0.75)'; ctx.fillRect(0, 0, w, h)
                ctx.beginPath()
                for (let k = 0; k < w + h; k += step) { ctx.moveTo(k, 0); ctx.lineTo(k - h, h) }
                ctx.strokeStyle = HATCH; ctx.lineWidth = 1 / zoom; ctx.stroke()
                ctx.restore()
                ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.strokeStyle = HATCH; ctx.lineWidth = 1 / zoom; ctx.stroke()
              }} />
          ) })}
          {(() => {
            const mid = t.segs[Math.floor(t.segs.length / 2)], r = rectOf(t, mid), text = 'TUNNEL', lw = text.length * fs * 0.62 + 6 / zoom, lh = fs + 4 / zoom
            return (
              <Group x={r.x + r.w / 2 - lw / 2} y={r.y + r.h / 2 - lh / 2} listening={false}>
                <Rect width={lw} height={lh} fill="#FFFFFF" stroke={HATCH} strokeWidth={1 / zoom} cornerRadius={2 / zoom} listening={false} />
                <Text name="tunnel-label" text={text} width={lw} height={lh} align="center" verticalAlign="middle" fontSize={fs} fontStyle="bold"
                  fontFamily="JetBrains Mono, monospace" fill={HATCH} listening={false} />
              </Group>
            )
          })()}
        </Group>
      ))}
      {picked && picked.segs.map((s, i) => { const r = rectOf(picked, s, drag ? drag.d * tunnelPitch(picked, gs) : 0); return (
        <Rect key={'p' + i} name="tunnel-sel" x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(46,125,91,0.12)" stroke={SELECT} strokeWidth={1.5}
          strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      ) })}
    </Group>
  )
}
