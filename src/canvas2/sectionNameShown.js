// sectionNameShown.js — whose name tab is on the plan (STUDIO.md §7a Sections): every section's while the bottom-right
// island's Sections is on (studio/viewPrefs.js sectionNames, off by default); otherwise a section's own while it is
// hovered (on the plan, or its row in the card's Sections list) or selected. SectionNames.jsx works it out as it draws
// and publishes the ids here; only a name that shows can be clicked (canvas2/hitTest.js) — a hidden tab is floor.
// No imports beyond zustand: the hit test is pure and runs without the canvas.

import { create } from 'zustand'

/** Is section `id`'s name shown, given the toggle, the selection and the hover? */
export const nameShownBy = ({ on, selectedIds, hoverIds, listHover }, id) => !!on || (selectedIds || []).includes(id) || (hoverIds || []).includes(id) || listHover === id

/** The sections whose name is drawn now (SectionNames.jsx keeps it). */
export const useShownNames = create(() => ({ ids: [] }))
/** Is section `id`'s name on the plan now? */
export const nameShown = (id) => useShownNames.getState().ids.includes(id)
