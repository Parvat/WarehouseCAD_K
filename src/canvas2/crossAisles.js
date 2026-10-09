import { rackFootprint } from '../generate/columnCheck'
import { pxToFtIn } from '../utils/canvas'
import { failingCrossAisles, fmtLenDown, sectionCrossAisles, isRow } from '../utils/copyChange'

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
   standing across the gap between them, are ONE cross-aisle and share one
   label — whatever sections either side (one line may pass from section 2
   to 3, the next from 1 to 3). The label reads the NARROWEST line's width,
   its arrow spans that line's gap, centred across the lines it covers. A
   gap inside one section (a split, a deleted bay) is not a cross-aisle, so
   it has no label. On Generate's layouts (their wall rows split at the
   cross-aisles) this is exactly what the envelopes gave.

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

export function crossAisleLabels(objects, gridSize = 40, { profile = null } = {}) {
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
    if (g.sectioned) out.push(...lineLabels(k, g, objects, gridSize, profile))
    else out.push(...envelopeLabels(k, g, gridSize))
  }
  return out
}

/** A sectioned building: one label per cross-aisle, from the per-line cross-aisles Check layout measures. */
function lineLabels(k, { parentId, rot, feet }, objects, gridSize, profile) {
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
  return clusters.sort((a, b) => a.lo - b.lo || a.c0 - b.c0).map((cl, i) => {
    const narrow = cl.lines.reduce((m, q) => (q.hi - q.lo < m.hi - m.lo ? q : m))
    const w = narrow.hi - narrow.lo, red = cl.lines.some(listed)
    return {
      key: k + '|' + i,
      isHoriz: rot,                         // vertical rows run along Y: the cross-aisle gap is along Y
      gapLo: narrow.lo, gapHi: narrow.hi, labelMid: (narrow.lo + narrow.hi) / 2,
      positions: [(cl.c0 + cl.c1) / 2],
      level: red ? 1 : 3,
      text: red ? fmtLenDown(w, gridSize) : pxToFtIn(w, gridSize),
    }
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
