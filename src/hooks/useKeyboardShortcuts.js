import { useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { nanoid } from 'nanoid'
import { pasteAt } from '../utils/pasteAt'
import { cancelPlacement } from '../utils/placement'
import { useRowGroup, clearGroup, cancelGroupBox, ROW_GROUP_TOOL } from '../utils/rowGroupTool'
import { FILL_TOOL, cancelFill } from '../utils/fillTool'
import { SPLIT_TOOL, useSplit } from '../utils/splitTool'
import { selectAllIds, keptBySelectAll } from '../utils/layers'
import { deleteSelectionWithAreas } from '../utils/deleteSelection'
import { notify, clearNotice } from '../utils/notice'
import { deleteBaySelection } from '../utils/baySides'
import { toggleMeasure } from '../utils/toolSwitch'
import { isTypingTarget, textOwnsKey } from '../utils/typing'

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
        if (useCanvasStore.getState().activeTool === FILL_TOOL) { useCanvasStore.getState().setActiveTool(TOOLS.SELECT); return }
        // a row being placed (paste, duplicate, left panel): Esc cancels it, nothing else
        if (cancelPlacement()) return
        // the Row group (utils/rowGroupTool.js): Esc leaves the Row group tool, then clears the group (and a pending apply)
        if (useCanvasStore.getState().activeTool === ROW_GROUP_TOOL) { cancelGroupBox(); useCanvasStore.getState().setActiveTool(TOOLS.SELECT); return }
        // the Split tool (utils/splitTool.js), before a cut: Esc leaves it (after a cut the piece is a placement, above)
        if (useCanvasStore.getState().activeTool === SPLIT_TOOL) { useSplit.setState({ hover: null }); useCanvasStore.getState().setActiveTool(TOOLS.SELECT); return }
        // any other tool (Pan, Line, Text, Freehand, a shape …): Esc ends it — back to Select (utils/toolSwitch.js
        // clears what it left behind)
        // (Esc also clears the selection: leaving Pan — the tool a fresh plan opens in — with the building picked must not keep it)
        if (useCanvasStore.getState().activeTool !== TOOLS.SELECT) { useCanvasStore.getState().setActiveTool(TOOLS.SELECT); useCanvasStore.getState().clearSelection(); useCanvasStore.getState().setActiveWall(null); return }
        { const g = useRowGroup.getState()
          if (g.keys.length || g.pending) { clearGroup(); return } }
        useCanvasStore.getState().clearSelection()
        useCanvasStore.getState().setActiveWall(null)
        return
      }

      // ── Delete / Backspace — delete selected ─────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        e.preventDefault()
        const s = useCanvasStore.getState()
        // a pair's bays picked on one side: removed from that side only (utils/baySides.js), one undo step
        if (deleteBaySelection(useCanvasStore, nanoid)) return
        const { selectedIds, objects, activeBaySelection } = s
        /* A cross-row bay marquee (activeBaySelection, canvas2's own
           marquee-mouseup) takes priority over the single-object
           activeBayIdx check below — the same action the multi-bay panel's
           own "Delete selected bays" button calls (deleteSelectedBays),
           so the keyboard and the panel can never disagree about what
           Delete does while a bay selection is active. Previously this
           block never looked at activeBaySelection at all, so Delete fell
           through to deleteSelected() (whole-object) even with a bay
           marquee active — deleting entire rows instead of just the
           picked bays. */
        if (activeBaySelection && activeBaySelection.length > 0) {
          s.deleteSelectedBays()
          /* deleteSelectedBays only clears activeBaySelection, not
             selectedIds — the rack rows a bay marquee added there (BUG
             29) stay selected, which re-satisfies GroupRotateOverlay's
             own selectedObjects.length >= 2 gate now that
             activeBaySelection is empty again, bringing back the
             group-rotate outline/handle around racks nothing asked to
             rotate (BUG 31). Clearing the selection too leaves nothing
             selected after a bay delete, matching MultiBayPanel's own
             "Delete selected bays" button (RackRowPanelCore.jsx), which
             does the same pairing. */
          s.clearSelection()
          return
        }
        if (selectedIds.length === 1) {
          const obj = objects.find(o => o.id === selectedIds[0])
          const BEAM_RACK = new Set(['rack_row','rack_double_row'])
          if (obj && BEAM_RACK.has(obj.type) && obj.beams?.length > 1  && obj.activeBayIdx != null) {
            // Delete active bay if one is selected, else delete last bay
            const bayIdx = obj.activeBayIdx != null ? obj.activeBayIdx : obj.beams.length - 1
            s.deleteSingleBay(obj.id, bayIdx)
            return
          }
        }
        deleteSelectionWithAreas(useCanvasStore)        // with each racking area the delete empties (utils/deleteSelection.js)
        return
      }

      // ── Arrow nudge — move selected 1px (10px with Shift) ────────────────
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && !isInput) {
        e.preventDefault()
        const step = e.shiftKey ? 40 : 4
        const { selectedIds, moveObjects } = useCanvasStore.getState()
        if (!selectedIds.length) return
        const dx = e.key==='ArrowLeft' ? -step : e.key==='ArrowRight' ? step : 0
        const dy = e.key==='ArrowUp'   ? -step : e.key==='ArrowDown'  ? step : 0
        moveObjects(selectedIds, dx, dy)
        return
      }

      if (!ctrl) {
        if (isInput) return
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
          useCanvasStore.getState().toggleLockSelected()
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
          useCanvasStore.getState().cutSelected()
          break
        case 'v':
          e.preventDefault()
          // at the mouse cursor; Ctrl+Shift+V exactly in place (utils/pasteAt.js)
          pasteAt(useCanvasStore, e.shiftKey ? 'inPlace' : 'cursor', nanoid)
          break
        case 'a':
          e.preventDefault()
          {
            // every real layout object that can be picked: no helper (building outline, aisle, racking area),
            // nothing on a hidden or locked layer (utils/layers.js selectAllIds)
            const st = useCanvasStore.getState()
            const ids = selectAllIds(st.objects, st.layers)
            if (ids.length) st.selectGroup(ids)
            else st.clearSelection()
            // what it leaves out on purpose (a locked layer — Generate locks Columns), said in the bar so a
            // Delete that follows doesn't look like it missed them
            const kept = keptBySelectAll(st.objects, st.layers)
            if (kept) notify(kept, 'locked layers — unlock them in Layers to select')
            else clearNotice()
          }
          break
        case 'd': {
          useRowGroup.setState({ message: null })
          e.preventDefault()
          // Duplicate: copy, then paste 20 px down-right; the copy is the selection (utils/pasteAt.js)
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