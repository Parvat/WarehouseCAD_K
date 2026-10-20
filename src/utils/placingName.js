import { ZONE_KINDS } from '../generate/rackingArea'

/** What a placement is placing, for its status (canvas2/RowGroupBar.jsx): a zone by its kind ("office"), racks as
 *  rows, anything else as objects. */
export function placingName(items = []) {
  const n = items.length
  const zone = n === 1 && ZONE_KINDS.find(k => k.type === items[0]?.type)
  if (zone) return zone.label.toLowerCase()
  if (n && items.every(o => typeof o?.type === 'string' && o.type.startsWith('rack_'))) return n === 1 ? 'row' : `${n} rows`
  return n === 1 ? 'object' : `${n} objects`
}
