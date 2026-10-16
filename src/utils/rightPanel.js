// rightPanel.js — the right panel's tab (Properties | Elevations) and the Elevations tab's width.
//
// Presentation state, per browser (localStorage), never the canvas store. The Elevations tab holds the drawing, so the
// panel widens on it (ELEV_W at first, drag its edge, remembered); Properties keeps the normal width. GeneratePanel
// reads the width to stay clear of the panel.

import { create } from 'zustand'

const KEY = 'trace.rightpanel.v1'
export const RP_W = 272, ELEV_W = 480, ELEV_MIN = 360
export const elevMax = () => Math.max(ELEV_MIN, Math.min(900, (typeof window !== 'undefined' ? window.innerWidth : 1600) * 0.6))

const read = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { tab: v?.tab === 'elevations' ? 'elevations' : 'properties', elevW: Number.isFinite(v?.elevW) ? v.elevW : ELEV_W } }
  catch { return { tab: 'properties', elevW: ELEV_W } }
}

/** { tab: 'properties' | 'elevations', elevW } */
export const useRightPanel = create(() => read())
export function setRightPanel(patch) {
  useRightPanel.setState(patch)
  const s = useRightPanel.getState()
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab, elevW: s.elevW })) } catch { /* private window */ }
}
/** The panel's width for that state: the Elevations tab its own, Properties the normal one. */
export const panelWidth = (s) => (s.tab === 'elevations' ? s.elevW : RP_W)
/** The panel's live width, for the panel itself and what keeps clear of it. */
export function useRightPanelWidth() { const s = useRightPanel(); return { width: panelWidth(s), tab: s.tab, elevW: s.elevW } }
