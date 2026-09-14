// validate.js
// ─────────────────────────────────────────────────────────────────────────────
// Guardrails, run on SAVE. These exist to protect dealer credibility: a layout
// that quotes 20-deep push-back or a bay too short to hold a pallet is worse
// than no layout at all, because it goes out under the dealer's name.
//
// Validation runs against the RESOLVED rules, not the patch, since a customer
// override is only wrong in combination with what it inherits.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_RULES, LANE_TYPES, LOCKED_PATHS } from './defaults'

const LANE_LABEL = {
  driveIn: 'Drive-in', driveThrough: 'Drive-through',
  pushback: 'Push-back', palletFlow: 'Pallet-flow',
}

const at = (obj, path) =>
  path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

const num = v => typeof v === 'number' && Number.isFinite(v)

/** Expand 'mhe.*.minAisleFt' against a rules object into concrete paths. */
function expandLocked(rules) {
  const out = []
  for (const pattern of LOCKED_PATHS) {
    const star = pattern.indexOf('*')
    if (star === -1) { out.push(pattern); continue }
    const [head, tail] = pattern.split('.*.')
    const branch = at(rules, head)
    if (!branch) continue
    for (const key of Object.keys(branch)) out.push(`${head}.${key}.${tail}`)
  }
  return out
}

/**
 * @returns {{ errors: Array, warnings: Array, ok: boolean }}
 *   Each entry is { path, message, kind }. `kind` is one of
 *   'pallet-fit' | 'depth-range' | 'aisle' | 'locked' | 'shape'.
 */
export function validateRules(rules) {
  const errors = []
  const warnings = []
  const err  = (path, message, kind) => errors.push({ path, message, kind })
  const warn = (path, message, kind) => warnings.push({ path, message, kind })

  if (!rules || typeof rules !== 'object') {
    return { errors: [{ path: '', message: 'No rules to validate.', kind: 'shape' }], warnings, ok: false }
  }

  // ── A bay must hold at least one pallet ──────────────────────────────────
  const palletW = at(rules, 'pallet.wIn')
  const beams   = at(rules, 'selective.beamLengthsIn')
  if (!num(palletW) || palletW <= 0) {
    err('pallet.wIn', 'Pallet width must be a positive number.', 'shape')
  } else if (!Array.isArray(beams) || beams.length === 0) {
    err('selective.beamLengthsIn', 'At least one beam length is required.', 'shape')
  } else {
    for (const b of beams) {
      if (!num(b) || b <= 0) {
        err('selective.beamLengthsIn', `Beam length "${b}" is not a positive number.`, 'shape')
      } else if (b < palletW) {
        err('selective.beamLengthsIn',
          `A ${b}" beam cannot hold a ${palletW}" pallet — a bay must hold at least one.`,
          'pallet-fit')
      }
    }
  }

  // ── Lane depth within the type's allowed range ───────────────────────────
  for (const type of LANE_TYPES) {
    const cfg = at(rules, type)
    if (!cfg) continue
    const ceiling = DEFAULT_RULES[type]?.depth
    const depth   = cfg.depth
    const label   = LANE_LABEL[type] || type

    if (!Array.isArray(depth) || depth.length !== 2 || !depth.every(num)) {
      err(`${type}.depth`, `${label} depth must be a [min, max] pair.`, 'shape')
      continue
    }
    const [min, max] = depth
    if (min < 1)      err(`${type}.depth`, `${label} depth cannot start below 1.`, 'depth-range')
    if (max < min)    err(`${type}.depth`, `${label} max depth is below its min.`, 'depth-range')
    /* The shipped range is the engineering ceiling for the type. Exceeding it
       is the "no 20-deep push-back" case the contract calls out by name. */
    if (ceiling && max > ceiling[1]) {
      err(`${type}.depth`,
        `${label} allows at most ${ceiling[1]} deep — ${max} is beyond the type's range.`,
        'depth-range')
    }

    if (!Array.isArray(cfg.lanes) || !cfg.lanes.length || !cfg.lanes.every(num)) {
      err(`${type}.lanes`, `${label} needs at least one lane count.`, 'shape')
    }
  }

  // ── minAisle ≤ aisle ─────────────────────────────────────────────────────
  const mhe = at(rules, 'mhe') || {}
  for (const [key, m] of Object.entries(mhe)) {
    if (!m || typeof m !== 'object') continue
    if (!num(m.aisleFt) || m.aisleFt <= 0) {
      err(`mhe.${key}.aisleFt`, `${key}: aisle width must be a positive number.`, 'shape')
      continue
    }
    if (!num(m.minAisleFt) || m.minAisleFt <= 0) {
      err(`mhe.${key}.minAisleFt`, `${key}: minimum aisle must be a positive number.`, 'shape')
      continue
    }
    if (m.minAisleFt > m.aisleFt) {
      err(`mhe.${key}.minAisleFt`,
        `${key}: minimum aisle (${m.minAisleFt}ft) is wider than the design aisle (${m.aisleFt}ft).`,
        'aisle')
    }
  }

  // ── Locked rows — code/safety, not preference ────────────────────────────
  for (const path of expandLocked(rules)) {
    const shipped = at(DEFAULT_RULES, path)
    const current = at(rules, path)
    if (shipped === undefined || current === undefined) continue
    if (current !== shipped) {
      err(path,
        `${path} is a code/safety value fixed at ${shipped}. Overriding it (${current}) is blocked.`,
        'locked')
    }
  }

  const esfr = at(rules, 'clearances.esfrBelowDeflectorIn')
  if (esfr !== undefined && (!num(esfr) || esfr <= 0)) {
    err('clearances.esfrBelowDeflectorIn', 'ESFR clearance must be a positive number.', 'shape')
  }

  /* No warning for a frame shallower than the pallet. A 40" pallet on a 36"
     frame overhangs onto the beams by design — that is how selective racking
     is loaded, and the shipped defaults pair exactly those numbers. A
     validator that flags its own defaults trains people to ignore it. */

  // ── Softer signals: legal, but worth a second look ───────────────────────
  const flue = at(rules, 'selective.flueIn')
  if (num(flue) && flue > 0 && flue < 3) {
    warn('selective.flueIn',
      `A ${flue}" flue is tighter than the 3" most fire codes expect between back-to-back rows.`,
      'clearance')
  }

  return { errors, warnings, ok: errors.length === 0 }
}
