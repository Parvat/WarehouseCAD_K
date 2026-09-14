# Trace CAD — Trace shell + skin + Generate (Phase 1)

## What the app now does
1. Boots into a **Login** page (Trace pine-on-paper skin) → **Sign in**.
2. Lands on a **Hub** — three doors: **Draw**, Inspect, Label.
3. **Draw opens your real CAD editor**, now re-skinned to the Trace theme
   (pine on warm paper, Oswald / Plus Jakarta / JetBrains Mono).
4. Inside the CAD, a **"Describe the building"** panel (top-left): type
   length + width, pick a rack type, press **Generate layout** → the building is
   drawn and filled with real, editable racks; the pallet count is read off them.
5. A **← Hub** button (bottom-left of the CAD) goes back to the Hub.

Inspect / Label are placeholder screens for now — they'll read a layout later.

## How to run
```
npm install
npm run dev        # open the URL it prints
npm test           # 77 tests pass
npm run build      # production build
```

## How the re-skin works (no components touched)
The app themes everything through CSS variables. A new `[data-theme="trace"]`
block in `src/index.css` defines the pine/paper values, and `App.jsx` sets the
theme to `trace` on load. Every panel/toolbar re-skins through the variable
system — no component or protected file was edited to restyle. Canvas object
colors (rack fills) stay as-is by design.

## Files added / changed
- `src/shell/Login.jsx`, `src/shell/Hub.jsx` — the two front pages (new).
- `src/App.jsx` — now a small router: login → hub → CAD (rewritten).
- `src/index.css` — added the `trace` theme block.
- `index.html` — added Oswald + Plus Jakarta Sans fonts.
- `src/generate/traceGenerate.js` — generate adapter + Phase-1 stub (new).
- `src/components/Generate/GeneratePanel.jsx` — the Brief panel (new).
- `src/__test__/traceGenerate.test.js` — generate tests (new).

Never touched: the store, canvas math, CanvasArea/Objects/Overlays, constants.

## Phase-2 (later, not in here)
- Real optimizing rack-engine swaps in behind `generateAndPlace` — the object
  adapter doesn't change.
- Inspect / Label become real apps reading the shared layout.
- Front pages get real projects, sign-in, and the share-with-customer flow.
