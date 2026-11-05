// selectionActions.js — the object actions the selection bar (src/studio/StudioBars.jsx) moves out of the right card
// and the keyboard (STUDIO.md §6). Each is the SAME call the card, a key or the library already makes — moved, not
// rebuilt: Add / Remove bay are the card's + Bay / − Bay (RackRowPanelCore.jsx), Duplicate is Ctrl+D, Delete the
// Delete key, Lock Ctrl+L, the order and Copy / Cut the card's More → Object / Arrange, Paste Ctrl+V, Add door and
// Add zone the library's own placement (registered by the left panel: setLibraryPick).

import { nanoid } from 'nanoid'
import { useCanvasStore } from '../store/useCanvasStore'
import { addBayUpdate } from '../components/RightPanel/panels/RackRowPanelCore.jsx'
import { deleteBaySelection } from '../utils/baySides'
import { deleteSelectionWithAreas, deletableIn } from '../utils/deleteSelection'
import { pasteAt } from '../utils/pasteAt'
import { useRowGroup, startGroupFromSelection } from '../utils/rowGroupTool'
import { selectionLevel, pickedBays } from '../canvas2/selectionLevel'
import { sectionIds } from '../canvas2/sections'
import { notify } from '../utils/notice'
import { pickableIn } from '../utils/layers'
import { pickedColumn } from '../canvas2/columnPick'

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
/** Delete (the Delete key, and the bars' Delete): bays picked delete only those bays — a pair's bay picked on one side
 *  comes off that side only (utils/baySides.js), the rows stay; rows selected delete the rows, with each racking
 *  area that empties. One undo step. */
export function deleteSelection() {
  // a locked rack's bays are not deleted either (STUDIO.md §7a Locks)
  { const s0 = store.getState(), ok = pickableIn(s0.layers), owners = [...new Set((s0.activeBaySelection || []).map(e => e.objId))]
    if (owners.length && !owners.some(id => ok(s0.objects.find(o => o.id === id)))) { notify('Locked', 'unlock it to delete'); return } }
  if (deleteBaySelection(store, nanoid)) return
  const s = store.getState()
  /* a column picked out of its grid (canvas2/columnPick.js): one column is not deleted on its own — Esc, then Delete,
     deletes the grid; a locked layer's (or locked) objects are never deleted, only clicked */
  if (pickedColumn(s)) { notify('A column stays with its grid', 'Esc, then Delete, deletes the column grid'); return }
  const ok = deletableIn(s)                                    // clear all (Ctrl+A) takes what Generate locked too
  if (s.selectedIds.length && !s.selectedIds.some(id => ok(s.objects.find(o => o.id === id)))) { notify('Locked', 'unlock it to delete'); return }
  // a locked object clicked into the selection stays: only the rest is deleted
  if (s.selectedIds.some(id => !ok(s.objects.find(o => o.id === id)))) s.selectGroup(s.selectedIds.filter(id => ok(s.objects.find(o => o.id === id))))
  if (s.activeBaySelection?.length) { s.deleteSelectedBays(); s.clearSelection(); return }
  if (s.selectedIds.length === 1) {
    const obj = s.objects.find(o => o.id === s.selectedIds[0])
    if (obj && (obj.type === 'rack_row' || obj.type === 'rack_double_row') && obj.beams?.length > 1 && obj.activeBayIdx != null) { s.deleteSingleBay(obj.id, obj.activeBayIdx); return }
  }
  if (selectionLevel(s) === 'bays') {
    /* The only bay of a rack: that rack goes. A piece of a longer section (a pair's other side, left by a one-side
       delete): the section stays, split where both facing bays are now gone (canvas2/sections.js). A whole row (its
       only bay): the row is deleted — one undo step, and the notice offers Undo (STUDIO.md §7). */
    const one = pickedBays(s), r = one.length === 1 && s.objects.find(o => o.id === one[0].objId)
    if (r && r.beams?.length === 1) {
      const piece = sectionIds(s.objects, r.id, s.gridSize || 40).length > 1
      s.selectGroup([r.id]); s.clearBaySelection(); deleteSelectionWithAreas(store)
      if (!piece) notify('Row deleted', 'its only bay', { undo: true })
    }
    return
  }
  deleteSelectionWithAreas(store)
}
/** Cut (Ctrl+X, the menu's Cut): a cut deletes, so never a locked object (or a locked layer's — a column clicked on
 *  the locked Columns layer): only the rest of the selection is cut; nothing else, nothing cut. */
export function cutSelection() {
  const s = store.getState(), ok = pickableIn(s.layers)
  const ids = s.selectedIds.filter(id => ok(s.objects.find(o => o.id === id)))
  if (!ids.length) { if (s.selectedIds.length) notify('Locked', 'unlock it to cut'); return }
  if (ids.length !== s.selectedIds.length) s.selectGroup(ids)
  store.getState().cutSelected()
}
/** Paste (Ctrl+V): where the pointer is. */
export const pasteHere = () => pasteAt(store, 'cursor', nanoid)
/** Row group (the selection bar's): the group starts from the selected rows and the Row group tool is on to add more —
 *  the only start that takes the selection (the tool pill's and G start empty). */
export const groupSelectedRows = () => startGroupFromSelection(store)

/* the left panel's library placement (FloatingToolbar's pickItem): an item by its id — Man door, a zone kind */
let libraryPick = null
export const setLibraryPick = (fn) => { libraryPick = fn }
export const pickLibraryItem = (id) => (libraryPick ? libraryPick(id) : false)
