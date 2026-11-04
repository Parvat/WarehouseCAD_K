// notice.js — a short note in the canvas status bar (canvas2/RowGroupBar.jsx), e.g. what Ctrl+A left out. Presentation
// state: { text, hint, at } or text null. It clears itself after NOTICE_MS (the bar's timer), or on the next notice.

import { create } from 'zustand'

// how long a notice stays (STUDIO.md §7): plain info 5 s, one with Undo 8 s; hover pauses it; a question stays until answered
export const NOTICE_MS = 5000
export const NOTICE_UNDO_MS = 8000
export const useNotice = create(() => ({ text: null, hint: null, at: 0, undo: false, action: null }))
/** Show `text` (with a muted `hint`) in the bar; null clears it. `undo`: what it reports is the step just made — the
 *  notice offers Undo. */
/*  `action`: { label, run } — one button the notice offers ("Fill new space"). */
export const notify = (text, hint = null, { undo = false, action = null } = {}) => useNotice.setState(text ? { text, hint, at: Date.now(), undo: !!undo, action } : { text: null, hint: null, at: 0, undo: false, action: null })
export const clearNotice = () => notify(null)
