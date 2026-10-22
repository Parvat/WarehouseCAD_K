# Trace — Studio theme (replaces THEME.md for app chrome)

Source of truth: the mockup files in `design/studio/*.dc.html`. When this file and a mockup disagree, the mockup wins. Every value below is copied from them.

## 1. Layout model

- Canvas fills the whole window. Everything else floats on it as dark **islands**. No fixed panels, no frame.
- Islands (all `position: fixed` over the canvas, 16px from the window edges):
  - **Top-left**: logo · project name ▾ (opens layout menu) · Auto-saved. Height 44.
  - **Top-right**: undo · redo · | · Generate/Regenerate · Check (count chip) · Export (mint). Height 44.
  - **Left rail**: 48 wide, icon buttons 36×36: Floor plans, Racking, Ops, Structural, Safety, Zones, Blocks · | · Project settings. Top 76.
  - **Library flyout**: opens right of the rail (left 72, top 76, width 232). List rows 36h: hollow icon · name · hint. Footer hint line.
  - **Right card**: width **300**, top 76, right 16. Height = its content; max = down to 76px above the bottom; then scrolls inside. Same width for every tab and state. Holds Properties / Elevations tabs, Generate, Check layout, zone and group editing.
  - **Tool pill**: bottom centre, 20px from bottom. Buttons 36×36, radius 8, groups split by 1px separators. Active tool = active fill.
  - **Bottom-left**: Hub · | · zoom − 100% +. Height 40.
  - **Bottom-right**: Aisles · Checks · Elevations layer toggles · Fit. Height 40.
- **Selection bar**: dark pill (radius 12) floating just above the selected object. Contents per object type (section 6).
- **Mode bars** (Row group, Split, Fill): dark pill at top of canvas, centred, top 76.
- **Notices**: dark pill above the tool pill, 76px from bottom, with an action (Undo) and ✕.
- **Modals** (Project settings, Rules, Export, New project): backdrop + centred dark card.

## 2. Colours

### Chrome (dark islands)
| Token | Value | Use |
|---|---|---|
| ground | `#F4F3EF` | canvas background |
| ground-dot | `#D9D6CC` | 1px dots every 20px |
| island | `#1F2321` | every floating surface |
| island-line | `#323835` | 1px island border |
| inset | `#2A2F2C` | fields, segment tracks, chips, secondary buttons |
| divider | `#2E3431` | lines inside islands |
| separator | `#3A403C` | short vertical separators, ghost button border, neutral active segment |
| active | `#2E4A3C` | active tool / tab / segment / selected list row |
| text-strong | `#F2F4F1` | titles, values |
| text | `#E8EAE6` | body |
| icon | `#C9CEC9` | idle icons |
| muted | `#9AA29C` | labels, hints |
| faint | `#7E8680` | placeholders, shortcut keys |
| accent | `#7BD3A4` | primary buttons, active icon/text, logo |
| on-accent | `#0F2A1F` | text on accent |
| select | `#2E7D5B` | selection outline + handles on the canvas |
| danger-icon | `#FF9C86` | delete icons |

### Message levels (chips and boxes inside islands)
| Level | Background | Text |
|---|---|---|
| Error | `#4A231B` | `#FFB4A3` (box title `#FFD9CF`) |
| Warning | `#3A2E17` | `#F2C77A` |
| Note | `#1E2E4A` | `#A9C4FF` |

Warning action button: background `#F2C77A`, text `#3A2E17`.

### Drawing (canvas plan and elevation sheet — paper palette, same as exports)
| Element | Value |
|---|---|
| Building floor | `#FFFFFF`, wall `#1F2321` 2px |
| Rack | hollow: fill `#FFFFFF`, outline `#2E5E48` 1.2, bay lines `#A9C2B3` |
| Uprights, beams (elevation) | `#14392B` |
| Pallet | fill `#E8DCC2`, edge `#B08F52`, deck strip `#C9A870` |
| Dimensions, dimension numbers | `#1B4FD8` |
| Words in drawings | `#767C74` |
| Ceiling line | `#41483F`, dashed 6 4 |
| Max load line | `#C99A1E`, dashed 5 3; band to ceiling `#F2C230` at 22% |
| Zone | fill `#EFEDE6`, edge `#B9B3A4` |
| Lost position X | `#C0452A` |
| Elevation sheet | `#FFFFFF` with grid `#EFEEE9` every 14px, radius 8 |

### Plan drawing rules (see design/studio/PlanDetail.dc.html)
- **One drawing at every zoom, for every object in the layout.** No switch at all: racks, uprights, flues, walls, columns, doors, zones, MHE, safety items, blocks, text objects, dimension lines and X marks are each drawn one way only, at true size. Zooming only scales them; there is never a moment where one version swaps for another, so nothing jumps, appears, disappears or changes shape while zooming. Lines that would go under 1px stay at 1px.
- **No switch at all for uprights.** Always drawn at their true width (3″ or 4″ from the frame), minimum 1px on screen. Zoomed out they just look like thin lines because they are small. There is never a moment where one version swaps for another, so nothing jumps or changes shape while zooming. Outlines 1px, non-scaling, pixel-snapped.
- Back-to-back pair = one outline with a visible flue gap between the inner faces.
- Aisle width = dimension line face to face with slim open chevron arrowheads (8px, fixed size). Value sits in a break in the line (no halo, no badge); if the aisle is too narrow for the break, value goes 5px above the line. No badge. Format `10′-6″`. Blue OK, amber `#B8730E` (text `#9A5F0A`) under pick width, red `#C0452A` (text `#B23A22`) under travel width. All aisle labels on one row; slide only to clear a column.
- Column = solid `#1F2321` square; clearance to each face = small grey `#767C74` number (9.5px) on a thin dotted `#9AA29C` line, **no arrowheads**; touching a face = number only.
- Lost positions per pallet position (not per bay): a fixed-size square X only, `#C0452A` 1.5px, no fill and no outline, so bay lines stay visible. Bay lines `#9FB8A9`.
- The only zoom-based change allowed: small labels (column clearances, bay numbers) fade in when zoomed in. They fade in place, never move, with a buffer (hysteresis) so they don't flicker at the threshold. Objects themselves never change.
- Dimension numbers in drawings: Plus Jakarta Sans 600, tabular figures.

## 3. Type

- **Plus Jakarta Sans** for every word. **JetBrains Mono** for numbers and units only.
- Base 13 / 400. Secondary 12. Captions 11 uppercase, tracking .06em, muted.
- Titles 600: island title 13–14, card title 14, modal title 15, page title 18–22.
- Big figures: mono 24 / 500 (right card), 15 (summary rows).
- Max weight 600. No Oswald in Studio.
- In drawings: words PJS 10–10.5 muted; numbers mono 9–10.5 blue; level tags PJS 8.5 / 600 `#8A7A55` inside the right pallet, top-right corner.

## 4. Shape and depth

| Thing | Radius | Shadow |
|---|---|---|
| Island (top bars, rail, right card, flyout, bottom bars) | 10 | `0 8px 24px rgba(15,18,16,.18)` |
| Tool pill, selection bar, mode bars | 12 | `0 10px 28px rgba(15,18,16,.22)` |
| Modal | 12 | `0 24px 60px rgba(15,18,16,.4)`; backdrop `rgba(15,18,16,.45)` |
| Buttons 36h | 8 | — |
| Buttons / fields 26–34h | 6 | — |
| Segment inner buttons, chips | 4–6 | — |

## 5. Controls

- **Primary**: accent fill, on-accent text, 600. Heights: 36 in cards and modals, 28 in bars.
- **Ghost**: transparent, 1px separator border, text colour.
- **Inset**: inset fill, text colour (Depth, Fit, secondary bar actions).
- **Icon button**: 28–36 square, transparent, icon colour; active = active fill + accent icon.
- **Segmented**: inset track with 2–3px padding; active segment = active fill + accent text (or separator fill + strong text for neutral choices like Properties/Elevations).
- **Field**: inset fill, no border, radius 6; numbers mono 12; highlighted (being edited) = 1px select border. Heights: 30 in the right card, **26 in dialogs** (Project settings, Rules), **28 on New project**. Label above field: 11px muted, 6px gap.
- **Dialog spacing**: sections padded 20px 24px (New project 20px 28px), 14px between fields in a row and between rows. Chips 24h.
- **Toggle**: 30×18, off `#3A403C`, on accent with on-accent knob.
- **Scrollbars (everywhere, every scrolling area)**: thin, 8px; thumb `#3A403C` radius 4 with a 2px `#1F2321` border, hover `#4A514D`; track transparent. Firefox: `scrollbar-width: thin; scrollbar-color: #3A403C transparent`. Set once globally, never per component; no browser-default scrollbar anywhere.
- **Icons**: see section 9 (box style, 24px).
- **Hover** (island buttons): background `#2A2F2C` (inset); an active button (pressed tool, on toggle, open section) hovers `#355A47`.
- **Hover in the right card**: list rows, the More row, Check items, secondary (ghost), inset and danger buttons → background `#2A2F2C`. No hover change on toggles, colour swatches, the segmented control's active segment, a picked row or the mint primary button.
- **Keys while typing**: with focus in an input, select or textarea, Ctrl/Cmd + A C V X Z Y, Delete / Backspace, the arrows and the single-letter tool keys act on the text only, never on the canvas.
- **Disabled**: the same control at 45% opacity, cursor not-allowed.
- **Tool shortcuts** (shown in the tool pill's hint, key in mono): V Select · P Pan · F Fill racking · G Row group · S Split · M Measure · L Line · T Text.

## 6. Selection bar contents

| Selected | Bar |
|---|---|
| One rack row | Elevation ▾ · add/remove bay · Split · Row group · Rotate · Duplicate · Delete · ⋯ |
| Several rows | Apply elevation ▾ · Even spacing · Align · Row group · Delete |
| Zone | Type ▾ · W × L fields · Lock · Duplicate · Delete |
| Column | Absorbed / Removed · Show clearances |
| Aisle label | Width field · Lock |
| Wall / building | Thickness 3″ 6″ 9″ 12″ · Add door · Wall clearance |
| Right-click empty floor | Paste · Fill racking here · Add zone ▾ |

## 7. Behaviour rules

- Generate opens **inside the right card**. Top bar label: "Generate" on an empty plan, "Regenerate" when racks exist; Regenerate shows the warning line "Keeps zones, doors and columns. Replaces racking."
- Empty plan shows a centred card: "Your building is ready" · Generate layout · Draw racks. Gone after the first rack.
- Elevations: Depth and full-screen buttons sit in the "In this layout" row (editor: in its header). The drawing has no buttons on it.
- Elevation drawing labels (panel): Ceiling · Max load height (sprinklers −N) · free headroom + top of load stacked in one column on the far left · Frame dimension · beam heights at each beam (right) · L tags inside right pallet · pallet height and width arrows inside L1 pallets · face (4″) and lift-off (6″) as extension lines on the left of L1 · Beam length · pallets · capacity under the rack.
- Exports and printing always use the paper palette, never the dark chrome.

## 8. How to build from this

1. One screen per prompt. Open the matching mockup file, match it exactly.
2. Screenshot your build at 1440×900 next to the mockup screenshot. List every difference. Fix until none. Put both images in the report.
3. Never invent a value. If something is missing here and in the mockup, stop and ask.

## 9. Icons (locked) — see design/studio/Icons.dc.html

One icon style everywhere: **D, box style.** Objects, rail categories, tools, selection-bar actions, top-bar actions and small buttons.

- Flat solid shapes, no outlines, on a 24px grid; objects sit in the middle ~16px.
- Straight edges on whole pixels (`shape-rendering: crispEdges` on rects); curves, diagonals and arrowheads stay smooth.
- Thin parts are 1px: walls, door wall stubs, forks, dimension lines, dashed boxes, row lines, cut lines, tray edges. Bodies 2–10px.
- Draw only at 24px or exactly 48px (2x). Never scale to other sizes.
- **Object colours** (on the dark UI): ops `#F59A45` (dark parts `#C46F22`, cab `#FFD5AE`); racks `#7BD3A4` with dark `#1F2321` bay gaps; structure `#C9CEC9` (stairs/conveyor `#8C948E`); safety yellow `#F5CD4A`, red `#F07A5F`, teal `#5FC4B8`, exit `#7BD3A4`; zones in their own colour; dimension `#7FA6FF`.
- **Tool / action colours:** idle `#C9CEC9`, active `#7BD3A4` on the active fill `#2E4A3C`. Cut-outs inside a solid shape use `#1F2321`.
- Forklift, reach truck and pallet jack always show two forks.
- The same thing always uses the same icon (rail, flyout row, selection bar, zone label).
- No other icon set. Not Lucide, not line icons.

## 10. Illustrations (later)

- **B, isometric**, is kept for 3D and illustrations only, never for clickable icons: the empty-plan card, Hub empty state, onboarding, loading while Generate runs, and a future 3D preview of the layout.
