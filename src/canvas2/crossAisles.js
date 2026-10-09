import { rackFootprint } from '../generate/columnCheck'
import { pxToFtIn } from '../utils/canvas'
import { failingCrossAisles, fmtLenDown, sectionCrossAisles, isRow } from '../utils/copyChange'
import { labelScale } from '../render/labelSize'
import { AISLE_LABEL_FONT_PX, AISLE_LABEL_PADX_PX } from './hitTest'

/* ── Cross-aisle width labels ─────────────────────────────────────────────────
   A cross-aisle is not an object: it is a gap along the run between sections
   of racks. It gets ONE label, drawn exactly like an aisle label
   (DimensionLabels.jsx's AisleLabelView takes this layout). Per building (and
   per row orientation):

   A building whose rows carry section stamps (Generate's, Fill racking's, a
   racking area's): the cross-aisles are the per-line ones Check layout
   measures (sectionCrossAisles) — in each line of racks, the gap where the
   run passes from one section's racks to another's. Wall rows take no part:
   an unbroken wall row has no gap, so it adds no line (merging the racks
   into envelopes instead let a full-length wall row swallow every section,
   and a Fill racking layout showed no cross-aisle labels at all). The lines
   whose gaps overlap along the run, next to each other across with no rack
   standing across the gap between them, are ONE cross-aisle — whatever
   sections either side (one line may pass from section 2 to 3, the next
   from 1 to 3). Its label repeats along it about every LABEL_EVERY_FT,
   evenly: n = max(1, round(length across / LABEL_EVERY_FT)) equal stretches,
   a label at each stretch's centre. Each line belongs to the stretch its
   centre falls in; a label reads the NARROWEST of its own lines (its arrow
   spans that line's gap) and goes red on its own lines alone, so a local
   squeeze shows on the nearest label only. A label sits on clear floor: its
   pill and arrow, at the Label size `lz`, touch no rack and no zone; a
   blocked centre slides to the nearest clear spot in its stretch, and a
   stretch with none gets no label (e.g. lines whose rows stop at an office:
   their "gap" runs across it). A gap inside one section (a split, a deleted
   bay) is not a cross-aisle, so it has no label.

   A building with no section stamps (racks placed by hand): unchanged — the
   racks' extents along the run are merged into sections and each gap
   between two consecutive sections is a cross-aisle, its width the clear
   gap between the nearest ends either side, centred across the racks on
   both sides. No label between split racks and the racks they were cut from
   (a cut piece carries `splitOf` = the original rack's id; that rack and its
   pieces are one family): a gap is skipped when every family on either side
   of it is a split family with racks on BOTH sides of the gap. Bay-delete
   pieces (`pieceOf` only) are not a family here: the gap a deleted bay
   leaves keeps its label.

   `isHoriz` follows aisleLabelLayout's meaning — true when the gap is
   measured along Y — so a horizontal layout (rows run along X, the
   cross-aisle gap is along X) gives isHoriz false. World px. Pure.

   With a forklift `profile` (the warning colours on: Checks layer shown, markings on) a label over a
   cross-aisle Check layout lists as an error — failingCrossAisles, the same per-line rule and comparator —
   is red (level 1; there is no amber level for a cross-aisle) and reads that listed width, the narrowest
   one under it, rounded down. A gap the error rule ignores stays uncoloured (a building with no sections
   has none it lists). */
const EPS = 1e-6
/** A cross-aisle's width label repeats along it about this often (ft). */
export const LABEL_EVERY_FT = 75

export function crossAisleLabels(objects, gridSize = 40, { profile = null, lz = labelScale(undefined, gridSize) } = {}) {
  const groups = new Map()
  for (const o of objects) {
    if (!o || typeof o.type !== 'string' || !o.type.startsWith('rack_')) continue
    const f = rackFootprint(o)
    const k = (o.parentId ?? '') + '|' + (f.rotated ? 'v' : 'h')
    if (!groups.has(k)) groups.set(k, { parentId: o.parentId, rot: f.rotated, feet: [], sectioned: false })
    const g = groups.get(k)
    g.feet.push({ ...f, family: o.splitOf || o.id, cut: !!o.splitOf })
    // sectionCrossAisles' own condition: a row of this building and orientation carrying a section stamp
    if (isRow(o) && o.genSection != null) g.sectioned = true
  }
  const out = []
  for (const [k, g] of groups) {
    if (g.sectioned) out.push(...lineLabels(k, g, objects, gridSize, profile, lz))
    else out.push(...envelopeLabels(k, g, gridSize))
  }
  return out
}

/** A sectioned building: its cross-aisles from the per-line cross-aisles Check layout measures, a label about
 *  every LABEL_EVERY_FT along each, on clear floor. */
function lineLabels(k, { parentId, rot, feet }, objects, gridSize, profile, lz) {
  const run = (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
  const cross = (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
  const failing = profile ? failingCrossAisles(objects, parentId, rot, profile, gridSize) : []
  const listed = (q) => failing.some(f => f.a === q.a && f.b === q.b && f.lo === q.lo && f.hi === q.hi)
  // the lines' gaps, taken across in order; each joins the first cross-aisle it overlaps along the run
  // unless a rack stands across the gap between them
  const clusters = []
  for (const q of sectionCrossAisles(objects, parentId, rot).sort((a, b) => a.cross[0] - b.cross[0])) {
    const blocked = (cl) => {
      const a0 = cl.c1, a1 = q.cross[0], lo = Math.max(cl.lo, q.lo), hi = Math.min(cl.hi, q.hi)
      return a1 > a0 + EPS && feet.some(f => { const [r0, r1] = run(f), [c0, c1] = cross(f); return c0 < a1 - EPS && c1 > a0 + EPS && r0 < hi - EPS && r1 > lo + EPS })
    }
    let cl = clusters.find(c => Math.min(c.hi, q.hi) - Math.max(c.lo, q.lo) >= -EPS && !blocked(c))
    if (!cl) clusters.push(cl = { lo: q.lo, hi: q.hi, c0: q.cross[0], c1: q.cross[1], lines: [] })
    cl.lines.push(q)
    cl.lo = Math.min(cl.lo, q.lo); cl.hi = Math.max(cl.hi, q.hi); cl.c0 = Math.min(cl.c0, q.cross[0]); cl.c1 = Math.max(cl.c1, q.cross[1])
  }
  // what a label may not touch: every rack and every zone
  const obstacles = objects.filter(o => o && typeof o.type === 'string' && (o.type.startsWith('rack_') || o.type.startsWith('zone_')))
    .map(o => (o.type.startsWith('rack_') ? rackFootprint(o) : { x: o.x, y: o.y, w: o.width, h: o.height }))
  const hit = (p, q) => p.x < q.x + q.w - EPS && q.x < p.x + p.w - EPS && p.y < q.y + q.h - EPS && q.y < p.y + p.h - EPS
  const fs = AISLE_LABEL_FONT_PX / lz, aw = 5 / lz          // aisleLabelOps' own pill and arrowhead sizes
  return clusters.sort((a, b) => a.lo - b.lo || a.c0 - b.c0).flatMap((cl, i) => {
    const len = cl.c1 - cl.c0, n = Math.max(1, Math.round(len / (LABEL_EVERY_FT * gridSize))), step = len / n
    const stretches = Array.from({ length: n }, (_, j) => ({ s0: cl.c0 + j * step, s1: cl.c0 + (j + 1) * step, lines: [] }))
    for (const q of cl.lines) stretches[Math.min(n - 1, Math.max(0, Math.floor(((q.cross[0] + q.cross[1]) / 2 - cl.c0) / step)))].lines.push(q)
    const out = []
    stretches.forEach((st, j) => {
      if (!st.lines.length) return
      const narrow = st.lines.reduce((m, q) => (q.hi - q.lo < m.hi - m.lo ? q : m))
      const w = narrow.hi - narrow.lo, red = st.lines.some(listed), mid = (narrow.lo + narrow.hi) / 2
      const text = red ? fmtLenDown(w, gridSize) : pxToFtIn(w, gridSize)
      const pw = text.length * fs * 0.62 + (AISLE_LABEL_PADX_PX / lz) * 2, ph = fs * 1.5
      // the label at a position across: its pill (centred on the gap) and its arrow across the gap
      const rects = (p) => (rot
        ? [{ x: p - pw / 2, y: mid - ph / 2, w: pw, h: ph }, { x: p - aw / 2, y: narrow.lo, w: aw, h: w }]
        : [{ x: mid - pw / 2, y: p - ph / 2, w: pw, h: ph }, { x: narrow.lo, y: p - aw / 2, w, h: aw }])
      const clear = (p) => !rects(p).some(r => obstacles.some(o => hit(r, o)))
      const centre = (st.s0 + st.s1) / 2, half = rot ? pw / 2 : ph / 2
      let pos = centre
      if (!clear(centre)) {
        // the nearest clear spot in the stretch: just past an obstacle's edge, or the stretch's own ends
        const cands = [st.s0, st.s1]
        for (const o of obstacles) { const [c0, c1] = rot ? [o.x, o.x + o.w] : [o.y, o.y + o.h]; cands.push(c0 - half - 0.5 / lz, c1 + half + 0.5 / lz) }
        const ok = cands.filter(p => p >= st.s0 - EPS && p <= st.s1 + EPS && clear(p)).sort((p, q) => Math.abs(p - centre) - Math.abs(q - centre))
        if (!ok.length) return                                   // no clear floor in the stretch: no label
        pos = ok[0]
      }
      out.push({
        key: k + '|' + i + '|' + j,
        isHoriz: rot,                       // vertical rows run along Y: the cross-aisle gap is along Y
        gapLo: narrow.lo, gapHi: narrow.hi, labelMid: mid,
        positions: [pos],
        level: red ? 1 : 3,
        text,
      })
    })
    return out
  })
}

/** A building with no section stamps: the gaps between the racks merged along the run (as ever). */
function envelopeLabels(k, { rot, feet }, gridSize) {
  const run = (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
  const cross = (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
  // sections: racks merged along the run
  const sorted = [...feet].sort((a, b) => run(a)[0] - run(b)[0])
  const sections = []
  for (const f of sorted) {
    const [r0, r1] = run(f), [c0, c1] = cross(f)
    const s = sections[sections.length - 1]
    if (s && r0 < s.r1 - EPS) { s.r1 = Math.max(s.r1, r1); s.c0 = Math.min(s.c0, c0); s.c1 = Math.max(s.c1, c1); s.families.add(f.family); if (f.cut) s.cutFamilies.add(f.family) }
    else sections.push({ r0, r1, c0, c1, families: new Set([f.family]), cutFamilies: new Set(f.cut ? [f.family] : []) })
  }
  const out = []
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i], b = sections[i + 1]
    const gapLo = a.r1, gapHi = b.r0
    if (gapHi - gapLo <= EPS) continue
    // split pieces and the racks they were cut from, alone on both sides: no label
    if ([...a.families, ...b.families].every(fam => (a.cutFamilies.has(fam) || b.cutFamilies.has(fam)) && a.families.has(fam) && b.families.has(fam))) continue
    const c0 = Math.min(a.c0, b.c0), c1 = Math.max(a.c1, b.c1)
    out.push({
      key: k + '|' + i,
      isHoriz: rot,
      gapLo, gapHi, labelMid: (gapLo + gapHi) / 2,
      positions: [(c0 + c1) / 2],
      level: 3,                             // no sections: Check layout lists no cross-aisle here
      text: pxToFtIn(gapHi - gapLo, gridSize),
    })
  }
  return out
}
