import { create } from 'zustand'
import { C, MONO } from './cardParts'

/* The shortcut sheet (STUDIO.md §1 bottom-right, §7a): every mouse and key action of 7a, grouped — Select, Bays,
   Row group, Tools, Keys. Opened by the bottom-right island's ? and the ? key; Esc or a click outside closes it.
   Presentation state only, never the canvas store. */
export const useHelp = create(() => ({ open: false }))
export const toggleHelp = () => useHelp.setState(s => ({ open: !s.open }))
export const closeHelp = () => { if (useHelp.getState().open) useHelp.setState({ open: false }) }

export const HELP = [
  { title: 'Select', rows: [
    ['Click', 'Selects what is under the cursor — a rack selects its row'],
    ['Shift+click', 'Adds or removes rows (zones, doors and text too)'],
    ['Drag an object', 'Moves it, past 6 px; under that it is a click'],
    ['Drag the floor', 'Pan: pans · Select (V): a box selects rows; Shift+drag adds'],
    ['Click the floor', 'Inside the building: the building · outside: clears'],
    ['Wall', 'Click selects the building; drag moves it with its contents'],
    ['Building handles', 'Resize the building (8 px hit area)'],
    ['Click a column', 'That column; again or Esc: the whole grid'],
    ['Drag a column', 'Columns layer unlocked: sideways moves its vertical line, up or down its horizontal line'],
    ['Right-click', 'An object: its menu · the floor: Paste, Fill racking, Add zone'],
  ] },
  { title: 'Bays', rows: [
    ['Click a selected row', 'Selects that bay; again: back to its row'],
    ['Shift+click', 'Adds or removes bays, in any row'],
    ['Shift+drag along a row', 'Adds the run of bays it crosses'],
    ['Drag', 'Moves the rows of the selected bays'],
    ['Esc', 'Back up to the rows'],
    ['Delete', 'Deletes those bays; the only bay of a rack deletes the row'],
  ] },
  { title: 'Row group', rows: [
    ['G, or Row group in the bar', 'Starts the group (the bar’s from the selection)'],
    ['Click a row', 'Adds it to the group'],
    ['Click a group row', 'Picks the bay under it — its edit applies to the others'],
    ['Shift+click a group row', 'Removes it'],
    ['Drag on empty floor', 'Adds every row in the box'],
    ['Drag a handle', 'Edits that row and applies to the others'],
    ['Drag a group row', 'Moves the whole group'],
    ['Done, Esc or ✕', 'Ends the mode'],
  ] },
  { title: 'Tools', rows: [
    ['V', 'Select'], ['P', 'Pan'], ['F', 'Fill racking — one fill, then Pan'], ['G', 'Row group'], ['S', 'Split'],
    ['M', 'Measure'], ['L', 'Line'], ['T', 'Text'], ['Space+drag, middle-drag', 'Pans in any tool'],
  ] },
  { title: 'Keys', rows: [
    ['Ctrl+A', 'Selects everything; Delete then clears all'], ['Delete', 'Deletes the selection'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy / Cut / Paste at the pointer'],
    ['Ctrl+D', 'Duplicate'], ['Ctrl+L', 'Lock / Unlock'], ['Arrows', 'Nudge (Shift: further)'],
    ['Esc', 'Steps up, ends a tool, closes a card'], ['?', 'This list'],
  ] },
]

/** The sheet's body (the island card, StudioFrame BottomRight). */
export function HelpBody() {
  return (
    <div role="dialog" aria-label="Shortcuts" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', overflowY: 'auto', minHeight: 0 }}>
      {HELP.map(g => (
        <section key={g.title} aria-label={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted }}>{g.title}</div>
          {g.rows.map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, fontSize: 12, lineHeight: 1.4 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.strong }}>{k}</span>
              <span style={{ color: C.text }}>{v}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
