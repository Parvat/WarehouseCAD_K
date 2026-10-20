# Trace theme — from the marketplace planner, for Trace CAD

Source: the planner's `globals.css`, `sheet.css` and figure components
(`PlanFigure.tsx`, `ElevationFigure.tsx`, `CantileverFigures.tsx`).

This replaces Trace CAD's current type system (Montserrat / Inter) and the
studio / obsidian / blueprint palettes for app chrome. Canvas object colours
stay hardcoded, as before — they are not theme tokens.

---

## 1. Colour tokens

```css
:root{
  /* ground */
  --bg:#F2F1EC;        /* page / app background, warm */
  --bg2:#EAE8E1;       /* input fill, graph-paper lines, chips */
  --paper:#FFFFFF;     /* panels, cards, the drawing sheet */
  --sand:#E7E4DB;

  /* brand */
  --pine:#14392B;      /* primary: active segment, primary button, rack outline */
  --pine-2:#1D5340;    /* hover / emphasis, cantilever arms */
  --pine-3:#0C2620;    /* pressed */
  --mint:#E7EFEA;      /* rack fill, summary band, list hover */

  /* text */
  --ink:#171A18;       /* body text, building walls */
  --ink-2:#41483F;     /* secondary text */
  --steel:#767C74;     /* labels, captions, muted */

  /* lines */
  --line:#DEDACF;      /* hairlines, input borders */
  --line-2:#C3BEB1;    /* stronger dividers */

  /* signal */
  --blue:#1B4FD8;      /* dimensions, section numbers, focus, links */
  --yellow:#F2C230;    /* flue, dock doors, "most" badge */
  --gold:#C8A34A;      /* match figure */
  --amber:#D98324;     /* warnings */
  --flag:#A8341C;      /* errors, killed bays, truck entry arrows */
}
```

### Message boxes (Check layout, notes)

| Kind | Left border 3px | Background | Text |
|---|---|---|---|
| Error | `#A8341C` | `#F5E7E3` | `#6B2413` |
| Warning | `#C07A12` | `#F8F0DF` | `#6B4A0B` |
| Note / layout tip | `#1B4FD8` | `#E9EEFB` | `#1B3A8C` |

Heading inside a box: JetBrains Mono 10px, uppercase, letter-spacing .12em,
category name right-aligned at 75% opacity.

---

## 2. Drawing colours (canvas)

| Element | Colour | Stroke |
|---|---|---|
| Rack outline / uprights | `#14392B` pine | 0.6–0.9 |
| Rack fill | `#E8EFEA` mint | — |
| Flue line | `#F2C230` yellow | 1 |
| Building walls | `#1A1D1B` ink | heavy |
| Dimensions, cross-aisle outline | `#1B4FD8` blue | 0.6, dash `3 2` |
| Aisle labels (muted) | `#BFBBB0` | — |
| Removed / unusable bay | fill `#F6E4DE`, stroke `#A8341C` | 0.9 |
| Truck entry arrows | `#A8341C` | 1.1 |
| Zones (staging etc.) | fill `#EFEDE6`, stroke `#CFCABD` | 0.8 |
| Pallet / material load | fill `#E8DCC2`, edge `#B08F52`, deck `#C9A870` | — |
| Cantilever arm | `#1D5340` | — |
| Beam (elevation) | `#C9B27A` | — |
| Text on drawings | JetBrains Mono, `#6B726C` | — |

Strokes keep a fixed screen weight (`vector-effect: non-scaling-stroke`).

---

## 3. Type

```css
--ff-display:'Oswald',sans-serif;                    /* 700, UPPERCASE headings only */
--ff-body:'Plus Jakarta Sans',system-ui,sans-serif;  /* all UI text, labels, buttons */
--ff-mono:'JetBrains Mono',ui-monospace,monospace;   /* numbers and units only */
```

Google Fonts: `Oswald:wght@700`, `Plus+Jakarta+Sans:wght@400;500;600;700`,
`JetBrains+Mono:wght@400;500;600`.

On `body`:

```css
-webkit-font-smoothing:antialiased;
-moz-osx-font-smoothing:grayscale;
text-rendering:optimizeLegibility;
```

Without `antialiased`, Plus Jakarta Sans looks bold at any weight.

Rules:
- **Mono is for numbers only.** `240`, `28 ft`, `96 in`, `12.5′`. A value that
  is a word (`Counterbalance`, `Length`, `Ceiling`) is in Plus Jakarta Sans.
- Mono figures use `font-variant-numeric: tabular-nums`.
- Weights default 400; 500–600 for buttons and active states. PJS reads a
  weight heavier than most faces, so don't go above 600 in UI.
- Small uppercase captions (figure titles, legend, summary band) are mono,
  10–11px, letter-spacing .08–.14em.

### Scale

| Token | Size / line-height |
|---|---|
| `--fs-h2` | 26px / 1.05 (Oswald) |
| `--fs-h3` | 18px / 1.3 |
| `--fs-lg` | 16px / 1.55 |
| `--fs-base` | 15px / 1.55 |
| `--fs-sm` | 14px / 1.5 — dense UI floor |
| `--fs-xs` | 13px / 1.45 |
| `--fs-label` | 12px / 1.35 |
| `--fs-micro` | 11px / 1.3 |
| `--tracking-label` | .08em |

---

## 4. Spacing, sizes, radius

```css
--sp-hair:2px; --sp-half:6px;
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px;
--sp-6:24px; --sp-7:32px; --sp-8:40px; --sp-9:48px; --sp-10:64px;

--h-compact:32px; --h-control:36px; --h-input:40px; --h-cta:44px;

--r-control:2px;   /* inputs, buttons, segments */
--r-surface:4px;   /* cards, panels — nothing rounder */

--focus-ring:3px solid rgba(20,57,43,.28); --focus-offset:2px;
--t-colour:150ms; --t-open:200ms;
--min-touch:44px;
```

Shadow (dropdowns, popovers only): `0 6px 16px rgba(26,29,27,.13)`.

---

## 5. Components

**Input panel section header** — `01` in mono 10px blue, tracking .14em;
title in Oswald 700 uppercase 13–17px; a muted one-line note beside it in PJS
11–13px steel ("the box you are filling").

**Field label** — 8.5–11px, uppercase, tracking .05em, steel, above the field.

**Input / select** — height 29–36px, fill `--bg2`, 1px `--line` border, radius
2px, mono value centred, unit (`ft`, `in`, `lb`, `%`) right-aligned in steel.
Focus: 2px blue outline, fill turns white.

**Segmented control** (Ceiling / In-rack, Pallets / Long / Both) — buttons on
`--bg2` with `--line` borders; active = pine fill, white text. Labels in PJS.

**Primary button** — pine fill, white text, radius 2px, height 40px, PJS 14px
weight 500.

**Small figure button** (`DEPTH →`, `3D`) — white, 1px line border, blue mono
8.5px uppercase text, height 17px; border turns blue on hover.

**Summary band** (`10 ROWS · 24 BAYS/ROW · 15′ SPARE`) — mint background,
1px line on top, mono 11px uppercase tracking .08em, pine; numbers bold pine-2;
separators pine at 45% opacity.

**Graph-paper canvas**

```css
background:
  linear-gradient(var(--bg2) 1px, transparent 1px) 0 0/100% 24px,
  linear-gradient(90deg, var(--bg2) 1px, transparent 1px) 0 0/24px 100%,
  var(--paper);
```

**Figure heading** — mono 10px uppercase tracking .14em steel: title left,
size centred, legend right (10×6 swatches drawn in the canvas colours).

**Placard** (key figures) — yellow ground, 3px ink border, Oswald title over a
2px ink rule, mono values.

**Overlay** — backdrop `rgb(26 29 27 / .55)`, white box, 1px line border,
radius 2px.

---

## 6. Not in these files — confirm from the current planner code

The planner changed after these files were uploaded (early Sept). Three later
changes I know the shape of but not the exact values:

1. **Input panel** — white at the top fading into the warm ground (a vertical
   gradient, roughly `#FFFFFF → #F2F1EC`), labels and toggles in PJS rather
   than mono.
2. **"Good to know" notes tab** — a sage/green-grey colour, distinct from the
   error / warning / note boxes.
3. **Clearance band** in the elevation — pale yellow fill with dashed edges.

Have Claude Code read the current values from the warehouse-network repo
(`apps/web/app/globals.css` and the planner components) rather than guessing.

---

## 7. Applying it to Trace CAD

- Put section 1, 3 and 4 tokens in `index.css` `:root`; map Tailwind theme
  colours to `var(--…)` so existing classes keep working.
- Replace Montserrat / Inter with PJS everywhere; JetBrains Mono stays for
  figures only.
- Radius: 2px controls, 4px panels. This reverses the softer 12px card / pill
  direction used in the CAD left panel — decide whether the panel keeps its own
  shape or follows the sheet.
- Accent: pine `#14392B` for active/selected chrome, blue `#1B4FD8` for
  dimensions and focus only. No orange accent.
- Category colours on the toolbar (`storage`, `mhe`, `structural`, `safety`,
  `utilities`) are identity colours and stay as they are.
- Dark mode: the planner has none. Either drop obsidian / blueprint for now or
  define dark values for each token deliberately; don't let components keep
  their own hex.
