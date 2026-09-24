// defaults.js
// ─────────────────────────────────────────────────────────────────────────────
// The shipped Trace default profile — layer one of the cascade.
//
//   Trace default  →  dealer profile  →  customer override
//
// These are the COMMON set, not an exhaustive catalogue. Every list here is
// meant to be extended by a dealer for their own inventory rather than
// predicted up front, so the form appends to these rather than replacing the
// concept of them.
// ─────────────────────────────────────────────────────────────────────────────

/* travelFt: the truck's physical drive-through minimum (not pick) — used
   both when the placement walk (GENERATOR_SPEC_V10.md) has to absorb a
   too-close column into the aisle, and as the true-block floor in
   checkColumns's 3-level accessibility test (BUG 39). Default 8ft, capped
   at the truck's own aisleFt for narrow-aisle trucks — a truck can never
   need MORE room to drive through than it needs to work in, so VNA's 6ft
   aisle (narrower than the 8ft default) caps its own travelFt at 6, not 8.
   Computed from aisleFt rather than hand-copied so the two can't drift out
   of the min() relation if aisleFt is ever retuned. */
const TRAVEL_FT_DEFAULT = 8
const travelFtFor = (aisleFt) => Math.min(TRAVEL_FT_DEFAULT, aisleFt)

export const DEFAULT_RULES = {
  // GMA pallet: 40" loading face (across the beam) x 48" deep (into the
  // frame) — the industry-standard selective-rack stance, not a choice.
  pallet: { wIn: 40, dIn: 48 },

  selective: {
    frameWidthsIn:     [3, 4],
    frameDepthsIn:     [36, 42, 48],
    beamLengthsIn:     [96, 144],
    beamFaceHeightsIn: [4, 5, 6],
    flueIn:            9,
    wallClearanceIn:   6,
  },

  cantilever: {
    towerSpacingIn: 48, towerWidthIn: 10, spineDepthIn: 4,
    armThicknessIn: 3,  armLengthsIn: [36, 48, 52, 60, 72],
    sided: ['single', 'double'],
  },

  driveIn:      { lanes: [2, 4], depth: [1, 10], uprightWidthIn: 4, pallet: { wIn: 40, dIn: 48 }, access: 'lifo' },
  driveThrough: { lanes: [2, 4], depth: [1, 8],  uprightWidthIn: 4, pallet: { wIn: 40, dIn: 48 }, access: 'fifo' },
  pushback:     { lanes: [2, 3], depth: [2, 5],  uprightWidthIn: 3, pallet: { wIn: 40, dIn: 48 }, access: 'lifo', inclineDeg: 4 },
  palletFlow:   { lanes: [2, 4], depth: [2, 20], uprightWidthIn: 3, pallet: { wIn: 40, dIn: 48 }, access: 'fifo' },

  /* crossAisleFt (BUG 54): the truck's own width for the perpendicular
     through-aisle that splits a run in two — a SEPARATE dimension from
     aisleFt (the pick aisle between rack faces), not reused from it.
     Reach/narrow-aisle trucks need less room to just drive straight
     through than counterbalance trucks do to turn/maneuver: ~8-10ft for
     reach/VNA, ~12-14ft for counterbalance. */
  mhe: {
    reach:          { aisleFt: 10.5, minAisleFt: 10.0, travelFt: travelFtFor(10.5), crossAisleFt: 9 },
    vna:            { aisleFt: 6.0,  minAisleFt: 5.5,  travelFt: travelFtFor(6.0),  crossAisleFt: 8.5 },
    counterbalance: { aisleFt: 12.5, minAisleFt: 12.0, travelFt: travelFtFor(12.5), crossAisleFt: 13 },
  },

  clearances: { esfrBelowDeflectorIn: 18, locked: true },
}

/* Labels for the MHE keys. Kept beside the rules rather than inside them so a
   dealer adding a truck supplies a name without the merge having to reason
   about display strings. */
export const MHE_LABELS = {
  reach:          'Reach truck',
  vna:            'VNA / turret',
  counterbalance: 'Counterbalance',
}

/* The lane-storage types, so validation and the form can iterate them without
   re-listing the keys in three places. */
export const LANE_TYPES = ['driveIn', 'driveThrough', 'pushback', 'palletFlow']

/* Code/safety values, not preference. Overriding one is blocked on save —
   see validate.js. Matched as a path suffix so it catches every MHE entry
   without naming the trucks. */
export const LOCKED_PATHS = [
  'clearances.esfrBelowDeflectorIn',
  'mhe.*.minAisleFt',
]

export const DEFAULT_PROFILE_ID = 'default'

/** A fresh config: just the locked Trace default, nothing dealer-specific. */
export function emptyConfig() {
  return {
    activeProfileId:  DEFAULT_PROFILE_ID,
    activeCustomerId: null,
    profiles: [
      { id: DEFAULT_PROFILE_ID, name: 'Trace Default', locked: true, rules: DEFAULT_RULES },
    ],
    customerOverrides: {},
  }
}
