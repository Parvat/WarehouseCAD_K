// elevations.js — rack elevation TYPES and which bays carry them (ELEVATIONS_PLAN.md).
//
// A type: name, colour, upright height, beam levels from the floor up (each to the TOP of its beam; the first may be
// the floor: beamIn 0), pallet height and load per level, clearance above the pallet, the beam's face height and the
// upright's hole pitch. Frame depth is not the type's: it is the rack's own drawn depth (rack.depthIn).
//
// The layout's types — { version, defaultId, types } — are part of the layout: the canvas store's `elevations`,
// saved, undone and loaded with it (utils/saveLoad.js; a file from before, with the types as an 'elevation_types'
// object among its objects, is moved there by extractLegacy). Every function here takes the table explicitly.
//
// Assignment is layered, overrides stored only where they differ, on each beam rack:
//   layout default → rack `elevType` → side `elevSides[s]` → bay `elevBays[s][b]`.
// Side s is the rack's local band: 0 the top, 1 the bottom (activeBaySide / faceIndex); a single row has side 0 only.
// A bay-side's type is the most specific one set; DEFAULT_REF ('*') names the layout default explicitly (a joined
// rack's bays that had no override). After a paint, `compressElev` writes the same resolution back minimally.
//
// `rack.levels` mirrors the rack-level type's level count, so every reader of it keeps working; every count that
// sees a single bay — the bay ledger, rack capacity, column pick blocks, narrow aisles — reads `levelsAt` instead,
// the bay-side's own type. With no table (the generator's own layouts, the test fixtures) everything reads
// `rack.levels`, exactly as before. Pure, except installElevationsKeeper.

export const ELEV_TYPE = 'elevation_types'
export const ELEV_ID = 'elevation-types'
export const ELEV_VERSION = 1
export const DEFAULT_REF = '*'
export const ELEV_FIELDS = ['elevType', 'elevSides', 'elevBays']
const BEAM = new Set(['rack_row', 'rack_double_row'])
export const isBeamRack = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams)
export const isElevTable = (o) => !!o && o.type === ELEV_TYPE
/** A file or clipboard from before the types moved to the store: the 'elevation_types' object(s) taken out of
 *  `objects` → { objects, table } (table null when there was none). */
export function extractLegacy(objects) {
  const list = objects || []
  if (!list.some(isElevTable)) return { objects: list, table: null }
  const o = list.find(isElevTable)
  return { objects: list.filter(x => !isElevTable(x)), table: { version: ELEV_VERSION, defaultId: o.defaultId, types: o.types } }
}
export const sidesOf = (r) => (r && r.type === 'rack_double_row' ? 2 : 1)

/* ── types ───────────────────────────────────────────────────────────────── */

/** The elevation colours — saturated, so a bay's tint stands out from the rack's own pale fill (the first, the usual
 *  default, included). OLD_PALETTE: the pale set types were given before; drawn as the new colour at the same place
 *  (utils/elevationDraw.js tint). */
export const PALETTE = ['#E07B22', '#2F80ED', '#27AE60', '#9B51E0', '#EB5757', '#00A3A3', '#C9A100', '#5E60CE']
export const OLD_PALETTE = ['#7FA7D9', '#E8A33D', '#6DBE8C', '#C77DCB', '#E46F6F', '#5BC0C8', '#B9A15A', '#8E8CE0']
export const SPACING_IN = 60, PALLET_H_IN = 48, CLEARANCE_IN = 6, LOAD_LB = 2000, BEAM_FACE_IN = 4, HOLE_PITCH_IN = 2
/** The beam face height (in) of type `t` — 4" for a type saved before it had one. */
export const beamFace = (t) => (Number.isFinite(t?.beamFaceIn) ? t.beamFaceIn : BEAM_FACE_IN)
/** The clearance (in) the top of the top load must keep under the sprinkler heads — the layout's setting (on its
 *  types table, saved and undone with it), 18" when not set. */
export const SPRINKLER_CLEARANCE_IN = 18
/** The clear height (in) elevations assume while the project has none set — Check layout reminds (utils/project.js
 *  `projectReminders`). */
export const ASSUMED_CLEAR_IN = 288
export const sprinklerClearance = (table) => {
  // the project's advanced setting (utils/project.js); a table from before the project: its own; else 18"
  const a = table?.project?.advanced?.sprinklerClearanceIn
  if (Number.isFinite(a) && a >= 0) return a
  return Number.isFinite(table?.sprinklerClearanceIn) && table.sprinklerClearanceIn >= 0 ? table.sprinklerClearanceIn : SPRINKLER_CLEARANCE_IN
}
/** The ceiling type `type` is checked and drawn against, from the project (utils/project.js) → { clearHeightIn,
 *  sprinklerIn, id, name, assumed } or null: its own ceiling entry, else the project's default. A clear height not set
 *  (or no ceiling entry at all) is ASSUMED_CLEAR_IN, `assumed` true. No project: null — the caller reads the
 *  building's old fields. */
export function ceilingOf(table, type) {
  const pr = table?.project
  if (!pr) return null
  const c = (type?.ceilingId && pr.ceilings?.find(x => x.id === type.ceilingId)) || pr.ceilings?.find(x => x.id === pr.defaultCeilingId) || pr.ceilings?.[0]
  if (!c) return { clearHeightIn: ASSUMED_CLEAR_IN, sprinklerIn: null, id: null, name: null, assumed: true }
  const set = c.clearHeightIn > 0
  return { clearHeightIn: set ? c.clearHeightIn : ASSUMED_CLEAR_IN, sprinklerIn: c.sprinklerIn > 0 ? c.sprinklerIn : null, id: c.id, name: c.name, assumed: !set }
}
/** The top of type `t`'s top load (in): the top beam + its pallet; with no load on the top level, the top of the upright. */
export function topOfLoad(t) {
  const top = [...t.levels].sort((a, b) => a.beamIn - b.beamIn).pop()
  return top && top.palletHeightIn > 0 ? top.beamIn + top.palletHeightIn : t.uprightHeightIn
}
/** What the top load breaks in building `b` ({ clearHeightIn, sprinklerIn }): 'clear' — above the clear height;
 *  'sprinkler' — within `clearanceIn` of the sprinkler heads; null — neither (or no building heights). The clear height
 *  wins when both. */
export function topLoadIssue(t, b, clearanceIn = SPRINKLER_CLEARANCE_IN) {
  if (!b) return null
  const z = topOfLoad(t)
  if (b.clearHeightIn > 0 && z > b.clearHeightIn + 1e-6) return 'clear'
  if (b.sprinklerIn > 0 && z > b.sprinklerIn - clearanceIn + 1e-6) return 'sprinkler'
  return null
}
/** The upright's hole pitch (in) — 2" when not set. */
export const holePitch = (t) => (Number.isFinite(t?.holePitchIn) && t.holePitchIn > 0 ? t.holePitchIn : HOLE_PITCH_IN)

/** `n` levels from the floor up: the floor, then a beam every SPACING_IN. */
export const levelsOf = (n, { spacingIn = SPACING_IN, palletHeightIn = PALLET_H_IN, loadLb = LOAD_LB } = {}) =>
  Array.from({ length: Math.max(1, n) }, (_, k) => ({ beamIn: k * spacingIn, palletHeightIn, loadLb }))

/** A type with `n` levels (the migration's and "New type"'s shape). */
export function makeType({ id, name, color = PALETTE[0], levelsCount = 4, clearanceIn = CLEARANCE_IN } = {}) {
  const levels = levelsOf(levelsCount)
  return { id, name: name || `${levels.length} levels`, color, uprightHeightIn: levels[levels.length - 1].beamIn + SPACING_IN, clearanceIn, beamFaceIn: BEAM_FACE_IN, holePitchIn: HOLE_PITCH_IN, levels }
}

/** `t` with `n` levels: levels removed from the top, or added above at its own top spacing. */
export function withLevelCount(t, n) {
  const L = t.levels.slice(0, Math.max(1, n))
  const step = L.length > 1 ? L[L.length - 1].beamIn - L[L.length - 2].beamIn : SPACING_IN
  while (L.length < n) { const top = L[L.length - 1]; L.push({ ...top, beamIn: top.beamIn + step }) }
  const upright = Math.max(t.uprightHeightIn, L[L.length - 1].beamIn + (L[L.length - 1].palletHeightIn || 0) + (t.clearanceIn || 0))
  return { ...t, levels: L, uprightHeightIn: n > t.levels.length ? upright : t.uprightHeightIn }
}

export const typeById = (table, id) => (table && id != null ? table.types.find(t => t.id === (id === DEFAULT_REF ? table.defaultId : id)) || null : null)

/* ── resolution ──────────────────────────────────────────────────────────── */

/** The type id bay `bay` of `rack` carries on side `side` (a single row: side 0), or null with no table. */
export function typeIdAt(rack, bay, side, table) {
  const s = sidesOf(rack) === 2 ? (side === 1 ? 1 : 0) : 0
  const v = rack.elevBays?.[s]?.[bay] ?? rack.elevSides?.[s] ?? rack.elevType ?? DEFAULT_REF
  return v === DEFAULT_REF ? (table ? table.defaultId : null) : v
}
export const typeAt = (rack, bay, side, table) => typeById(table, typeIdAt(rack, bay, side, table))
/** The rack-level type (what `rack.levels` mirrors). */
export const rackTypeId = (rack, table) => { const v = rack.elevType ?? DEFAULT_REF; return v === DEFAULT_REF ? table?.defaultId ?? null : v }
/** Levels on bay `bay`, side `side`: its type's, else the rack's own `levels`. */
export function levelsAt(rack, bay, side, table) {
  const t = table ? typeAt(rack, bay, side, table) : null
  return t ? t.levels.length : rack.levels || 1
}
/** `(rack, bay, side) → levels` for a types table, or null without one (read `rack.levels`). */
export function levelsResolver(table) {
  if (!table) return null
  const fn = (r, b, s) => levelsAt(r, b, s, table)
  // the pallet face a bay-side holds (positions per beam): its elevation's pallet, when it names one (Project setup)
  fn.face = faceResolver(table)
  return fn
}
/** `(rack, bay, side) → pallet face (in)`: the bay-side's elevation's pallet (`type.palletId`, the project's pallet
 *  sizes), else the rack's own `palletWIn` — null with no project pallets (read the rack's). */
export function faceResolver(table) {
  const pallets = table?.project?.pallets
  if (!pallets?.length) return null
  return (r, b, s) => { const t = typeAt(r, b, s, table); const p = t?.palletId && pallets.find(x => x.id === t.palletId); return p?.faceIn > 0 ? p.faceIn : (r.palletWIn || 40) }
}
/** Every bay-side's type id: [[side 0 per bay], [side 1 per bay]] (one array for a single row). */
export const typeMap = (rack, table) => Array.from({ length: sidesOf(rack) }, (_, s) => rack.beams.map((_, b) => typeIdAt(rack, b, s, table)))

/** `rack` with its overrides written minimally for `map` (typeMap's shape): each side's majority type becomes the
 *  side type, the rack's the common one, dropped when it is the default; only bays that differ keep their own. */
export function compressElev(rack, map, table) {
  const def = table ? table.defaultId : null
  const maj = (arr) => { const n = new Map(); let best = null, bn = 0; for (const t of arr) { const k = (n.get(t) || 0) + 1; n.set(t, k); if (k > bn) { bn = k; best = t } } return best }
  const sideBase = map.map(maj)
  // two sides that differ: the rack keeps its own type (else the default) when one side has it, so only the other
  // side is an override
  const cur = rackTypeId(rack, table)
  const rackBase = sideBase.length === 2 && sideBase[0] !== sideBase[1] ? (sideBase.includes(cur) ? cur : sideBase.includes(def) ? def : maj(map.flat())) : sideBase[0]
  const out = { ...rack }
  for (const k of ELEV_FIELDS) delete out[k]
  if (rackBase !== def && rackBase != null) out.elevType = rackBase
  const sides = sideBase.map(t => (t === rackBase ? null : t))
  if (sides.some(t => t != null)) out.elevSides = sides
  const bays = map.map((a, s) => a.map(t => (t === sideBase[s] ? null : t)))
  if (bays.some(a => a.some(t => t != null))) out.elevBays = bays
  return out
}

/** `rack.levels` set to its rack-level type's count (the mirror). */
export function syncLevels(rack, table) {
  const t = typeById(table, rackTypeId(rack, table))
  return t && rack.levels !== t.levels.length ? { ...rack, levels: t.levels.length } : rack
}
/** Every rack's `levels` mirror brought up to date (same array when nothing changes). */
export function syncAllLevels(objects, table) {
  if (!table) return objects
  let changed = false
  const out = objects.map(o => { if (!isBeamRack(o)) return o; const n = syncLevels(o, table); if (n !== o) changed = true; return n })
  return changed ? out : objects
}

/* ── carrying the type through pieces ────────────────────────────────────── */

/** The elevation fields of a piece of `src` made of its own bays `idx` (in the piece's own order; null = a new bay,
 *  which inherits). `keepSide` 0 / 1: the piece is that half of a pair, now a single row (it takes the side's
 *  type as its own). Table-free: the layers above the bays are carried as they are. */
export function carryElev(src, idx, keepSide = null) {
  const out = {}
  if (!ELEV_FIELDS.some(k => src[k] != null)) return out
  const half = keepSide === 0 || keepSide === 1
  const rackT = half ? src.elevSides?.[keepSide] ?? src.elevType : src.elevType
  if (rackT != null) out.elevType = rackT
  if (!half && src.elevSides) out.elevSides = [...src.elevSides]
  const sides = half ? [keepSide] : Array.from({ length: sidesOf(src) }, (_, s) => s)
  const bays = sides.map(s => idx.map(i => (i == null ? null : src.elevBays?.[s]?.[i] ?? null)))
  if (bays.some(a => a.some(t => t != null))) out.elevBays = bays
  return out
}
/** Replace `piece`'s elevation fields with `fields`. */
export const withElev = (piece, fields) => { const o = { ...piece }; for (const k of ELEV_FIELDS) delete o[k]; return { ...o, ...fields } }
/** What bay `b`, side `s` of `rack` carries, explicit ('*' = the default) — for a join, where the bays of two racks
 *  come under one rack-level type. */
export const effectiveRef = (rack, b, s) => rack.elevBays?.[s]?.[b] ?? rack.elevSides?.[s] ?? rack.elevType ?? DEFAULT_REF

/* ── migration and the keeper ────────────────────────────────────────────── */

/** A types table made from the racks' own levels (one type per distinct value, the most common the default) and
 *  `objects` with the racks of another value carrying theirs as `elevType` → { objects, table }. Nothing moves;
 *  every count is unchanged. Null when there is no beam rack. */
export function migrate(objects) {
  const racks = objects.filter(isBeamRack)
  if (!racks.length) return null
  const byLevels = new Map()
  for (const r of racks) { const n = r.levels || 1; byLevels.set(n, (byLevels.get(n) || 0) + 1) }
  const counts = [...byLevels].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const types = counts.map(([n], i) => makeType({ id: `elev-${n}`, levelsCount: n, color: PALETTE[i % PALETTE.length] }))
  const table = { version: ELEV_VERSION, defaultId: types[0].id, types }
  return { table, objects: objects.map(o => (isBeamRack(o) && (o.levels || 1) !== counts[0][0] && o.elevType == null ? { ...o, elevType: `elev-${o.levels || 1}` } : o)) }
}

let seq = 0
const freshId = (table, base) => { let id; do { id = `${base}-${(++seq).toString(36)}${Date.now().toString(36).slice(-3)}` } while (table.types.some(t => t.id === id)); return id }

/** The layout after an action, made consistent → { objects, table } (the same two when nothing changes):
 *   - an 'elevation_types' object among the objects (an old clipboard pasted) is taken out (adopted when there is
 *     no table yet);
 *   - no table while there are beam racks: one made from their levels (a load, the first racks placed) — unless
 *     `migrate: false`;
 *   - overrides naming a type that no longer exists are dropped (those bays fall back);
 *   - a rack whose `levels` changed while its type didn't (`prevObjects`: the layout before — a levels edit, the
 *     Row group's levels replay) gets the type with that many levels — an existing one, or a copy of its type;
 *   - any other mismatch (a new rack, a piece, a type changed): `levels` follows the type;
 *   - a custom type ("N levels · custom", made automatically before Elevation mode) no bay carries any more is
 *     removed — in the same pass, so the edit that emptied it and its removal are one undo step. Others stay. */
export function reconcileElevations({ prevObjects = null, objects, table, migrate: doMigrate = true }) {
  let out = objects, T = table
  const legacy = extractLegacy(out)
  if (legacy.objects !== out) { out = legacy.objects; if (!T) T = legacy.table }
  if (!T && !doMigrate) return { objects: out, table: T }   // (the Row group's writer: a layout without types stays so)
  if (!T) { const m = migrate(out); if (!m) return { objects: out, table: T }; out = m.objects; T = m.table }
  { const d = dedupeNames(T); if (d !== T) T = d }   // two types of one name (an old file): the later ones renamed
  const ids = new Set(T.types.map(t => t.id))
  const known = (v) => v == null || v === DEFAULT_REF || ids.has(v)
  const prevById = new Map((prevObjects || []).filter(isBeamRack).map(o => [o.id, o]))
  let tb = T, changed = out !== objects
  out = out.map(o => {
    if (!isBeamRack(o)) return o
    let r = o
    if (!known(r.elevType) || (r.elevSides && r.elevSides.some(v => !known(v))) || (r.elevBays && r.elevBays.some(a => a.some(v => !known(v))))) {
      r = { ...r }
      if (!known(r.elevType)) delete r.elevType
      if (r.elevSides) r.elevSides = r.elevSides.map(v => (known(v) ? v : null))
      if (r.elevBays) r.elevBays = r.elevBays.map(a => a.map(v => (known(v) ? v : null)))
    }
    const t = typeById(tb, rackTypeId(r, tb))
    if (t && (r.levels || 1) !== t.levels.length) {
      const p = prevById.get(r.id)
      const levelsEdit = p && (p.levels || 1) !== (r.levels || 1) && (p.elevType ?? null) === (r.elevType ?? null) && p.type === r.type
      if (levelsEdit) {
        const n = r.levels || 1
        let m = tb.types.find(x => x.levels.length === n)
        if (!m) {
          m = { ...withLevelCount(t, n), id: freshId(tb, 'elev'), name: uniqueTypeName(tb, `${n} levels`), color: PALETTE[tb.types.length % PALETTE.length] }
          tb = { ...tb, types: [...tb.types, m] }
          ids.add(m.id)
        }
        r = { ...r, elevType: m.id }
        delete r.elevSides; delete r.elevBays
        if (m.id === tb.defaultId) delete r.elevType
      } else r = { ...r, levels: t.levels.length }
    }
    if (r !== o) changed = true
    return r
  })
  const unused = unusedCustom(out, tb)
  if (unused.length) tb = { ...tb, types: tb.types.filter(t => !unused.includes(t.id)) }
  return { objects: changed ? out : objects, table: tb }
}
/** A custom type's name — what an edit used to call a design at a non-standard spacing (before Elevation mode). */
export const isCustomName = (name) => / · custom( \d+)?$/.test(String(name || ''))
/** The custom types of `table` no bay of `objects` carries (never the default) → their ids. */
export function unusedCustom(objects, table) {
  if (!table || !table.types.some(t => isCustomName(t.name))) return []
  const used = new Set()
  for (const r of objects) if (isBeamRack(r)) for (const side of typeMap(r, table)) for (const id of side) used.add(id)
  return table.types.filter(t => isCustomName(t.name) && t.id !== table.defaultId && !used.has(t.id)).map(t => t.id)
}

/** The history snapshot the store writes (useCanvasStore pushHistory's shape) — for the writers outside the store
 *  that fold a change into the current entry. */
export const snapshotOf = (st, objects = st.objects, elevations = st.elevations) => JSON.stringify({ objects, groups: st.groups || [], layers: st.layers, elevations: elevations ?? null })

/** For a store: after each action (a new history entry following the one seen) the layout is reconciled and the
 *  result written into that SAME entry (one undo step); a load (history reset) or a layout set without history is
 *  given its types. Undo / redo are left alone — their snapshots are already consistent. Returns the unsubscribe. */
export function installElevationsKeeper(store) {
  let lastHistory = store.getState().history, lastIndex = store.getState().historyIndex, busy = false
  const write = (r, st) => {
    const full = { objects: r.objects, elevations: r.table }
    if (st.historyIndex >= 0 && st.history.length) {
      const history = st.history.slice(0, st.historyIndex + 1)
      history[history.length - 1] = snapshotOf(st, r.objects, r.table)
      full.history = history
      full.historyIndex = history.length - 1
    }
    busy = true
    try { store.setState(full) } finally { busy = false }
    lastHistory = store.getState().history; lastIndex = store.getState().historyIndex
  }
  const run = (st, prevObjects) => {
    const r = reconcileElevations({ prevObjects, objects: st.objects, table: st.elevations })
    if (r.objects !== st.objects || r.table !== st.elevations) write(r, st)
  }
  run(store.getState(), null)
  return store.subscribe((st) => {
    if (busy) return
    if (st.history === lastHistory && st.historyIndex === lastIndex) {
      // a layout set without history (a load, the fixture): give it its types
      if ((!st.elevations && st.objects.some(isBeamRack)) || st.objects.some(isElevTable)) run(st, null)
      return
    }
    const prevTop = lastIndex >= 0 && lastHistory ? lastHistory[lastIndex] : undefined
    const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
    lastHistory = st.history; lastIndex = st.historyIndex
    let prev = null
    if (action) { try { prev = JSON.parse(prevTop).objects } catch { prev = null } }
    if (action || !st.elevations || st.objects.some(isElevTable)) run(st, prev)
  })
}

/* ── the table's own edits (the Elevations panel) ────────────────────────── */

/** The table replaced by `fn(table)` (made from the racks' levels first, or a 4-level default, when there is
 *  none) → { objects, table }: every rack's levels mirror following, every override of a type that went dropped.
 *  The same two when `fn` changes nothing. */
export function editTable(objects, table, fn) {
  let objs = objects, T = table
  if (!T) { const m = migrate(objects); if (m) { objs = m.objects; T = m.table } else T = { version: ELEV_VERSION, defaultId: 'elev-4', types: [makeType({ id: 'elev-4', levelsCount: 4 })] } }
  const next = fn(T)
  if (!next || (next === T && T === table)) return { objects, table }
  const r = reconcileElevations({ prevObjects: objs, objects: objs, table: next })
  return { objects: syncAllLevels(r.objects, r.table), table: r.table }
}
/** A new type (a copy of `fromId`, or the default) named `name`. */
export function addType(table, { fromId = null, name = null, id } = {}) {
  const src = typeById(table, fromId ?? table.defaultId) || makeType({ levelsCount: 4 })
  const t = { ...JSON.parse(JSON.stringify(src)), id: id || freshId(table, 'elev'), name: name || (fromId ? `${src.name} copy` : `Type ${table.types.length + 1}`), color: PALETTE[table.types.length % PALETTE.length] }
  return { ...table, types: [...table.types, t] }
}
export const updateType = (table, id, patch) => ({ ...table, types: table.types.map(t => (t.id === id ? { ...t, ...patch } : t)) })
/** Without type `id` (never the last one); the default moves to the first left. Overrides naming it are dropped by
 *  editTable's reconcile, so those bays fall back — to the default, under no other override. */
export function removeType(table, id) {
  if (table.types.length <= 1) return table
  const types = table.types.filter(t => t.id !== id)
  return { ...table, types, defaultId: table.defaultId === id ? types[0].id : table.defaultId }
}
export const setDefault = (table, id) => (table.types.some(t => t.id === id) ? { ...table, defaultId: id } : table)

/* ── names, and assigning ─────────────────────────────────── */

/** `name`, or "name 2", "name 3"… — the first no other type (but `exceptId`) is called. */
export function uniqueTypeName(table, name, exceptId = null) {
  const taken = new Set((table?.types || []).filter(t => t.id !== exceptId).map(t => t.name))
  if (!taken.has(name)) return name
  let k = 2
  while (taken.has(`${name} ${k}`)) k++
  return `${name} ${k}`
}
/** The table with every name unique: a later type with a name already used gets "name 2"… (same table when none). */
export function dedupeNames(table) {
  if (!table) return table
  const seen = new Set()
  let changed = false
  const types = table.types.map(t => {
    if (!seen.has(t.name)) { seen.add(t.name); return t }
    let k = 2
    while (seen.has(`${t.name} ${k}`) || table.types.some(x => x.name === `${t.name} ${k}`)) k++
    const name = `${t.name} ${k}`
    seen.add(name); changed = true
    return { ...t, name }
  })
  return changed ? { ...table, types } : table
}
/** `objects` with type `typeId` on the bay-sides `cells` (Map rackId → [[side, bay]…]), each rack's overrides
 *  written back minimally and its levels mirror following (same array when nothing changes). */
export function assignCells(objects, table, cells, typeId) {
  if (!table || !cells || !cells.size) return objects
  let changed = false
  const out = objects.map(o => {
    const list = cells.get(o.id)
    if (!list || !isBeamRack(o)) return o
    const map = typeMap(o, table)
    for (const [s, b] of list) if (map[s] && b >= 0 && b < o.beams.length) map[s][b] = typeId
    const n = syncLevels(compressElev(o, map, table), table)
    if (JSON.stringify(n) !== JSON.stringify(o)) changed = true
    return n
  })
  return changed ? out : objects
}

/* ── painting ────────────────────────────────────────────────────────────── */

/** `rack` with `typeId` painted (or, `reset`, its overrides removed) on `sides` (null = all) and `bays` (null = all):
 *    Row (no sides, no bays) — the rack whole; reset: every override removed (the default, or nothing set).
 *    Side — those sides whole; reset: the side's own and its bays' overrides removed (the rack's type).
 *    Bay — those bays on those sides; reset: their own overrides removed (the side's type). */
export function paintRack(rack, table, { sides = null, bays = null, typeId = null, reset = false }) {
  const S = sidesOf(rack), ss = sides == null ? Array.from({ length: S }, (_, s) => s) : [...new Set(sides.map(s => (S === 1 ? 0 : s)))]
  if (reset && sides == null && bays == null) { const o = { ...rack }; for (const k of ELEV_FIELDS) delete o[k]; return syncLevels(o, table) }
  const map = typeMap(rack, table)
  for (const s of ss) {
    const bs = bays == null ? rack.beams.map((_, b) => b) : bays.filter(b => b >= 0 && b < rack.beams.length)
    for (const b of bs) {
      let t = typeId
      if (reset) t = bays == null ? rackTypeId(rack, table) : (() => { const v = rack.elevSides?.[s] ?? rack.elevType ?? DEFAULT_REF; return v === DEFAULT_REF ? table.defaultId : v })()
      map[s][b] = t
    }
  }
  return syncLevels(compressElev(rack, map, table), table)
}

/* ── the plan view's legend, the checks, the BOM ─────────────────────────── */

/** Bays per type (each side of a back-to-back is one bay — the two sides can carry different types), counting only
 *  the bays `counted` says count (the bay ledger: an overlapped bay once): [{ type, bays }] in table order, used ones. */
export function legendCounts(objects, T, counted = null) {
  if (!T) return []
  const n = new Map()
  for (const r of objects.filter(isBeamRack)) {
    const c = counted ? counted(r) : null
    for (let s = 0; s < sidesOf(r); s++) r.beams.forEach((_, b) => { if (c && !c[b]) return; const id = typeIdAt(r, b, s, T); n.set(id, (n.get(id) || 0) + 1) })
  }
  return T.types.filter(t => n.has(t.id)).map(t => ({ type: t, bays: n.get(t.id) }))
}

/** What doesn't fit, per type in use: [{ kind: 'elev-fit' | 'elev-height', typeId, text, level? }]. A pallet plus
 *  the clearance must fit from the top of its beam (the floor) to the underside of the next beam — its top less the
 *  type's beam face height (the top level has no beam above it: a top load standing above the frame is normal); the top of the
 *  upright must be under the clear height of the building the type's racks stand in (`clearHeightFt` on the floor
 *  plan; none set: not checked); the top of the top load too ('elev-load-clear'), and at least the sprinkler clearance
 *  (the table's setting, 18") under the building's sprinkler heads (`sprinklerFt`; 'elev-sprinkler'). */
export function elevationIssues(objects, T) {
  if (!T) return []
  const used = new Map()
  for (const r of objects.filter(isBeamRack)) for (let s = 0; s < sidesOf(r); s++) r.beams.forEach((_, b) => { const id = typeIdAt(r, b, s, T); if (!used.has(id)) used.set(id, new Set()); used.get(id).add(r.id) })
  // feet always with their inches, as on the drawing (utils/elevationDrawing.js ftInDash): 19'-0", 24'-7"
  const ftIn = (inches) => { const v = Math.round(inches), f = Math.floor(v / 12), i = v - f * 12; return f ? `${f}'-${i}"` : `${i}"` }
  const out = []
  for (const t of T.types) {
    if (!used.has(t.id)) continue
    const ids = [...used.get(t.id)]
    const L = [...t.levels].sort((a, b) => a.beamIn - b.beamIn)
    const face = beamFace(t)
    L.forEach((lv, k) => {
      if (k + 1 >= L.length) return
      const next = L[k + 1].beamIn - face
      const need = (lv.palletHeightIn || 0) + (t.clearanceIn || 0)
      if (next - lv.beamIn < need - 1e-6) {
        const from = lv.beamIn ? `the top of the beam at ${lv.beamIn}"` : 'the floor'
        const where = `between ${from} and the underside of the next at ${next}"`
        out.push({ kind: 'elev-fit', typeId: t.id, level: k + 1, ids, text: `Elevation ${t.name}: level ${k + 1} pallet ${lv.palletHeightIn}" + ${t.clearanceIn}" clearance doesn't fit ${where}` })
      }
    })
    const floors = new Map()
    const ceil = ceilingOf(T, t)
    // no clear height set (24' assumed — for drawing the elevation only): no clear-height or sprinkler check at all;
    // Check layout's reminders say so (utils/project.js projectReminders)
    if (ceil?.assumed) { /* nothing checked against a guess */ }
    else if (ceil) floors.set('ceiling', { fp: { id: 'ceiling', clearHeightFt: ceil.clearHeightIn ? ceil.clearHeightIn / 12 : null, sprinklerFt: ceil.sprinklerIn ? ceil.sprinklerIn / 12 : null }, ids: [...ids] })
    else for (const id of ids) { const r = objects.find(o => o.id === id); const fp = r && objects.find(o => o.id === r.parentId && ((Number.isFinite(o.clearHeightFt) && o.clearHeightFt > 0) || (Number.isFinite(o.sprinklerFt) && o.sprinklerFt > 0))); if (fp) { if (!floors.has(fp.id)) floors.set(fp.id, { fp, ids: [] }); floors.get(fp.id).ids.push(id) } }
    const sprClr = sprinklerClearance(T), zLoad = topOfLoad(t)
    for (const { fp, ids: inFp } of floors.values()) {
      const b = { clearHeightIn: fp.clearHeightFt > 0 ? fp.clearHeightFt * 12 : null, sprinklerIn: fp.sprinklerFt > 0 ? fp.sprinklerFt * 12 : null }
      const issue = topLoadIssue(t, b, sprClr)
      if (issue === 'clear') out.push({ kind: 'elev-load-clear', typeId: t.id, ids: inFp, text: `Elevation ${t.name}: top of load ${ftIn(zLoad)} is above the building's clear height ${ftIn(b.clearHeightIn)}` })
      if (issue === 'sprinkler') out.push({ kind: 'elev-sprinkler', typeId: t.id, ids: inFp, text: `Top load within ${sprClr}" of sprinklers — elevation ${t.name}: top of load ${ftIn(zLoad)}, sprinkler heads at ${ftIn(b.sprinklerIn)}` })
    }
    for (const { fp, ids: inFp } of floors.values()) if (fp.clearHeightFt > 0 && t.uprightHeightIn > fp.clearHeightFt * 12 + 1e-6)
      out.push({ kind: 'elev-height', typeId: t.id, ids: inFp, text: `Elevation ${t.name}: top of upright ${ftIn(t.uprightHeightIn)} is above the building's clear height ${ftIn(fp.clearHeightFt * 12)}` })
  }
  return out
}

/** The frame depths (in, the racks' own) of the racks carrying type `id` somewhere, ascending. */
export function typeDepths(objects, T, id) {
  const out = new Set()
  for (const r of objects.filter(isBeamRack)) for (let s = 0; s < sidesOf(r); s++) if (r.beams.some((_, b) => typeIdAt(r, b, s, T) === id)) out.add(r.depthIn ?? 42)
  return [...out].sort((a, b) => a - b)
}

/** For the BOM: every bay of every beam rack, per side — { rackId, bay, side, typeId, levels (beam heights, in),
 *  uprightHeightIn, beamIn, frameDepthIn (the rack's own depth) }. */
export function elevationBays(objects, T) {
  const out = []
  for (const r of objects.filter(isBeamRack)) for (let s = 0; s < sidesOf(r); s++) r.beams.forEach((beamIn, bay) => {
    const t = typeAt(r, bay, s, T)
    out.push({ rackId: r.id, bay, side: s, typeId: t ? t.id : null, levels: t ? t.levels.map(l => l.beamIn) : Array.from({ length: r.levels || 1 }, (_, k) => k * SPACING_IN), uprightHeightIn: t ? t.uprightHeightIn : null, beamIn, frameDepthIn: r.depthIn ?? null })
  })
  return out
}
/** For the BOM: each rack's upright frames per side — [{ rackId, side, heights: [per upright position] }]; a frame
 *  between two bays of different types takes the taller. */
export function uprightHeights(objects, T) {
  const out = []
  for (const r of objects.filter(isBeamRack)) for (let s = 0; s < sidesOf(r); s++) {
    const h = r.beams.map((_, b) => typeAt(r, b, s, T)?.uprightHeightIn ?? null)
    out.push({ rackId: r.id, side: s, heights: Array.from({ length: r.beams.length + 1 }, (_, k) => Math.max(h[k - 1] ?? -Infinity, h[k] ?? -Infinity)).map(v => (Number.isFinite(v) ? v : null)) })
  }
  return out
}
