// homeTool.js — the tool the app comes back to (STUDIO.md §7): Pan, the tool a plan opens with. Ending any other tool
// — Done, Esc, a bar's ✕, a library item placing, a split — goes back to it, never to Select. With Pan a click selects
// what is under the cursor (a building's blank floor: the building) and a drag pans; Select (V) is the box tool.

import { TOOLS } from '../constants'

export const HOME_TOOL = TOOLS.PAN
/** Is `tool` one of the two plain tools — Pan or Select — the selection works with (the bar, the menus)? */
export const isPlainTool = (tool) => tool === TOOLS.PAN || tool === TOOLS.SELECT
