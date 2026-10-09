import { useEffect, useState } from 'react'
import { Group, Rect } from 'react-konva'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { zonePreview } from '../utils/rackingAreaTool'
import { LabelPill } from './DimensionLabels'
import { pxToFtIn } from '../utils/canvas'

/* A zone being resized or placed, on the canvas — pure paint, never listening:
     - while an edge is dragged, the bays (per row) the release will remove, in red: the keeper's own
       landing (utils/rackingAreaTool.js zonePreview → landZones), so the preview is exactly what mouse-up
       does. Nothing is removed until then. Recomputed a moment after the edge stops (a big layout's
       refit is not a per-frame job);
     - its size, "40' × 30'", on the zone while it is resized or placed (ZoneSizeLabel). */
export const REMOVED = '#C0392B'
const FONT_PX = 11

/** The zone being resized: { zoneId, was (the zone as it was when the drag began) } or nulls. */
export const useZoneEdit = create(() => ({ zoneId: null, was: null }))

/** "40' × 30'" just inside the top edge of a zone box (world px), clear of the zone's own name. */
export function ZoneSizeLabel({ box, gridSize, zoom }) {
  return <LabelPill cx={box.x + box.w / 2} cy={box.y + (FONT_PX * 1.4) / zoom} text={`${pxToFtIn(box.w, gridSize)} × ${pxToFtIn(box.h, gridSize)}`} fontSize={FONT_PX / zoom} zoom={zoom} color="#D8B4FE" />
}

export function ZoneEditPreview({ gridSize }) {
  const { zoneId, was } = useZoneEdit()
  const objects = useCanvasStore(s => s.objects)
  const zoom = useCanvasStore(s => s.zoom) || 1
  const zone = zoneId ? objects.find(o => o.id === zoneId) : null
  const [boxes, setBoxes] = useState([])
  useEffect(() => {
    if (!zoneId) { setBoxes([]); return undefined }
    const t = setTimeout(() => setBoxes(zonePreview(useCanvasStore.getState().objects, zoneId, was, { gridSize })), 60)
    return () => clearTimeout(t)
  }, [zoneId, was, objects, gridSize])
  if (!zone) return null
  return (
    <Group listening={false}>
      {boxes.map((b, i) => <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(192,57,43,0.35)" stroke={REMOVED} strokeWidth={1.5}
        strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} name="zone-removed-bay" />)}
      <ZoneSizeLabel box={{ x: zone.x, y: zone.y, w: zone.width, h: zone.height }} gridSize={gridSize} zoom={zoom} />
    </Group>
  )
}
