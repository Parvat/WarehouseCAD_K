// viewPrefs.js — small per-browser view preferences the Studio frame and the canvas share (localStorage, never the
// canvas store or the layout).
//   dblClickFit — double-click on empty canvas also fits to content (off by default: a big jump while editing)
//   card        — what the right card shows: 'tabs' (Properties | Elevations) or 'generate'
import { create } from 'zustand'

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
}))

/** The canvas's fit-to-content, registered by Canvas2 so the bottom-right island's Fit can call it. */
export const fitRef = { current: null }
