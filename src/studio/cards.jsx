import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useBayLedger } from '../components/RightPanel/useBayLedger'
import { getLayoutCapacity, getRackCapacity } from '../utils/capacity'
import { useColumnCheck } from '../generate/useColumnCheck'
import { usableCapacity, rackPositionsLost } from '../generate/usableCapacity'
import { levelsResolver, typeById } from '../utils/elevations'
import { selectionCells, cellTypes } from '../utils/elevSelection'
import { setRackDepths } from '../utils/rackDepthAction'
import { withAnchoredPosition } from '../utils/bayAnchor'
import { pxToFtIn } from '../utils/canvas'
import { zoneSized } from '../utils/floorClamp'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { BeamSelect, changeBayUpdate } from '../components/RightPanel/panels/RackRowPanelCore'
import { BEAM_PRESETS_IN } from '../utils/bayBeam'
import { useLayoutCheck, goToIssue, issueKey, remindersLabel } from '../utils/layoutCheck'
import { getCanvasContainerSize } from '../utils/canvasContainer'
import { openSetup } from '../utils/project'
import { ZONE_KINDS } from '../generate/rackingArea'
import { Head, BigFigure, Sec, Grid2, Field, InlineField, TextInput, NumInput, SelectField, Row, ToggleRow, Totals, Hint,
  Tag, CountChip, IconBtn, C, MONO, LEVEL } from './cardParts'

/* The right card's blocks for the states drawn in the mockups (design/studio/Studio.dc.html): nothing selected (C7),
   a rack (C1), a zone (C6) and Check layout (C5). Every other section uses the same parts (cardParts.jsx). */

const RACK_NAME = { rack_row: 'Selective', rack_double_row: 'Double deep', rack_drive_in: 'Drive-in', rack_drive_through: 'Drive-through', rack_pushback: 'Pushback', rack_pallet_flow: 'Pallet flow', rack_cantilever: 'Cantilever' }
const isFp = (o) => typeof o?.type === 'string' && o.type.startsWith('fp_')
const n = (v) => (v ?? 0).toLocaleString('en-US')
/** feet and inches as the mockup writes them: 8′ 0″, 42″ */
export const ftIn = (inches) => {
  const ft = Math.floor(Math.abs(inches) / 12), inc = Math.round((Math.abs(inches) % 12) * 10) / 10
  if (inc === 12) return `${ft + 1}′ 0″`
  return ft === 0 ? `${inc}″` : `${ft}′ ${inc}″`
}

/** The layout's figures: gross positions, usable (after column and narrow-aisle losses), racks, the building. */
export function useLayoutFigures() {
  const { objects, gridSize, elevations } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize || 40, elevations: s.elevations })))
  const ledger = useBayLedger(objects, gridSize)
  const { result } = useColumnCheck()
  return useMemo(() => {
    const gross = getLayoutCapacity(objects, undefined, ledger).total
    const { usable } = usableCapacity(objects, { check: result, ledger, gridSize, elevations })
    const racks = objects.filter(o => RACK_NAME[o.type]).length
    const fp = objects.find(isFp)
    return { gross, usable, racks, building: fp ? `${Math.round(fp.width / gridSize)}′ × ${Math.round(fp.height / gridSize)}′` : null }
  }, [objects, ledger, result, gridSize, elevations])
}

/** The Layout block (C1: positions · usable · racks; C7, an empty plan: positions · building). */
export function LayoutBlock({ last = true }) {
  const f = useLayoutFigures()
  const items = f.racks > 0
    ? [{ label: 'positions', value: n(f.gross) }, { label: 'usable', value: n(f.usable), accent: true }, { label: 'racks', value: n(f.racks) }]
    : [{ label: 'positions', value: n(f.gross) }, ...(f.building ? [{ label: 'building', value: f.building }] : [])]
  return <Sec label="Layout" gap={8} last={last} aria-label="Layout totals"><Totals items={items} /></Sec>
}

/** C7: nothing selected. */
export function NothingSelected() {
  return (
    <Head last={false}>
      <span style={{ color: C.strong }}>Nothing selected</span>
      <span style={{ color: C.muted, fontSize: 12 }}>Click a rack, zone or wall to edit it.</span>
    </Head>
  )
}

/** The selection's elevation as the C1 chip: its colour and name (read-only — elevations are set in the Elevations tab). */
function ElevationChip() {
  const { objects, T, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const types = useMemo(() => (T ? cellTypes(objects, T, selectionCells({ objects, selectedIds, activeBaySelection })) : []), [objects, T, selectedIds, activeBaySelection])
  if (!types.length) return null
  const t = types.length === 1 ? typeById(T, types[0].id) : null
  return (
    <Row label="Elevation" title="Set elevations in the Elevations tab">
      <span aria-label="Elevation" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', borderRadius: 6, background: C.inset, fontSize: 12, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {t && <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }} />}
        {t ? t.name : `mixed — ${types.map(x => `${typeById(T, x.id)?.name || '—'} (${x.bays})`).join(', ')}`}
      </span>
    </Row>
  )
}

/** C1: a beam rack row — its name, positions and usable, Bays · Beam · Depth · Flue, the elevation, the column
 *  check's two switches. `beam` is the rack panel's beam state (the picked bay's, else the next new bay's). */
export function RackMain({ obj, newBeam, setNewBeam }) {
  const { objects, commitObjectUpdate, gridSize, elevations } = useCanvasStore(useShallow(s => ({ objects: s.objects, commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize || 40, elevations: s.elevations })))
  const ledger = useBayLedger(objects, gridSize)
  const { result, showMarks, setShowMarks, pickBothSides, setPickBothSides } = useColumnCheck()
  const beams = obj.beams || [96], upIn = obj.uprightWidth || 3, levels = obj.levels || 1
  const entry = ledger.racks.get(obj.id)
  const full = getRackCapacity(obj, undefined, levelsResolver(elevations))
  const total = full && entry && entry.uncounted ? entry.positions : (full?.total || 0)
  const lost = useMemo(() => rackPositionsLost(obj.id, objects, { check: result, ledger, gridSize, elevations }), [obj.id, objects, result, ledger, gridSize, elevations])
  const usable = Math.max(0, total - lost)
  const activeBay = obj.activeBayIdx ?? null
  const beamShown = activeBay !== null ? beams[activeBay] : newBeam
  /* Bays: a count — bays added (the next new bay's beam) or taken off the far end, one undo step, the start held */
  const setBays = (count) => {
    const c = Math.max(1, Math.min(200, Math.round(count)))
    if (c === beams.length) return
    const nb = c > beams.length ? [...beams, ...Array(c - beams.length).fill(newBeam)] : beams.slice(0, c)
    const w = ((upIn * (nb.length + 1) + nb.reduce((s, b) => s + b, 0)) / 12) * gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { beams: nb, width: w }))
  }
  const flue = obj.flueSpaceIn || 9
  const setFlue = (f) => {
    const oldFlueH = (flue / 12) * gridSize, rowH = (obj.height - oldFlueH) / 2, newH = rowH * 2 + (f / 12) * gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { flueSpaceIn: f, flueBaseIn: f, height: newH }))
  }
  const row = obj.rowIndex != null ? ` · row ${obj.rowIndex}` : ''
  return (
    <>
      <Head caption={`${RACK_NAME[obj.type] || 'Rack'}${row}`}>
        <BigFigure value={n(total)} unit="positions" right={`${n(usable)} usable`} />
      </Head>
      <Sec aria-label="Rack fields">
        <Grid2>
          <Field label="Bays"><NumInput aria="Bays" value={beams.length} min={1} onCommit={setBays} /></Field>
          <Field label={activeBay !== null ? `Bay ${activeBay + 1} beam` : 'Beam'}>
            <SelectField aria={activeBay !== null ? `Bay ${activeBay + 1} beam` : 'New bay beam'} value={BEAM_PRESETS_IN.includes(beamShown) ? String(beamShown) : 'other'}
              onChange={e => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; activeBay !== null ? commitObjectUpdate(obj.id, changeBayUpdate(obj, activeBay, v, gridSize)) : setNewBeam(v) }}>
              {!BEAM_PRESETS_IN.includes(beamShown) && <option value="other">{ftIn(beamShown)}</option>}
              {BEAM_PRESETS_IN.map(b => <option key={b} value={String(b)}>{ftIn(b)}</option>)}
            </SelectField>
          </Field>
          <Field label="Depth" title="This rack only — against a wall it keeps its wall clearance and grows away from the wall; otherwise about its centre">
            <TextInput aria="Rack depth" value={`${obj.depthIn ?? 42}″`} onCommit={t => { const v = parseFloat(String(t).replace(/[″"s]|in/g, '')); if (Number.isFinite(v) && v > 0 && v !== (obj.depthIn ?? 42)) setRackDepths(useCanvasStore, [obj.id], v) }} />
          </Field>
          {obj.type === 'rack_double_row'
            ? <Field label="Flue"><SelectField aria="Flue" value={String(flue)} onChange={e => setFlue(Number(e.target.value))}>
                {[6, 9, 12].map(f => <option key={f} value={String(f)}>{f}″</option>)}
                {![6, 9, 12].includes(flue) && <option value={String(flue)}>{flue}″</option>}
              </SelectField></Field>
            : <Field label="Upright"><SelectField aria="Upright" value={String(upIn)} onChange={e => {
                const u = Number(e.target.value), w = ((u * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)) / 12) * gridSize
                commitObjectUpdate(obj.id, withAnchoredPosition(obj, { uprightWidth: u, width: w }))
              }}>{[3, 4].map(u => <option key={u} value={String(u)}>{u}″</option>)}</SelectField></Field>}
        </Grid2>
      </Sec>
      <Sec aria-label="Rack checks">
        <ElevationChip />
        <ToggleRow label="Require pick both sides" aria="Require pick from both sides" title="A column with clear space on only one side is accessible by default (drivable + pickable from the far side). Turn this on to flag those too." on={pickBothSides} onClick={() => setPickBothSides(!pickBothSides)} />
        <ToggleRow label="Show markings" on={showMarks} onClick={() => setShowMarks(!showMarks)} />
      </Sec>
    </>
  )
}

/** C6: a zone — its kind, its name, an exact width and length (one undo step; the edge against a wall stays). */
export function ZoneMain({ obj }) {
  const commitObjectUpdate = useCanvasStore(s => s.commitObjectUpdate)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const kind = ZONE_KINDS.find(z => z.type === obj.type)?.label || 'Zone'
  /* typed as the field shows it (40′ 0″) or plainly (40, 40' 6") */
  const size = (key) => (text) => {
    const ft = parseFeet(String(text).replace(/′/g, "'").replace(/″/g, '"'))
    if (ft == null) return
    const st = useCanvasStore.getState(), cur = st.objects.find(o => o.id === obj.id)
    if (!cur || Math.abs(ft * gridSize - cur[key]) < 1e-6) return
    commitObjectUpdate(obj.id, zoneSized(st.objects, cur, { [key]: ft * gridSize }, { gridSize }))
  }
  return (
    <div aria-label="Zone settings" style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>Zone · {kind}</span>
      <InlineField label="Name"><TextInput words aria="Zone name" value={obj.label || ''} onCommit={t => commitObjectUpdate(obj.id, { label: t })} /></InlineField>
      <Grid2>
        <Field label="Width"><TextInput aria="Zone width" value={ftIn(obj.width / gridSize * 12)} onCommit={size('width')} /></Field>
        <Field label="Length"><TextInput aria="Zone length" value={ftIn(obj.height / gridSize * 12)} onCommit={size('height')} /></Field>
      </Grid2>
      <Hint>No racking is placed inside a zone. Its edges count as walls.</Hint>
    </div>
  )
}

/* an item's title and its detail: the text before " — " is the title, the rest the detail */
const split = (text) => { const i = text.indexOf(' — '); return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [text, null] }

/** C5: Check layout — the counts, every item with its level tag (a click zooms to it and stays highlighted), the
 *  usable / total figures. Reminders are the Note level and open Project settings. */
export function CheckCard() {
  const result = useLayoutCheck(s => s.result)
  const close = useLayoutCheck(s => s.close)
  const hiKey = useLayoutCheck(s => s.highlight?.key)
  const f = useLayoutFigures()
  if (!result) return null
  const items = [
    ...result.errors.map(it => ({ it, level: 'error' })),
    ...result.warnings.map(it => ({ it, level: 'warning' })),
    ...(result.reminders || []).map(it => ({ it, level: 'note', reminder: true })),
  ]
  const counts = { error: result.errors.length, warning: result.warnings.length, note: (result.reminders || []).length }
  return (
    <div aria-label="Layout check" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, color: C.strong }}>Check layout</span>
        {['error', 'warning', 'note'].map(l => counts[l] > 0 && <CountChip key={l} level={l} n={counts[l]} />)}
        <span style={{ marginLeft: 'auto' }}><IconBtn name="Close" label="Close layout check" onClick={close} size={26} color={C.muted} /></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px 8px', overflowY: 'auto', minHeight: 0 }}>
        {!items.length && <span style={{ padding: '0 8px 8px', color: C.muted, fontSize: 12 }}>{remindersLabel(result) || 'No issues found.'}</span>}
        {items.map(({ it, level, reminder }, i) => {
          const [t, d] = split(it.text)
          const on = !reminder && hiKey === issueKey(it)
          return (
            <button key={it.kind + i} type="button" aria-label={it.text} title={reminder ? 'Open Project settings' : 'Show it on the drawing'}
              onClick={() => (reminder ? openSetup('settings') : goToIssue(useCanvasStore, it, getCanvasContainerSize()))}
              style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, border: 0, borderRadius: 8, background: on ? C.inset : 'transparent', textAlign: 'left', color: C.text, cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Tag level={level} /><span style={{ fontSize: 13, color: C.strong }}>{t}</span></span>
              {d && <span style={{ fontSize: 12, lineHeight: 1.45, color: C.muted }}>{d}</span>}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${C.divider}`, color: C.muted, fontSize: 12, flexShrink: 0 }}>
        Click an item to zoom to it<span style={{ marginLeft: 'auto', fontFamily: MONO, color: C.text }}>{n(f.usable)} / {n(f.gross)}</span>
      </div>
    </div>
  )
}
