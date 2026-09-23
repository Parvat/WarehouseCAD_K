import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { loadConfig, saveConfig } from './storage'
import { resolveRules, resolveActive } from './resolve'
import { validateRules } from './validate'
import { DEFAULT_PROFILE_ID, MHE_LABELS } from './defaults'

/* ── Rules profiles — the app-side binding ───────────────────────────────────
   One resolved profile is the single source of truth the generator, the
   capacity math and the column check all read. Change the profile and the
   whole design re-drives, because every consumer reads the same resolved
   object rather than its own constants.

   Config lives here and in localStorage. It is deliberately NOT in the canvas
   store: it describes how this dealer sells racking, not what is on the sheet,
   and the canvas store puts everything through undo, autosave and the .wcad
   file. */

const Ctx = createContext(null)

export function RulesProvider({ children }) {
  const [config, setConfig] = useState(loadConfig)

  const rules = useMemo(() => resolveActive(config), [config])

  /* The MHE list the UI offers, shaped like the profiles the column check
     already takes, so callers hand `mheOptions[key]` straight to
     checkColumns() without a second mapping step. */
  const mheOptions = useMemo(() => {
    const out = {}
    for (const [key, m] of Object.entries(rules.mhe || {})) {
      out[key] = {
        key,
        label: m.label || MHE_LABELS[key] || key,
        aisleFt: m.aisleFt,
        minAisleFt: m.minAisleFt,
        retrievalFt: m.retrievalFt,
        travelFt: m.travelFt,
      }
    }
    return out
  }, [rules])

  /* Commit a config. Validation runs on the RESOLVED result, because a
     customer override is only ever wrong in combination with what it
     inherits. A failed save changes nothing. */
  const commit = useCallback((next) => {
    const resolved = resolveRules(next, next.activeProfileId, next.activeCustomerId)
    const result = validateRules(resolved)
    if (!result.ok) return result
    setConfig(next)
    saveConfig(next)
    return result
  }, [])

  const setActiveProfile  = useCallback(id =>
    setConfig(c => { const n = { ...c, activeProfileId: id }; saveConfig(n); return n }), [])
  const setActiveCustomer = useCallback(id =>
    setConfig(c => { const n = { ...c, activeCustomerId: id || null }; saveConfig(n); return n }), [])

  /* Preview what a candidate config would resolve to, without committing —
     the form needs this to show the effect of an edit before save. */
  const preview = useCallback((candidate) =>
    resolveRules(candidate, candidate.activeProfileId, candidate.activeCustomerId), [])

  const value = useMemo(() => ({
    config, setConfig, commit, preview,
    rules, mheOptions,
    setActiveProfile, setActiveCustomer,
    validate: validateRules,
    DEFAULT_PROFILE_ID,
  }), [config, commit, preview, rules, mheOptions, setActiveProfile, setActiveCustomer])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRules() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRules must be used inside <RulesProvider>')
  return ctx
}
