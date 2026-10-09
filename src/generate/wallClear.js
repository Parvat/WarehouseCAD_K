// generate/wallClear.js — THE wall clearance (BUG 76): inches from a wall's INNER face to the back of a
// single row flush on it, one setting for Generate and Fill racking alike (the shared Racking settings,
// utils/fillTool.js: the Generate panel's "Wall clearance" field and the Fill racking options bar both edit
// it). Default 3"; 0 is allowed (flush). It sets the walls along the rows only — the run ends stay as they
// were in both tools. Imports nothing.
//
// Before BUG 76 the Generate field measured from the building's OUTLINE (6" on a 3" wall = 3" from the inner
// face) and Fill racking sat flush (0"), whatever its own settings said. A value stored the old way is read
// as the old value less the wall's thickness, never below 0, so a layout comes out where it was.

/** The default wall clearance: inches from the wall's inner face. */
export const WALL_CLEAR_IN = 3
/** The wall a building has unless told otherwise (the floor plan's default, 0.25 ft). */
export const DEFAULT_WALL_THICKNESS_IN = 3

/** An old wall clearance (inches from the building's outline) as inches from the wall's inner face. */
export const clearFromOutline = (oldIn, wallThicknessIn = DEFAULT_WALL_THICKNESS_IN) => Math.max(0, oldIn - wallThicknessIn)

/** The wall clearance (inner face, inches) a settings object asks for: its own `wallClearIn`; else an old
 *  `wallClearanceIn` (from the outline), converted; else `fallback`. */
export function wallClearOf(settings, { wallThicknessIn = DEFAULT_WALL_THICKNESS_IN, fallback = WALL_CLEAR_IN } = {}) {
  if (Number.isFinite(settings?.wallClearIn)) return Math.max(0, settings.wallClearIn)
  if (Number.isFinite(settings?.wallClearanceIn)) return clearFromOutline(settings.wallClearanceIn, wallThicknessIn)
  return fallback
}
