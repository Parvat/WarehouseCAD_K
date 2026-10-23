// viewPrefs.js — small per-browser view preferences the Studio frame and the canvas share (localStorage, never the
// canvas store or the layout).
//   dblClickFit — double-click on empty canvas also fits to content (off by default: a big jump while editing)
//   card        — what the right card shows: 'tabs' (Properties | Elevations) or 'generate'
//   rulesOpen   — the Rules profiles dialog (the layout menu opens it; so does the Generate card's note)
import { create } from 'zustand'
import { setRightPanel } from '../utils/rightPanel'

const DBLCLICK_FIT_KEY = 'trace.canvas2.dblClickFit'
const readFit = () => { try { return localStorage.getItem(DBLCLICK_FIT_KEY) === '1' } catch { return false } }

export const useViewPrefs = create((set, get) => ({
  dblClickFit: readFit(),
  toggleDblClickFit: () => {
    const next = !get().dblClickFit
    try { localStorage.setItem(DBLCLICK_FIT_KEY, next ? '1' : '0') } catch { /* private window */ }
    set({ dblClickFit: next })
  },
  card: 'tabs',
  setCard: (card) => set({ card }),
  rulesOpen: false,
  setRulesOpen: (rulesOpen) => set({ rulesOpen }),
}))

/** An object picked on the plan by the user (a click on it, or on a building's wall): the Generate card, if it is
 *  showing, closes — its unsaved Forklift / Wall clearance go with it, as on Cancel — and the card shows Properties for
 *  what was picked. */
export function pickedOnPlan() {
  if (useViewPrefs.getState().card !== 'generate') return
  useViewPrefs.getState().setCard('tabs')
  setRightPanel({ tab: 'properties' })
}

/** The canvas's fit-to-content, registered by Canvas2 so the bottom-right island's Fit can call it. */
export const fitRef = { current: null }
