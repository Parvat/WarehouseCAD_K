# Claude Code — render the objects (do in order)

Reference (the locked design): `trace-object-design-spec.md` (geometry) +
`trace-layout-rendered.svg` (the look). Colours: fill `#DCE8DC` · outline `#14392B`
· dividers `#3E6B54` · flue/beam `#E0A63C` · column `#3B6FB5` · conflict `#C0392B`.

## STEP 1 — fix the input focus bug (2 min, do first)
In `src/components/Generate/GeneratePanel.jsx`, the `Field` component is defined
INSIDE `GeneratePanel`, so every keystroke remounts the inputs and drops focus.
Move `Field` (and the `labelSt` it uses) out to module scope, top of the file.
No logic changes.

## STEP 2 — render the 7 rack types to spec
Rack geometry lives in `src/components/Canvas/ShapeGeometry.jsx` (see the
`rack_cantilever` case for the pattern). Update each rack case to draw from the
object's own data — DO NOT change the object data or the store, only how it's
drawn. Do ONE type at a time and eyeball it against the SVG before the next.

- **rack_row (selective):** green box, pine outline, one vertical divider per bay
  boundary (`beams.length`), solid pine cap each end. NO centre line.
- **rack_double_row:** two bands + bay dividers + ONE orange line at the flue
  between them. End caps span both.
- **rack_cantilever:** already correct — just confirm arms stay centred on towers.
- **rack_drive_in:** lane dividers (`lanes`), CLOSED back wall (solid pine far
  end), open near end, entry arrows one end.
- **rack_drive_through:** same lanes, both ends open, arrows through.
- **rack_pushback:** lane dividers + `palletDeep` nested cart rects per lane,
  arrows one end.
- **rack_pallet_flow:** lane dividers + dashed roller lines down each lane,
  arrows one end.

## STEP 3 — rendering performance (after the shapes look right)
- **Level of detail:** below ~15% zoom, draw each rack as ONE plain green rect
  (skip bay/lane detail). Full detail only when zoomed in.
- **Cull off-screen:** skip rendering racks whose bounds are fully outside the
  viewport.
- **Conflict tint:** when the column check flags a rack/aisle, overlay the
  affected slot/segment in `#C0392B`.

## Rules
- Rendering changes only — never change object data, the store, `canvas.js`, or
  `constants/`.
- After each type: `npm run build` clean, `npm test` green.
- Match the SVG structurally; exact bay widths come from the real numbers, so it
  won't be pixel-identical — the structure is what matters.
