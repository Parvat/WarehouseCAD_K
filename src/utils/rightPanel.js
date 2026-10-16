// rightPanel.js — the right panel's width (presentation).
//
// The panel keeps its normal width: a rack's elevation is set in Elevation mode (utils/elevMode.js), not in
// Properties, so nothing widens it any more. GeneratePanel reads the width to stay clear of the panel.

export const RP_W = 272
/** The panel's width, for the panel itself and what keeps clear of it. */
export function useRightPanelWidth() { return { width: RP_W } }
