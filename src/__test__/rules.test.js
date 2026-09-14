import { describe, it, expect } from 'vitest'
import { DEFAULT_RULES, emptyConfig } from '../rules/defaults'
import {
  deepMerge, profileChain, resolveProfile, resolveRules, resolveActive, explainValue,
} from '../rules/resolve'
import { validateRules } from '../rules/validate'

/* The worked example straight out of the contract doc. */
const config = {
  activeProfileId:  'our-reach-standard',
  activeCustomerId: 'cord-global',
  profiles: [
    { id: 'default', name: 'Trace Default', locked: true, rules: DEFAULT_RULES },
    {
      id: 'our-reach-standard', name: 'Our reach-truck standard', extends: 'default',
      rules: { mheDefault: 'reach', selective: { frameWidthsIn: [3, 4] } },
    },
  ],
  customerOverrides: {
    'cord-global': {
      name: 'Cord Global', extends: 'our-reach-standard',
      rules: { building: { columnGridFt: { x: 50, y: 54 }, clearHeightFt: 36 } },
    },
  },
}

describe('rules — deepMerge', () => {
  it('merges nested objects key by key', () => {
    const out = deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3 } })
    expect(out).toEqual({ a: { x: 1, y: 3 } })
  })

  it('REPLACES arrays rather than concatenating them', () => {
    // a customer narrowing frame widths to [4] must not silently re-admit 3
    const out = deepMerge({ frameWidthsIn: [3, 4, 6] }, { frameWidthsIn: [4] })
    expect(out.frameWidthsIn).toEqual([4])
  })

  it('does not mutate either input', () => {
    const base = { a: { x: 1 }, list: [1, 2] }
    const patch = { a: { y: 2 }, list: [3] }
    const snapshot = JSON.stringify({ base, patch })
    deepMerge(base, patch)
    expect(JSON.stringify({ base, patch })).toBe(snapshot)
  })

  it('copies nested objects out of the patch instead of sharing them', () => {
    const patch = { a: { x: 1 } }
    const out = deepMerge({}, patch)
    out.a.x = 99
    expect(patch.a.x).toBe(1)
  })

  it('treats undefined as "no opinion", not as a value', () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 })
  })
})

describe('rules — the cascade', () => {
  it('resolves a dealer profile over the shipped default', () => {
    const r = resolveProfile(config, 'our-reach-standard')
    expect(r.mheDefault).toBe('reach')                 // from the profile
    expect(r.selective.frameWidthsIn).toEqual([3, 4])  // from the profile
    expect(r.selective.beamLengthsIn).toEqual([96, 144]) // inherited
    expect(r.pallet).toEqual({ wIn: 48, dIn: 40 })       // inherited
  })

  it('layers a customer override on top — three lines, not a full copy', () => {
    const r = resolveRules(config, 'our-reach-standard', 'cord-global')
    expect(r.building.columnGridFt).toEqual({ x: 50, y: 54 })
    expect(r.building.clearHeightFt).toBe(36)
    expect(r.mheDefault).toBe('reach')                   // still from dealer
    expect(r.selective.flueIn).toBe(6)                   // still from default
    // the override really is tiny
    expect(Object.keys(config.customerOverrides['cord-global'].rules)).toEqual(['building'])
  })

  it('resolveActive reads the config\'s own active ids', () => {
    expect(resolveActive(config)).toEqual(
      resolveRules(config, 'our-reach-standard', 'cord-global'))
  })

  it('a customer\'s own extends wins over a mismatched profileId', () => {
    const r = resolveRules(config, 'default', 'cord-global')
    expect(r.mheDefault).toBe('reach')   // came via the customer's extends
  })

  it('chains root-first, always rooted at the shipped default', () => {
    expect(profileChain(config, 'our-reach-standard').map(p => p.id))
      .toEqual(['default', 'our-reach-standard'])
  })

  it('roots an orphan profile at the default rather than resolving to a stub', () => {
    const orphan = {
      ...config,
      profiles: [...config.profiles, { id: 'loose', name: 'Loose', rules: { pallet: { wIn: 42 } } }],
    }
    const r = resolveRules(orphan, 'loose')
    expect(r.pallet.wIn).toBe(42)              // its own change
    expect(r.selective.flueIn).toBe(6)         // still inherits the base
  })

  it('survives a cycle instead of hanging', () => {
    const cyclic = {
      ...emptyConfig(),
      profiles: [
        ...emptyConfig().profiles,
        { id: 'a', name: 'A', extends: 'b', rules: { pallet: { wIn: 1 } } },
        { id: 'b', name: 'B', extends: 'a', rules: { pallet: { dIn: 2 } } },
      ],
    }
    const r = resolveRules(cyclic, 'a')
    expect(r.pallet.wIn).toBe(1)
  })

  it('falls back to the shipped default with no config at all', () => {
    expect(resolveActive(null).selective.flueIn).toBe(6)
  })

  it('explains which layer a value came from', () => {
    const e = explainValue(config, 'selective.frameWidthsIn')
    expect(e.source.id).toBe('our-reach-standard')
    expect(e.value).toEqual([3, 4])
    const inherited = explainValue(config, 'selective.flueIn')
    expect(inherited.source.id).toBe('default')
  })
})

describe('rules — guardrails', () => {
  const ok = rules => validateRules(rules)

  it('passes the shipped defaults', () => {
    expect(ok(DEFAULT_RULES).ok).toBe(true)
  })

  it('passes the fully resolved worked example', () => {
    expect(ok(resolveActive(config)).ok).toBe(true)
  })

  it('rejects a beam too short to hold a pallet', () => {
    const r = deepMerge(DEFAULT_RULES, { selective: { beamLengthsIn: [36] } })
    const v = ok(r)
    expect(v.ok).toBe(false)
    expect(v.errors.some(e => e.kind === 'pallet-fit')).toBe(true)
  })

  it('rejects 20-deep push-back, by name', () => {
    const r = deepMerge(DEFAULT_RULES, { pushback: { depth: [2, 20] } })
    const v = ok(r)
    expect(v.ok).toBe(false)
    expect(v.errors.some(e => e.kind === 'depth-range' && e.path === 'pushback.depth')).toBe(true)
  })

  it('allows 20-deep pallet flow, where the type does support it', () => {
    expect(ok(deepMerge(DEFAULT_RULES, { palletFlow: { depth: [2, 20] } })).ok).toBe(true)
  })

  it('rejects a minimum aisle wider than the design aisle', () => {
    const r = deepMerge(DEFAULT_RULES, { mhe: { reach: { aisleFt: 9, minAisleFt: 10 } } })
    const v = ok(r)
    expect(v.ok).toBe(false)
    expect(v.errors.some(e => e.kind === 'aisle')).toBe(true)
  })

  it('blocks overriding a locked safety row', () => {
    const esfr = ok(deepMerge(DEFAULT_RULES, { clearances: { esfrBelowDeflectorIn: 12 } }))
    expect(esfr.ok).toBe(false)
    expect(esfr.errors.some(e => e.kind === 'locked')).toBe(true)

    const minAisle = ok(deepMerge(DEFAULT_RULES, { mhe: { vna: { minAisleFt: 4 } } }))
    expect(minAisle.ok).toBe(false)
    expect(minAisle.errors.some(e => e.kind === 'locked' && e.path === 'mhe.vna.minAisleFt')).toBe(true)
  })

  it('lets a dealer widen the DESIGN aisle, which is preference not code', () => {
    expect(ok(deepMerge(DEFAULT_RULES, { mhe: { reach: { aisleFt: 11.5 } } })).ok).toBe(true)
  })

  it('lets a dealer extend a list with their own inventory', () => {
    const r = deepMerge(DEFAULT_RULES, { selective: { beamLengthsIn: [96, 144, 168] } })
    expect(ok(r).ok).toBe(true)
    expect(r.selective.beamLengthsIn).toEqual([96, 144, 168])
  })

  it('does NOT flag a frame shallower than the pallet — overhang is by design', () => {
    // the shipped defaults pair a 36" frame with a 40" pallet on purpose
    expect(ok(DEFAULT_RULES).warnings).toHaveLength(0)
    expect(ok(deepMerge(DEFAULT_RULES, { selective: { frameDepthsIn: [36] } })).warnings).toHaveLength(0)
  })

  it('warns, without blocking, on a flue tighter than fire code expects', () => {
    const v = ok(deepMerge(DEFAULT_RULES, { selective: { flueIn: 2 } }))
    expect(v.ok).toBe(true)
    expect(v.warnings.some(w => w.kind === 'clearance')).toBe(true)
  })

  it('reports rather than throws on a malformed profile', () => {
    const v = ok({ pallet: 'nonsense', selective: { beamLengthsIn: 'no' } })
    expect(v.ok).toBe(false)
    expect(v.errors.length).toBeGreaterThan(0)
  })
})
