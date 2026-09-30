// rackLevels.js — every beam rack has a number of levels.
//
// Capacity (utils/capacity.js), the column check (generate/columnCheck.js)
// and the rack panel all read `levels || 1`, so a rack with no `levels` value
// counted as ONE level. Generated racks carry 4 (sizingLayout's default); racks
// placed by hand from the left panel, and racks in layouts saved before this,
// carried none. New racks are stamped with DEFAULT_LEVELS where they are placed,
// and the keeper below fills it in on any rack still missing it — a loaded
// layout, an old autosave, anything created some other way. A rack that has a
// levels value keeps it (a pasted or duplicated rack keeps its source's).

export const DEFAULT_LEVELS = 4              // the same as a generated rack
export const LEVEL_TYPES = new Set(['rack_row', 'rack_double_row'])

const hasLevels = (o) => Number.isFinite(o.levels) && o.levels > 0

/** Does `o` need a levels value? */
export const missingLevels = (o) => !!o && LEVEL_TYPES.has(o.type) && !hasLevels(o)

/** `objects` with DEFAULT_LEVELS on every rack missing a levels value — the
 *  same array when nothing is missing. */
export function fillLevels(objects) {
  if (!Array.isArray(objects) || !objects.some(missingLevels)) return objects
  return objects.map(o => missingLevels(o) ? { ...o, levels: DEFAULT_LEVELS } : o)
}

/** The fields a newly placed object of `type` starts with for its levels. */
export const levelsFor = (type) => LEVEL_TYPES.has(type) ? { levels: DEFAULT_LEVELS } : {}

/** Fills DEFAULT_LEVELS on any rack in the store still missing it: on start,
 *  after a load, after anything that adds one without it. */
export function installLevelsKeeper(store) {
  let busy = false
  const fix = () => {
    if (busy) return
    const objects = store.getState().objects
    const next = fillLevels(objects)
    if (next === objects) return
    busy = true
    try { store.setState({ objects: next }) } finally { busy = false }
  }
  fix()
  return store.subscribe(fix)
}
