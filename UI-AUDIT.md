# UI Audit — master @ 7867f32 against THEME.md

Report only. Nothing in `src/` was changed.

**Method**
- Every screen was opened with a real mouse in Chromium (Playwright) at 1700×1050, then again at 1700×640 (the 640 px high check).
- On each screen, every rendered text node, control and overlay was measured: computed font, size, weight, tracking and case; control height, radius, padding and colours; overlay position, z-index, shadow and backdrop; whether it is off-screen or covered (5-point hit test).
- A static sweep of all 75 UI source files counted fonts, sizes, radii, z-indexes, icon sizes and strokes, glyphs, and hex colours per file.
- Screenshots are in `ui-audit/`. Each item names the one it is visible in.

**Screens covered**
- Login, Hub, start screen (New project, with and without Advanced), plan with both toolbars, Generate panel, library panel (collapsed, expanded, sections), top-bar menu.
- Rules, Project settings, Project properties.
- Properties: rack, rack with folds open, multi-select, building.
- Elevations: list, row menu, editor (new, with new entries), full screen, side/detailed.
- Row group bar, Split, Fill bar, notice, zone placing and placed, Check layout, Export ask, export window.
- Right-click (on a rack and on empty canvas), tooltips.

**THEME.md targets used below**

| What | Target |
|---|---|
| Fonts | Oswald 700 uppercase for headings only; Plus Jakarta Sans (PJS) for all UI; JetBrains Mono (JBM) for numbers only, tabular |
| Type scale | 26 / 18 / 16 / 15 / 14 / 13 / 12 / 11 px, with 14 as the dense floor; mono captions 10–11 px tracked .08–.14em |
| UI weight | ≤ 600 |
| Spacing | 4 / 8 / 12 / 16 / 20 / 24 / 32 |
| Heights | compact 32 · control 36 · input 40 · cta 44 |
| Radius | 2 px controls, 4 px panels, nothing rounder |
| Shadow | `0 6px 16px rgba(26,29,27,.13)`, for dropdowns and popovers only |
| Backdrop | `rgb(26 29 27/.55)`, white box, 1 px line, radius 2 |
| Accent | pine for selection; blue only for dimensions, focus and links; no orange accent |
| Status colours | amber for warnings, flag for errors |

---

## 1. Broken — hidden, clipped, unusable (9)

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| B1 | Plan, every screen at 640 px | Floating drawing toolbar (`FloatingPanel`, fixed, z 9998) | It is 564 px tall at y 130, so it runs 54 px off the bottom of a 640 px window. The last tools (Flip, Hide) cannot be reached, and its position is not re-clamped when the window shrinks. | Any popover must fit the viewport | 40-plan-640, 42…47 |
| B2 | Plan at 640 px | "← Hub" button (z 55) | The drawing toolbar covers 3 of its 5 hit points, so it is only clickable on its left edge. | Nothing covers primary navigation | 40-plan-640 |
| B3 | Project settings, Rules (both sizes) | Drawing toolbar vs modals | At z 9998 the toolbar paints **above** the modal backdrop (Project settings z 200, Rules z 300). It is undimmed and stays clickable while a modal is open. | The overlay backdrop covers everything behind the box | 11-project-settings, 41-project-settings-640, 46-rules-640 |
| B4 | All right-click targets | Context menus | There are none: the code has no `onContextMenu` anywhere. Right-click on a rack or on empty canvas does nothing (the browser menu is suppressed by the canvas). The brief lists "all right-click menus" as a screen. | Row/object menus exist (THEME row menu = Elevations ⋯ menu) | 31-right-click-rack, 32-right-click-empty |
| B5 | Elevations toolbar (list, editor, full screen, side) | Beam label `BEAM 8'-0" · 2 PALLETS` | Clipped with an ellipsis (146 of 155 px shown) on every Elevations screen, so the pallet count is cut. | Text is never clipped where the value matters | 16-elevations-list … 21-elevations-side-detailed |
| B6 | Zones, placing an Office | Status bar | Reads "Placing row" while placing a zone. | Status names the thing being placed | 26-zone-placing |
| B7 | Export ask ("1 error found. Export anyway?") | Close method | No X, no Esc and no outside click. The only ways out are the two buttons, and "Show issues" is not an obvious cancel. | Overlays close with X, Esc and an outside click | 29-export-ask |
| B8 | Top-bar menu ("Settings and more") | Menu panel | It has no `role="menu"` or `menuitem`, so it is not announced as a menu and has no arrow-key navigation. Esc and outside click do work. At 1050 px it is 905 px tall. | Menus are menus | 09-topbar-menu, 45-topbar-menu-640 |
| B9 | Export window | Whole window | Arial throughout, a yellow `#F0B429` "Print / Save as PDF" button with the 🖨 emoji, and a grey `#E8EAF0` Close button at radius 6. It is the only screen outside the theme entirely. | PJS, pine primary, Lucide icons, radius 2 | 30-export-window |

---

## 2. Inconsistent (by audit category)

### 2.1 Typography

**Rendered font families** (text nodes counted across all screens)

| Family | Count | Verdict |
|---|---|---|
| JetBrains Mono | 2536 | **Over-used**: large amounts of words are set in mono (see T3) |
| Plus Jakarta Sans | 1688 | OK |
| Oswald | 335 | OK where it is a heading, but used at 10 px for tab and fold labels (T5) |
| IBM Plex Mono | 186 | Not in THEME (elevation drawing text) |
| Arial | 17 | Not in THEME (export window, B9) |
| DM Mono | 6 | Not in THEME (Text panel Font / Size / Align and its number input) |
| Montserrat | 2 | Banned (Text panel font select) |

**Static font declarations**
- `var(--font-mono)` ×145, `var(--font-ui)` ×28, `var(--font-display)` ×13, `inherit` ×10.
- Literal `'Oswald'` ×9, `'Plus Jakarta Sans'` ×3, `'JetBrains Mono'` ×2. These bypass the tokens.

**Rendered sizes**
- 7 px ×1505: SVG ruler and drawing text (JBM).
- 8 px; 9 px ×303; 9.5; 10 px ×747; 10.5; 11 px ×751; 11.5 px ×133; 12; 12.5 px ×405; 13; 14; 15; 19; 32 px at weight 800.
- In total there are **88 distinct font combinations** (family, size, weight, tracking, case).

**Static size declarations**
- 9 ×64, 11 ×64, 10 ×44, 12 ×32, `var(--fs-xs)` ×18, 13 ×16, 11.5 ×16, 14 ×9, 12.5 ×9, 7 ×6, 9.5 ×6, 10.5 ×5, 19 ×4.
- Also 8, 15, 16, 18, 20, 24, 26, 27, 32 and 40.

**Weights:** 600 ×68, 700 ×29, 500 ×18, 800 ×1 (static); 700 ×212 and 800 ×11 rendered.

**Tracking and case:** 18 distinct `letterSpacing` values; `uppercase` ×30.

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| T1 | App-wide | `index.css:1`, `:10`, `:12` | Google Fonts loads **Inter and Montserrat**, and `:root --font-ui` / `--font-display` are set to `'Montserrat'`. Components that still use `var(--font-ui)` get Montserrat if a theme block does not override it. | PJS for UI, Oswald for headings; no Montserrat or Inter | — (source) |
| T2 | Canvas text objects, Properties → Text | `shapes.jsx:721` uses `"Inter, sans-serif"`. `PropertiesPanel.jsx:27`, `TextPanel.jsx:9` offer Montserrat / Inter in the font list, and `PropertiesPanel.jsx:661` defaults to Montserrat. | Banned fonts as the default text-object font | PJS (or JBM for numbers) | 13-properties-rack |
| T3 | Properties (all object types) | Labels and words in JBM | Words set in mono include: "No object selected", "Draw or click a shape…", "MHE", "Reach truck", "Copy / Paste / Cut / Group / Ungroup", "Rot", "Label", "Size", "Wall thickness", "Show clear interior dim", "Area:", "If absorbed / If removed", "Applies to 1 selected object", "TRANSPARENT · 70%", "FP RECT", "rack row", "Bay 8", the Summary labels (Pallets, Ground level, Total length, Wall clear, Remaining), "Elevation: …", "+ Bay / − Bay", "Delete all", "Select 2+ objects to group · Ctrl+G", "8 columns in racks · −60 blocked…". | JBM for numbers only; words in PJS | 12-project-properties, 13-properties-rack, 13b, 14, 15 |
| T4 | Rules, Project settings, start-screen Advanced, Hub, Login, Elevations | Words in JBM | Rules: "+ Profile", "+ Customer", "from Trace Default", "Trace Default is read-only…", "Ready to save.", "Cancel", "Trace Default" / "— none —" selects. Project settings column headers "Default, Name, Clear height (ft), Face (in)…", "Forklift", "Reach truck". Hub: "6 projects / 2 due / 3 layouts ready". Login: "TRACE · dealer workspace · v0.1". Elevations: "DEFAULT" chip and "BEAM … PALLETS". | Same as T3 | 10-rules-panel, 11-project-settings, 03b, 02-hub, 01-login, 16 |
| T5 | Properties / Elevations tabs, Properties fold headers, top-bar menu headings | Oswald at **10 px** ("PROPERTIES", "ELEVATIONS", "COLUMN CHECK", "ARRANGE", "COLOR", "LAYERS", "File / Edit / View") | Off the scale and below the floor. Section headings at 10 px also read as captions. | Oswald 13–17 px for section headers; 11 px minimum | 04-plan, 09-topbar-menu |
| T6 | Library panel | Section labels "FLOOR PLANS, RACKING, OPS…" | PJS uppercase tracked, while the Properties folds use Oswald. That gives two heading styles side by side. | Headings in Oswald 700 uppercase | 08-left-panel-sections |
| T7 | Generate panel, start screen | Group labels "BUILDING", "COLUMN GRID (ft)", "ROW DIRECTION" | PJS uppercase at weight 600–700, not the section header pattern. "Describe the building" title is PJS 13. | Section header (mono 10 px blue "01" + Oswald 13–17) and field label 8.5–11 px uppercase steel | 06-generate-panel |
| T8 | Start screen, Elevations editor | Numbers in PJS | "48×40" (PJS 12) on the start screen; beam-face segments "3 in / 4 in / 5 in / 6 in" (PJS 11.5) in the editor. | Numbers in JBM | 03-start-screen, 18-elevations-editor-new |
| T9 | Properties → Column check | "−60" / "−0" figures | JBM 32 px at weight **800**. The 32 px size is off the scale (top is 26) and 800 is above the 600 cap. | ≤ 26 px, weight ≤ 600 | 13-properties-rack |
| T10 | Properties summary | "3,250 positions / 3,190 usable" | 32 / 19 px figures at weight 700. Both are off the scale (top is 26, then 18) and above the 600 cap. | 26 / 18 px, weight ≤ 600 | 04-plan |
| T11 | App-wide | Weight 700 (212 nodes) and 800 (11) in UI text | Over the cap outside Oswald headings. | ≤ 600 in UI | — |
| T12 | App-wide | Half-pixel sizes 9.5 / 10.5 / 11.5 / 12.5 px (12.5 ×405 rendered) | Off the scale. | 11 / 12 / 13 | — |
| T13 | Canvas and elevation drawing | 7 px JBM labels (×1505), IBM Plex Mono in the elevation drawing | 7 px is unreadable at 100 %; Plex Mono is a fourth mono face. | JBM; drawing text ≥ 9–10 px | 04-plan, 16-elevations-list |
| T14 | Text panel | DM Mono on Font / Size / Align and their inputs | A third mono face. | JBM | 03-start-screen (behind the dialog) |
| T15 | App-wide | 18 distinct `letterSpacing` values | The tracking scale is not followed. | .08–.14em on mono captions; none elsewhere | — |

### 2.2 Popups and overlays

Close methods were read from the source and checked by hand. "Fits at 640" was measured at 1700×640.

| Overlay | Position / z | Backdrop | Shadow | Radius | Padding | Close | Fits at 640 | Verdict |
|---|---|---|---|---|---|---|---|---|
| New project (start screen) | centred, z 200 | .55 THEME ✓ | THEME ✓ | 4 | 0 (inner sections 16–24) | Esc (= Draw it myself); no X | ✓ (top 24) | OK. The radius should be 2 per the box spec (THEME's overlay box is radius 2). |
| Project settings | centred, z 200 | .55 ✓ | `0 18px 60px rgba(0,0,0,.28)` ✗ | 4 | 0 | X, Esc, outside click, Cancel | ✓ (top 24) | Shadow off-theme; drawing toolbar shows above it (B3) |
| Rules profiles | centred, z 300, portal | `rgba(0,0,0,.32)` ✗ | `var(--shadow)` | 2 ✓ | header 11/14 | X, Esc, outside click, Cancel | ✓ (footer visible) | Backdrop off-theme; drawing toolbar above it (B3) |
| Export anyway? | centred, z 200 | `rgba(0,0,0,.25)` ✗ | `0 8px 30px rgba(0,0,0,.2)` ✗ | **10** ✗ | 16/18 | **none** (B7) | ✓ | No title / X, radius 10, buttons radius 6 at 12 px |
| Top-bar menu | absolute under the ⋯ button, z 100 | none | `0 4px 24px rgba(20,57,43,.08)` ✗ | **12** ✗ | 0 | Esc, outside click | scrolls (550 px, maxHeight) ✓ | Radius 12, shadow off-theme, no role (B8) |
| Elevations row menu (⋯) | fixed, portal, z 500 | none | THEME ✓ | 4 | 10 | outside click, ⋯ toggle, scroll / resize | ✓ flips up | OK (radius 4 is fine for a popover panel) |
| Elevation full screen | fixed, z 300 | none (full-bleed) | — | 0 | — | Esc, ⤡ button | ✓ | ⤢ / ⤡ text glyphs as icons (I3) |
| Generate panel ("Describe the building") | fixed under the Generate button, z 40 | none | `0 4px 16px rgba(0,0,0,.12)` ✗ | 2 ✓ | 0 | X only (no Esc, no outside click) | not checked when open at 640 (511 px tall from y 60, so it fits) | Shadow off-theme; no Esc |
| Drawing toolbar | fixed, z **9998** | — | `0 8px 22px rgba(11,16,29,.14)` ✗ | **11** ✗ | 0 | X (Hide drawing tools) | ✗ **off-screen** (B1) | z 9998 is above modals (B3) |
| Pinned tray | same `FloatingPanel` | — | same | 11 ✗ | — | X | same clamp issue as B1 | — |
| Row group bar | bottom centre, z 60 | — | `0 2px 10px rgba(0,0,0,.14)` ✗ | **8** ✗ | 8/10 | X | ✓ | Radius 8, shadow off-theme |
| Notice (Ctrl+A "Building and columns are kept") | bottom centre, z 61 | — | same as row group | 8 ✗ | 8/10 | auto / X | ✓ | Same |
| Fill bar ("Fill racking options") | top of the canvas, z 60 | — | `0 2px 10px rgba(0,0,0,.12)` ✗ | 8 ✗ | 6/10 | X, Esc | ✓ | Inputs 25 px radius 5 (C-list) |
| Zone placing status | bottom centre, z 60 | — | same | 8 ✗ | 8/10 | Esc | ✓ | Wrong word (B6) |
| Elevation legend chip | bottom left, z 50 | — | `0 1px 4px rgba(0,0,0,.12)` ✗ | 8 ✗ | 6/8 | — | ✓ | Radius 8 |
| "← Hub" | bottom left, z 55 | — | `0 2px 8px rgba(20,57,43,.12)` ✗ | 6 ✗ | 6/12 | — | covered at 640 (B2) | — |
| Color picker (Fill & stroke) | dropdown in Properties | none | not measured | not measured | — | Esc, outside click | not opened at 640 | Not opened in this pass |
| Tooltips | native `title` only | — | browser | — | — | — | — | 29–63 `title` tooltips per screen and no styled tooltip. That is acceptable, but icon-only buttons (layer toggles, canvas corner buttons) rely on them as their only label (33-tooltip-hover). |
| Toasts / confirms | — | — | — | — | — | — | — | There are no toast or confirm components. The notice bar and the Export ask cover this role. |

**z-index**
- There are 21 distinct z-index values, from 2 to 10000 (9998 / 9999 / 10000 are used by the floating panels and drag ghosts).
- Nothing was found under the canvas or the panel. The only stacking fault is the reverse one: the floating toolbar sits above the modals (B3).

### 2.3 Buttons and inputs

The live sweep found **134 distinct control variants** (tag × height × radius × padding × colours × font). The main families:

| Variant | Height | Radius | Font | Where | Off-target |
|---|---|---|---|---|---|
| Primary pine (Export, Generate layout, Save, Save & apply) | 34 / 40 / 32 / 32 | 8 / 2 / 2 / 2 | PJS 13–14 w600 | top bar, Generate panel, Project settings, Rules | Heights 32/34 vs 40; Export radius 8; weight 600 vs 500 |
| Secondary outline (Check layout, Cancel, + Add, Show issues) | 34 / 30 / 32 / 28 | 8 / 2 / 6 / 6 | PJS 12–13 | top bar, dialogs | Four heights, three radii |
| Check layout with errors | 34 | 8 | PJS red text + red icon on a red border | top bar | Red text as a button state; THEME has flag only for error *messages* |
| Floating drawing-toolbar cells | 37 | 9 | icon | drawing toolbar | Radius 9 |
| Library rows | 32 | 0 | PJS 13 | left panel | — |
| Library section headers | 36 | 7 | PJS 11 uppercase | left panel | Radius 7 |
| Top-bar icon buttons (undo, redo, ⋯) | 30 | 7 | icon | top bar | Radius 7 |
| Round pin / tools buttons | 30 | 50 % | icon | left panel top | Round is off-theme |
| Properties action buttons (Copy, Paste, Cut, Group…) | 27 | 5 | **JBM 10** | Properties | Mono words at 10 px, radius 5 |
| Layer buttons | 24 | 5 | icon | Properties → Layers | 24 px is under compact (32) |
| Tabs (Properties / Elevations) | 34 | 0 | Oswald 10 | right panel | 10 px |
| Segmented (Front/Side, Simple/Detailed) | 26 | 2 | PJS 12 | Elevations toolbar | pine-active ✓; height 26 |
| Segmented (Yes/No, Auto/Horizontal/Vertical) | 31 | 2 | PJS 12 | Generate panel | pine-active ✓; height 31 |
| Segmented (Ask / Auto apply) | 22 | 4 | PJS 11 | Row group bar | height 22 |
| Menu segment buttons (theme / units) | 26 | 6 | JBM 10 | top-bar menu | mono words |
| Toggles | 20 | 999 | — | Properties (Require pick…, Show markings) | Pill radius (exempt only if THEME allows switches) |
| Wall-thickness chips 3"/6"/9"/12" | 22 | 4 | JBM 10 | Properties → building | The selected chip shows only a darker outline, not pine-active |
| Fit | 26 | 2 | PJS 12 | Elevations toolbar | height |
| Inputs — start screen | 30 in a 32 box | 0 | JBM 13 | New project | 30 vs 36–40 |
| Inputs — Properties | 29 | 6 | JBM 12 | Properties | radius 6 |
| Inputs — Project settings | 30 | 2 | JBM 13 | Project settings | 30 vs 36–40 |
| Inputs — Generate panel | 32 | 2 | JBM 13 | Generate panel | — |
| Inputs — Fill bar | 25 | 5 | JBM 11 | Fill bar | 25 px, radius 5 |
| Inputs — elevation editor inner | 24 | 2 | JBM 12 | Elevations editor | 24 px |
| Search | 28 | 8 | PJS 14 | left panel | radius 8 |
| Selects (Rules, Project settings forklift) | 28–30 | 2 | **JBM** 12 | Rules, Project settings | Words in mono; native chevron |
| Row-menu buttons | 28 | 2 | PJS 12 | Elevations ⋯ menu | — |
| Hub cards | 243 | 4 | — | Hub | ✓ |
| Login button | 45 | 2 | PJS 14 | Login | 45 vs cta 44 |
| Library footer (Project Settings / Properties) | 40 | 2 | PJS 12 | left panel | — |
| Export window buttons | 32 | 6 | **Arial 13 bold**, yellow | export window | B9 |
| Apply to N selected rows | 32 | 2 | PJS 13 | Elevations | The disabled state is a muddy grey-green, not a lighter pine |
| Danger | — | — | — | Delete all (Properties), trash icons (Project settings) | There is **no danger variant**: "Delete all" is a plain mono button and trash icons are grey |

**Summary**
- Heights in use: 20, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 36, 37, 40, 45.
- THEME allows four heights: 32 / 36 / 40 / 44.
- Radii in use, static: 4 ×44, 5 ×34, 2 ×27, 6 ×22, 8 ×18, `R` ×14, 7 ×12, 50 % ×11, 3 ×9, 1 ×5, 9 ×4, 11 ×3, 999 ×3, 10 ×2, 12 ×1.
- THEME allows two radii: 2 and 4.

### 2.4 Colours

Hardcoded hex values per file (uses / distinct). **Exempt by rule** (canvas drawing, object category colours, palette grids, theme swatches) is marked *exempt*. Everything else is chrome and should be a token.

| File | Uses / distinct | Main values | Notes |
|---|---|---|---|
| `index.css` | 146 / 102 | token blocks for studio / obsidian / blueprint + Trace | Tokens live here; fine. But the **planner still ships dark themes** (obsidian, blueprint, `#2A2D36`, `#5BC8FF`). THEME says no dark mode in the planner. |
| `components/Canvas/FloorPlan.jsx` | 77 / 11 | `#4A9EFF` ×24, `#F0B429` ×12, `#555A6A`, `#2A2D36`, `#E8EAF0` | *Exempt* drawing, except `#4A9EFF` selection blue (see A1) |
| `canvas2/RowGroupBar.jsx` | 25 / 8 | `#0B101D`, `#FFF`, `#6B7280`, `#E6E9EF`, `#C0392B`, `#B87309` | Chrome: old studio greys, and red / amber that are not `--flag` / `--amber` |
| `components/LeftPanel/FloatingToolbar.jsx` | 24 / 18 | `#FFFFFF`, `#22C55E`, `#888888`, `#B4B0A4` + category hues | Category hues are exempt; `#22C55E`, `#888888`, `#FFFFFF` are chrome |
| `shell/Hub.jsx` | 24 / 9 | `#14392B` ×7, `#ECEAE1`, `#D6D4C9`, `#6E7A6F`, `#161C18`, `#B8791E` | Right colours, but hardcoded rather than tokens; `#6E7A6F` ≠ steel `#767C74`, `#161C18` ≠ ink `#171A18` |
| `shell/Login.jsx` | 20 / 10 | `#6E7A6F`, `#14392B`, `#F2F1EC`, `#5C8574`, `#2C5B47` | Same drift |
| `components/Elevations/ElevationsTab.jsx` | 18 / 12 | `#1B4FD8`, `#1B3A8C`, `#E9EEFB`, `#C07A12`, `#6B4A0B`, `#F8F0DF` | The THEME message colours, but inline; should be shared tokens |
| `canvas2/FillTool.jsx` | 17 / 8 | `#2F7BD8`, `#FFF`, `#E6E9EF`, `#6B7280`, `#0B101D` | Old studio greys in chrome; `#2F7BD8` selection blue |
| `canvas2/Canvas2.jsx` | 15 / 5 | `#FFF`, `#3A4152`, `#E6E9EF`, `#ECEAE1`, `#0B101D` | Old studio greys in chrome |
| `canvas2/shapes.jsx` | 13 / 9 | `#4A9EFF`, `#F0B429`, `#3B6FB5`, `#2F7BD8` | *Exempt* drawing, except selection blue |
| `App.jsx` | 9 / 5 | `#14392B`, `#161C18`, `#6E7A6F`, `#F2F1EC`, `#ECEAE1` | Chrome |
| `canvas2/AreaPrompt.jsx` | 9 / 3 | `#0B101D`, `#FFF`, `#E6E9EF` | Chrome, old studio |
| `components/RightPanel/PropertiesPanel.jsx` | 9 / 9 | `#818CF8`, `#A78BFA`, `#34D399`, `#2DD4BF`, `#FBBF24`, `#F472B6`, `#B87309` | Mostly the *exempt* palette; `#B87309` is a chrome warning |
| `components/Toolbar/TopBar.jsx` | 8 / 8 | `#ECEAE1`, `#14392B`, `#F97316` **orange**, `#388BFD`, `#38BDF8`, `#161B22`, `#0D1829` | Orange and blues in chrome (theme swatches are exempt) |
| `canvas2/DimensionLabels.jsx` | 7 / 4 | `#4A9EFF`, `#0A0D16`, `#F0B429` | Dimensions should be `--blue #1B4FD8` |
| `components/RightPanel/LabelsPanel.jsx` | 7 / 7 | palette | *Exempt* palette |
| `canvas2/CopyChange.jsx` | 6 / 6 | `#2F7BD8`, `#C0392B`, `#E67E22` **orange**, `#D97706`, `#FBBF24` | Orange accent |
| `canvas2/ElevationsCanvas.jsx` | 6 / 5 | old studio greys | Chrome |
| `components/Project/ProjectSetup.jsx` | 6 / 5 | `#1B4FD8`, `#14392B`, `#A8341C` | THEME values, inline |
| `components/Elevations/ElevationDrawing.jsx` | 5 / 4 | `#FFFFFF`, `#0B101D`, `#2F7BD8` | `#2F7BD8` blue for the picked beam |
| `components/Generate/GeneratePanel.jsx` | 5 / 1 | `#FFF` ×5 | Should be `--paper` |
| `components/LeftPanel/WarehouseObjectPicker.jsx` | 5 / 4 | `#F59E0B`, `#6366F1` (+ alpha suffixes) | Category hues, *exempt* |
| `canvas2/RowGroupPreview.jsx` | 3 / 3 | `#2F7BD8`, `#E67E22`, `#D35400` | Orange |
| `components/RightPanel/ColumnCheckPanel.jsx` | 2 / 2 | `#E67E22`, `#B85F12` | Orange |
| `components/RightPanel/LayoutCheckPanel.jsx` | 2 / 2 | `#C0392B`, `#B87309` | Not `--flag #A8341C` / `--amber #D98324` |
| `canvas2/ZoneEdit.jsx`, `MeasureTool.jsx`, `GroupRotateOverlay.jsx`, `Overlays.jsx`, others | 1–3 each | `#C0392B`, `#F0B429`, `#C084FC`, `#A78BFA`, `#22C55E` | Mixed |

**Accent misuse**

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| A1 | Plan, Row group, Elevations | Selection outlines and handles on the canvas (`#4A9EFF`, `#2F7BD8`), the picked beam in the elevation drawing | **Blue used for selection.** | Pine for selection; blue only for dimensions and focus | 22-row-group-bar, 21-elevations-side-detailed |
| A2 | Project settings, Elevations ELEVATIONS checkbox, start screen | Native radio and checkbox controls render browser blue | Blue for selection | Pine (`accent-color: var(--pine)`) | 11-project-settings, 04-plan |
| A3 | Properties → Column check | "−60 / −0" in red, plus the orange `#E67E22` tint | Red / orange for a figure that is information, not an error | Ink figures; flag only for a real error | 13-properties-rack |
| A4 | Copy/change, Row group preview, Column check, TopBar | `#E67E22`, `#D35400`, `#F97316` | Orange accent | No orange accent (amber `#D98324` for warnings only) | 22-row-group-bar |
| A5 | Check layout, Row group bar, Zone edit | `#C0392B` / `#B87309` | Error and warning colours are not the THEME values | flag `#A8341C`, amber `#D98324` | 28-check-layout |
| A6 | Plan dimension labels | `#4A9EFF` light blue on dark chips; orange-tinted clear labels | Dimension blue is not `--blue` | `--blue #1B4FD8` | 04-plan |
| A7 | Properties summary "By type" bars | Indigo / violet bullets and bars (`#818CF8` / `#A78BFA`) | Not category colours of the toolbar; read as a stray accent | Category colours or pine | 04-plan |
| A8 | Top bar | "Check layout · 1 error" turns the whole button red | Red used as a button state | A flag count chip or flag icon; button stays secondary | 29-export-ask |
| A9 | App-wide | Studio greys `#0B101D` / `#3A4152` / `#6B7280` / `#E6E9EF` / `#F1F3F6` hardcoded in canvas2 chrome (RowGroupBar, FillTool, AreaPrompt, Canvas2, ElevationsCanvas) | The old cool-grey palette beside the new warm Trace palette | ink `#171A18`, steel `#767C74`, line `#DEDACF`, bg2 `#EAE8E1` | 22, 24 |

### 2.5 Messages

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| M1 | Check layout panel | Errors / Warnings list | Coloured heading text and icon only; no message box. Error red `#C0392B` and warning `#B87309` are not THEME values. | Error box `#A8341C` on `#F5E7E3`, text `#6B2413`; warning `#C07A12` on `#F8F0DF`, text `#6B4A0B` | 28-check-layout, 29-export-ask |
| M2 | Properties top | "● Aisle labels visible" black pill banner | A status note styled as a solid ink pill in mono | Note box (blue border on `#E9EEFB`) or a plain caption | 06-generate-panel, 13 |
| M3 | Properties summary | "13 overlapping bays not counted" in amber mono | A warning shown as a caption, not a box | Warning box | 29-export-ask |
| M4 | Hub | "Needs attention" amber tag with an amber left rule on a beige card | Close to a warning, but the background is beige, not `#F8F0DF` | Warning box | 02-hub |
| M5 | Generate panel | "Pallet 48×40 … wall clearance 3" — Project setup" | A note as plain grey text | Note box | 06-generate-panel |
| M6 | Rules | "Trace Default is read-only — add a profile…" | A note as a mono line with a lock icon | Note box | 10-rules-panel |
| M7 | Elevations | "Select rows on the plan…", "Same as … use that one instead?", "Clear height not set" | ✓ THEME note and warning boxes (blue / amber, radius 2). Uses inline hex rather than shared tokens (A-list). | — | 16, 18, 19 |
| M8 | Elevation drawing | Amber depth note `#B5730F` | A third amber, ≠ `#C07A12` / `#D98324` | Warning colours | 21-elevations-side-detailed |
| M9 | Row group bar / notice | Neutral bars for "Building and columns are kept" | ✓ correct level (note), but styled as a floating status chip | Note style | 25-notice-ctrl-a |

### 2.6 Spacing and alignment

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| S1 | Properties → building | W / H / Rot / Label / Size rows | Labels in a narrow left column at 9–10 px mono; "ft" units sit outside the inputs; the "H" label wraps under "ft". | Field label above or left in a fixed column; unit right-aligned **inside** the input | 06-generate-panel |
| S2 | Properties → Column check | "8 columns in racks · −60 blocked from the aisle" | Wraps mid-phrase at 9 px | 11 px, one line or a clean break | 12-project-properties |
| S3 | Elevations toolbar | Front/Side · Simple/Detailed · beam label · Fit · ⤢ | Gaps 0 / 8 / 12 px mixed; the beam label is truncated (B5) | 8 px steps | 16-elevations-list |
| S4 | Project settings | Column headers vs inputs | Mono header labels sit left of the input text; the "Default" radio column is narrower than its header | Labels aligned to the input text | 11-project-settings |
| S5 | Plan top-right | Generate button (fixed) | It is fixed to the canvas top-right and sits under the top-bar menu when that is open; it moves with the right panel width (1305 vs 1097) | — | 09-topbar-menu |
| S6 | Library | Expanded panel footer vs rows | The footer labels are 12 px with 16 px left padding; the rows above have 15 px indent + icon. Not aligned with the section icons. | One left edge | 07-left-panel-expanded |
| S7 | Properties | Padding 10 / 12 / 14 / 16 px mixed between folds | Off the 4 / 8 / 12 / 16 scale | Spacing scale | 13b |
| S8 | Rules | Field rows: label + "from Trace Default" caption + input | The caption sits under the label, so the input row is offset 8 px from the label's baseline | — | 10-rules-panel |

### 2.7 Empty, loading and disabled states

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| E1 | Properties, nothing selected | "No object selected / Draw or click a shape…" | Mono at 10 / 9 px, faint, top-left; no icon. Reads as debug text. | Empty state in PJS, muted, with a line of guidance | 04-plan |
| E2 | Properties → Arrange | Disabled Copy / Cut / Group / Ungroup | Grey text on grey, no cursor change, about 1.7:1 contrast | A disabled style consistent with the other disabled controls (opacity .45 of the enabled style) | 04-plan |
| E3 | Elevations | "Apply to 0 selected rows" | Disabled shown as a muddy grey-green fill, unlike E2 | Same disabled rule | 16-elevations-list |
| E4 | Generate / Fill | Long operations | No loading indicator; Generate layout on the start screen only disables (`busy`) | A busy state on the primary button | 03-start-screen |
| E5 | Hub | Card counts | Hardcoded demo counts; no empty state for 0 projects | — | 02-hub |
| E6 | Search (library) | No results | Not opened in this pass — needs a check | "No matches" line | — |
| E7 | Elevations list | Only one elevation | No empty state needed (there is always a default). OK. | — | 16 |

### 2.8 Icons

| # | Screen | Element | What is wrong | THEME.md target | Screenshot |
|---|---|---|---|---|---|
| I1 | App-wide | Lucide sizes 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21 | 11 sizes | One size per context | — |
| I2 | App-wide | `strokeWidth` 15 distinct values (0.5–5); `absoluteStrokeWidth` used 52 times, while **45 icons have a size and no `absoluteStrokeWidth`** | Stroke weight varies with size | stroke ~1.5 with `absoluteStrokeWidth` | — |
| I3 | Various | Text glyphs used as icons: ✕ ×5, ⤢ ×4, ← ×3, ⚠ ×3, ⋯ ×2, ▲▼, ✎, ✓, ✗, ↑↓ | A mixed set beside Lucide (e.g. "← Hub", "⤢" full screen, "⋯" row menu, the ⚠ in notes) | Lucide only | 16, 04-plan |
| I4 | Export window | 🖨 emoji in "Print / Save as PDF" | Emoji | Lucide `Printer` | 30-export-window |
| I5 | Properties → Column check | "MHE" forklift icon | A custom glyph at a different stroke from Lucide | Matched to Lucide spec | 13-properties-rack |

---

## 3. Cosmetic (12)

| # | Screen | Element | What is wrong | Target | Screenshot |
|---|---|---|---|---|---|
| C1 | Top bar | "Trace / Untitled layout" | Logo Oswald with a ◆ glyph; breadcrumb PJS 13 grey | OK, but ◆ is a text glyph | 04-plan |
| C2 | Library collapsed rail | Round pin and tools buttons | 50 % radius | 2 px | 08b-left-panel-collapsed |
| C3 | Library expanded header | "T Library" logo tile at radius 6 | — | 2–4 | 07 |
| C4 | Canvas corner buttons (measure, eye, fit) | Radius 8, 30 px | — | 2, 32 | 04-plan |
| C5 | Elevation legend chip | Checkbox + "ELEVATIONS" + "5 levels · 40×48 · Main 325 bays" | Mixed PJS / JBM on one line; the uppercase label is not a field label style | — | 04-plan |
| C6 | Row group bar | "Ask" pine pill at radius 4 in a radius-8 bar | Nested radii | 2 / 4 | 22-row-group-bar |
| C7 | Hub | Card icons in beige squares at radius 2; "Open →" uses a text arrow | → glyph | Lucide `ArrowRight` | 02-hub |
| C8 | Login | "TRACE · dealer workspace · v0.1" in mono | Words in mono | PJS caption | 01-login |
| C9 | Properties → Color | "Fill & stroke / TRANSPARENT · 70%" | Mixed weights and cases in one control | — | 04-plan |
| C10 | Elevations list row | "DEFAULT" chip in mono uppercase at radius 2 | Fine as a caption; the size is 9 px | 10–11 px | 16 |
| C11 | Scrollbars | Default OS scrollbars in the right panel and the top-bar menu | — | Thin, line-coloured | 09 |
| C12 | Project settings | Trash icons grey at 14 px with no hover-danger | — | Flag on hover | 11 |

---

## 4. Counts per category

| Category | Broken | Inconsistent | Cosmetic | Total |
|---|---|---|---|---|
| 1 Typography | 1 (B9) | 15 (T1–T15) | 3 (C1, C8, C9) | 19 |
| 2 Popups / overlays | 5 (B1, B2, B3, B7, B8) | 12 rows off-theme in the table | 1 (C11) | 18 |
| 3 Buttons / inputs | — | 134 variants → 33 families listed, 16 heights, 15 radii | 4 (C2, C3, C4, C6) | 37 |
| 4 Colours | — | 27 files with chrome hex; 9 accent misuses (A1–A9) | 1 (C12) | 37 |
| 5 Messages | — | 7 (M1–M6, M8); M7 and M9 are correct | — | 7 |
| 6 Spacing / alignment | 1 (B5) | 8 (S1–S8) | 2 (C5, C10) | 11 |
| 7 Empty / loading / disabled | — | 6 (E1–E6) | — | 6 |
| 8 Icons | — | 5 (I1–I5) | 1 (C7) | 6 |
| Other (missing screens / wording) | 2 (B4 right-click, B6 "Placing row") | — | — | 2 |
| **Total** | **9** | **~118** | **12** | |

---

## 5. Suggested fix order

1. **Broken first.** All small and local:
   - B1–B3: clamp `FloatingPanel` to the viewport on resize, and drop its z-index below the modal layer (≤ 150).
   - B5: let the beam label shrink or wrap.
   - B6: fix the zone status wording.
   - B7: add X, Esc and outside click to Export ask.
   - B8: add menu roles.
   - B9: rebuild the export window chrome with tokens and Lucide.
   - B4 is a product decision: build right-click menus, or drop them from the brief.
2. **Tokens and fonts in `index.css`** (one file; fixes the most pixels):
   - set `--font-ui` to PJS and `--font-display` to Oswald, and remove the Inter / Montserrat import;
   - add `--flag`, `--amber`, `--blue` and the three message-box token triplets;
   - point the Trace palette at THEME values (`#171A18`, `#767C74`, `#DEDACF`);
   - decide whether obsidian / blueprint stay (THEME: no dark mode in the planner).
3. **Swap hardcoded chrome hex for tokens**, file by file from the colours table:
   - canvas2 chrome (RowGroupBar, FillTool, AreaPrompt, Canvas2, ElevationsCanvas);
   - then TopBar, Hub, Login, App, LayoutCheckPanel, ColumnCheckPanel, CopyChange.
   - Leave the *exempt* drawing, category and palette colours alone.
4. **Selection colour:** canvas selection blue → pine (A1); `accent-color: var(--pine)` on native radio and checkbox controls (A2); remove the orange (A4).
   - This touches drawing files. `FloorPlan.jsx` is under `Canvas/` and is **protected**, so it needs approval before editing.
5. **Mono misuse** (T3, T4): Properties, Rules, Project settings headers, Hub, Login. Words go to PJS and only the figures stay in JBM. This is the largest single visual change.
6. **Type scale and weights** (T5, T9–T12, T15):
   - move 9 / 9.5 / 10 / 10.5 / 11.5 / 12.5 px to 11 / 12 / 13;
   - 700 / 800 → 600 in UI;
   - tab and fold headings to Oswald 13;
   - one tracking value for captions.
7. **Controls:** one primary, one secondary and one danger button; heights 32 / 36 / 40 / 44; radius 2 for controls and 4 for panels; inputs with the unit inside.
8. **Popups:** one overlay recipe (backdrop .55, radius 2, THEME shadow) for Project settings, Rules and Export ask; floating bars and chips to radius 4 with the THEME shadow.
9. **Messages:** a shared `<Note level>` box (error / warning / note) for the Check layout list, the Properties banners, Generate, Rules and Hub.
10. **Icons:**
    - replace the text glyphs and the emoji with Lucide;
    - add `absoluteStrokeWidth` to the 45 icons without it;
    - settle on one size per context (14 inline, 16 buttons, 21 / 22 library).
11. **Empty, loading and disabled states, and the cosmetic list.**
