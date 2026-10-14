// rightPanel.js — the right panel's width.
//
// Presentation state, per browser (localStorage), never the canvas store. While a rack (or bays of one) is selected the
// panel widens for its Elevation section (ELEV_W at first, drag its edge, remembered); otherwise it keeps the normal
// width. GeneratePanel reads the same width to stay clear of the panel.

import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { isBeamRack } from './elevations'

const KEY = 'trace.rightpanel.v1'
export const RP_W = 272, ELEV_W = 480, ELEV_MIN = 360
export const elevMax = () => Math.max(ELEV_MIN, Math.min(900, (typeof window !== 'undefined' ? window.innerWidth : 1600) * 0.6))

const read = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { elevW: Number.isFinite(v?.elevW) ? v.elevW : ELEV_W } }
  catch { return { elevW: ELEV_W } }                                   // (a tab name, as first stored, is not JSON)
}

/** { elevW } */
export const useRightPanel = create(() => read())
export function setRightPanel(patch) {
  useRightPanel.setState(patch)
  try { localStorage.setItem(KEY, JSON.stringify({ elevW: useRightPanel.getState().elevW })) } catch { /* private window */ }
}
/** Whether store state `s` has a beam rack (or bays of one) selected. */
export const rackSelected = (s) => (s.activeBaySelection || []).length > 0 || (s.selectedIds || []).some(id => isBeamRack(s.objects.find(o => o.id === id)))
/** The panel's width: wide (its own, remembered) while a rack is selected, else the normal one. */
export const panelWidth = (rp, wide) => (wide ? rp.elevW : RP_W)
/** The panel's live width, for the panel itself and what keeps clear of it. */
export function useRightPanelWidth() {
  const rp = useRightPanel(), wide = useCanvasStore(rackSelected)
  return { width: panelWidth(rp, wide), wide, elevW: rp.elevW }
}
