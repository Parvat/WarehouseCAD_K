import { useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { nanoid } from 'nanoid'
import { pasteAt } from '../utils/pasteAt'
import { cancelPlacement } from '../utils/placement'
import { useRowGroup, clearGroup, cancelGroupBox, ROW_GROUP_TOOL } from '../utils/rowGroupTool'
import { FILL_TOOL, cancelFill } from '../utils/fillTool'
import { SPLIT_TOOL, useSplit } from '../utils/splitTool'
import { selectAllIds, keptBySelectAll, pickableIn, toggleLock } from '../utils/layers'
import { pickedColumn, clearColumnPick } from '../canvas2/columnPick'
import { deleteSelectionWithAreas } from '../utils/deleteSelection'
import { notify, clearNotice } from '../utils/notice'
import { deleteBaySelection } from '../utils/baySides'
import { toggleMeasure } from '../utils/toolSwitch'
import { isTypingTarget, textOwnsKey } from '../utils/typing'
import { selectionLevel, stepUp } from '../canvas2/selectionLevel'
import { deleteSelection, cutSelection } from '../studio/selectionActions'
import { HOME_TOOL, isPlainTool } from '../utils/homeTool'
import { toggleHelp } from '../studio/HelpCard'
import { nudgeWithSections, duplicateSections } from '../utils/sectionEdit'
import { useCrossAislePick, clearCrossAislePick, pickedCrossAisle } from '../utils/crossAisleTool'
import { CROSS_AISLE_TOOL, cancelCut, deleteCrossAisle } from '../utils/crossAisleCut'

/** The app's keyboard shortcuts, one keydown handler (exported so a test can press keys at it). */
export function shortcutHandler(e) {
      /* typing in a field (an input, a select, a textarea): the key is the field's — Ctrl/Cmd + A C V X Z Y,
         Delete / Backspace, the arrows and the single-letter tools act on the text, never on the canvas (utils/typing.js) */
      const isInput = isTypingTarget(document.activeElement) || isTypingTarget(e.target)
      const ctrl = e.ctrlKey || e.metaKey
      if (textOwnsKey(e)) return


      // ── Escape — deselect, cancel draw ──────────────────────────────────
      if (e.key === 'Escape') {
        useRowGroup.setState({ message: null })   // a shown result ("Applied to 11 rows") is over
        // a fill box being dragged: Esc drops it, nothing placed; with none, Esc leaves the fill tool
        if (cancelFill()) return
        if (useCanvasStore.getState().activeTool === FILL_TOOL) { useCanvasStore.getState().setActiveTool(HOME_TOOL); return }
        // the Cross aisle tool (utils/crossAisleCut.js): a band being dragged — Esc drops it; with none, Esc leaves the tool
        if (cancelCut()) return
        if (useCanvasStore.getState().activeTool === CROSS_AISLE_TOOL) { useCanvasStore.getState().setActiveTool(HOME_TOOL); return }
        // a row being placed (paste, duplicate, left panel): Esc cancels it, nothing else
        if (cancelPlacement()) return
        // picked bays step up to their rows first, everywhere (STUDIO.md §7 — canvas2/selectionLevel.js)
        if (selectionLevel(useCanvasStore.getState()) === 'bays') { stepUp(useCanvasStore); return }
        // a column picked steps up to its grid (canvas2/columnPick.js)
        if (pickedColumn()) { clearColumnPick(); return }
        // a cross-aisle picked: Esc lets it go (utils/crossAisleTool.js)
        if (useCrossAislePick.getState().pick) { clearCrossAislePick(); return }
        // the Row group (utils/rowGroupTool.js): Esc leaves it — the tool, the group, the edit row: nothing selected, no bar
        if (useCanvasStore.getState().activeTool === ROW_GROUP_TOOL) { cancelGroupBox(); clearGroup(); useCanvasStore.getState().setActiveTool(HOME_TOOL); useCanvasStore.getState().clearSelection(); useCanvasStore.getState().setActiveWall(null); return }
        // the Split tool (utils/splitTool.js), before a cut: Esc leaves it (after a cut the piece is a placement, above)
        if (useCanvasStore.getState().activeTool === SPLIT_TOOL) { useSplit.setState({ hover: null }); useCanvasStore.getState().setActiveTool(HOME_TOOL); return }
        // any other tool (Line, Text, Freehand, a shape …): Esc ends it — back to Pan, the home tool (utils/homeTool.js, toolSwitch.js
        // clears what it left behind)
        // (Pan and Select are the plain tools: Esc there only clears the selection — utils/homeTool.js)
        if (!isPlainTool(useCanvasStore.getState().activeTool)) { useCanvasStore.getState().setActiveTool(HOME_TOOL); useCanvasStore.getState().clearSelection(); useCanvasStore.getState().setActiveWall(null); return }
        { const g = useRowGroup.getState()
          if (g.keys.length || g.pending) { clearGroup(); useCanvasStore.getState().clearSelection(); useCanvasStore.getState().setActiveWall(null); return } }
        useCanvasStore.getState().clearSelection()
        useCanvasStore.getState().setActiveWall(null)
        return
      }

      // ── Delete / Backspace — delete selected ─────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        e.preventDefault()
        // a cross-aisle picked, nothing selected: Delete rejoins its rows (utils/crossAisleCut.js, xaisle-tool)
        { const st = useCanvasStore.getState(), c = !st.selectedIds.length && useCrossAislePick.getState().pick ? pickedCrossAisle(st.objects) : null
          if (c) { deleteCrossAisle(useCanvasStore, c); return } }
        // one Delete for the key and the bars (studio/selectionActions.js deleteSelection): bays picked — only those
        // bays, the rows stay; rows — the rows
        deleteSelection()
        return
      }

      // ── Arrow nudge — move selected 1px (10px with Shift) ────────────────
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && !isInput) {
        e.preventDefault()
        const step = e.shiftKey ? 40 : 4
        // nothing on a locked layer (or itself locked) moves — a locked column is clicked, never moved
        const { objects, layers, moveObjects } = useCanvasStore.getState(), ok = pickableIn(layers)
        const selectedIds = useCanvasStore.getState().selectedIds.filter(id => ok(objects.find(o => o.id === id)))
        if (!selectedIds.length) return
        const dx = e.key==='ArrowLeft' ? -step : e.key==='ArrowRight' ? step : 0
        const dy = e.key==='ArrowUp'   ? -step : e.key==='ArrowDown'  ? step : 0
        // a section takes its racks, stopped at the walls and its neighbours (utils/sectionEdit.js)
        const n = nudgeWithSections(objects, selectedIds, dx, dy, useCanvasStore.getState().gridSize || 40)
        if (n.dx || n.dy) moveObjects(n.ids.filter(id => ok(objects.find(o => o.id === id))), n.dx, n.dy)
        return
      }

      if (!ctrl) {
        if (isInput) return
        // ? — the shortcut sheet (studio/HelpCard.jsx); Esc closes it
        if (e.key === '?') { toggleHelp(); return }
        // ── Tool shortcuts ─────────────────────────────────────────────────
        // Studio (STUDIO.md §5): F Fill racking, G Row group, S Split, M Measure — shown in the tool pill's hints.
        // M was Multi-select, a tool only the retired SVG engine had.
        if (e.key.toLowerCase() === 'm') { toggleMeasure(useCanvasStore); return }
        const toolMap = {
          'v': TOOLS.SELECT,
          'f': FILL_TOOL,
          'g': ROW_GROUP_TOOL,
          's': SPLIT_TOOL,
          'p': TOOLS.PAN,
          'l': TOOLS.LINE,
          'a': TOOLS.ARC,
          'c': TOOLS.CIRCLE,
          'r': TOOLS.RECT,
          't': TOOLS.TEXT,
        }
        const tool = toolMap[e.key.toLowerCase()]
        if (tool) { useCanvasStore.getState().setActiveTool(tool); return }
        return
      }

      // ── Ctrl shortcuts ────────────────────────────────────────────────────
      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault()
          if (e.shiftKey) useCanvasStore.getState().saveAsFile()
          else            useCanvasStore.getState().saveToFile()
          break
        case 'o':
          e.preventDefault()
          useCanvasStore.getState().loadFromFile()
          break
        case 'l':
          e.preventDefault()
          toggleLock(useCanvasStore)
          break
        case 'z':
          e.preventDefault()
          if (e.shiftKey) useCanvasStore.getState().redo()
          else            useCanvasStore.getState().undo()
          break
        case 'y':
          e.preventDefault()
          useCanvasStore.getState().redo()
          break
        case 'c':
          e.preventDefault()
          useCanvasStore.getState().copySelected()
          break
        case 'x':
          e.preventDefault()
          // a cut deletes: never a locked object or a locked layer's (studio/selectionActions.js cutSelection)
          cutSelection()
          break
        case 'v':
          e.preventDefault()
          // at the mouse cursor; Ctrl+Shift+V exactly in place (utils/pasteAt.js)
          pasteAt(useCanvasStore, e.shiftKey ? 'inPlace' : 'cursor', nanoid)
          break
        case 'a':
          e.preventDefault()
          {
            // everything, the building included: only layers the user locked by hand are skipped (with hidden layers and
            // objects locked one by one — utils/layers.js selectAllIds)
            const st = useCanvasStore.getState()
            const ids = selectAllIds(st.objects, st.layers)
            if (ids.length) st.selectGroup(ids)
            else st.clearSelection()
            // what it leaves out on purpose (a layer locked by hand), said in the bar so a
            // Delete that follows doesn't look like it missed them
            const kept = keptBySelectAll(st.objects, st.layers)
            if (kept) notify(kept, 'locked layers — unlock them in Layers to select')
            else clearNotice()
          }
          break
        case 'd': {
          useRowGroup.setState({ message: null })
          e.preventDefault()
          // Duplicate: copy, then paste 20 px down-right; the copy is the selection (utils/pasteAt.js) — sections go
          // beside themselves instead, never over a neighbour (utils/sectionEdit.js)
          { const st = useCanvasStore.getState()
            if (st.selectedIds.length && st.selectedIds.every(id => st.objects.find(o => o.id === id)?.type === 'section_area')) { duplicateSections(useCanvasStore); break } }
          useCanvasStore.getState().copySelected()
          pasteAt(useCanvasStore, 'nudge', nanoid)
          break
        }
        case 'g':
          e.preventDefault()
          if (e.shiftKey) useCanvasStore.getState().ungroupSelected()
          else            useCanvasStore.getState().groupSelected()
          break
        default:
          break
      }
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    window.addEventListener('keydown', shortcutHandler)
    return () => window.removeEventListener('keydown', shortcutHandler)
  }, [])
}
