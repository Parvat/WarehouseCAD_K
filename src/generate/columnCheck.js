// columnCheck.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure column-grid + forklift interference logic. No React, no store, no
// rendering — it takes placed racks + column footprints + a forklift profile
// and returns conflicts plus red-mark geometry for a renderer to draw.
//
// This is the "brain" of the grid check. The recalc-on-activate wiring and the
// red markings on the canvas are wired in the live app (see the Claude Code
// brief); this module is what they call.
// ─────────────────────────────────────────────────────────────────────────────

const GS = 40 // px per foot (v16b convention)

// The selectable forklift input. Aisle widths are typical; tune per real MHE.
export const MHE_PROFILES = {
  reach:          { key: 'reach',          label: 'Reach truck',   aisleFt: 10.5, minAisleFt: 10.0, retrievalFt: 6 },
  vna:            { key: 'vna',            label: 'VNA / turret',  aisleFt: 6.0,  minAisleFt: 5.5,  retrievalFt: 4 },
  counterbalance: { key: 'counterbalance', label: 'Counterbalance', aisleFt: 12.5, minAisleFt: 12.0, retrievalFt: 7 },
}

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

// Expand a v16b column_grid object into individual column footprints (px).
export function expandColumnGrid(cg, gridSize = GS) {
  if (!cg || !cg.spacingX || !cg.spacingY) return []
  const w = cg.columnW || gridSize   // 12" default
  const h = cg.columnH || gridSize
  const xs = [cg.x]; let ax = cg.x; for (const s of cg.spacingX) { ax += s; xs.push(ax) }
  const ys = [cg.y]; let ay = cg.y; for (const s of cg.spacingY) { ay += s; ys.push(ay) }
  const cols = []
  for (const cx of xs) for (const cy of ys) cols.push({ x: cx, y: cy, w, h })
  return cols
}

// ── The check ────────────────────────────────────────────────────────────────
// racks:   [{ id, x, y, width, height, type, beams, levels, palletWIn }]  (px)
// columns: [{ x, y, w, h }]  (px)  — use expandColumnGrid() to build these
// profile: one of MHE_PROFILES
export function checkColumns({ racks = [], columns = [], profile = MHE_PROFILES.reach, gridSize = GS }) {
  const minAislePx = profile.minAisleFt * gridSize
  const rackConflicts = []
  const aisleBlocks = []
  const redMarks = []
  let positionsLostIfAbsorb = 0
  let sectionsLostIfRemove = 0

  // 1) Column inside a rack → absorb (lose positions) vs remove (lose section).
  columns.forEach((col, ci) => {
    for (const r of racks) {
      const rb = { x: r.x, y: r.y, w: r.width, h: r.height }
      if (!overlaps(col, rb)) continue

      const beams     = r.beams || [96]
      const levels    = r.levels || 1
      const palletWIn = r.palletWIn || 48
      const palletWPx = (palletWIn / 12) * gridSize
      const rows      = r.type === 'rack_double_row' ? 2 : 1

      // Absorb: only the pallet slot(s) the column sits in, all levels, both faces.
      const slotsHit      = Math.max(1, Math.ceil(col.w / palletWPx))
      const positionsLost = slotsHit * levels * rows
      // Remove: drop the whole bay it lands in.
      const palletsPerBay = Math.floor((beams[0] || 96) / palletWIn)
      const sectionsLost  = palletsPerBay * levels * rows

      positionsLostIfAbsorb += positionsLost
      sectionsLostIfRemove  += sectionsLost

      const box = {
        x: Math.max(col.x, rb.x),
        y: Math.max(col.y, rb.y),
        w: Math.min(col.x + col.w, rb.x + rb.w) - Math.max(col.x, rb.x),
        h: Math.min(col.y + col.h, rb.y + rb.h) - Math.max(col.y, rb.y),
      }
      rackConflicts.push({ rackId: r.id, columnIndex: ci, overlap: box, positionsLost, sectionsLost })
      redMarks.push({ ...box, kind: 'rack-column' })
    }
  })

  // 2) Column in a travel aisle → blocked if the clear side is under the min.
  //    Aisles = vertical gaps between consecutive rack rows.
  const sorted = [...racks].sort((a, b) => a.y - b.y)
  for (let i = 0; i < sorted.length - 1; i++) {
    const top = sorted[i], bot = sorted[i + 1]
    const gapY = top.y + top.height
    const gapH = bot.y - gapY
    if (gapH <= 0) continue
    const x0 = Math.max(top.x, bot.x)
    const x1 = Math.min(top.x + top.width, bot.x + bot.width)
    if (x1 <= x0) continue

    const aisleBox = { x: x0, y: gapY, w: x1 - x0, h: gapH }
    columns.forEach((col, ci) => {
      if (!overlaps(col, aisleBox)) return
      // Widest clear pass on either side of the column within the aisle.
      const topClear = col.y - gapY
      const botClear = (gapY + gapH) - (col.y + col.h)
      const clearPx  = Math.max(topClear, botClear)
      const blocked  = clearPx < minAislePx
      aisleBlocks.push({
        betweenRows: [top.id, bot.id], columnIndex: ci,
        aisleFt: +(gapH / gridSize).toFixed(1),
        clearFt: +(clearPx / gridSize).toFixed(1),
        blocked,
      })
      if (blocked) redMarks.push({ x: col.x, y: gapY, w: col.w, h: gapH, kind: 'aisle-blocked' })
    })
  }

  return {
    rackConflicts,
    aisleBlocks,
    redMarks,
    summary: {
      profile: profile.label,
      rackConflicts: rackConflicts.length,
      blockedAisles: aisleBlocks.filter(a => a.blocked).length,
      positionsLostIfAbsorb,   // customer keeps the rack, loses these positions
      sectionsLostIfRemove,    // vs deleting whole bays — always worse
    },
  }
}
