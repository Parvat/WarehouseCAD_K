// zoneSelection.js — which zones carry a size label (canvas2/ZoneEdit.jsx SelectedZoneSizes). Pure, no Konva.

/** Every selected zone but the one being resized (it draws its own label, with the red preview). */
export const selectedZones = (objects, selectedIds, editing = null) => {
  const ids = new Set(selectedIds || [])
  return objects.filter(o => ids.has(o.id) && o.id !== editing && typeof o.type === 'string' && o.type.startsWith('zone_'))
}
