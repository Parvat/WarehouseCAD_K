import { useCanvasStore } from '../store/useCanvasStore'
import { toggleLock } from '../utils/layers'
import { useLocked } from './useLocked'
import { IconBtn } from './cardParts'

/** The object's padlock in its card head (doors-edit round — every object type: racks, doors, zones and offices,
 *  sections, the column grid, text, dimensions, the building …): the same Lock / Unlock as Ctrl+L and the bars
 *  (utils/layers.js toggleLock — a layer's padlock shows here too). Locked: still selectable, not movable or editable,
 *  its controls greyed (STUDIO.md §7a Locks). */
export function CardLock({ obj }) {
  const locked = useLocked(obj)
  if (!obj) return null
  return <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked}
    onClick={() => toggleLock(useCanvasStore)} />
}
