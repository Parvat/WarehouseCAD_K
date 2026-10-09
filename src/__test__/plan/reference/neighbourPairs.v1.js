// FROZEN REFERENCE: neighbourPairs from src/generate/rowAisles.js as it was before BUG 77 (master 2d32c44).
// PB_pairingBlocks.test.js checks the new pairing gives exactly these pairs on untouched layouts. Never edit it.
import { rackFootprint } from '../../../generate/rackFootprint'
import { rowLines } from '../../../utils/syncSections'

const EPS = 1e-6
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a)

/** A line's pieces as stretches: end-to-end pieces (overlapping by a shared upright, or touching) together,
 *  a real gap between pieces starting a new stretch. */
function stretchesOf(pieces) {
  const items = pieces.map(r => ({ r, run: runOf(rackFootprint(r)) })).sort((a, b) => a.run[0] - b.run[0])
  const out = []
  let end = -Infinity
  for (const it of items) {
    if (out.length && it.run[0] <= end + EPS) out[out.length - 1].push(it.r)
    else out.push([it.r])
    end = Math.max(end, it.run[1])
  }
  return out
}

/** Neighbour pairs among beam racks: Map(key -> [idA, idB]) and the section
 *  each rack belongs to: Map(id -> sectionKey). */
export function neighbourPairs(racks) {
  const pairs = new Map(), sectionOf = new Map()
  const groups = new Map()
  for (const r of racks) {
    const f = rackFootprint(r)
    const k = (r.parentId || '') + '|' + (f.rotated ? 'v' : 'h')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push({ r, run: runOf(f) })
  }
  for (const [gk, items] of groups) {
    items.sort((a, b) => a.run[0] - b.run[0])
    const sections = []
    for (const q of items) {
      const s = sections[sections.length - 1]
      if (s && q.run[0] < s.end - EPS) { s.racks.push(q.r); s.end = Math.max(s.end, q.run[1]) }
      else sections.push({ racks: [q.r], end: q.run[1] })
    }
    sections.forEach((s, si) => {
      const sk = gk + '|' + si
      for (const r of s.racks) sectionOf.set(r.id, sk)
      const lines = rowLines(s.racks)
      for (let i = 0; i + 1 < lines.length; i++) {
        // the best-facing pair of pieces for each pair of facing stretches, at each width between them
        const best = new Map()
        const sa = stretchesOf(lines[i].pieces), sb = stretchesOf(lines[i + 1].pieces)
        sa.forEach((stA, ia) => stA.forEach(p => sb.forEach((stB, ib) => stB.forEach(q => {
          const fp = rackFootprint(p), fq = rackFootprint(q)
          const [a0, a1] = runOf(fp), [b0, b1] = runOf(fq)
          const shared = Math.min(a1, b1) - Math.max(a0, b0)
          if (shared <= EPS) return                                              // don't share any of the run
          const gap = crossOf(fq)[0] - crossOf(fp)[1]
          if (gap <= EPS) return                                                 // touching: no aisle
          // one per pair of stretches AND width: a stretch facing at two widths (a single on the far half of a
          // pair) keeps a label for each
          const k = ia + ':' + ib + ':' + Math.round(gap * 100), b = best.get(k)
          if (!b || shared > b.shared + EPS) best.set(k, { shared, p, q })
        }))))
        for (const { p, q } of best.values()) pairs.set(pairKey(p.id, q.id), [p.id, q.id])
      }
    })
  }
  return { pairs, sectionOf }
}
