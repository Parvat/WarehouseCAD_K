// rowAisles.js — which rows face each other across an aisle: ONE pairing for the aisle labels
// (aisleRebuild.js), Check layout's aisle check (layoutCheck.js), the column-in-aisle check
// (columnCheck.js) and Generate's aisle objects (traceGenerate.js), so none can disagree with another.
//
//   - neighbourPairs: beam racks, per line — facing stretches of consecutive lines across, one pair per
//     pair of stretches and width (the aisle labels' rule; moved here from aisleRebuild.js), section by
//     section: the sections come from the double rows, so a wall row running past them can't merge them
//     into one (BUG 77 — a row deleted in one section left its neighbours there unpaired).
//   - rowAisleGaps: every aisle between neighbouring rows, as gaps — beam racks by neighbourPairs, any pair
//     with another rack type by rowGaps.
//   - rowGaps / groupBySegment: the old pairing (moved here from columnCheck.js), kept for the other rack
//     types. On its own it missed almost every aisle of a layout with sections: groupBySegment joins racks
//     sharing any of the run, so full-length wall rows chain every section into one segment, and rowGaps
//     compares only neighbours in one list across (BUG 74, BUG 75).
// Pure. Imports only rackFootprint.js and syncSections.js — nothing that imports this module back.

import { rackFootprint } from './rackFootprint'
import { rowLines } from '../utils/syncSections'

const EPS = 1e-6
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a)

/* Group racks into runs (segments) by shared-run overlap — a travel aisle
 * only exists BETWEEN two racks that actually face each other along the
 * same run; a rack in a different run (across a cross-aisle) shares no
 * aisle with it even if it happens to sit at the same Y. "Same run" means
 * sharing the cross-axis range: X-overlap for horizontal racks (stacked
 * down Y), Y-overlap for vertical ones (stacked across X, GENERATOR_SPEC_
 * V10's orientation) — mismatched orientation never shares a run. Union-
 * find over pairwise overlap rather than exact position equality, so a
 * hand-resized bay (still overlapping its neighbors' span) still groups
 * correctly, not just an untouched generated layout sharing one exact x. */
export function groupBySegment(racks) {
  const n = racks.length
  const feet = racks.map(rackFootprint)
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj }
  const sameRun = (a, b) => {
    if (a.rotated !== b.rotated) return false
    return a.rotated
      ? a.y < b.y + b.h && a.y + a.h > b.y   // vertical: share the same Y range
      : a.x < b.x + b.w && a.x + a.w > b.x   // horizontal: share the same X range
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sameRun(feet[i], feet[j])) union(i, j)
    }
  }
  const groups = new Map()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(racks[i])
  }
  return [...groups.values()]
}

/** The gaps between neighbouring rows of one run — the aisles, measured
 *  along the axis the rows are stacked on: [{ top, bot (the racks), stacked,
 *  gapStart, gapLen, crossStart, crossEnd, box }] (px). */
export function rowGaps(racks) {
  const out = []
  for (const run of groupBySegment(racks)) {
    if (!run.length) continue
    const stacked = rackFootprint(run[0]).rotated   // true: stacked along X (vertical rows). false: along Y.
    const feet = run.map(r => ({ r, f: rackFootprint(r) }))
    feet.sort((a, b) => stacked ? a.f.x - b.f.x : a.f.y - b.f.y)
    for (let i = 0; i < feet.length - 1; i++) {
      const top = feet[i], bot = feet[i + 1]
      const gapStart = stacked ? (top.f.x + top.f.w) : (top.f.y + top.f.h)
      const gapLen   = stacked ? (bot.f.x - gapStart) : (bot.f.y - gapStart)
      if (gapLen <= 0) continue
      const crossStart = Math.max(stacked ? top.f.y : top.f.x, stacked ? bot.f.y : bot.f.x)
      const crossEnd   = Math.min(
        stacked ? top.f.y + top.f.h : top.f.x + top.f.w,
        stacked ? bot.f.y + bot.f.h : bot.f.x + bot.f.w,
      )
      if (crossEnd <= crossStart) continue
      const box = stacked
        ? { x: gapStart, y: crossStart, w: gapLen, h: crossEnd - crossStart }
        : { x: crossStart, y: gapStart, w: crossEnd - crossStart, h: gapLen }
      out.push({ top: top.r, bot: bot.r, stacked, gapStart, gapLen, crossStart, crossEnd, box })
    }
  }
  return out
}

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

/** Blocks along the run (sections) for pairing: { start, end, racks }. Built from the DOUBLE rows — a
 *  cross-aisle splits them, and a single row flush on a wall running past several sections can't merge
 *  them into one (BUG 77) — then every rack joins each block it overlaps along the run (so a wall row is
 *  in every section's block). Racks overlapping no such block, and every rack of a group with no double
 *  rows, are merged by overlapping run among themselves, as before. */
function pairingBlocks(items) {
  const merge = (list) => {
    const out = []
    for (const q of [...list].sort((a, b) => a.run[0] - b.run[0])) {
      const b = out[out.length - 1]
      if (b && q.run[0] < b.end - EPS) b.end = Math.max(b.end, q.run[1])
      else out.push({ start: q.run[0], end: q.run[1], racks: [] })
    }
    return out
  }
  const blocks = merge(items.filter(q => q.r.type === 'rack_double_row'))
  const rest = []
  for (const q of items) {
    const hit = blocks.filter(b => q.run[0] < b.end - EPS && q.run[1] > b.start + EPS)
    if (hit.length) for (const b of hit) b.racks.push(q.r)
    else rest.push(q)
  }
  const extra = merge(rest)
  for (const q of rest) extra.find(b => q.run[0] >= b.start - EPS && q.run[1] <= b.end + EPS).racks.push(q.r)
  return [...blocks, ...extra].sort((a, b) => a.start - b.start)
}

/** Neighbour pairs among beam racks: Map(key -> [idA, idB]) and the section
 *  each rack belongs to: Map(id -> sectionKey) — a rack in several blocks (a wall row past several
 *  sections) takes the first. Within a block, each line of racks pairs with the next line across. */
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
    pairingBlocks(items).forEach((s, si) => {
      const sk = gk + '|' + si
      for (const r of s.racks) if (!sectionOf.has(r.id)) sectionOf.set(r.id, sk)
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

const BEAMS = new Set(['rack_row', 'rack_double_row'])
/** The aisles between neighbouring rows, every one: [{ top, bot, stacked, gapStart, gapLen, crossStart, crossEnd, box }] (world px; top before bot
 *  across). Beam racks are paired exactly as the aisle labels pair them — facing stretches, per line
 *  (neighbourPairs) — whatever the sections or the wall rows; the old pairing (rowGaps over segments joined
 *  by any shared run) chained a layout's sections into one through its full-length wall rows and compared
 *  only neighbours in one list across, so it missed almost every aisle (BUG 74). A pair with any other rack
 *  type is found by rowGaps, as before. `racks`: right-angled racks. */
export function rowAisleGaps(racks) {
  const beams = racks.filter(r => BEAMS.has(r.type)), byId = new Map(beams.map(r => [r.id, r]))
  const out = []
  for (const [a, b] of neighbourPairs(beams).pairs.values()) {
    const p = byId.get(a), q = byId.get(b)
    const fp = rackFootprint(p), fq = rackFootprint(q), rot = fp.rotated
    const across = (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h]), along = (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
    const [top, bot] = across(fp)[1] <= across(fq)[0] ? [p, q] : [q, p]
    const ft = rackFootprint(top), fb = rackFootprint(bot)
    const lo = across(ft)[1], hi = across(fb)[0], r0 = Math.max(along(ft)[0], along(fb)[0]), r1 = Math.min(along(ft)[1], along(fb)[1])
    out.push({ top, bot, stacked: !!rot, gapStart: lo, gapLen: hi - lo, crossStart: r0, crossEnd: r1, box: rot ? { x: lo, y: r0, w: hi - lo, h: r1 - r0 } : { x: r0, y: lo, w: r1 - r0, h: hi - lo } })
  }
  for (const g of rowGaps(racks)) if (!BEAMS.has(g.top.type) || !BEAMS.has(g.bot.type)) out.push(g)
  return out
}
