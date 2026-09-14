# Trace — rules profiles (data contract)

The rules table becomes DATA, not hardcoded defaults. One resolved profile is
the single source of truth the **generator**, **capacity math**, and **column
check** all read. Change the profile → the whole design re-drives.

## The cascade (three layers, each stores only what it changes)
```
Trace default  →  dealer profile ("Our reach standard")  →  customer override ("Cord Global")
```
Resolving a project = deep-merge top-down: customer wins over dealer wins over
default. So "Cord Global" is a 3-line override, not a full copy.

## Shape
```json
{
  "activeProfileId": "our-reach-standard",
  "activeCustomerId": "cord-global",

  "profiles": [
    {
      "id": "default",
      "name": "Trace Default",
      "locked": true,
      "rules": { /* full set below */ }
    },
    {
      "id": "our-reach-standard",
      "name": "Our reach-truck standard",
      "extends": "default",
      "rules": {
        "mheDefault": "reach",
        "selective": { "frameWidthsIn": [3, 4] }
      }
    }
  ],

  "customerOverrides": {
    "cord-global": {
      "name": "Cord Global",
      "extends": "our-reach-standard",
      "rules": {
        "building": { "columnGridFt": { "x": 50, "y": 54 }, "clearHeightFt": 36 }
      }
    }
  }
}
```

## The default `rules` (from the [code] table — fill the [verify?] ones)
> Defaults are the shipped **common set**. The form lets a dealer ADD to any of
> these lists (frame widths, beam lengths, depths…) for their own inventory —
> so we don't need to predict every dealer. Ship sensible, let them extend.
```json
{
  "pallet": { "wIn": 48, "dIn": 40 },

  "selective": {
    "frameWidthsIn": [3, 4],
    "frameDepthsIn": [36, 42, 48],
    "beamLengthsIn": [96, 144],
    "beamFaceHeightsIn": [4, 5, 6],
    "flueIn": 6,
    "wallClearanceIn": 3
  },

  "cantilever": {
    "towerSpacingIn": 48, "towerWidthIn": 10, "spineDepthIn": 4,
    "armThicknessIn": 3, "armLengthsIn": [36, 48, 52, 60, 72],
    "sided": ["single", "double"]
  },

  "driveIn":      { "lanes": [2, 4], "depth": [1, 10], "uprightWidthIn": 4, "pallet": { "wIn": 40, "dIn": 48 }, "access": "lifo" },
  "driveThrough": { "lanes": [2, 4], "depth": [1, 8],  "uprightWidthIn": 4, "pallet": { "wIn": 40, "dIn": 48 }, "access": "fifo" },
  "pushback":     { "lanes": [2, 3], "depth": [2, 5],  "uprightWidthIn": 3, "pallet": { "wIn": 40, "dIn": 48 }, "access": "lifo", "inclineDeg": 4 },
  "palletFlow":   { "lanes": [2, 4], "depth": [2, 20], "uprightWidthIn": 3, "pallet": { "wIn": 40, "dIn": 48 }, "access": "fifo" },

  "mhe": {
    "reach":          { "aisleFt": 10.5, "minAisleFt": 10.0 },
    "vna":            { "aisleFt": 6.0,  "minAisleFt": 5.5  },
    "counterbalance": { "aisleFt": 12.5, "minAisleFt": 12.0 }
  },

  "clearances": { "esfrBelowDeflectorIn": 18, "locked": true }
}
```

## Guardrails (validate on SAVE — this protects dealer credibility)
- `beamLengthIn ≥ palletWidthIn` (a bay must hold ≥1 pallet).
- depth within the type's allowed range (no 20-deep push-back).
- `minAisleFt ≤ aisleFt`.
- **Locked rows** (`esfrBelowDeflectorIn`, `minAisleFt`) — warn hard or block
  on override; these are code/safety, not preference.

## How it plugs into what's built
- `generateLayout(brief, rules)` — reads frame/beam/flue/depth from resolved rules.
- `getRackCapacity` — already reads pallet/beam/levels; point it at the profile's pallet.
- `checkColumns` — takes the profile's `mhe` instead of a hardcoded one.

## Where it lives
- Default profile ships in the app (a constant).
- Dealer + customer profiles: `localStorage` for now (config, not canvas data),
  → a backend later when there are accounts. NEVER in the canvas store.

## Not in scope here
The **form UI** (open defaults, edit, save, apply) is a live-app build for
Claude Code. This file is the contract it reads and writes.
