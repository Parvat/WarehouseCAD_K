// rowEdits.js — "Apply my changes to all sections": replay the ROW edits the
// user made since the last sync in every other section.
//
// Pending edits are not logged action by action (the store is protected):
// they are the DIFFERENCE between the rows now and a BASELINE of the rows
// as they were right after the last sync (or generation). The baseline lives
// on the building (floor plan) object as `rowBaseline`, so it is saved with
// the layout, rides in every undo snapshot (undoing an edit takes it off the
// list; undoing a sync brings the list back) and is replaced in the sync's
// own commit (the list clears).
//
// A row = a line across the aisles in one section, identified by the
// generator's stamps: `${genSection}|${rowIndex}` (split pieces share it).
//   - delete: a baseline row that's gone  -> that row goes in every other section;
//   - move:   a baseline row whose position changed (all pieces together;
//             a change of LENGTH is a bay edit, never a move along the run)
//             -> the same row moves by the same amount in every other section;
//   - add:    a row that isn't in the baseline (placed by hand, pasted)
//             -> a copy in every other section at the same position relative
//             to that section (same beams/depth/levels), all sharing one new
//             rowIndex; a copy that wouldn't fit is skipped and reported.
// Bay changes are not edits here ("Match bays in this section" does bays).
// Edits to the same row in several sections: the LATER one wins everywhere
// (order read from the undo history) and the clash is reported.
// Positions in the baseline are feet from the building's corner, so they
// hold when the building is dragged.

import { rackFootprint } from '../generate/columnCheck'
import { rackIssues } from './bayBeam'
import { rowLines } from './syncSections'
import { splitRackForBayDelete } from './baySplit'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6
const FT_EPS = 1e-4
const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
export const rowKey = (section, rowIndex) => section + '|' + rowIndex
const stamped = (r) => r.rowIndex != null && r.genSection != null

/** The building's run direction: its baseline's, else its generated rows',
 *  else most of its racks'. */
function buildingRotated(fp, racks) {
  if (fp.rowBaseline && typeof fp.rowBaseline.rotated === 'boolean') return fp.rowBaseline.rotated
  const gen = racks.filter(stamped)
  const pool = gen.length ? gen : racks
  const n = pool.filter(r => rackFootprint(r).rotated).length
  return n * 2 > pool.length
}
/** The building's beam racks: those running with its rows, and any placed
 *  the other way round (`across` — e.g. dropped from the left panel
 *  without being turned). */
function buildingRacks(objects, fp) {
  const all = objects.filter(o => BEAM.has(o.type) && Array.isArray(o.beams) && rightAngle(o) && o.parentId === fp.id)
  const rotated = buildingRotated(fp, all)
  return { racks: all.filter(r => rackFootprint(r).rotated === rotated), across: all.filter(r => rackFootprint(r).rotated !== rotated), rotated }
}
const origin = (fp, rotated) => ({ run0: rotated ? fp.y || 0 : fp.x || 0, cross0: rotated ? fp.x || 0 : fp.y || 0 })

/** The rows now: Map(key -> line) and the added lines. Each line: { pieces,
 *  key, section, rowIndex, run, end, cross, bays } in feet from the corner.
 *
 *  WHICH RACKS ARE AN EXISTING ROW is decided by rack id, not by stamps: a
 *  row is the racks whose ids the baseline recorded for it, plus the split
 *  pieces made from them since (`pieceOf` leads back to one of them, on the
 *  same line, not lying on top of another piece). Any other rack is an ADDED
 *  row, whatever rowIndex/section stamps it carries — a pasted or duplicated
 *  copy of a row can never read as that row having moved. (A baseline from
 *  before ids were recorded falls back to the stamps.) */
export function currentRows(objects, fp, gridSize = 40) {
  const { racks, across, rotated } = buildingRacks(objects, fp)
  const { run0, cross0 } = origin(fp, rotated)
  const toFt = (l) => ({ run: (l.runStart - run0) / gridSize, end: (l.runEnd - run0) / gridSize, cross: (l.crossLo - cross0) / gridSize })
  const baysOf = (l) => l.pieces.reduce((n, q) => n + (Array.isArray(q.beams) ? q.beams.length : 0), 0)
  const base = fp.rowBaseline?.rows || {}
  const byKey = new Map(), added = []
  const bySection = new Map()
  const baseIds = new Map()
  for (const [k, b] of Object.entries(base)) for (const id of b.ids || []) baseIds.set(id, k)
  const byIds = Object.values(base).some(b => Array.isArray(b.ids))
  const allById = new Map([...racks, ...across].map(r => [r.id, r]))
  const rowOfPiece = (r) => {                     // the baseline row a split piece came from, or null
    const seen = new Set()
    let q = r
    while (q && !baseIds.has(q.id)) {
      if (!q.pieceOf || seen.has(q.id)) return null
      seen.add(q.id)
      q = allById.get(q.pieceOf) || (baseIds.has(q.pieceOf) ? { id: q.pieceOf } : null)
    }
    return q ? baseIds.get(q.id) : null
  }
  const overlapsArea = (a, b) => {
    const fa = rackFootprint(a), fb = rackFootprint(b)
    return Math.min(fa.x + fa.w, fb.x + fb.w) - Math.max(fa.x, fb.x) > 0.5 && Math.min(fa.y + fa.h, fb.y + fb.h) - Math.max(fa.y, fb.y) > 0.5
  }
  const member = (r) => {
    if (!byIds) return true
    const k = rowKey(r.genSection, r.rowIndex)
    if (baseIds.get(r.id) === k) return true
    if (!r.pieceOf || rowOfPiece(r) !== k) return false
    // a piece shares its row's line and never lies on top of another of its racks
    const same = racks.filter(q => q !== r && q.rowIndex === r.rowIndex && q.genSection === r.genSection)
    const lineOf = (q) => crossOf(rackFootprint(q))
    const [c0, c1] = lineOf(r)
    const onLine = same.some(q => { const [d0, d1] = lineOf(q); return c0 < d1 - EPS && c1 > d0 + EPS })
    return onLine && !same.some(q => overlapsArea(q, r))
  }
  const addedStamped = []
  for (const r of racks.filter(stamped)) {
    if (!member(r)) { addedStamped.push(r); continue }
    if (!bySection.has(r.genSection)) bySection.set(r.genSection, [])
    bySection.get(r.genSection).push(r)
  }
  for (const [section, list] of bySection) {
    const lines = rowLines(list)
    const groups = new Map()
    for (const l of lines) {
      const k = rowKey(section, l.pieces[0].rowIndex)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push({ ...l, ...toFt(l), bays: baysOf(l), key: k, section, rowIndex: l.pieces[0].rowIndex })
    }
    for (const [k, ls] of groups) {
      const b = base[k]
      ls.sort((a, c) => (b ? Math.hypot(a.run - b.run, a.cross - b.cross) - Math.hypot(c.run - b.run, c.cross - b.cross) : a.cross - c.cross))
      byKey.set(k, ls[0])
      for (const extra of ls.slice(1)) added.push({ ...extra, key: null })
    }
  }
  const loose = [...racks.filter(r => !stamped(r)), ...addedStamped]
  for (const l of rowLines(loose)) added.push({ ...l, ...toFt(l), key: null, section: null, rowIndex: null })
  /* a rack placed the other way round is its own row, measured along the
     building's run: counted (never silently ignored) — an added row unless
     a sync has already stamped it */
  for (const r of across) {
    const f = rackFootprint(r)
    const [runStart, runEnd] = rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w]
    const [crossLo, crossHi] = rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h]
    const l = { pieces: [r], runStart, runEnd, crossLo, crossHi }
    if (stamped(r) && (!byIds || baseIds.get(r.id) === rowKey(r.genSection, r.rowIndex)) && !byKey.has(rowKey(r.genSection, r.rowIndex))) byKey.set(rowKey(r.genSection, r.rowIndex), { ...l, ...toFt(l), key: rowKey(r.genSection, r.rowIndex), section: r.genSection, rowIndex: r.rowIndex })
    else added.push({ ...l, ...toFt(l), key: null, section: null, rowIndex: null })
  }
  return { byKey, added, rotated, run0, cross0 }
}

/** Rotation a beam rack dropped into this building should get so it runs
 *  with the building's generated rows (90 for vertical rows, 0 for
 *  horizontal), or null if the building has no generated rows. */
export function rowRotationFor(objects, fpId) {
  const fp = objects.find(o => o.id === fpId)
  if (!fp) return null
  const gen = objects.filter(o => BEAM.has(o.type) && o.parentId === fpId && stamped(o))
  if (!gen.length) return null
  return buildingRotated(fp, gen) ? 90 : 0
}

/** Extra fields for a rack dropped from the left panel: a single or double
 *  row dropped into a building with generated rows is turned to run with
 *  them (a row dropped into a vertical layout is vertical), so it lines up
 *  with the rows around it and "Apply my changes" treats it as an added row. */
export function dropRotation(objects, parentFp, type) {
  if (!parentFp || !BEAM.has(type)) return {}
  const rot = rowRotationFor(objects, parentFp.id)
  return rot == null ? {} : { rotation: rot }
}

/** A fresh baseline from the rows as they are now. */
export function makeBaseline(objects, fp, gridSize = 40) {
  const { byKey, rotated } = currentRows(objects, { ...fp, rowBaseline: null }, gridSize)
  const rows = {}
  for (const [k, l] of byKey) rows[k] = { section: l.section, rowIndex: l.rowIndex, run: l.run, end: l.end, cross: l.cross, bays: l.bays, ids: l.pieces.map(q => q.id) }
  return { v: 2, rotated, rows }
}

/** Section envelopes from the baseline: Map(section -> { start, end }) (ft). */
function baselineSections(baseline) {
  const out = new Map()
  for (const b of Object.values(baseline.rows)) {
    const s = out.get(b.section) || { start: Infinity, end: -Infinity }
    s.start = Math.min(s.start, b.run); s.end = Math.max(s.end, b.end)
    out.set(b.section, s)
  }
  return out
}
/** Which baseline section a line along [run, end] ft belongs to (most overlap). */
function sectionOfRun(sections, run, end) {
  let best = null, bestOv = 0
  for (const [s, e] of sections) {
    const ov = Math.min(end, e.end) - Math.max(run, e.start)
    if (ov > bestOv + EPS) { best = s; bestOv = ov }
  }
  return best
}

/** The pending edits that will be copied: [{ kind: 'delete'|'move'|'trim'|
 *  'add', section, rowIndex, key, dRunFt, dCrossFt, end, bays, line }].
 *   - move: only the movement made — a delta on the axis that changed;
 *   - trim: end bay(s) deleted at an end of the row that borders a
 *     cross-aisle (fewer bays, that end moved in, the other end where it
 *     was). A wall-end trim, a middle-bay delete (a split: same length) and
 *     a beam-length change (same bays) are local and not listed.
 *  Empty when the building has no baseline. */
export function pendingEdits(objects, fp, gridSize = 40) {
  const baseline = fp?.rowBaseline
  if (!baseline) return []
  const { byKey, added } = currentRows(objects, fp, gridSize)
  const secs = baselineSections(baseline)
  const order = [...secs.keys()].sort((a, c) => secs.get(a).start - secs.get(c).start)
  const edits = []
  for (const [k, b] of Object.entries(baseline.rows)) {
    const c = byKey.get(k)
    if (!c) { edits.push({ kind: 'delete', key: k, section: b.section, rowIndex: b.rowIndex }); continue }
    const lenChanged = Math.abs((c.end - c.run) - (b.end - b.run)) > FT_EPS
    const startSame = Math.abs(c.run - b.run) <= FT_EPS, endSame = Math.abs(c.end - b.end) <= FT_EPS
    if (lenChanged && b.bays != null && c.bays < b.bays && (startSame !== endSame)) {
      const end = startSame ? 'end' : 'start'
      const moved = end === 'end' ? c.end < b.end : c.run > b.run
      const i = order.indexOf(b.section)
      const bordersCrossAisle = end === 'start' ? i > 0 : i >= 0 && i < order.length - 1
      /* how many END bays: the distance that end moved in, in bay pitches of
         the piece at that end (a middle-bay delete in the same row doesn't
         move the end, so it never counts here) */
      const endPiece = [...c.pieces].sort((p, q) => end === 'start'
        ? runOf(rackFootprint(p))[0] - runOf(rackFootprint(q))[0] : runOf(rackFootprint(q))[1] - runOf(rackFootprint(p))[1])[0]
      const pitchIn = endPiece.beams.reduce((t, x) => t + x, 0) / endPiece.beams.length + (endPiece.uprightWidth || 3)
      const shiftIn = Math.abs(end === 'end' ? b.end - c.end : c.run - b.run) * 12
      const n = Math.round(shiftIn / pitchIn)
      if (moved && bordersCrossAisle && n >= 1) edits.push({ kind: 'trim', key: k, section: b.section, rowIndex: b.rowIndex, end, bays: n, line: c })
    }
    const dRun = lenChanged ? 0 : c.run - b.run
    const dCross = c.cross - b.cross
    if (Math.abs(dRun) > FT_EPS || Math.abs(dCross) > FT_EPS) {
      edits.push({ kind: 'move', key: k, section: b.section, rowIndex: b.rowIndex, dRunFt: round(dRun), dCrossFt: round(dCross), line: c })
    }
  }
  for (const [k, c] of byKey) if (!baseline.rows[k]) added.push({ ...c, key: null })
  for (const l of added) edits.push({ kind: 'add', section: sectionOfRun(secs, l.run, l.end), rowIndex: null, key: null, line: l })
  return edits
}
const round = (v) => Math.round(v * 10000) / 10000

const fmtFt = (ft) => {
  const inches = Math.round(Math.abs(ft) * 12)
  const f = Math.floor(inches / 12), i = inches % 12
  return f && i ? `${f}' ${i}"` : f ? `${f}'` : `${i}"`
}
/** Row numbers as ranges: [3,4,5,9] -> "rows 3–5, 9", [2] -> "row 2". */
function rowsText(nums) {
  const n = [...new Set(nums)].sort((x, y) => x - y), parts = []
  for (let i = 0; i < n.length;) {
    let j = i
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++
    parts.push(j > i + 1 ? `${n[i]}–${n[j]}` : j === i + 1 ? `${n[i]}, ${n[j]}` : `${n[i]}`)
    i = j + 1
  }
  return (n.length > 1 ? 'rows ' : 'row ') + parts.join(', ')
}
/** "Delete row 5 · Move row 2 by 6' · Add 1 row" — the same change to
 *  several rows is said once ("Move rows 3–21 by 8'"). */
export function describeEdits(edits) {
  const groups = new Map()
  for (const e of edits) {
    let what = null
    if (e.kind === 'delete') what = 'Delete'
    if (e.kind === 'trim') what = `Trim|${e.bays} end bay${e.bays > 1 ? 's' : ''} at the ${e.end === 'start' ? 'start' : 'far end'}`
    if (e.kind === 'move') {
      const a = Math.abs(e.dRunFt) > FT_EPS, c = Math.abs(e.dCrossFt) > FT_EPS
      what = 'Move|' + (a && c ? `${fmtFt(e.dRunFt)} along, ${fmtFt(e.dCrossFt)} across` : fmtFt(a ? e.dRunFt : e.dCrossFt))
    }
    if (!what) continue
    if (!groups.has(what)) groups.set(what, [])
    groups.get(what).push(e.rowIndex)
  }
  const parts = [...groups].map(([what, rows]) => {
    const [verb, by] = what.split('|')
    const r = rowsText(rows)
    return verb === 'Delete' ? `Delete ${r}` : verb === 'Trim' ? `Remove ${by} of ${r}` : `Move ${r} by ${by}`
  })
  const adds = edits.filter(e => e.kind === 'add').length
  if (adds) parts.push(`Add ${adds} row${adds > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

/** When each row last changed: for rows edited in several sections, the
 *  undo history tells which edit came later. Returns Map(key -> history
 *  index of the snapshot where the row reached its current state). */
function changeOrder(keys, objects, fp, history, gridSize) {
  const order = new Map()
  if (!history || !history.length) return order
  const now = currentRows(objects, fp, gridSize).byKey
  const sig = (l) => (l ? [l.run, l.end, l.cross].map(v => v.toFixed(4)).join(',') : 'x')
  const want = new Map(keys.map(k => [k, sig(now.get(k))]))
  let pending = new Set(keys)
  for (let i = history.length - 1; i >= 0 && pending.size; i--) {
    let snap
    try { snap = JSON.parse(history[i]).objects } catch { continue }
    const f = snap.find(o => o.id === fp.id) || fp
    const rows = currentRows(snap, f, gridSize).byKey
    for (const k of [...pending]) {
      if (sig(rows.get(k)) !== want.get(k)) { order.set(k, i + 1); pending.delete(k) }
    }
  }
  for (const k of pending) order.set(k, 0)
  return order
}

/** The replay as { updates, deletes, adds, baseline, reports } — see the
 *  file header. `history` = the store's undo history (for clashes). */
export function planReplay(objects, fpId, gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12), history = []) {
  const fp = objects.find(o => o.id === fpId)
  const plan = { updates: new Map(), deletes: new Set(), adds: [], baseline: null,
    applied: [], deleted: [], moved: [], added: [], skipped: [], held: [], clashes: [], missing: [], trimmed: [], trimSkipped: [] }
  if (!fp || !fp.rowBaseline) return plan
  const edits = pendingEdits(objects, fp, gridSize)
  if (!edits.length) return plan
  const { byKey, rotated, run0, cross0 } = currentRows(objects, fp, gridSize)
  const baseline = fp.rowBaseline
  const secs = baselineSections(baseline)
  const sections = [...secs.keys()].sort((a, b) => secs.get(a).start - secs.get(b).start)
  const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : 10
  const box = { x0: (fp.x || 0) + wt, y0: (fp.y || 0) + wt, x1: (fp.x || 0) + (fp.width || 0) - wt, y1: (fp.y || 0) + (fp.height || 0) - wt }
  const runBox = rotated ? [box.y0, box.y1] : [box.x0, box.x1]
  const crossBox = rotated ? [box.x0, box.x1] : [box.y0, box.y1]
  const clean = (v) => (Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-9 ? Math.round(v * 1e6) / 1e6 : v)
  const shifted = (o, dRunPx, dCrossPx) => ({ x: clean(o.x + (rotated ? dCrossPx : dRunPx)), y: clean(o.y + (rotated ? dRunPx : dCrossPx)) })
  const clamp = (d, lo, hi, a, b) => { let out = d; if (hi + out > b) out = Math.min(out, Math.max(0, b - hi)); if (lo + out < a) out = Math.max(out, Math.min(0, a - lo)); return out }

  /* deletes, moves and trims, per row number. When the same row was changed
     in several sections the undo history orders the changes:
       - a delete that is the row's latest change deletes it everywhere;
       - moves combine PER AXIS — along the run the latest along-move, across
         the aisles the latest across-move — and every section's row goes to
         its own baseline spot plus those deltas (so a row moved along in one
         section and up in another ends up moved along AND up everywhere);
       - trims: the latest trim at each end, applied where that end borders
         a cross-aisle and the row isn't already trimmed there. */
  const byRow = new Map()
  for (const e of edits) if (e.kind !== 'add') { if (!byRow.has(e.rowIndex)) byRow.set(e.rowIndex, []); byRow.get(e.rowIndex).push(e) }
  const multi = [...byRow.values()].filter(l => new Set(l.map(e => e.section)).size > 1).flat().map(e => e.key)
  const order = multi.length ? changeOrder([...new Set(multi)], objects, fp, history, gridSize) : new Map()
  const latest = (list) => [...list].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)).pop()
  const secIdx = new Map(sections.map((x, i) => [x, i]))
  for (const [rowIndex, list] of byRow) {
    if (new Set(list.map(e => e.section)).size > 1) plan.clashes.push({ rowIndex, sections: [...new Set(list.map(e => e.section))], winner: latest(list).section, kind: latest(list).kind })
    const del = list.filter(e => e.kind === 'delete')
    if (del.length && latest(list).kind === 'delete') {
      const win = latest(del)
      plan.applied.push(win)
      for (const s of sections) {
        if (s === win.section) continue
        const line = byKey.get(rowKey(s, rowIndex))
        if (!line) continue
        for (const p of line.pieces) plan.deletes.add(p.id)
        plan.deleted.push({ section: s, rowIndex, ids: line.pieces.map(p => p.id) })
      }
      continue
    }
    const moves = list.filter(e => e.kind === 'move')
    const along = latest(moves.filter(e => Math.abs(e.dRunFt) > FT_EPS))
    const across = latest(moves.filter(e => Math.abs(e.dCrossFt) > FT_EPS))
    for (const e of new Set([along, across].filter(Boolean))) plan.applied.push(e)
    if (along || across) {
      for (const s of sections) {
        const k = rowKey(s, rowIndex)
        const line = byKey.get(k), b = baseline.rows[k]
        if (!line) { if (s !== (along || across).section) plan.missing.push({ section: s, rowIndex }); continue }
        // only the axis that changed: the other axis stays exactly where the row is
        let dRun = along && b ? (b.run + along.dRunFt - line.run) * gridSize : 0
        let dCross = across && b ? (b.cross + across.dCrossFt - line.cross) * gridSize : 0
        const lo = line.runStart, hi = line.runEnd, clo = line.crossLo, chi = line.crossHi
        const r = clamp(dRun, lo, hi, runBox[0], runBox[1]), c = clamp(dCross, clo, chi, crossBox[0], crossBox[1])
        const cut = Math.max(Math.abs(r - dRun), Math.abs(c - dCross))
        if (cut > EPS) plan.held.push({ section: s, rowIndex, ids: line.pieces.map(p => p.id), shortIn: Math.round((cut / gridSize) * 12 * 100) / 100 })
        if (Math.abs(r) < EPS && Math.abs(c) < EPS) continue
        for (const p of line.pieces) plan.updates.set(p.id, { ...(plan.updates.get(p.id) || {}), ...shifted(p, r, c) })
        plan.moved.push({ section: s, rowIndex, ids: line.pieces.map(p => p.id) })
      }
    }
    for (const endName of ['start', 'end']) {
      const win = latest(list.filter(e => e.kind === 'trim' && e.end === endName))
      if (!win) continue
      plan.applied.push(win)
      for (const s of sections) {
        if (s === win.section) continue
        const i = secIdx.get(s)
        if (endName === 'start' ? i === 0 : i === sections.length - 1) continue      // that end is at a wall here
        const k = rowKey(s, rowIndex), line = byKey.get(k), b = baseline.rows[k]
        if (!line) continue
        // the piece at that end (world order along the run), its end bays
        const piece = [...line.pieces].sort((a, c) => endName === 'start'
          ? runOf(rackFootprint(a))[0] - runOf(rackFootprint(c))[0]
          : runOf(rackFootprint(c))[1] - runOf(rackFootprint(a))[1])[0]
        const cur = { ...piece, ...(plan.updates.get(piece.id) || {}) }
        // already trimmed here by hand? (that end already in by some bays)
        const pitchIn = cur.beams.reduce((t, x) => t + x, 0) / cur.beams.length + (cur.uprightWidth || 3)
        const inFt = b ? (endName === 'start' ? line.run - b.run : b.end - line.end) : 0
        const already = Math.max(0, Math.round((inFt * 12) / pitchIn))
        const n = win.bays - already
        if (n <= 0) continue
        const len = cur.beams.length
        if (n >= len) { plan.trimSkipped.push({ section: s, rowIndex, reason: 'the row is shorter than the trim' }); continue }
        const rot = ((cur.rotation || 0) % 360 + 360) % 360
        const reversed = rot === 180 || rot === 270
        const atLocalStart = (endName === 'start') !== reversed
        const idx = atLocalStart ? Array.from({ length: n }, (_, j) => j) : Array.from({ length: n }, (_, j) => len - 1 - j)
        const out = splitRackForBayDelete(cur, new Set(idx), newId, gridSize)
        if (!out || out.length !== 1) continue
        const { beams, width, x, y } = out[0]
        plan.updates.set(piece.id, { ...(plan.updates.get(piece.id) || {}), beams, width, x, y })
        plan.trimmed.push({ section: s, rowIndex, end: endName, bays: n, id: piece.id })
      }
    }
  }

  // adds: copies in every other section, sharing a new rowIndex
  let nextRow = 1
  for (const o of objects) if (o.parentId === fp.id && o.rowIndex != null) nextRow = Math.max(nextRow, o.rowIndex + 1)
  const next = () => objects.filter(o => !plan.deletes.has(o.id)).map(o => (plan.updates.has(o.id) ? { ...o, ...plan.updates.get(o.id) } : o)).concat(plan.adds)
  const fmtIn = (px) => fmtFt(px / gridSize)
  const rowName = (r) => (r.rowIndex != null ? `row ${r.rowIndex}` : 'the new row')
  for (const e of edits.filter(x => x.kind === 'add')) {
    const l = e.line, rowIndex = nextRow++
    // its section: the one it overlaps most, else (sitting in a cross-aisle) the nearest
    const home = e.section ?? [...sections].sort((a, c) => {
      const d = (x) => { const v = secs.get(x); return Math.max(0, v.start - l.end, l.run - v.end) }
      return d(a) - d(c)
    })[0]
    const stampOf = (o, section) => { const f = rackFootprint(o), b = { ...f, rotated }; return { rowIndex, genSection: section, genRunFt: (runOf(b)[0] - run0) / gridSize, genCrossFt: (crossOf(b)[0] - cross0) / gridSize } }
    for (const p of l.pieces) plan.updates.set(p.id, { ...(plan.updates.get(p.id) || {}), ...stampOf(p, home) })
    const homeEnv = secs.get(home)
    const homeLen = (homeEnv.end - homeEnv.start) * gridSize
    const bayPx = (q) => ((q.beams.reduce((t, x) => t + x, 0) / q.beams.length + (q.uprightWidth || 3)) / 12) * gridSize
    const fpRun = (o) => runOf({ ...rackFootprint(o), rotated }), fpCross = (o) => crossOf({ ...rackFootprint(o), rotated })
    const isReversed = (o) => { const t = ((o.rotation || 0) % 360 + 360) % 360; return t === 180 || t === 270 }
    const srcIds = new Set(l.pieces.map(q => q.id))
    /* the row next to the new one in a section: the nearest (across) row of
       ONE piece whose middle is inside that section — the rows as they will
       be after this apply's moves and deletes, not the copies being added */
    const neighbourIn = (sec, crossMid) => {
      const env = secs.get(sec), lo = run0 + env.start * gridSize, hi = run0 + env.end * gridSize
      const addIds = new Set(plan.adds.map(a => a.id))
      const cands = next().filter(o => o.parentId === fp.id && Array.isArray(o.beams) && o.beams.length && !srcIds.has(o.id) && !addIds.has(o.id)
        && ((fpRun(o)[0] + fpRun(o)[1]) / 2) > lo - EPS && ((fpRun(o)[0] + fpRun(o)[1]) / 2) < hi + EPS)
      const pieces = new Map()
      for (const o of cands) { const k = o.rowIndex ?? o.id; pieces.set(k, (pieces.get(k) || 0) + 1) }
      const mid = (o) => (fpCross(o)[0] + fpCross(o)[1]) / 2
      return cands.filter(o => pieces.get(o.rowIndex ?? o.id) === 1).sort((a, c) => Math.abs(mid(a) - crossMid) - Math.abs(mid(c) - crossMid))[0] || null
    }
    const srcCrossMid = (fpCross(l.pieces[0])[0] + fpCross(l.pieces[0])[1]) / 2
    /* a FULL-LENGTH row — as long as the row next to it in its own section
       (within half a bay) — is a row of every section: each copy is full
       length for ITS section, with the bays of the row next to it there.
       A shorter row is copied at its own length (cut only if it can't fit). */
    const homeNb = l.pieces.length === 1 ? neighbourIn(home, srcCrossMid) : null
    const fullLength = l.pieces.length === 1 && (homeNb
      ? (l.runEnd - l.runStart) >= (fpRun(homeNb)[1] - fpRun(homeNb)[0]) - bayPx(l.pieces[0]) / 2
      : (l.runEnd - l.runStart) >= homeLen - bayPx(l.pieces[0]) + EPS)
    const placed = [], shortened = []
    const patterns = [{ section: home, bays: l.pieces.reduce((t, q) => t + q.beams.length, 0), beams: l.pieces.flatMap(q => q.beams), from: 'source' }]
    for (const s of sections) {
      if (s === home) continue
      const dRun = (secs.get(s).start - homeEnv.start) * gridSize
      /* where the row sits in its own section, the copy sits in this one;
         a copy that would stick out of this section (a paste nudge, a
         section a bay shorter) slides back inside if it's short enough —
         one longer than the section can't go in (a full-length row is cut
         to the section's length) */
      const env = secs.get(s), envLo = run0 + env.start * gridSize, envHi = run0 + env.end * gridSize
      let copies = l.pieces.map(p => { const c = { ...p, ...shifted(p, dRun, 0), id: newId(), activeBayIdx: null }; return { ...c, ...stampOf(c, s) } })
      let why = null, pattern = null
      const nb = fullLength ? neighbourIn(s, srcCrossMid) : null
      if (nb) {
        // the neighbour's bays (in world order along the run), from its start to its end
        const c0 = copies[0], beams = isReversed(c0) === isReversed(nb) ? [...nb.beams] : [...nb.beams].reverse()
        const upIn = nb.uprightWidth || c0.uprightWidth || 3
        const width = ((upIn * (beams.length + 1) + beams.reduce((a, b) => a + b, 0)) / 12) * gridSize
        let c = { ...c0, beams, uprightWidth: upIn, width, x: c0.x - (width - c0.width) / 2 }
        const dR = fpRun(nb)[0] - fpRun(c)[0], dC = fpCross(c0)[0] - fpCross(c)[0]
        c = { ...c, ...shifted(c, dR, dC) }
        copies = [{ ...c, ...stampOf(c, s) }]
        pattern = { section: s, bays: beams.length, beams, from: nb.rowIndex != null ? `row ${nb.rowIndex}` : 'the row next to it' }
      }
      const extent = () => { const fs = copies.map(c => runOf({ ...rackFootprint(c), rotated })); return [Math.min(...fs.map(f => f[0])), Math.max(...fs.map(f => f[1]))] }
      let [lo, hi] = extent()
      if (hi - lo > envHi - envLo + EPS && copies.length === 1) {
        const c = copies[0], n = c.beams.length
        let drop = 0
        while (drop < n - 1 && ((hi - lo) - drop * bayPx(c)) > envHi - envLo + EPS) drop++
        const rot = ((c.rotation || 0) % 360 + 360) % 360, reversed = rot === 180 || rot === 270
        const idx = Array.from({ length: drop }, (_, j) => (reversed ? j : n - 1 - j))       // the far end's bays
        const cut = splitRackForBayDelete(c, new Set(idx), newId, gridSize)
        if (cut && cut.length === 1) { copies = [{ ...c, beams: cut[0].beams, width: cut[0].width, x: cut[0].x, y: cut[0].y }]; shortened.push({ section: s, bays: copies[0].beams.length, dropped: drop }) }
        ;[lo, hi] = extent()
      }
      if (hi - lo > envHi - envLo + EPS) why = `is ${fmtIn((hi - lo) - (envHi - envLo))} longer than this section`
      else {
        const slide = lo < envLo ? envLo - lo : hi > envHi ? envHi - hi : 0
        if (Math.abs(slide) > EPS) copies = copies.map(c => ({ ...c, ...shifted(c, slide, 0) }))
      }
      const world = next()
      for (const c of copies) {
        if (why) break
        const iss = rackIssues(c, world, gridSize)
        if (iss.wallOutIn > 0) { why = `would pass the wall by ${fmtFt(iss.wallOutIn / 12)}`; break }
        if (iss.overlaps.length) {
          const other = world.find(o => o.id === iss.overlaps[0])
          const fc = rackFootprint(c), fo = rackFootprint(other)
          // by how far it would have to move to clear it (across the aisle or along the run)
          const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0)
          const by = Math.min(ov(fc.x, fc.x + fc.w, fo.x, fo.x + fo.w), ov(fc.y, fc.y + fc.h, fo.y, fo.y + fo.h))
          const name = l.pieces.some(q => q.id === other.id)
            ? `the new row itself (it reaches into this section from section ${home})`
            : rowName(other)
          why = `overlaps ${name} by ${fmtIn(by)}`
        }
      }
      if (why) { plan.skipped.push({ section: s, rowIndex, reason: why }); continue }
      plan.adds.push(...copies)
      placed.push(s)
      const cut = shortened.find(x => x.section === s)
      patterns.push(pattern || { section: s, bays: copies.reduce((t, q) => t + q.beams.length, 0), beams: copies.flatMap(q => q.beams), from: cut ? 'source-shortened' : 'source', ...(cut ? { dropped: cut.dropped } : {}) })
    }
    // no silent skips: every other section is either placed or reported
    for (const s of sections) {
      if (s !== home && !placed.includes(s) && !plan.skipped.some(k => k.section === s && k.rowIndex === rowIndex)) plan.skipped.push({ section: s, rowIndex, reason: 'not placed' })
    }
    plan.added.push({ rowIndex, section: home, sections: placed, fullLength, shortened, patterns: patterns.sort((a, b) => a.section - b.section), ids: l.pieces.map(p => p.id) })
    plan.applied.push(e)
  }

  // the new baseline: the rows as they are after the replay
  const after = applyReplay(objects, plan)
  plan.baseline = makeBaseline(after, fp, gridSize)
  return plan
}

/** The objects after a replay plan (deletes, updates, copies). */
export function applyReplay(objects, plan) {
  return objects.filter(o => !plan.deletes.has(o.id))
    .map(o => (plan.updates.has(o.id) ? { ...o, ...plan.updates.get(o.id) } : o))
    .concat(plan.adds)
}
