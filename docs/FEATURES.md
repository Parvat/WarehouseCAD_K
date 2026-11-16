# Trace CAD — Feature list

One master list. Merged from: PP's feature notes, the generic CAD roadmap, the product roadmap (Layout Checker / Import), the CLASS reference screenshots, and the open work list (Nov 2026).
Also merged: TRACE_ROADMAP.md and PANEL_FEATURES.md (new rows marked "(from …)"), PLATFORM_PLAN.md (rows in section 12 and 13, details at the end).

**Status column**: Claude Code fills it from the code: Done · Partial · Todo. Items already built stay listed so nothing is lost.
**Phase**: 1 = this phase (sellable to a dealer) · 2 = next phase · 3 = later / AI.

---

## 0. Quality bar (applies to every item)

Users forgive a plain interface. They won't forgive frustrating drawing. So, in order:

1. Smooth drawing performance (no lag at 50k+ positions)
2. Excellent snapping, with clear indicators
3. Intuitive selection and editing
4. Responsive keyboard shortcuts
5. Clear panel organisation and good typography
6. Helpful empty states
7. Subtle animations
8. Glass effects only on small floating parts: the floating toolbar, command palette, colour picker and context menu. Never on cards or the canvas.

---

## 1. Units of measure — Phase 1

| Item | Phase | Status |
|---|---|---|
| Project unit setting: Imperial (ft-in) or Metric (m, mm) | 1 | Partial — Units select saved in Project settings; nothing reads it, everything shows ft-in |
| Every input accepts any unit typed (12'6", 150 in, 3.8 m, 3800 mm) and converts | 1 | Partial — ft-in typed in some fields (elevations, Fill aisle, zone size); no metric parsing |
| Display precision: 1/16 in or 1 mm; feet-inches format 12′-6″ | 1 | Partial — 12′-6″ format to the inch; no 1/16 in, no mm |
| Labels, dimension chains, Properties, BOM sizes, Tally, PDF, xlsx/CSV all follow the project unit | 1 | Todo |
| Store one internal unit (no rounding drift when switching) | 1 | Done |
| Pallet, beam and deck sizes shown in the dealer's catalogue unit | 2 | Todo |

## 2. Canvas engine

| Item | Phase | Status |
|---|---|---|
| Infinite pan, zoom, Fit, zoom to selection | 1 | Partial — no zoom to selection |
| Snapping: grid, object edges, wall inner face, column, endpoint, midpoint | 1 | Partial — grid, edges, wall, column, rack end-to-end on move; no endpoint/midpoint |
| Better snap indicators (marker + label of what it snapped to) | 1 | Partial — guide lines only; no marker or label |
| Rulers and an origin | 2 | Partial — rulers (layout menu switch); no origin |
| Guides (drag from ruler) | 2 | Todo |
| Mini map for large buildings | 2 | Todo |
| Previous view / saved views | 2 | Todo |
| Performance: virtual rendering, smooth zoom/pan on very large layouts | 1 | Partial — live pan/zoom optimised; no viewport culling |
| Background autosave | 1 | Done |
| Themes: light, dark, blueprint, high contrast | 2 | Partial — one light Studio theme only |

## 3. Drawing tools

| Item | Phase | Status |
|---|---|---|
| Line, polyline, rectangle, polygon, circle, arc | 1 | Partial — Line/Arc/Arrow in the pill, Rectangle/Ellipse in Blocks, but canvas2 has no draw handler for them; no polyline/polygon |
| Text with font size, style, colour | 1 | Partial — text objects draw and style (Text panel); the Text tool doesn't place text in canvas2 |
| Dimension tool (linear, chained) and leader / callout | 1 | Partial — automatic building and column-grid chains; Dimension tool not drawn in canvas2; no leader |
| Freehand pen | 2 | Partial — pen options UI and saved strokes draw; no stroke capture in canvas2 |
| Hand-drawn shape recognition (rect, circle, line, arrow) | 2 | Todo |
| Symmetry drawing | 3 | Todo |
| Measure: distance, area, perimeter, angle | 1 | Partial — distance only |
| Wall tool with dimension chain while drawing (CLASS: 30 / 30 / 60 m chain) | 1 | Partial — building walls show typed-editable dimensions; no wall-drawing tool |

## 4. Selection and editing

| Item | Phase | Status |
|---|---|---|
| Click, Shift+click, box select, Ctrl+A | 1 | Done |
| Lasso select | 2 | Todo |
| Select similar (all racks of this type / elevation) | 2 | Todo |
| Select by layer | 2 | Todo |
| Move, rotate, mirror, align, distribute | 1 | Partial — move and rotate only |
| Copy, paste, duplicate (with a notice when nothing happens) | 1 | Partial — no notice when Duplicate does nothing |
| **Multiple copy**: X / Y offset + number of copies + auto-number (CLASS) | 1 | Todo |
| Group / ungroup | 2 | Done |
| Lock / unlock per object and per layer | 1 | Done |
| Every drag also takes a typed exact value | 1 | Partial — bays, column chain, building size, Fill aisle typed; not every drag |
| One undo per intent; Undo / Redo history | 1 | Done |
| Cascade move: Alt+drag a row moves every row beyond it the same amount, aisles kept; stops at a cross-aisle, a locked row or the far wall (from PANEL_FEATURES) | 2 | Todo |
| "Close gap": after deleting a row, pull the following rows up to the forklift aisle width (from PANEL_FEATURES) | 3 | Todo |

## 5. Properties panel

| Item | Phase | Status |
|---|---|---|
| Every object shows its editable properties | 1 | Done |
| Rack: bays, levels, depth, beam length, upright size, capacity, elevation | 1 | Done |
| Rack: back-to-back space (flue), number deep and multi-deep spacing (CLASS) | 1 | Partial — flue only; no number deep / multi-deep |
| Rack: cost per bay (feeds BOM prices) | 2 | Todo |
| Rack: manufacturer, SKU, notes | 2 | Todo |
| Row run settings: begin with rack or aisle, start / centre / end cross aisle (CLASS) | 2 | Partial — cross-aisle position exists in the Fill engine (centre default); no UI, no begin-with option |
| Door: width, height, swing, type | 1 | Partial — type and width; no height or swing |
| Column: size, grid spacing, wall Yes/No | 1 | Done |
| Per-bay beam length: pick a bay, 4′–16′ or custom; bays after it slide, pallets recomputed (from PANEL_FEATURES) | 1 | Done |

## 6. Layers

| Item | Phase | Status |
|---|---|---|
| Show / hide, lock per layer | 1 | Done |
| Create, rename, colour, reorder layers | 2 | Todo |
| Layer opacity, filter | 2 | Todo |
| Standard layers filled automatically (Building, Columns, Zones, Sections, Racking, Aisles, Checks, Notes), check overlays on their own layer (from TRACE_ROADMAP) | 1 | Done |
| PDF export includes only visible layers (clean customer drawing without check overlays) (from TRACE_ROADMAP) | 1 | Done |

## 7. Racking-specific tools (the competitive edge)

| Item | Phase | Status |
|---|---|---|
| **All rack types: selective, double-deep, drive-in, drive-thru, push-back, pallet flow, carton flow, cantilever, shelving** — each drawn, filled, generated, elevated, in BOM, Tally, PDF and Check | 1 | Partial — selective (single, back-to-back) end to end; others placeable from the library only; no double-deep or carton flow |
| Mezzanine | 2 | Partial — placeable library block only |
| Object library: racks, equipment, structural, safety; frequently used tools and objects pinned | 1 | Partial — library rail + flyout done; no pinning in the Studio flyout |
| Custom user objects (save your own, reuse across projects) | 2 | Partial — store actions exist; panel not mounted |
| Display: beam colour, upright colour, line style per rack (CLASS) | 2 | Todo |
| Auto layout with staging, office and dock areas | 2 | Partial — Generate works around placed zones; doesn't create them |
| Fill racking in a box / section, Generate whole building | 1 | Done |
| One engine: Generate = Fill the whole building | 2 | Partial — Fill and Generate share row maths; still two engines |
| Cross aisle tool, tunnel | 1 | Done |
| Row group, split, separate | 1 | Done |
| Sections with legend; storage areas by temperature: frozen / chilled / ambient, hatched (CLASS) | 1 | Partial — sections, legend, per-section equipment; no temperature types or hatching |
| Equipment per area (forklift, reach, VNA, pallet jack, custom) | 1 | Done |
| Fill keeps door clear spaces open | 1 | Todo |
| Dock doors and P&D stations, auto-numbered (CLASS: 01–34) | 1 | Partial — Add door places dock doors; no numbering, no P&D stations |
| Column grid: spacing, walls Yes/No, chain typing, drag | 1 | Done |
| Elevations: auto best fit from clear height, front/side view | 1 | Done |
| Elevation view settings: show column, roof, aisle dimensions, shelf heights, load clearance (CLASS) | 2 | Partial — ceiling, sprinkler, max-load line, beam heights drawn; no show/hide settings, no column/roof/aisle dims |
| Row numbering continuous / per section | 1 | Done |
| Layout options + Compare | 2 | Todo |
| Optimisation: aisle width, turning radius, capacity utilisation | 3 | Todo |
| S3 generator strategy: a rack between every column (from TRACE_ROADMAP) | 2 | Todo |
| Make single row in one click; single → back-to-back where there's room (from PANEL_FEATURES) | 2 | Partial — deleting one side's bays turns a pair into a single; no one-click action, no reverse |
| Regenerate keeps manual work: locked racks and placed areas survive (from PANEL_FEATURES) | 2 | Partial — hand-placed racks, zones, doors, columns kept; locked generated racks still replaced |
| Bay numbers along each row (from PANEL_FEATURES) | 2 | Todo |
| Numbering scheme: letters or numbers, start point, direction, show / hide (from PANEL_FEATURES) | 2 | Partial — R1… numbers with show/hide; no letters, start or direction |
| Blocked-position marker style: X, alternative icons or a text label (from PANEL_FEATURES) | 3 | Todo |

## 8. Building and site objects

| Item | Phase | Status |
|---|---|---|
| Building outline (rectangle, L, custom), editable size | 1 | Done |
| Walls, doors, dock doors, man doors | 1 | Done |
| Offices, zones, staging, stairs | 1 | Partial — office, staging, washroom, custom area; no stairs |
| Fire exits, pedestrian walkways, safety lines | 2 | Partial — man door doubles as exit; no walkways or safety lines |
| Bollards, guard rails, column guards, end-of-aisle guards | 2 | Partial — bollard, guard rail, rack protector; no column or end-of-aisle guard |
| Windows, fire extinguishers | 2 | Partial — windows only |
| Conveyor, charging station | 3 | Done |
| A zone placed over racking removes the bays under it; counts update (from PANEL_FEATURES) | 1 | Done |
| Manual column placer: add or move a single column (irregular grids) (from PANEL_FEATURES) | 2 | Partial — single column placeable from the library; grid columns move a whole line |
| Sprinkler / fire zone overlay, for rack-height and flue rules (from PANEL_FEATURES) | 3 | Todo |

## 8a. Analytics

| Item | Phase | Status |
|---|---|---|
| Rack count, pallet positions, usable vs lost | 1 | Done |
| Floor utilisation, storage density, cubic utilisation | 2 | Partial — positions per 1,000 sq ft only |
| Capacity (total load) | 2 | Todo |

## 9. Validation (Check layout)

| Item | Phase | Status |
|---|---|---|
| Rack overlaps wall / column / rack | 1 | Done |
| Aisle too narrow, cross aisle below travel width | 1 | Done |
| No way in, max run | 1 | Done |
| Rack in a door clear space | 1 | Todo |
| Rack exceeds clear height / sprinkler clearance | 1 | Done |
| Fire exit blocked | 2 | Todo |
| Check runs automatically on save, never blocks | 1 | Partial — runs before PDF export (asks, never blocks); not on save |
| Check layout button: specific issues, click zooms to and highlights each, mark as OK (from TRACE_ROADMAP) | 1 | Done |
| Column on an upright frame, unreachable rack (no pick side), angled racks flagged as unchecked (from TRACE_ROADMAP) | 1 | Done |

## 10. Output

| Item | Phase | Status |
|---|---|---|
| PDF export: plan, elevations, BOM, legend key | 1 | Done |
| Print: scale, multiple sheets, landscape / portrait, title block, company logo, revision table | 1 | Partial — A1, auto scale and orientation, title block, several sheets; no sheet choice, logo or revision table |
| BOM: xlsx, CSV, by row, by section | 1 | Done |
| BOM prices and quote | 2 | Todo |
| Truck count for the BOM | 2 | Todo |
| PNG / SVG export | 2 | Todo |
| DXF export | 2 | Todo |
| DWG export | 3 | Todo |

## 11. Import

| Item | Phase | Status |
|---|---|---|
| Image / PDF as a traced background (scale by two points) | 2 | Todo |
| DXF import, dealer tags building, columns, docks | 2 | Todo |
| Vector PDF import | 2 | Todo |
| DWG import | 3 | Todo |
| Import an existing racking plan and run Check (sales door-opener) | 3 | Todo |
| Scanned floor plan recognition (AI) | 3 | Todo |

## 12. Save, projects and platform — Phase 1

Details: [Platform plan](#platform-plan-details)

| Item | Phase | Status |
|---|---|---|
| Login, organisations, user roles | 1 | Todo |
| Cloud save + local file (.trace) open / save | 1 | Partial — local .wcad open/save only; no cloud |
| Refresh keeps you in the project | 1 | Partial — layout restored from local autosave, but refresh starts at the sign-in screen |
| Version history and restore | 1 | Todo |
| Hosting, security | 1 | Todo |
| Stripe payments (per job + Pro) | 1 | Todo |
| Project list: create, duplicate, archive, delete, search, recent, favourites, templates | 1 | Todo |
| Dashboard: status pipeline (Draft / Shared / Approved / In service / Inspection due), recent activity, quick actions | 2 | Todo |
| Tablet-friendly (draw on site) | 2 | Todo |
| Real URLs (/login, /projects, /projects/:id) with a remembered session (from PLATFORM_PLAN) | 1 | Todo |
| Accounts database: users, companies, projects, user settings, per-company access rules (from PLATFORM_PLAN) | 1 | Todo |
| One data layer talks to the backend (saveProject, loadProject, listVersions, addComment); layouts stored as files (from PLATFORM_PLAN) | 1 | Todo |
| Trials and plan limits (the "is paid" check at each paid feature) (from PLATFORM_PLAN) | 1 | Todo |

## 13. Collaboration

| Item | Phase | Status |
|---|---|---|
| Share link with customer (view, comment, pins) | 2 | Todo |
| Revision system for ongoing deal changes | 2 | Todo |
| Mentions, permissions | 3 | Todo |
| Live co-editing | 3 | Todo |
| Share links expire and can be revoked (from PLATFORM_PLAN) | 2 | Todo |

## 14. UI polish

| Item | Phase | Status |
|---|---|---|
| Keyboard shortcuts (V move, R rotate, M measure, Ctrl+D duplicate, Space pan, Delete) + shortcut sheet | 1 | Partial — V, M, Ctrl+D, Space, Delete and the ? sheet; no R rotate (R is Rectangle) |
| Command palette (Ctrl+K) | 2 | Todo |
| Context menu (right click) | 1 | Done |
| Icon redesign (line style), rail labels | 1 | Partial — icons redone; rail names are tooltips only |
| Empty states (new project, no racks, no elevations) | 1 | Partial — new-project setup, "No elevation yet", BOM "No racks"; no empty-plan card |
| Dialog styling, Hub, Sign in | 1 | Partial — dialogs in Studio style; Hub and Sign in still the old skin |
| Search anything (Rack A12, Door 3, Column C17) | 2 | Todo |
| Dead-code cleanup | 1 | Partial — _svg_reference, unmounted LeftPanel/index.jsx, WarehouseObjectPicker, CustomObjects remain |

## 15. Separate apps on the same layout file

| Item | Phase | Status |
|---|---|---|
| Labels: rack / bay / level, barcode, QR | 2 | Todo |
| Inspection: status, photos, notes, damage, repair history, report | 2 | Todo |
| Mini WMS | 3 | Todo |

## 16. AI — Phase 3

| Item | Phase | Status |
|---|---|---|
| Layout from text (spacing, pallet size, weight, height) | 3 | Todo |
| Natural-language edits ("add five rows with 12 ft aisles") | 3 | Todo |
| Detect inefficient layouts, suggest aisle widths | 3 | Todo |
| Ask Inspect (Q&A over inspection data) | 3 | Todo |

## 17. Marketing website

| Item | Phase | Status |
|---|---|---|
| Landing page: what Trace does for a dealer, screenshots, pricing | 1 | Todo |
| Sign-up / trial, Stripe checkout | 1 | Todo |
| Docs / help pages, short videos | 2 | Todo |

---

## Left out on purpose

General-CAD items a racking dealer doesn't need, kept here so the choice is visible:
ellipse, bezier, offset / extend / trim / join / explode, scale tool, constraints (parallel, perpendicular, equal), tangent snap, rotate view, layer groups, project folders and tags, admin activity log / audit trail / storage quotas, CLASS simulation tab, using images straight from Google (copyright risk; upload instead).

## Open work (in order)

1. generate-far-walls: column grid rules 1–4, then merge
2. fill-doors
3. All rack types: audit, then rounds by dealer demand
4. Units of measure
5. Platform: login, save, hosting, Stripe
6. Small bugs: Duplicate notice, pen edge crossing a section, REG-tally-ticks timeout
7. Phase 2 items above

---

## Platform plan (details)

(From PLATFORM_PLAN.md — backend, accounts, saving, sharing, payments.)

Status: PLANNED, not started. Finish the layout/canvas work first. This doc captures
the decisions and open questions so building can start cleanly later.

### 1. Backend decision: Supabase (managed)

**Why:** almost all of Trace's heavy work (generator, drawing, PDF export) runs in the
browser. The backend only has to store accounts, projects, versions and settings,
handle login, and pass comments around. Supabase provides all of that out of the box:
Postgres database, authentication (email/password, Google, magic links), row-level
security rules, file storage, and real-time updates (for live comments).

**Cost (checked Sept 2026, verify at build time):**
- Development/testing: Free tier. Free projects pause after 7 days of inactivity, so
  never for real customers.
- Launch: **Pro, $25/month + usage** (8 GB database, 100K monthly active users, 100 GB
  storage). Compute is billed separately; realistic total ~$60/month.
- Later, only if an enterprise buyer requires it: **Team, $599/month** — gives SOC 2 /
  ISO 27001 reports for the Supabase part, SSO/SAML ("log in with your company
  account"), 14-day backups. A very large customer may also want Trace's OWN SOC 2
  (separate process, months, several thousand dollars) — only when a deal needs it.

**Alternatives considered:** own server (Spring Boot + Postgres) — full control, no
lock-in, but months of plumbing (login, sessions, storage, realtime, security) before
any feature. Revisit only at very large scale or for on-premise customers.

### 2. Heavy work: where it runs

- **Generator, drawing, PDF:** in the browser. Each user brings their own computing
  power, so thousands of users put zero load on the servers. Nothing to load-balance.
- **Supabase Edge Functions:** only for short, light tasks (webhooks, emails, checks).
  They have strict time/memory limits; not for heavy jobs.
- **Heavy server jobs, if ever needed** (DWG import, scanned-PDF import, batch jobs):
  a separate worker service on an auto-scaling platform (e.g. Google Cloud Run, AWS).
  Flow: browser uploads to Supabase → worker is triggered → does the work → writes the
  result back to Supabase. It scales up automatically under load and down to zero when
  idle. DXF import may be doable in the browser, so a worker may only be needed for DWG
  or scanned PDFs.

### 3. Rules from day one (keep a future migration cheap)

If Trace later moves off Supabase (own server, or self-hosted Supabase as a middle
step), these rules keep it to a few weeks instead of months:

1. **One place in the app talks to Supabase:** a `data/` folder with functions like
   `saveProject()`, `loadProject()`, `listVersions()`, `addComment()`. The rest of the
   app never calls Supabase directly. A migration rewrites that folder, not the app.
2. **Business logic stays in the app,** not in database triggers or Supabase-specific
   functions.
3. **Layouts are stored as files** (the `.trace` format) in Storage; the database only
   holds the list of projects, versions, users, settings and comments. Files move
   trivially.
4. **Standard login methods only** (email/password, Google). Nothing Supabase-only.

Migration difficulty by part: database — easy (plain Postgres dump/restore); files —
easy (S3-style copy); security rules — medium (reference Supabase's login user); live
comments — medium (swap to WebSockets); login/accounts — hardest (export users and
password hashes; the new server must take over sessions and resets).

Middle step: Supabase is open source and can be self-hosted on your own servers with no
app changes.

### 4. Build order (when this starts)

1. **Routing + login session.** Real URLs (`/login`, `/projects`, `/projects/:id`);
   the session is remembered so refresh keeps the user where they were. (Today refresh
   goes back to login.)
2. **Accounts + database.** Users, companies (if multi-user), projects, user settings.
3. **Save/load: cloud + local.** Cloud is the main copy, with autosave. Plus
   Export/Import a `.trace` file for local backups or offline work.
4. **Versioning.** Every save keeps a snapshot; named versions ("Sent to customer
   v2"); restore an old version.
5. **Hosting.** Staging + live sites, own domain, HTTPS. Can run alongside 2–4.
6. **Share link + comments (Figma-style).** Dealer creates a link; the customer opens
   it view-only and drops comment pins on the layout; the dealer sees them live,
   replies, resolves. Links can expire and be revoked.
7. **Payments.** Stripe subscriptions, trials, plan limits (the "is paid" check at each
   paid feature). Stripe holds card data; Trace never stores it.

**Security** is part of each step, not a separate one: login and password rules (2),
per-company data access rules (2), expiring/revocable share links (6), HTTPS and
backups (5), Stripe for card data (7).

### 5. Open questions (answer before building)

1. **Accounts:** one login per dealer, or companies with several users (e.g. a
   dealer's salespeople sharing projects)?
2. **Customers on a share link:** view + comment without an account, or must sign up?
3. **Pricing model (rough):** per user per month, per company, or per project? Shapes
   how accounts are structured, even though payments come last.

### 6. Current layout work

Needs none of this. The canvas, generator and editing tools run entirely in the
browser and keep working as they are. The only thing to keep in mind meanwhile: all
layout data should stay inside the saved layout (the `.trace` / scene save), not in
side storage, so it can be uploaded to the cloud later without changes.
