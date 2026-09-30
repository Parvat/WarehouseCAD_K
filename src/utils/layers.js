// layers.js — the seven standard layers, which layer an object is on, and
// what a layer's eye and padlock mean everywhere that asks.
//
//   Building  floor plan, walls, doors/docks and other structure
//   Columns   the column grid (and single columns)
//   Zones     office, staging, washroom and custom areas — no racking inside
//   Racking   every rack, the racking areas that placed them, and the floor
//             equipment placed among them
//   Aisles    aisle objects; their labels and the cross-aisle labels
//   Checks    red X marks, red aisle warnings, orange upright flags, column
//             clearance arrows and labels — drawing only, never an object
//   Notes     text, dimensions, lines and drawn shapes
//
// An object's layer is its `layerId` when that names a layer in the list,
// otherwise the layer its type belongs on. Layouts saved before the seven
// existed (layerIds 'racks', 'structural' ...) therefore land where they
// belong with no migration of the objects themselves.
//
// Hidden  — not drawn, not pickable, not a snap target, not in the PDF.
// Locked  — drawn and printed, and still a snap target (racks snap to a
//           locked building's walls and to locked columns), but not
//           pickable, not draggable, never caught by a marquee or Ctrl+A.
// A layer missing from the list counts as shown and unlocked, so an object
// never vanishes just because the layer list is absent (a bare test store).

export const STANDARD_LAYERS = [
  { id: 'building', name: 'Building', color: '#6B675F', visible: true, locked: false },
  { id: 'columns',  name: 'Columns',  color: '#4547C4', visible: true, locked: false },
  { id: 'zones',    name: 'Zones',    color: '#7c3aed', visible: true, locked: false },
  { id: 'racking',  name: 'Racking',  color: '#165c45', visible: true, locked: false },
  { id: 'aisles',   name: 'Aisles',   color: '#B87309', visible: true, locked: false },
  { id: 'checks',   name: 'Checks',   color: '#C42B2B', visible: true, locked: false },
  { id: 'notes',    name: 'Notes',    color: '#3b82f6', visible: true, locked: false },
]
export const LAYER_IDS = STANDARD_LAYERS.map(l => l.id)

/* Generate locks these two: the building and its columns are the frame the
   layout is drawn in, so a drag across the floor must not grab them. */
export const LOCKED_AFTER_GENERATE = ['building', 'columns']

const NOTE_TYPES = new Set([
  'text', 'line', 'arrow', 'arc', 'freehand', 'dimension', 'rect', 'circle',
  'triangle', 'diamond', 'star', 'cross', 'l_shape', 't_shape', 'u_shape',
])

/** The layer an object of this type belongs on. */
export function layerForType(type) {
  const t = typeof type === 'string' ? type : ''
  if (t.startsWith('fp_')) return 'building'
  if (t === 'column_grid' || t === 'struct_column') return 'columns'
  if (t.startsWith('struct_')) return 'building'
  if (t === 'aisle') return 'aisles'
  if (t.startsWith('zone_')) return 'zones'
  if (t === 'racking_area') return 'racking'
  if (t.startsWith('rack_') || t.startsWith('mhe_') || t.startsWith('safety_') || t.startsWith('util_')) return 'racking'
  if (t.startsWith('annot_') || NOTE_TYPES.has(t)) return 'notes'
  return 'notes'
}

const asMap = (layers) => layers instanceof Map ? layers : new Map((layers || []).filter(Boolean).map(l => [l.id, l]))

/** The id of the layer `obj` is on, resolved against `layers` (array or Map). */
export function layerOf(obj, layers) {
  const m = asMap(layers)
  return obj && obj.layerId && m.has(obj.layerId) ? obj.layerId : layerForType(obj && obj.type)
}

/** Is `obj` drawn? (its layer shown, or no such layer in the list) */
export function isShown(layers, obj) {
  const m = asMap(layers), l = m.get(layerOf(obj, m))
  return !l || l.visible !== false
}

/** Can `obj` be picked, dragged or marqueed? */
export function isPickable(layers, obj) {
  if (!obj || obj.locked) return false
  const m = asMap(layers), l = m.get(layerOf(obj, m))
  return !l || (l.visible !== false && !l.locked)
}

/** A predicate over objects for a fixed layer list — one Map for the lot. */
export const pickableIn = (layers) => { const m = asMap(layers); return (o) => isPickable(m, o) }
export const shownIn = (layers) => { const m = asMap(layers); return (o) => isShown(m, o) }

/** What a drag may snap to: the objects being moved (the guides measure
 *  them) and everything else that is drawn — a LOCKED layer included (its
 *  walls and columns are what racks are placed against), a hidden layer
 *  never. `movedIds` is a Set. */
export function snapTargets(objects, layers, movedIds) {
  const ok = shownIn(layers)
  return (objects || []).filter(o => o && ((movedIds && movedIds.has(o.id)) || ok(o)))
}

/** Is layer `id` shown? (the Checks and Aisles overlays ask this) */
export function layerShown(layers, id) {
  const l = asMap(layers).get(id)
  return !l || l.visible !== false
}

/** Is `layers` exactly the standard seven, in order? */
export function isStandard(layers) {
  return Array.isArray(layers) && layers.length === LAYER_IDS.length && layers.every((l, i) => l && l.id === LAYER_IDS[i])
}

/** The standard seven, each keeping the eye and padlock it already had in `layers`. */
export function standardLayers(layers) {
  const m = asMap(layers)
  return STANDARD_LAYERS.map(d => {
    const had = m.get(d.id)
    return had ? { ...d, visible: had.visible !== false, locked: !!had.locked } : { ...d }
  })
}

/** The standard seven as Generate leaves them: Building and Columns locked (and shown). */
export function generatedLayers(layers) {
  return standardLayers(layers).map(l => LOCKED_AFTER_GENERATE.includes(l.id) ? { ...l, visible: true, locked: true } : l)
}

/** Flip a layer's eye or padlock. Anything selected on it that can no longer
 *  be picked leaves the selection, so a drag can never move a locked object
 *  that happened to be selected before the lock. */
export function setLayer(store, id, patch) {
  store.getState().updateLayer(id, patch)
  const st = store.getState()
  const ok = pickableIn(st.layers)
  const keep = st.selectedIds.filter(sid => { const o = st.objects.find(x => x.id === sid); return o && ok(o) })
  if (keep.length !== st.selectedIds.length) {
    if (keep.length) st.selectGroup(keep)
    else st.clearSelection()
  }
}

/** Keeps the store's layer list the seven standard layers — on start, after a
 *  load of an older layout, after anything that swaps the list. Eye and
 *  padlock state carry over by id. */
export function installLayerKeeper(store) {
  let busy = false
  const fix = () => {
    if (busy) return
    const layers = store.getState().layers
    if (isStandard(layers)) return
    busy = true
    try { store.setState({ layers: standardLayers(layers) }) } finally { busy = false }
  }
  fix()
  return store.subscribe(fix)
}
