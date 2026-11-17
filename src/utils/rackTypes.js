// rackTypes.js — the one place that says what each rack type IS (R1, docs/EPICS.md): its family, how many faces it
// picks from, how it stores (FIFO / LIFO), and its name in each place the app shows one. Every file that used to keep
// its own list (31 copies of "the beam racks", four name tables) reads it from here. Adding a type (R2–R5) = one entry
// here plus its library entry in constants/warehouseObjects.js.
//
// Families:
//   beam      selective racking with bays and beam levels — the only family Fill, Generate, elevations, BOM and Tally
//             handle today (rack_row: single; rack_double_row: back-to-back pair, two faces)
//   lane      pallets stored deep in lanes (drive-in, drive-through, push-back, pallet flow)
//   arm       cantilever (towers and arms, not pallet positions)
//   shelf     hand-picked shelving
//   platform  mezzanine
//
// Names (kept exactly as the app showed them before the registry — R1 changes no text):
//   card      the Properties card caption (studio/cards.jsx, RightPanel/PropertiesPanel.jsx)
//   check     Check layout's words for the rack (utils/layoutCheck.js)
//   generate  the generator's object name (generate/traceGenerate.js)
// R2 renames rack_double_row's card name ("Double deep" is wrong for a back-to-back pair).

export const RACK_TYPES = {
  rack_row:           { family: 'beam',     faces: 1, card: 'Selective',     check: 'Single row',         generate: 'Rack Row' },
  rack_double_row:    { family: 'beam',     faces: 2, card: 'Double deep',   check: 'Double row',         generate: 'Double Row' },
  rack_drive_in:      { family: 'lane',     flow: 'LIFO', card: 'Drive-in',      check: 'Drive-in rack',      generate: 'Drive-In Rack' },
  rack_drive_through: { family: 'lane',     flow: 'FIFO', card: 'Drive-through', check: 'Drive-through rack', generate: 'Drive-Through Rack' },
  rack_pushback:      { family: 'lane',     flow: 'LIFO', card: 'Pushback',      check: 'Pushback rack',      generate: 'Push-Back Rack' },
  rack_pallet_flow:   { family: 'lane',     flow: 'FIFO', card: 'Pallet flow',   check: 'Pallet flow rack',   generate: 'Pallet-Flow Rack' },
  rack_cantilever:    { family: 'arm',      card: 'Cantilever',    check: 'Cantilever rack' },
  // (no card name yet: the card shows their bare type, and the nothing-selected rack count leaves them out — as before)
  rack_mezzanine:     { family: 'platform', check: 'Mezzanine' },
  rack_shelving:      { family: 'shelf',    check: 'Shelving unit' },
}

const ofFamily = (f) => new Set(Object.keys(RACK_TYPES).filter(t => RACK_TYPES[t].family === f))

/** the beam racks: bays, beam levels, a rack line — selective single rows and back-to-back pairs */
export const BEAM_TYPES = ofFamily('beam')
/** the lane racks: pallets stored deep in lanes */
export const LANE_TYPES = ofFamily('lane')

export const rackType = (type) => RACK_TYPES[type] || null
export const isBeamType = (type) => BEAM_TYPES.has(type)
export const isLaneType = (type) => LANE_TYPES.has(type)
/** how the lane rack stores — 'FIFO' or 'LIFO' (null for the rest) */
export const flowOf = (type) => RACK_TYPES[type]?.flow || null
/** a name table for one place ('card', 'check', 'generate'): { type → name }, only the types that have one there */
export const namesFor = (where) => Object.fromEntries(Object.entries(RACK_TYPES).filter(([, d]) => d[where]).map(([t, d]) => [t, d[where]]))
