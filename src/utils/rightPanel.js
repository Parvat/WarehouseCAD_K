// rightPanel.js — the right panel's tab (Properties | Elevations).
//
// Presentation state, per browser (localStorage), never the canvas store. The frame is fixed (theme-p2): the left
// panel 240, the right panel RP_W on both tabs — nothing drags it wider. GeneratePanel and the drawing toolbar's
// default spot read the width to stay clear of it.

import { create } from 'zustand'

const KEY = 'trace.rightpanel.v1'
export const RP_W = 320
/** the frame's shared header height: the left panel's Library row and the right panel's tabs */
export const PANEL_HEAD_H = 40

const read = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { tab: v?.tab === 'elevations' ? 'elevations' : 'properties' } }
  catch { return { tab: 'properties' } }
}

/** { tab: 'properties' | 'elevations' } */
export const useRightPanel = create(() => read())
export function setRightPanel(patch) {
  useRightPanel.setState(patch)
  const s = useRightPanel.getState()
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab })) } catch { /* private window */ }
}
/** The panel's width: fixed, the same on both tabs. */
export const panelWidth = () => RP_W
/** The panel's live width and tab, for the panel itself and what keeps clear of it. */
export function useRightPanelWidth() { const s = useRightPanel(); return { width: panelWidth(s), tab: s.tab } }
