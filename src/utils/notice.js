// notice.js — a short note in the canvas status bar (canvas2/RowGroupBar.jsx), e.g. what Ctrl+A left out. Presentation
// state: { text, hint, at } or text null. It clears itself after NOTICE_MS (the bar's timer), or on the next notice.

import { create } from 'zustand'

export const NOTICE_MS = 6000
export const useNotice = create(() => ({ text: null, hint: null, at: 0 }))
/** Show `text` (with a muted `hint`) in the bar; null clears it. */
export const notify = (text, hint = null) => useNotice.setState(text ? { text, hint, at: Date.now() } : { text: null, hint: null, at: 0 })
export const clearNotice = () => notify(null)
