// PlaceColumnGrid.jsx — the Columns tool's first step (col-grid round, item 1; mockup colplace.png): the "Place column
// grid" dialog. X and Y spacing (centre to centre); Columns on the walls Yes / No (No: the X and Y offset from the wall to
// the first column's centre); the column's Width and Depth; a live preview of the building with its columns and their
// count; Cancel · Place grid. Nothing is placed until Place grid — then one undo step adds the grid to the building, and
// everything after is edited in the column grid's Properties card (ColumnGridPanel). The gridlines are laid by the card's
// own rule (utils/columnGrid.js layGrid — Yes: from the walls; No: centred, equal end bays), so the two always agree.
// Every value from the mockup (measured at its 2×): a 300 card, the card's parts and palette; the preview strip #191C1B,
// the building white, the columns #2B2F2C; Place grid #2E7D5B with white text.

import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { C, fieldBox, Grid2, Sec, Caption, Seg, Btn } from './cardParts'
import { layGrid } from '../utils/columnGrid'
import { expandColumnGrid } from '../generate/columnCheck'
import { buildingOutline } from '../utils/floorGeom'
import { layerForType } from '../utils/layers'
import { ftIn } from '../utils/bom'
import { feetOf, inchesOf } from '../components/RightPanel/panels/ColumnGridPanel'

/** The dialog's state: the building it places into (null: closed), and the grid object's look from the library item. */
export const usePlaceGrid = create(() => ({ fpId: null, look: null }))
export const openPlaceGrid = (fpId, look = null) => usePlaceGrid.setState({ fpId, look })
export const closePlaceGrid = () => usePlaceGrid.setState({ fpId: null, look: null })

const PREVIEW_BG = '#191C1B', COLUMN = '#2B2F2C', PLACE = '#2E7D5B'
const PREVIEW_W = 236, PREVIEW_H = 150

/** One typed length: shown as feet-inches (50′, 12″), read on every keystroke; a bad entry keeps the last good value. */
function LenField({ label, aria, value, onChange, parse, show, min = 0 }) {
  const [text, setText] = useState(show(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(show(value)) }, [value, editing, show])
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
      <input type="text" aria-label={aria} value={text} className="st-field" style={fieldBox(true)}
        onFocus={e => { setEditing(true); e.target.select() }}
        onChange={e => { setText(e.target.value); const v = parse(e.target.value); if (v != null && v >= min) onChange(v) }}
        onBlur={() => setEditing(false)} />
    </label>
  )
}
const ftShow = (ft) => ftIn(ft * 12)
const inShow = (inch) => `${Math.round(inch * 100) / 100}″`

/** The grid these entries lay in building `fp` (world px) — the card's rule — and its columns as drawn. */
export function placedGrid(fp, p, gs = 40) {
  const upd = layGrid({ x: 0, y: 0 }, fp, { spX: p.spX, spY: p.spY, walls: !!p.walls, wIn: p.wIn, dIn: p.dIn }, gs)
  const cols = expandColumnGrid(upd, gs, [fp])
  return { upd, cols, nx: upd.spacingX.length + 1, ny: upd.spacingY.length + 1 }
}

export function PlaceColumnGrid() {
  const { fpId, look } = usePlaceGrid()
  const fp = useCanvasStore(s => (fpId ? s.objects.find(o => o.id === fpId) : null))
  const gs = useCanvasStore(s => s.gridSize) || 40
  // the mockup's entries: 50′ × 40′ centre to centre, columns on the walls, 12″ × 12″
  const [p, setP] = useState({ spX: 50, spY: 40, walls: true, wIn: 12, dIn: 12 })
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const g = useMemo(() => (fp ? placedGrid(fp, p, gs) : null), [fp, p, gs])
  useEffect(() => {
    if (!fpId) return
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePlaceGrid() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [fpId])
  if (!fpId || !fp || !g) return null

  const place = () => {
    const st = useCanvasStore.getState()
    st.addObject({
      type: 'column_grid', label: 'Column Grid', ...g.upd, showGrid: true, wallAttached: !!p.walls,
      fill: (look?.color || '#6366f1') + '22', stroke: look?.color || '#6366f1', strokeWidth: 1.5, opacity: 1, rotation: 0,
      layerId: layerForType('column_grid'), parentId: fp.id,
    })
    closePlaceGrid()
  }

  // the preview: the building fitted into the strip, each column a 4px square
  const poly = buildingOutline(fp), xs = poly.map(q => q.x), ys = poly.map(q => q.y)
  const x0 = Math.min(...xs), y0 = Math.min(...ys), bw = Math.max(...xs) - x0, bh = Math.max(...ys) - y0
  const k = Math.min(PREVIEW_W / bw, PREVIEW_H / bh), pw = bw * k, ph = bh * k
  const all = g.nx * g.ny === g.cols.length
  const count = all ? `${g.nx} × ${g.ny} = ${g.cols.length} columns` : `${g.cols.length} column${g.cols.length === 1 ? '' : 's'}`

  return (
    <div role="dialog" aria-modal="true" aria-label="Place column grid" data-place-grid
      onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && g.cols.length) place() }}
      style={{ position: 'absolute', zIndex: 200, left: '50%', top: 80, transform: 'translateX(-50%)', width: 300, borderRadius: 14, background: C.island, color: C.text, boxShadow: '0 12px 32px rgba(0,0,0,.28)', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <div style={{ padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: `1px solid ${C.divider}` }}>
        <span style={{ color: C.strong, fontSize: 15, fontWeight: 600 }}>Place column grid</span>
        <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>Enter the building's grid. You can change it later in Properties.</span>
      </div>
      <Sec label={<Caption>Spacing (centre to centre)</Caption>}>
        <Grid2>
          <LenField label="X spacing" aria="Grid X spacing" value={p.spX} onChange={set('spX')} parse={feetOf} show={ftShow} min={1} />
          <LenField label="Y spacing" aria="Grid Y spacing" value={p.spY} onChange={set('spY')} parse={feetOf} show={ftShow} min={1} />
        </Grid2>
      </Sec>
      <Sec gap={8}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, color: C.text, fontSize: 13 }}>Columns on the walls</span>
          <div style={{ width: 88 }}>
            <Seg aria="Columns on the walls" value={p.walls} onChange={set('walls')} options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} />
          </div>
        </div>
        <span data-walls-note style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>{p.walls ? 'Wall columns sit fully inside, face against the wall.' : 'Centred: equal end bays, no columns on the walls.'}</span>
      </Sec>
      <Sec label={<Caption>Column size</Caption>}>
        <Grid2>
          <LenField label="Width" aria="Grid column width" value={p.wIn} onChange={set('wIn')} parse={inchesOf} show={inShow} min={1} />
          <LenField label="Depth" aria="Grid column depth" value={p.dIn} onChange={set('dIn')} parse={inchesOf} show={inShow} min={1} />
        </Grid2>
      </Sec>
      <div data-place-preview style={{ background: PREVIEW_BG, padding: '22px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, borderBottom: `1px solid ${C.divider}` }}>
        <svg width={pw} height={ph} viewBox={`${x0} ${y0} ${bw} ${bh}`} style={{ overflow: 'visible', display: 'block' }} aria-hidden="true">
          <polygon points={poly.map(q => `${q.x},${q.y}`).join(' ')} fill="#FFFFFF" />
          {g.cols.map((c, i) => <rect key={i} data-preview-column="" x={c.x + c.w / 2 - 2 / k} y={c.y + c.h / 2 - 2 / k} width={4 / k} height={4 / k} fill={COLUMN} />)}
        </svg>
        <span data-place-count style={{ color: C.icon, fontSize: 13 }}>{count}</span>
        {!g.cols.length && <span role="alert" style={{ color: C.muted, fontSize: 12 }}>No column inside the building — check the values.</span>}
      </div>
      <div style={{ padding: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn kind="inset" onClick={closePlaceGrid} style={{ height: 30, color: C.icon }}>Cancel</Btn>
        <Btn kind="primary" onClick={place} disabled={!g.cols.length} style={{ height: 30, background: PLACE, color: '#FFFFFF', opacity: g.cols.length ? 1 : 0.45 }}>Place grid</Btn>
      </div>
    </div>
  )
}

