// mezzCheck.js — (r9-mezzanine) a mezzanine's checks — warnings, never errors:
//   - each stair needs a 3 ft clear landing at its foot (racks, columns, zones, walls, door clear spaces and other objects
//     off it);
//   - a pallet gate needs a face aisle like a rack face: the floor in front of it (outward) clear for the plan's truck aisle.
// Racks under the mezzanine stay allowed (the existing rule) — only the landing and the gate's aisle are looked at.
// → [{ id, kind: 'landing' | 'gate', i, text, box }]. Pure.
import { mezzSpec, mezzStairs, mezzGates } from './mezzanine'
import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { layoutColumns } from '../generate/usableCapacity'
import { doorClearRects } from '../utils/doorClear'
import { innerOutline } from '../utils/floorGeom'
import { clearInFront } from '../generate/laneFaces'
import { fmtLenDown } from '../utils/copyChange'

const E = 0.5
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > E && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > E
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_')
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_') && o.type !== 'rack_mezzanine' && o.width > 0 && o.height > 0

/** Is box `b` inside the building outline `poly` (every corner on the floor)? */
function inside(poly, b) {
  if (!poly || poly.length < 3) return true
  const pin = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], q = poly[j]; if ((a.y > y) !== (q.y > y) && x < ((q.x - a.x) * (y - a.y)) / ((q.y - a.y) || 1e-9) + a.x) c = !c } return c }
  const m = 0.5
  return [[b.x + m, b.y + m], [b.x + b.w - m, b.y + m], [b.x + b.w - m, b.y + b.h - m], [b.x + m, b.y + b.h - m]].every(([x, y]) => pin(x, y))
}

export function mezzWarnings(objects, gridSize = 40, profile = MHE_PROFILES.reach) {
  const out = []
  if (!Array.isArray(objects)) return out
  const mezzes = objects.filter(o => o?.type === 'rack_mezzanine' && o.width > 0 && o.height > 0)
  if (!mezzes.length) return out
  const fixed = [
    ...objects.filter(isZone).map(z => ({ x: z.x, y: z.y, w: z.width, h: z.height, kind: 'zone' })),
    ...layoutColumns(objects, gridSize).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: 'column' })),
    ...doorClearRects(objects, gridSize).map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, kind: 'door' })),
    ...objects.filter(isRack).map(r => { const f = rackFootprint(r); return { x: f.x, y: f.y, w: f.w, h: f.h, kind: 'rack' } }),
  ]
  for (const m of mezzes) {
    const fp = objects.find(o => o.id === m.parentId && typeof o.type === 'string' && o.type.startsWith('fp_'))
    const poly = fp ? innerOutline(fp, gridSize) : null
    for (const st of mezzStairs(m, gridSize)) {
      const hit = fixed.find(b => overlaps(b, st.foot))
      const out1 = !inside(poly, st.foot) || !inside(poly, st.box)
      if (hit || out1) out.push({ id: m.id, kind: 'landing', i: st.i, box: st.foot, text: `Stair ${st.i + 1}: needs a 3 ft clear landing at its foot (${out1 ? 'a wall' : 'a ' + hit.kind} is there)` })
    }
    const need = (profile?.aisleFt || 10) * gridSize
    for (const g of mezzGates(m, gridSize)) {
      const horiz = g.edge === 'top' || g.edge === 'bottom'
      const fl = horiz ? { along: 'x', at: g.bar.y1, a: Math.min(g.bar.x1, g.bar.x2), c: Math.max(g.bar.x1, g.bar.x2), dir: g.ny } : { along: 'y', at: g.bar.x1, a: Math.min(g.bar.y1, g.bar.y2), c: Math.max(g.bar.y1, g.bar.y2), dir: g.nx }
      const own = mezzStairs(m, gridSize).map(s => ({ ...s.box, kind: 'stair' }))
      const r = clearInFront(fl, need + E, { boxes: [...fixed, ...own], poly })
      if (r.kind) out.push({ id: m.id, kind: 'gate', i: g.i, box: null, text: `Pallet gate ${g.i + 1}: its face aisle is ${fmtLenDown(r.d, gridSize)} (${r.kind}) — the truck needs ${profile?.aisleFt || 10} ft` })
    }
  }
  return out
}
