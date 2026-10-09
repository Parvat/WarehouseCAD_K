// storage.js
// ─────────────────────────────────────────────────────────────────────────────
// Dealer and customer profiles are CONFIG, not canvas data — they describe how
// this dealer sells racking, not what is drawn on the current sheet. They go to
// localStorage and never into the canvas store: putting them there would push
// them onto the undo stack, into the .wcad file and through the autosave
// snapshot on every keystroke.
//
// A backend replaces this module when there are accounts; nothing outside it
// knows where the config lives.
// ─────────────────────────────────────────────────────────────────────────────

import { emptyConfig, DEFAULT_PROFILE_ID, DEFAULT_RULES } from './defaults'
import { resolveActive } from './resolve'

const KEY = 'trace.rules.v1'

/* The shipped default always comes from code, never from storage. Persisting
   it would freeze whatever shipped the day a dealer first opened the app, so
   a corrected default could never reach them. */
function withShippedDefault(config) {
  const others = (config.profiles || []).filter(p => p.id !== DEFAULT_PROFILE_ID)
  return {
    ...config,
    profiles: [
      { id: DEFAULT_PROFILE_ID, name: 'Trace Default', locked: true, rules: DEFAULT_RULES },
      ...others,
    ],
  }
}

/* The rules table's "Wall clear" (selective.wallClearanceIn, inches from the building's outline) is gone:
   the wall clearance is the one Racking setting now (utils/fillTool.js, generate/wallClear.js). A stored
   value is dropped from every profile and customer override when read; legacyWallClearanceIn hands it to
   the Racking settings once, converted as before. */
const stripWallClear = (rules) => {
  if (!rules?.selective || !('wallClearanceIn' in rules.selective)) return rules
  const { wallClearanceIn, ...selective } = rules.selective
  void wallClearanceIn
  return { ...rules, selective }
}
function withoutWallClear(config) {
  const overrides = Object.fromEntries(Object.entries(config.customerOverrides || {}).map(([id, c]) => [id, c && c.rules ? { ...c, rules: stripWallClear(c.rules) } : c]))
  return { ...config, profiles: (config.profiles || []).map(p => (p && p.rules ? { ...p, rules: stripWallClear(p.rules) } : p)), customerOverrides: overrides }
}

/** The wall clearance the active profile (and customer) stored in the rules table before it moved to the
 *  Racking settings — inches from the outline — or null. */
export function legacyWallClearanceIn() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const v = resolveActive(withShippedDefault({ ...emptyConfig(), ...parsed })).selective?.wallClearanceIn
    return Number.isFinite(v) ? v : null
  } catch { return null }
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyConfig()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyConfig()
    return withShippedDefault(withoutWallClear({ ...emptyConfig(), ...parsed }))
  } catch {
    /* Private mode, quota, or a half-written value from an older build —
       a broken profile must not take the editor down with it. */
    return emptyConfig()
  }
}

export function saveConfig(config) {
  try {
    /* Store only what the dealer authored. The default layer is code. */
    const { profiles = [], ...rest } = config
    localStorage.setItem(KEY, JSON.stringify({
      ...rest,
      profiles: profiles.filter(p => p.id !== DEFAULT_PROFILE_ID),
    }))
    return true
  } catch {
    return false
  }
}

export function clearConfig() {
  try { localStorage.removeItem(KEY); return true } catch { return false }
}

export { KEY as RULES_STORAGE_KEY }
