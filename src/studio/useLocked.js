import { useCanvasStore } from '../store/useCanvasStore'
import { isLockedIn } from '../utils/layers'

/** Is `obj` locked — on its own, or by its layer's padlock (utils/layers.js isLockedIn)? Live: a layer locked or
 *  unlocked re-renders the controls that ask (STUDIO.md §7a Locks: disabled at 45 %, titled Locked; the bar's Unlock). */
export const useLocked = (obj) => useCanvasStore(s => isLockedIn(s.layers, obj))
