// selectionActions.js — the object actions the selection bar (src/studio/StudioBars.jsx) moves out of the right card
// and the keyboard (STUDIO.md §6). Each is the SAME call the card, a key or the library already makes — moved, not
// rebuilt: Add / Remove bay are the card's + Bay / − Bay (RackRowPanelCore.jsx), Duplicate is Ctrl+D, Delete the
// Delete key, Lock Ctrl+L, the order and Copy / Cut the card's More → Object / Arrange, Paste Ctrl+V, Add door and
// Add zone the library's own placement (registered by the left panel: setLibraryPick).

import { nanoid } from 'nanoid'
import { useCanvasStore } from '../store/useCanvasStore'
import { addBayUpdate } from '../components/RightPanel/panels/RackRowPanelCore.jsx'
import { deleteBaySelection } from '../utils/baySides'
import { deleteSelectionWithAreas } from '../utils/deleteSelection'
import { pasteAt } from '../utils/pasteAt'
import { useRowGroup, startGroupFromSelection } from '../utils/rowGroupTool'

const store = useCanvasStore

/** + Bay: a bay at the far end, the existing bays where they are drawn — the beam the card's own picker starts on (the
 *  rack's last bay's), or `beamIn`. One undo step. */
export function addBayTo(obj, beamIn = null) {
  const st = store.getState(), beams = obj.beams || [96]
  st.commitObjectUpdate(obj.id, addBayUpdate(obj, beamIn ?? beams[beams.length - 1] ?? 96, st.gridSize || 40))
}
/** − Bay: a pair's bay picked on one side comes off that side only (as the Delete key); else the picked bay, else the
 *  last — an end bay shortens the rack with the other end held, a middle one splits it. One undo step. */
export function removeBayFrom(obj) {
  if (deleteBaySelection(store, nanoid)) return true
  const beams = obj.beams || [96]
  if (beams.length <= 1) return false
  store.getState().deleteSingleBay(obj.id, obj.activeBayIdx != null ? obj.activeBayIdx : beams.length - 1)
  return true
}
/** Rotate: the rotate handle's own write — about the object's centre — in one 90° step. One undo step. */
export function rotateQuarter(obj) {
  const r = ((((obj.rotation || 0) + 90) % 360) + 360) % 360
  store.getState().commitObjectUpdate(obj.id, { rotation: r })
}
/** Duplicate (Ctrl+D): copy, then paste 20 px down-right; the copy is the selection. */
export function duplicateSelection() {
  useRowGroup.setState({ message: null })
  store.getState().copySelected()
  pasteAt(store, 'nudge', nanoid)
}
/** Delete (the Delete key): the selection and each racking area it empties. One undo step. */
export const deleteSelection = () => deleteSelectionWithAreas(store)
/** Paste (Ctrl+V): where the pointer is. */
export const pasteHere = () => pasteAt(store, 'cursor', nanoid)
/** Row group (the selection bar's): the group starts from the selected rows and the Row group tool is on to add more —
 *  the only start that takes the selection (the tool pill's and G start empty). */
export const groupSelectedRows = () => startGroupFromSelection(store)

/* the left panel's library placement (FloatingToolbar's pickItem): an item by its id — Man door, a zone kind */
let libraryPick = null
export const setLibraryPick = (fn) => { libraryPick = fn }
export const pickLibraryItem = (id) => (libraryPick ? libraryPick(id) : false)
