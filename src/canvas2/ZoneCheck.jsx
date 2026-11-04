import { useEffect, useRef } from 'react'
import { Group, Rect } from 'react-konva'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { useDragPreview, previewObjects } from './dragPreview'
import { useZoneEdit, REMOVED } from './ZoneEdit'
import { LabelPill } from './DimensionLabels'
import { landZones } from '../utils/rackingAreaTool'
import { zoneProblems, isZoneObj, walkwayInNow } from '../utils/zoneCheck'
import { getColumnCheckView } from '../generate/columnCheckView'
import { MHE_PROFILES } from '../generate/columnCheck'

/* The live zone check (STUDIO.md §7a Zone): while a zone is dragged or resized, the layout the drop would leave — the
   zone where it is now, the racks under it cut as the drop cuts them (rackingAreaTool.js landZones) — is checked
   (utils/zoneCheck.js). If the zone blocks an aisle, cuts off rack faces or leaves a zone with no way in, the zone turns
   red with the reason, before the drop. The drop is still allowed; Check layout lists a zone with no way in as an error
   (the other two stay its warnings, with their X marks). Pure paint,
   never listening; worked out at most every THROTTLE ms (a big layout's check is not a per-frame job). */
const THROTTLE = 90
const FONT_PX = 11

/** The check's last answer: { zones: [{ id, box }], reasons: [text] } — empty when nothing is wrong or no zone moves. */
export const useZoneCheck = create(() => ({ zones: [], reasons: [] }))
const EMPTY = { zones: [], reasons: [] }

/** The zones a gesture is moving or resizing now, and the layout as it stands mid-gesture and as it was before it. */
function gesture(st, preview, edit) {
  if (edit.zoneId) {
    const z = st.objects.find(o => o.id === edit.zoneId)
    if (!z) return null
    return { ids: [z.id], now: st.objects, before: st.objects.map(o => (o.id === z.id && edit.was ? { ...o, ...edit.was } : o)) }
  }
  if (preview.ids && (preview.dx || preview.dy)) {
    const ids = st.objects.filter(o => isZoneObj(o) && preview.ids.has(o.id)).map(o => o.id)
    if (!ids.length) return null
    return { ids, now: previewObjects(st.objects, preview), before: st.objects }
  }
  return null
}

export function check() {
  const st = useCanvasStore.getState(), g = gesture(st, useDragPreview.getState(), useZoneEdit.getState())
  if (!g) return EMPTY
  const gridSize = st.gridSize || 40
  let n = 0
  const landed = landZones(g.now, g.before, { gridSize, newId: () => 'zonecheck' + (++n) }).objects
  let profile = MHE_PROFILES.reach
  try { profile = getColumnCheckView()?.profile || profile } catch { /* no column check view yet */ }
  const problems = zoneProblems(landed, { ids: g.ids, before: g.before, profile, gridSize, elevations: st.elevations, walkwayIn: walkwayInNow() })
  if (!problems.length) return EMPTY
  const zones = g.ids.map(id => landed.find(o => o.id === id)).filter(Boolean).map(z => ({ id: z.id, box: { x: z.x, y: z.y, w: z.width, h: z.height } }))
  return { zones, reasons: [...new Set(problems.map(p => p.text))] }
}

export function ZoneCheckPreview() {
  const zoneId = useZoneEdit(s => s.zoneId), was = useZoneEdit(s => s.was)
  const ids = useDragPreview(s => s.ids), dx = useDragPreview(s => s.dx), dy = useDragPreview(s => s.dy)
  const objects = useCanvasStore(s => s.objects)
  const zoom = useCanvasStore(s => s.zoom) || 1
  const result = useZoneCheck()
  const timer = useRef(null)
  useEffect(() => {
    if (!zoneId && !(ids && (dx || dy))) { if (timer.current) { clearTimeout(timer.current); timer.current = null } useZoneCheck.setState(EMPTY); return }
    if (timer.current) return   // the next run reads the latest state
    timer.current = setTimeout(() => { timer.current = null; useZoneCheck.setState(check()) }, THROTTLE)
  }, [zoneId, was, ids, dx, dy, objects])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  if (!result.zones.length) return null
  // drawn where the zone is NOW (the drag's offset applied by the check's own layout)
  const text = result.reasons.join(' · ')
  return (
    <Group listening={false} name="zone-check">
      {result.zones.map(z => (
        <Group key={z.id} listening={false}>
          <Rect x={z.box.x} y={z.box.y} width={z.box.w} height={z.box.h} fill="rgba(192,57,43,0.18)" stroke={REMOVED} strokeWidth={2}
            strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} name="zone-check-red" />
          <LabelPill cx={z.box.x + z.box.w / 2} cy={z.box.y + z.box.h / 2} text={text} fontSize={FONT_PX / zoom} zoom={zoom} color="#FFFFFF" bg={REMOVED} opacity={0.95} />
        </Group>
      ))}
    </Group>
  )
}
