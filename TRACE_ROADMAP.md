# Trace — Product Roadmap (beyond the generator)

Captured from the design discussion. The generator (column-aware, max-density,
S1/S2, both orientations) is the core; these are the features that make Trace an
ADVISOR a dealer relies on, not just a one-shot layout tool.

The through-line: **generator gets ~95% there → dealer adjusts by hand → Trace
watches their back.** No dealer trusts an auto-layout blindly; the value is in
assisting their judgment and catching mistakes.

═══════════════════════════════════════════════════════════════════════════
FEATURE 1 — Layout Checker ("Check layout" button)
═══════════════════════════════════════════════════════════════════════════
**What:** after a dealer manually edits a generated (or hand-built) layout, they
press a "Check layout" button and Trace scans the CURRENT layout and lists any
problems — accessibility, aisle widths, column conflicts, overlaps, blocked pick
faces.

**Why it's high-value:** turns Trace from "it drew this once" into "it watches
your back while you work." This is what makes a dealer RELY on it.

**Why it's cheap to build:** the validators already exist — `checkColumns`
(accessibility/blocked aisles), aisle-width checks, flue/face/straddle logic.
These don't care whether a layout was generated or hand-edited; they take a
layout and report problems. The checker is mostly **pointing the existing brain
at the dealer's manual work**, not a new engine.

**Design rules (agreed):**
- **A button, not real-time.** No warning popping on every drag — maddening.
  A "Check layout" button the dealer presses when ready (like running spell-check,
  not a dialog per keystroke). A quiet status badge ("3 issues") is an option too.
- **Warnings, not blocks.** Never stop the dealer — they know their site. Flag,
  explain, let them decide. "This aisle is now 9ft — your reach truck needs
  10.5ft." Informative, not preventing.
- **Specific + actionable.** Each warning points at the exact rack/aisle, states
  what's wrong and the number, and lets them jump to it. Never a vague "layout
  has issues."

**Priority:** AFTER the foundation stabilizes (rendering precision, measuring
tool, ruler, X-marks, S3). The checker is only as trustworthy as the checks
under it — build it once the validators are rock-solid so it doesn't cry wolf or
miss things.

**Checks already identified for it:**
- Column on an upright frame: currently flagged (orange) but not avoided. Matrix
  run found 520 columns on uprights in 36 of 100 layouts (e.g. 48 on 1080×410
  horizontal, 80 on 150×1000), mostly with a 25′ X grid near multiples of the
  8.25′ bay pitch. DECIDED (PP): no generator change. The dealer fixes it by
  changing one bay's beam length (shorter or longer) so the upright clears the
  column and the column falls in a pallet position instead, then uses the right-
  panel Sync button to apply the same change to the other rows in that section,
  keeping rows aligned. Depends on: per-bay beam length input + Sync (see
  PANEL_FEATURES.md). The orange flag stays to show where it's needed.
- Unreachable rack: a single row with no usable pick side (no aisle ≥ forklift
  aisle on either side, or both sides blocked by other racks). Not a column issue,
  so the column X-marks deliberately don't flag it; the checker should.
- Racks at non-orthogonal angles are skipped by the pick-zone check; the checker
  should warn that column losses weren't computed for them.

═══════════════════════════════════════════════════════════════════════════
FEATURE 2 — Import existing plans (the acquisition feature)
═══════════════════════════════════════════════════════════════════════════
Two flavors, both start from "the customer already has something":

**2a. Import a warehouse FLOOR PLAN (PDF or .dwg) → Trace rebuilds it as CAD →
plans racking on it.**
- User uploads their building's floor plan. Trace reads it, reconstructs the
  building outline (+ columns, docks, obstructions) as a Trace layout, then runs
  the generator to plan racking in it.
- VALUE: removes the "type in your building dimensions by hand" step — the dealer
  starts from the customer's real drawing. Huge friction remover for adoption.

**2b. Import an existing RACKING plan → Trace verifies it for gaps.**
- User uploads a plan that already HAS racking. Trace scans it and reports the
  same warnings as Feature 1 (accessibility, aisle widths, column conflicts,
  wasted space, capacity vs potential).
- VALUE: instant "let me check your current setup" — a sales wedge. A dealer can
  show a prospect "your existing layout loses X positions / has Y blocked aisles"
  before doing any work. This is a DOOR-OPENER with prospects.

**Honest feasibility (PP said "no idea how" — here's the real picture):**
- **PDF (vector):** a vector PDF (exported from CAD) has real lines/coordinates —
  parseable. A scanned/raster PDF (a photo of a printout) needs vision/OCR to
  interpret — much harder, lower fidelity. So "PDF" splits into two very
  different problems; start with vector PDFs.
- **.dwg / .dxf:** the native CAD format. .dxf is text-based and readable with
  existing libraries; .dwg is proprietary/binary and needs a conversion library
  (or convert .dwg→.dxf first). Real work but a solved problem — libraries exist.
- **The hard part is NOT reading the file — it's INTERPRETATION.** A floor plan is
  lines; deciding "this rectangle is the building, these squares are columns,
  this is a dock, this is an office" is the genuine challenge. Two paths:
  (a) assisted — Trace extracts the geometry and the dealer confirms/tags what's
  what (building outline, columns, docks); (b) automatic — infer it, which is an
  AI/vision problem and error-prone.
- **Realistic first version:** import vector PDF or .dxf → extract line geometry →
  show it on the canvas → dealer TAGS the building outline, columns, and zones
  (assisted, not fully automatic) → then generate/verify. The "dealer confirms"
  step makes it achievable now; full auto-interpretation is a later, AI-heavy
  upgrade.

**Priority:** Later / bigger. This is a major feature (file readers +
interpretation + a tagging UI). But 2b (verify an existing plan) is the
highest-leverage SALES feature — worth prototyping even in a rough form, because
"upload your plan, see your gaps" opens doors.

═══════════════════════════════════════════════════════════════════════════
FEATURE 3 — Layers (build on the existing right-panel Layers UI)
═══════════════════════════════════════════════════════════════════════════
**What exists:** the right panel already has a Layers section and the store has
`layers` (with `visible`, objects carry `layerId`). canvas2's Scene already hides
objects on invisible layers.

**What to add:**
- **Standard layers created by Generate:** Building (floor plan, walls), Structure
  (columns), Racking, Aisles, Annotations/Dimensions. Every generated object lands
  on its layer automatically.
- **Overlay layers** for the checks: clearance labels, aisle-width labels, red X
  marks (in-rack + pick-zone), orange upright marks, red aisle warnings. At
  full-building zoom these pile up; letting the dealer hide them per layer fixes
  clutter (and helps panning performance on huge layouts).
- **Lock per layer:** e.g. lock Building + Structure so dragging racks can never
  accidentally grab or move the building or columns. Locked layers are not
  selectable and not snap targets.
- **Print/export respects visibility:** PDF export includes only visible layers, so
  a dealer can export a clean customer drawing without the check overlays.

**Why:** declutters big layouts, prevents accidental moves of the building, and
gives two outputs from one layout (working view with checks vs clean customer PDF).

**Priority:** after the current bug fixes; moderate size since the UI and the
`visible` flag already exist.

═══════════════════════════════════════════════════════════════════════════
CURRENT FOUNDATION QUEUE (do these first — everything above builds on them)
═══════════════════════════════════════════════════════════════════════════
1. Flue rendering fix (thin line → removed; 9" default, column-fit, no phantom
   4.8" clearance).
2. Remove allowColumnInRack toggle; columns fall naturally; X-mark blocked pick
   faces.
3. Measuring tool + ruler (port from SVG).
4. Test cases — lock racking precision inch-by-inch.
5. S3 (rack between every column) → then the 3-options killer feature.
6. THEN Feature 1 (Layout Checker) — reuses the validators.
7. LATER Feature 2 (Import plans) — file readers + assisted tagging.
