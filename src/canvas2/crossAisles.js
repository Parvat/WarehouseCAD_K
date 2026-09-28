import { rackFootprint } from '../generate/columnCheck'
import { pxToFtIn } from '../utils/canvas'

/* ── Cross-aisle width labels ─────────────────────────────────────────────────
   A cross-aisle is not an object: it is the gap between two sections along
   the run. Per building (and per row orientation), the racks' extents along
   the run are merged into sections; each gap between two consecutive
   sections is a cross-aisle. Its width is the clear gap between the facing
   racks (the nearest ends on either side), and it gets ONE label, centred
   along the gap and across the racks on both sides of it — drawn exactly like
   an aisle label (DimensionLabels.jsx's AisleLabelView takes this layout).

   `isHoriz` follows aisleLabelLayout's meaning — true when the gap is
   measured along Y — so a horizontal layout (rows run along X, the
   cross-aisle gap is along X) gives isHoriz false. World px. Pure. */
const EPS = 1e-6

export function crossAisleLabels(objects, gridSize = 40) {
  const groups = new Map()
  for (const o of objects) {
    if (!o || typeof o.type !== 'string' || !o.type.startsWith('rack_')) continue
    const f = rackFootprint(o)
    const k = (o.parentId ?? '') + '|' + (f.rotated ? 'v' : 'h')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(f)
  }
  const out = []
  for (const [k, feet] of groups) {
    const rot = feet[0].rotated
    const run = (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
    const cross = (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
    // sections: racks merged along the run
    const sorted = [...feet].sort((a, b) => run(a)[0] - run(b)[0])
    const sections = []
    for (const f of sorted) {
      const [r0, r1] = run(f), [c0, c1] = cross(f)
      const s = sections[sections.length - 1]
      if (s && r0 < s.r1 - EPS) { s.r1 = Math.max(s.r1, r1); s.c0 = Math.min(s.c0, c0); s.c1 = Math.max(s.c1, c1) }
      else sections.push({ r0, r1, c0, c1 })
    }
    for (let i = 0; i + 1 < sections.length; i++) {
      const a = sections[i], b = sections[i + 1]
      const gapLo = a.r1, gapHi = b.r0
      if (gapHi - gapLo <= EPS) continue
      const c0 = Math.min(a.c0, b.c0), c1 = Math.max(a.c1, b.c1)
      out.push({
        key: k + '|' + i,
        isHoriz: rot,                       // vertical rows run along Y: the cross-aisle gap is along Y
        gapLo, gapHi, labelMid: (gapLo + gapHi) / 2,
        positions: [(c0 + c1) / 2],
        text: pxToFtIn(gapHi - gapLo, gridSize),
      })
    }
  }
  return out
}
