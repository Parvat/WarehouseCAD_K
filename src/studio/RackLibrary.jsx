import { useEffect, useMemo, useRef, useState } from 'react'
import { RACK_FAMILIES } from '../render/rackFamily'
import { textOwnsKey } from '../utils/typing'

/* (rack-design) The racking library — design/rack-library.png. A compact dark flyout right of the rail, as wide as its
   longest name: a search box, then the rack types in their colour families (PALLET, LANE, FLOW, OTHER), each a 28 px row
   with a 20×16 top-view glyph in its family colour (the plan's colours, render/rackFamily.js) and its name. A row's
   description shows in a tooltip right of the panel after 300 ms. Search filters across the groups and hides the empty
   ones; Up and Down move, Enter picks, Esc clears the search, then closes. A pick places the type as before
   (FloatingToolbar's pickItem: one, then back to Select); a double-click keeps it on (`onKeep`).
   The Rack Row (multi-bay) entry is gone from the library — a saved Rack Row still loads and edits (it is a rack_row). */

/** The library's rows: [group, [{ id (the library item), name, tip, icon }]]. A row whose item the library does not
 *  have shows disabled, "Coming soon". */
export const RACK_LIBRARY = [
  ['Pallet', [
    { id: 'rack_selective', name: 'Selective', tip: 'Single row, every pallet reachable', icon: 'selective' },
    { id: 'rack_double_row', name: 'Back-to-back', tip: 'Two rows sharing a flue', icon: 'b2b' },
    { id: 'rack_double_deep', name: 'Double-deep', tip: 'Two pallets deep, reach truck', icon: 'deep' },
  ]],
  ['Lane', [
    { id: 'rack_drive_in', name: 'Drive-in', tip: 'One entry, last in first out', icon: 'drivein' },
    { id: 'rack_drive_through', name: 'Drive-through', tip: 'Entry both ends, first in first out', icon: 'drivethrough' },
  ]],
  ['Flow', [
    { id: 'rack_pushback', name: 'Push-back', tip: 'Carts, load and pick one face', icon: 'pushback' },
    { id: 'rack_pallet_flow', name: 'Pallet flow', tip: 'Load back, pick front, gravity', icon: 'flow' },
    // (r8-carton-flow) built: was a disabled "Coming soon" row
    { id: 'rack_carton_flow', name: 'Carton flow', tip: 'Carton lanes, load back, pick front', icon: 'carton' },
  ]],
  ['Other', [
    { id: 'rack_cantilever', name: 'Cantilever', tip: 'Arms for long loads', icon: 'cantilever' },
    { id: 'rack_shelving', name: 'Shelving', tip: 'Hand-pick units', icon: 'shelving' },
    { id: 'rack_mezzanine', name: 'Mezzanine', tip: 'Raised floor area', icon: 'mezzanine', family: 'mezz' },
  ]],
]
/** Library items the flyout leaves out (still placeable from elsewhere by id, and still loading from a file). */
export const RACK_LIBRARY_HIDDEN = new Set(['rack_row'])

const ICON_COLOR = { Pallet: RACK_FAMILIES.pallet.icon, Lane: RACK_FAMILIES.lane.icon, Flow: RACK_FAMILIES.flow.icon, Other: RACK_FAMILIES.other.icon }
export const rackIconColor = (group, row) => (row.family ? RACK_FAMILIES[row.family].icon : ICON_COLOR[group])

/** A rack type's 20×16 top-view glyph, drawn in `color` (copied from the mockup's shapes). */
export function RackGlyph({ icon, color }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.5 }
  const bar = (y) => <rect x="1" y={y} width="18" height="2" fill={color} stroke="none" />
  const g = {
    selective: <><rect x="1.75" y="5.75" width="16.5" height="4.5" {...s} /><path d="M10 5.75v4.5" {...s} /></>,
    b2b: <><rect x="1.75" y="1.75" width="16.5" height="5.5" {...s} /><rect x="1.75" y="8.75" width="16.5" height="5.5" {...s} /><path d="M10 1.75v12.5" {...s} /></>,
    deep: <><rect x="1.75" y="1.75" width="16.5" height="12.5" {...s} /><path d="M10 1.75v12.5" {...s} /><path d="M3 8h14" {...s} strokeWidth="1" strokeDasharray="2 1.5" /></>,
    drivein: <><rect x="1.75" y="1.75" width="16.5" height="11" {...s} /><path d="M7.25 1.75v11M12.75 1.75v11" {...s} />{bar(13)}</>,
    drivethrough: <><rect x="1.75" y="2.75" width="16.5" height="10" {...s} /><path d="M7.25 2.75v10M12.75 2.75v10" {...s} />{bar(1)}{bar(13)}</>,
    pushback: <><rect x="1.75" y="1.75" width="16.5" height="11" {...s} /><path d="M10 10.5V5M7.5 7.25 10 4.75l2.5 2.5" {...s} />{bar(13)}</>,
    flow: <><rect x="1.75" y="2.75" width="16.5" height="10" {...s} /><path d="M10 5v5.5M7.5 8.25 10 10.75l2.5-2.5" {...s} />{bar(1)}{bar(13)}</>,
    // (r8-carton-flow) as Pallet flow's: the face bars and the arrow, with lane lines
    carton: <><rect x="1.75" y="2.75" width="16.5" height="10" {...s} /><path d="M5.75 2.75v10M14.25 2.75v10" {...s} strokeWidth="0.75" /><path d="M10 5v5.5M7.5 8.25 10 10.75l2.5-2.5" {...s} />{bar(1)}{bar(13)}</>,
    cantilever: <><path d="M1 3.25h18" {...s} strokeWidth="2.5" /><path d="M2.5 3v10M10 3v10M17.5 3v10" {...s} /></>,
    shelving: <><rect x="1.75" y="5.25" width="16.5" height="5.5" {...s} /><path d="M7.25 5.25v5.5M12.75 5.25v5.5" {...s} /></>,
    mezzanine: <><rect x="1.75" y="1.75" width="16.5" height="12.5" {...s} strokeDasharray="2.5 1.5" /><path d="M1.75 1.75l16.5 12.5M18.25 1.75L1.75 14.25" {...s} strokeWidth="1" /></>,
  }[icon]
  return <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>{g}</svg>
}

const GROUP = { padding: '8px 8px 2px', color: '#8A918C', fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }

/** The flyout. `items`: the Racking section's library items (FloatingToolbar's secItems); `onPick(item)`; `onKeep(item)`:
 *  a double-click — the type stays on until Esc; `onClose`. */
export function RackLibrary({ items, onPick, onKeep = null, onClose }) {
  const ref = useRef(null), searchRef = useRef(null), closing = useRef(null), tipTimer = useRef(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(-1)
  const [tip, setTip] = useState(null)   // { text, top, left }
  const byId = useMemo(() => new Map(items.map(it => [it.id, it])), [items])

  // the rows shown: filtered by the search, each group only while it has a row
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    return RACK_LIBRARY.map(([g, rows]) => [g, rows.filter(r => !s || r.name.toLowerCase().includes(s) || r.tip.toLowerCase().includes(s))]).filter(([, rows]) => rows.length)
  }, [q])
  const flat = useMemo(() => groups.flatMap(([g, rows]) => rows.map(r => ({ g, r, item: byId.get(r.id) || null }))), [groups, byId])
  const pickable = flat.map((f, i) => (f.item ? i : -1)).filter(i => i >= 0)

  useEffect(() => { searchRef.current?.focus() }, [])
  useEffect(() => { setActive(pickable.length ? pickable[0] : -1) }, [q])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(closing.current); clearTimeout(tipTimer.current) }, [])

  const pick = (f, keep = false) => {
    if (!f?.item) return
    if (keep && onKeep) { clearTimeout(closing.current); onKeep(f.item); onClose(); return }
    onPick(f.item)
    // a double-click's time before it closes, so the second click lands on the row (the type kept on), not the canvas
    clearTimeout(closing.current); closing.current = setTimeout(onClose, onKeep ? 350 : 0)
  }

  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-island="rail"]')) onClose() }
    const key = (e) => {
      // a key typed in some other field is that field's (utils/typing.js); in the library's own search box Up, Down and
      // Enter move and pick (a one-line box has no use for them)
      if (textOwnsKey(e) && e.target !== searchRef.current) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q) setQ(''); else onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        if (!pickable.length) return
        const at = pickable.indexOf(active), n = pickable.length
        setActive(pickable[at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n])
        return
      }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(flat[active]) }
    }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true) }
  })

  const showTip = (e, f) => {
    clearTimeout(tipTimer.current)
    const row = e.currentTarget.getBoundingClientRect(), panel = ref.current?.getBoundingClientRect()
    const text = f.item ? f.r.tip : 'Coming soon'
    tipTimer.current = setTimeout(() => setTip({ text, top: row.top + row.height / 2, left: (panel ? panel.right : row.right) + 4 }), 300)
  }
  const hideTip = () => { clearTimeout(tipTimer.current); setTip(null) }

  let idx = -1
  return (
    <div ref={ref} className="st-island" role="menu" aria-label="Racking library" data-island="flyout" data-rack-library=""
      style={{ left: 72, top: 76, width: 'max-content', flexDirection: 'column', alignItems: 'stretch', padding: 6, maxHeight: 'calc(100vh - 152px)', overflowY: 'auto', overflowX: 'hidden' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px', borderRadius: 6, background: '#2A2F2C', color: '#8A918C', marginBottom: 2 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7.6 7.6 11 11" stroke="currentColor" strokeWidth="1.3" /></svg>
        <input ref={searchRef} type="search" role="searchbox" aria-label="Search racking" placeholder="Search racking" value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 0, width: 0, border: 0, outline: 'none', background: 'transparent', color: '#E8EAE6', fontSize: 13, fontFamily: 'inherit', padding: 0 }} />
      </label>
      {!flat.length && <span style={{ padding: '8px', color: '#8A918C', fontSize: 12 }}>No match</span>}
      {groups.map(([g, rows]) => (
        <div key={g} role="group" aria-label={g} style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={GROUP} aria-hidden="true">{g}</span>
          {rows.map(r => {
            idx += 1
            const i = idx, f = flat[i], on = i === active
            return (
              <button key={r.id} type="button" role="menuitem" aria-label={r.name} aria-disabled={f.item ? undefined : 'true'} data-active={on ? '' : undefined}
                onMouseEnter={(e) => { if (f.item) setActive(i); showTip(e, f) }} onMouseLeave={hideTip}
                onClick={(e) => { hideTip(); if (e.detail > 1) return; pick(f) }}
                onDoubleClick={() => { hideTip(); pick(f, true) }}
                style={{ height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 8px', border: 0, borderRadius: 6, background: on ? '#2C312E' : 'transparent', color: '#E8EAE6', fontSize: 13, textAlign: 'left', whiteSpace: 'nowrap', ...(f.item ? null : { opacity: 0.45, cursor: 'not-allowed' }) }}>
                <RackGlyph icon={r.icon} color={rackIconColor(g, r)} />
                <span>{r.name}</span>
              </button>
            )
          })}
        </div>
      ))}
      {tip && (
        <span role="tooltip" style={{ position: 'fixed', left: tip.left, top: tip.top, transform: 'translateY(-50%)', padding: '5px 9px', borderRadius: 6, background: '#111412', color: '#FFFFFF', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 6px 16px rgba(15,18,16,.25)', zIndex: 160 }}>
          {tip.text}
        </span>
      )}
    </div>
  )
}
