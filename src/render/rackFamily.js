// rackFamily.js — (rack-design) how a rack looks on the plan: one line colour per family, no fill
// (design/rack-plan-colour.png). The family groups the rack types the way a dealer does, by how pallets move:
//
//   pallet  selective, back-to-back, double-deep   — beam racks, every pallet picked from the aisle
//   lane    drive-in, drive-through                — pallets stored deep in lanes a truck drives into
//   flow    push-back, pallet flow                 — pallets moved along the lane by carts or rollers
//   other   cantilever, shelving
//   mezz    mezzanine                              — a raised floor, not a rack
//
// `line` draws the rack: its outline, frames, posts, face bars, arrows and face words. `tint` draws the pallet slots
// (dashed). `icon` is the library's glyph colour on the dark flyout (studio/RackLibrary.jsx).
// Literal colours by design (CLAUDE.md: canvas object colours are never themed). Pure: no React, no store.

export const RACK_FAMILIES = {
  pallet: { line: '#2B3A67', tint: '#8C95B5', icon: '#8FA0D8' },
  lane:   { line: '#1C7A52', tint: '#86B8A0', icon: '#5BC193' },
  flow:   { line: '#B26A12', tint: '#D9AE78', icon: '#E3A456' },
  other:  { line: '#6A4C93', tint: '#B1A0C8', icon: '#B79BE0' },
  mezz:   { line: '#5A5F5B', tint: '#A9AFAA', icon: '#A9AFAA' },
}

const FAMILY_OF_TYPE = {
  rack_row: 'pallet', rack_double_row: 'pallet',
  rack_drive_in: 'lane', rack_drive_through: 'lane',
  rack_pushback: 'flow', rack_pallet_flow: 'flow',
  rack_cantilever: 'other', rack_shelving: 'other',
  rack_mezzanine: 'mezz',
}

/** A rack type's family ('pallet' · 'lane' · 'flow' · 'other' · 'mezz'), or null for a type that is not a rack. */
export const rackFamilyOf = (type) => FAMILY_OF_TYPE[type] || null
/** A rack type's colours { line, tint, icon }, or null. */
export const rackColors = (type) => RACK_FAMILIES[FAMILY_OF_TYPE[type]] || null

/** A selected rack: a 2 px outline 4 px outside it, and square white handles edged in this blue at its corners. Never a
 *  family colour, so a selected rack keeps its own lines and still reads as selected. */
export const RACK_SELECT = '#2F6FD6'
export const RACK_SELECT_GAP_PX = 4, RACK_SELECT_PX = 2, RACK_HANDLE_PX = 7

/** The rack numbers (R1, R2 …) beside each line. */
export const RACK_NUMBER = '#55605A'
