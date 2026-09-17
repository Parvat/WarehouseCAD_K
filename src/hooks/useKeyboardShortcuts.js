import { useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      const ctrl = e.ctrlKey || e.metaKey

      // ── Escape — deselect, cancel draw ──────────────────────────────────
      if (e.key === 'Escape') {
        useCanvasStore.getState().clearSelection()
        useCanvasStore.getState().setActiveWall(null)
        return
      }

      // ── Delete / Backspace — delete selected ─────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        e.preventDefault()
        const s = useCanvasStore.getState()
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
        s.deleteSelected()
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
        const toolMap = {
          'v': TOOLS.SELECT,
          'm': TOOLS.MULTI_SELECT,
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
          useCanvasStore.getState().paste()
          break
        case 'a':
          e.preventDefault()
          useCanvasStore.getState().selectAll()
          break
        case 'd': {
          e.preventDefault()
          const store = useCanvasStore.getState()
          store.copySelected()
          store.paste()
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

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}