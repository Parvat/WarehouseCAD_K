// rightPanel.js — the right panel's tab (Properties | Elevations) and each tab's width.
//
// Presentation state, per browser (localStorage), never the canvas store or the layout. Drag the panel's canvas-side
// edge to resize it (RP_MIN–RP_MAX); each tab remembers its own width (Properties RP_W to start, Elevations
// ELEV_W); a double-click on the edge puts the shown tab back to its default. GeneratePanel and the drawing toolbar's
// docked spot read the live width to stay clear of it.

import { create } from 'zustand'

const KEY = 'trace.rightpanel.v1'
export const RP_W = 320, ELEV_W = 440, RP_MIN = 300, RP_MAX = 560
/** the frame's shared header height: the left panel's Library row and the right panel's tabs */
export const PANEL_HEAD_H = 40

export const clampPanelW = (w, fallback = RP_W) => (Number.isFinite(w) ? Math.round(Math.min(RP_MAX, Math.max(RP_MIN, w))) : fallback)
export const defaultWidth = (tab) => (tab === 'elevations' ? ELEV_W : RP_W)

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { tab: v?.tab === 'elevations' ? 'elevations' : 'properties', propsW: clampPanelW(v?.propsW, RP_W), elevW: clampPanelW(v?.elevW, ELEV_W) }
  } catch { return { tab: 'properties', propsW: RP_W, elevW: ELEV_W } }
}

/** { tab: 'properties' | 'elevations', propsW, elevW } */
export const useRightPanel = create(() => read())
const save = () => {
  const s = useRightPanel.getState()
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab, propsW: s.propsW, elevW: s.elevW })) } catch { /* private window */ }
}
export function setRightPanel(patch) { useRightPanel.setState(patch); save() }
/** the shown tab's width, clamped; `persist: false` while a drag is live (written once on release) */
export function setPanelWidth(w, { persist = true } = {}) {
  const s = useRightPanel.getState(), k = s.tab === 'elevations' ? 'elevW' : 'propsW'
  useRightPanel.setState({ [k]: clampPanelW(w, defaultWidth(s.tab)) })
  if (persist) save()
}
/** the shown tab back to its default width */
export const resetPanelWidth = () => setPanelWidth(defaultWidth(useRightPanel.getState().tab))
/** The panel's width for that state: each tab its own. */
export const panelWidth = (s) => (s.tab === 'elevations' ? clampPanelW(s.elevW, ELEV_W) : clampPanelW(s.propsW, RP_W))
/** The panel's live width and tab, for the panel itself and what keeps clear of it. */
export function useRightPanelWidth() { const s = useRightPanel(); return { width: panelWidth(s), tab: s.tab } }
