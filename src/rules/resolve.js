// resolve.js
// ─────────────────────────────────────────────────────────────────────────────
// The cascade. Resolving a project deep-merges top-down:
//
//   Trace default  →  dealer profile  →  customer override
//
// so "Cord Global" stays a three-line override rather than a full copy of the
// rules table. The resolved object is the single source of truth the
// generator, the capacity math and the column check all read.
//
// Pure: no React, no store, no localStorage.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_PROFILE_ID, emptyConfig } from './defaults'

const isPlainObject = v =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Deep-merge `patch` over `base`.
 *
 *  Objects merge key by key; **arrays and scalars replace wholesale**. That
 *  matters: a dealer whose frame widths are [3, 4, 6] stores exactly that, and
 *  a customer who narrows them to [4] gets [4] — not a concatenation that
 *  quietly re-admits a size they excluded. "Add to the list" is the form's job
 *  (it writes the new whole list), never the merge's.
 *
 *  Neither input is mutated. */
export function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch
  if (!isPlainObject(base))  return { ...patch }

  const out = { ...base }
  for (const key of Object.keys(patch)) {
    const pv = patch[key]
    if (pv === undefined) continue
    out[key] = isPlainObject(pv) && isPlainObject(base[key])
      ? deepMerge(base[key], pv)
      : isPlainObject(pv) ? deepMerge({}, pv)
      : Array.isArray(pv) ? [...pv]
      : pv
  }
  return out
}

/** The `extends` chain for a profile, root-first: ['default', …, profileId]. */
export function profileChain(config, profileId) {
  const byId = new Map((config?.profiles || []).map(p => [p.id, p]))
  const chain = []
  const seen  = new Set()

  let id = profileId
  while (id) {
    if (seen.has(id)) break            // cycle — stop rather than hang
    const p = byId.get(id)
    if (!p) break                      // dangling parent — resolve what exists
    seen.add(id)
    chain.unshift(p)
    id = p.extends
  }

  /* Always rooted at the shipped default, even if a profile forgot to extend
     it or named a parent that has since been deleted. A profile is a set of
     CHANGES; without the base underneath, a three-line override would resolve
     to three lines of rules and every consumer would fall off a cliff. */
  const base = byId.get(DEFAULT_PROFILE_ID)
  if (base && chain[0]?.id !== DEFAULT_PROFILE_ID) chain.unshift(base)
  return chain
}

/** Rules for a dealer profile, with the default layer already merged under. */
export function resolveProfile(config, profileId) {
  const chain = profileChain(config, profileId)
  return chain.reduce((acc, p) => deepMerge(acc, p.rules || {}), {})
}

/** The fully-resolved rules for a project.
 *
 *  `customerId` is optional — a project with no customer selected simply
 *  resolves to the dealer profile. A customer's own `extends` wins over the
 *  passed profileId, because the override was authored against that profile. */
export function resolveRules(config, profileId, customerId) {
  const cfg = config || emptyConfig()
  const customer = customerId ? cfg.customerOverrides?.[customerId] : null
  const baseId = customer?.extends || profileId || cfg.activeProfileId || DEFAULT_PROFILE_ID

  const profileRules = resolveProfile(cfg, baseId)
  return customer ? deepMerge(profileRules, customer.rules || {}) : profileRules
}

/** What the app is currently designing to — the one call most consumers want. */
export function resolveActive(config) {
  const cfg = config || emptyConfig()
  return resolveRules(cfg, cfg.activeProfileId, cfg.activeCustomerId)
}

/** Immutably set `path` on a rules object, creating objects along the way.
 *  The form writes through this so an edit lands in the ACTIVE layer only —
 *  that is what keeps a dealer profile a short list of changes rather than a
 *  full copy of the table. */
export function setAt(obj, path, value) {
  const [head, ...rest] = path.split('.')
  const base = isPlainObject(obj) ? obj : {}
  if (!rest.length) return { ...base, [head]: value }
  return { ...base, [head]: setAt(base[head], rest.join('.'), value) }
}

/** Immutably remove `path`, so the value falls back to whatever it inherits.
 *  Empty parents are pruned — a layer that no longer changes anything should
 *  not leave `{ selective: {} }` behind claiming it does. */
export function unsetAt(obj, path) {
  if (!isPlainObject(obj)) return obj
  const [head, ...rest] = path.split('.')
  if (!(head in obj)) return obj
  const out = { ...obj }
  if (!rest.length) {
    delete out[head]
    return out
  }
  const child = unsetAt(out[head], rest.join('.'))
  if (isPlainObject(child) && Object.keys(child).length === 0) delete out[head]
  else out[head] = child
  return out
}

/** Every layer that contributed, so the form can show WHERE a value came from
 *  instead of presenting a merged blob with no provenance. */
export function explainValue(config, path) {
  const cfg = config || emptyConfig()
  const keys = path.split('.')
  const read = (obj) => keys.reduce((o, k) => (o == null ? undefined : o[k]), obj)

  const layers = profileChain(cfg, cfg.activeCustomerId
    ? (cfg.customerOverrides[cfg.activeCustomerId]?.extends || cfg.activeProfileId)
    : cfg.activeProfileId
  ).map(p => ({ id: p.id, name: p.name, value: read(p.rules || {}) }))

  const customer = cfg.activeCustomerId ? cfg.customerOverrides[cfg.activeCustomerId] : null
  if (customer) layers.push({ id: cfg.activeCustomerId, name: customer.name, value: read(customer.rules || {}) })

  const contributing = layers.filter(l => l.value !== undefined)
  return {
    value:  contributing.length ? contributing[contributing.length - 1].value : undefined,
    source: contributing.length ? contributing[contributing.length - 1] : null,
    layers,
  }
}
