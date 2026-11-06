// bom.js — the layout's bill of materials (BOM v1): selective single rows (rack_row) and back-to-back pairs
// (rack_double_row), quantities only, no prices. One pure function: the layout (objects) and its elevations in, BOM
// lines and flags out — it never reads the screen.
//
// What counts, and once (utils/bayLedger.js decides): a bay more than half covered by another rack's bay is not
// counted — overlapping racks never count twice; a frame two racks stand on together (in-line, a shared upright)
// counts once; on a pair side a frame stands only beside a bay that exists on that side (an empty side bay drops the
// frames between empty bays). Bays with X marks (lost positions) still count: the steel is there.
//
//   Upright frames    one per frame position and side; by height × depth (the taller of the two bays' elevations it
//                     stands between, on its side; the rack's own frame depth)
//   Beam pairs        per bay side × beam levels — level 1 has no beam when its elevation's First level on floor is
//                     on (the default); by beam length × beam face
//   Safety pins       2 per beam: 4 per beam pair
//   Wire decks        per bay side × beam level × the deck set for that beam length (the project's deck table); by
//                     deck width × depth (the frame depth). No deck row for a length: none counted, flagged
//   Row spacers       back-to-back only: per frame pair (both sides' frames at one upright position) × spacers for
//                     the frame height (the setting: N up to H ft, M above); by flue
//   Anchors           per frame × 2 feet × anchors per foot (setting, default 1)
//   Upright guards    (setting, off by default) on the frames at a row end that faces an aisle
//   End-of-aisle      (setting, off by default) one per row end facing an aisle — a pair's end counts once
//
// A bay side with no elevation (none resolves) is counted with the layout's default elevation, and flagged.

import { bayLedger } from './bayLedger'
import { typeAt, typeById, beamFace, sidesOf } from './elevations'
import { isEmptySide } from './bayEmpty'
import { sectionMap } from '../canvas2/sections'

export const BOM_DEFAULTS = {
  decks: [
    { beamIn: 96, widthsIn: [46, 46] },
    { beamIn: 108, widthsIn: [52, 52] },
    { beamIn: 144, widthsIn: [46, 46, 46] },
  ],
  anchorsPerFoot: 1,
  spacerBreakFt: 16, spacersUpTo: 2, spacersAbove: 3,
  uprightGuards: false, endGuards: false,
}
/** The project's BOM settings over the defaults (`project.bom`). */
export function bomSettings(project) {
  const b = project?.bom || {}
  return { ...BOM_DEFAULTS, ...b, decks: Array.isArray(b.decks) ? b.decks : BOM_DEFAULTS.decks }
}
/** Is an elevation's first level on the floor (no beam under it)? On unless turned off. */
export const firstOnFloor = (t) => t?.firstOnFloor !== false

/** How far past a row end the floor must be open to call it an aisle (in): a forklift's turn needs more, a wall
 *  clearance (3") or a flue far less — 4 ft tells them apart. */
export const AISLE_PROBE_IN = 48

export const PARTS = ['Upright frame', 'Beam pair', 'Safety pin', 'Wire deck', 'Row spacer', 'Anchor', 'Upright guard', 'End-of-aisle guard']
const BEAM = new Set(['rack_row', 'rack_double_row'])
const isBomRack = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && o.width > 0 && o.height > 0
const OTHER_RACK = /^rack_/
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
const footprint = (r) => {
  if (norm(r.rotation) % 180 === 90) { const cx = r.x + r.width / 2, cy = r.y + r.height / 2; return { x: cx - r.height / 2, y: cy - r.width / 2, w: r.height, h: r.width, rotated: true } }
  return { x: r.x, y: r.y, w: r.width, h: r.height, rotated: false }
}
const n2 = (v) => Math.round(v * 100) / 100
/** 192 → 16′; 198 → 16′-6″ */
export const ftIn = (inches) => { const v = Math.round(inches), f = Math.floor(v / 12), i = v - f * 12; return i ? `${f}′-${i}″` : `${f}′` }
const inch = (v) => `${n2(v)}″`

/** The deck set for a beam length (in): its widths, or null with no row for it (within ½"). */
export function deckSet(decks, beamIn) {
  const row = (decks || []).find(d => Math.abs(Number(d.beamIn) - beamIn) <= 0.5)
  return row ? (row.widthsIn || []).map(Number).filter(w => w > 0) : null
}

/**
 * The BOM of a layout.
 * @param objects   the layout's objects (the store's `objects`)
 * @param T         its elevations table (the store's `elevations`; the project rides on it)
 * @param opts      { gridSize = 40, settings (else the project's) }
 * @returns { lines: [{ key, part, size, qty, ids: [rackId] }], flags: [{ key, text, ids }], counted: { racks, bays } }
 */
export function computeBom(objects, T, { gridSize = 40, settings = null } = {}) {
  const S = settings || bomSettings(T?.project)
  const racks = (objects || []).filter(isBomRack)
  const ledger = bayLedger(objects || [], gridSize, T)
  const lines = new Map(), flags = new Map()
  const add = (part, size, qty, id, sort = 0) => {
    if (!(qty > 0)) return
    const key = part + '|' + size
    if (!lines.has(key)) lines.set(key, { key, part, size, qty: 0, ids: new Set(), sort })
    const l = lines.get(key); l.qty += qty; l.ids.add(id)
  }
  const flag = (key, text, id) => { if (!flags.has(key)) flags.set(key, { key, text, ids: new Set(), n: 0 }); const f = flags.get(key); f.n++; f.ids.add(id); f.text = typeof text === 'function' ? text(f.n) : text }
  const fallback = typeById(T, T?.defaultId)

  /** The elevation of bay `b` side `s`: its own, else the default (flagged). */
  const elevOf = (r, b, s) => {
    const t = typeAt(r, b, s, T)
    if (t) return t
    flag('no-elev', (n) => `${n} bay side${n === 1 ? '' : 's'} with no elevation — counted with the default`, r.id)
    return fallback
  }

  for (const r of racks) {
    const e = ledger.racks.get(r.id)
    if (!e) continue
    const depth = r.depthIn ?? 42, sides = sidesOf(r)
    // beams, pins and decks: every counted bay side that is not empty
    for (let s = 0; s < sides; s++) r.beams.forEach((beamIn, b) => {
      if (!e.counted[b] || isEmptySide(r, b, s)) return
      const t = elevOf(r, b, s)
      const levels = t ? t.levels.length : (r.levels || 1)
      const beamed = Math.max(0, levels - (firstOnFloor(t) ? 1 : 0))
      if (!beamed) return
      const face = beamFace(t)
      add('Beam pair', `${inch(beamIn)} × ${inch(face)} face`, beamed, r.id, beamIn * 100 + face)
      add('Safety pin', '', beamed * 4, r.id)
      const set = deckSet(S.decks, beamIn)
      if (!set || !set.length) { flag('deck-' + n2(beamIn), `Set decks for ${n2(beamIn)} in beams`, r.id); return }
      for (const w of set) add('Wire deck', `${inch(w)} × ${inch(depth)}`, beamed, r.id, w * 1000 + depth)
    })
    // frames: the ledger's (a shared one once; a pair side's only beside a bay of that side)
    /* a frame's height on its side: the taller of the bays it stands between there */
    const heightAt = (k, s) => {
      let h = null
      for (const b of [k - 1, k]) {
        if (b < 0 || b >= r.beams.length || !e.counted[b] || isEmptySide(r, b, s)) continue
        const t = typeAt(r, b, s, T) || fallback
        const v = t?.uprightHeightIn
        if (Number.isFinite(v) && (h == null || v > h)) h = v
      }
      return h
    }
    const sidesAt = e.frameSides || []
    sidesAt.forEach((list, k) => {
      for (const s of list) {
        const h = heightAt(k, s)
        add('Upright frame', h == null ? `height not set × ${inch(depth)}` : `${ftIn(h)} × ${inch(depth)}`, 1, r.id, (h || 0) * 1000 + depth)
        if (h == null) flag('no-height', (n) => `${n} frame${n === 1 ? '' : 's'} with no height (no elevation)`, r.id)
        add('Anchor', '', 2 * (Number(S.anchorsPerFoot) || 0), r.id)
      }
      // a back-to-back pair's two frames at this upright: tied by row spacers
      if (r.type === 'rack_double_row' && list.includes(0) && list.includes(1)) {
        const h = Math.max(heightAt(k, 0) || 0, heightAt(k, 1) || 0)
        const n = h > (Number(S.spacerBreakFt) || 16) * 12 + 1e-6 ? Number(S.spacersAbove) || 0 : Number(S.spacersUpTo) || 0
        const flue = r.flueSpaceIn || 9
        add('Row spacer', `${inch(flue)} flue`, n, r.id, flue)
      }
    })
  }

  // guards at the row ends that face an aisle (dealer's choice: off unless set)
  if (S.uprightGuards || S.endGuards) for (const end of rowEnds(objects || [], racks, ledger, gridSize)) {
    if (!end.aisle) continue
    if (S.uprightGuards) add('Upright guard', '', end.frames, end.rackId)
    if (S.endGuards) add('End-of-aisle guard', '', 1, end.rackId)
  }

  const others = (objects || []).filter(o => OTHER_RACK.test(o.type || '') && !isBomRack(o))
  if (others.length) for (const o of others) flag('other', (n) => `${n} rack${n === 1 ? '' : 's'} of another kind not in this BOM (selective and back-to-back only)`, o.id)

  const order = (p) => PARTS.indexOf(p)
  const out = [...lines.values()].sort((a, b) => order(a.part) - order(b.part) || a.sort - b.sort || a.size.localeCompare(b.size))
    .map(({ key, part, size, qty, ids }) => ({ key, part, size, qty, ids: [...ids] }))
  return {
    lines: out,
    flags: [...flags.values()].map(({ key, text, ids }) => ({ key, text, ids: [...ids] })),
    counted: { racks: racks.filter(r => ledger.racks.get(r.id)?.bays > 0).length, bays: racks.reduce((t, r) => t + (ledger.racks.get(r.id)?.bays || 0), 0) },
  }
}

/** Each row's two ends: { rackId, frames (the end frames there, a pair's both sides), aisle (the floor past it is open:
 *  inside a building, no rack or zone within AISLE_PROBE_IN) }. A row is a section: pieces joined end to end. */
export function rowEnds(objects, racks, ledger, gridSize = 40) {
  const sec = sectionMap(objects, gridSize), seen = new Set(), out = []
  const probe = (AISLE_PROBE_IN / 12) * gridSize
  const fps = objects.filter(o => /^fp_/.test(o.type || ''))
  const blockers = objects.filter(o => (OTHER_RACK.test(o.type || '') || /^zone_/.test(o.type || '')) && o.width > 0 && o.height > 0).map(o => ({ id: o.id, ...footprint(o) }))
  const inside = (b) => fps.some(f => b.x >= f.x - 1e-6 && b.y >= f.y - 1e-6 && b.x + b.w <= f.x + f.width + 1e-6 && b.y + b.h <= f.y + f.height + 1e-6)
  const hits = (b, ids) => blockers.some(o => !ids.has(o.id) && Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x) > 1e-6 && Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y) > 1e-6)
  for (const r of racks) {
    const ids = sec.get(r.id) || [r.id], k = ids.slice().sort().join(',')
    if (seen.has(k)) continue
    seen.add(k)
    const pieces = ids.map(id => racks.find(x => x.id === id)).filter(Boolean)
    if (!pieces.length || !pieces.some(p => (ledger.racks.get(p.id)?.bays || 0) > 0)) continue
    const fs = pieces.map(p => ({ p, f: footprint(p) })), rot = fs[0].f.rotated
    const lo = Math.min(...fs.map(q => (rot ? q.f.y : q.f.x))), hi = Math.max(...fs.map(q => (rot ? q.f.y + q.f.h : q.f.x + q.f.w)))
    const c0 = Math.min(...fs.map(q => (rot ? q.f.x : q.f.y))), c1 = Math.max(...fs.map(q => (rot ? q.f.x + q.f.w : q.f.y + q.f.h)))
    const set = new Set(ids)
    for (const [at, dir] of [[lo, -1], [hi, 1]]) {
      // the piece at this end, and its frames at that end
      const q = fs.find(x => Math.abs((dir < 0 ? (rot ? x.f.y : x.f.x) : (rot ? x.f.y + x.f.h : x.f.x + x.f.w)) - at) < 1e-6) || fs[0]
      const e = ledger.racks.get(q.p.id), runLow = norm(q.p.rotation) < 180   // stored bay order runs low → high below 180°
      const kEnd = (dir < 0) === runLow ? 0 : q.p.beams.length
      const frames = (e?.frameSides?.[kEnd] || []).length
      const box = rot ? { x: c0, y: dir < 0 ? at - probe : at, w: c1 - c0, h: probe } : { x: dir < 0 ? at - probe : at, y: c0, w: probe, h: c1 - c0 }
      out.push({ rackId: q.p.id, frames, aisle: inside(box) && !hits(box, set) })
    }
  }
  return out
}

/** The BOM as CSV (part, size, qty), the flags first as comment lines. */
export function bomCsv(bom) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const rows = [['Part', 'Size', 'Qty'], ...bom.lines.map(l => [l.part, l.size, l.qty])]
  return [...bom.flags.map(f => '# ' + f.text), ...rows.map(r => r.map(esc).join(','))].join('\r\n') + '\r\n'
}
