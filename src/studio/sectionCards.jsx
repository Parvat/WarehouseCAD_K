import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useBayLedger } from '../components/RightPanel/useBayLedger'
import { rowsFigure } from './SelectionBar'
import { membership, isSection, areaOf, SECTION_COLORS, BOUNDARIES, boundaryOf, wallInOf } from '../utils/sectionAreas'
import { setSectionColor, setSectionBoundary, setSectionWallIn, sizeSection } from '../utils/sectionEdit'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { useSectionHover } from '../canvas2/sectionTool'
import { useLocked } from './useLocked'
import { Head, Sec, Grid2, Field, TextInput, NumInput, StaticField, SecLabel, Seg, SelectField, C, MONO, LockedFields } from './cardParts'
import { mheProfiles, equipmentOf, CUSTOM, customProfile } from '../utils/equipment'

/* Sections in the right card (STUDIO.md §7a Sections): a selected section's block — its Name (typed: one undo step),
   its Equipment (the aisle checks of its racks: the project's forklift by default, another of the forklift list, or
   Custom — its own Aisle to pick and Space to move, typed: the checks use exactly those two — utils/equipment.js), its Width and Length (a rectangle, typed: one undo step, the top-left stays, kept inside the walls and off its
   neighbours) or its Area (a custom shape), its Colour (8 soft colours) and its Boundary (None, Fence, Wall + its
   thickness); and, with nothing selected, the Sections list under
   the Layout summary — each section's rows and positions (the racks whose centre it holds), then Unassigned. A row's
   hover lights its section on the plan; a click selects it. */
const feet = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′ ${i}″` : `${f}′` }

export function SectionMain({ obj }) {
  const gs = useCanvasStore(s => s.gridSize) || 40
  const locked = useLocked(obj)
  const commit = (label) => { const t = String(label || '').trim(); if (t && t !== obj.label) useCanvasStore.getState().commitObjectUpdate(obj.id, { label: t }) }
  const size = (k) => (t) => { const ft = parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"')); if (ft != null) sizeSection(useCanvasStore, obj.id, k === 'w' ? ft * gs : obj.width, k === 'h' ? ft * gs : obj.height) }
  const b = boundaryOf(obj)
  const projectKey = useCanvasStore(s => s.elevations?.project?.equipment?.mhe) || 'reach'
  const P = useMemo(() => mheProfiles(), [])
  // Custom starts from the widths it is held to now (its equipment's, or the project forklift's)
  const cur = (equipmentOf(obj) && equipmentOf(obj) !== CUSTOM ? P[equipmentOf(obj)] : null) || P[projectKey] || P.reach
  const setEquip = (v) => {
    const k = v || null
    if (k === equipmentOf(obj)) return
    useCanvasStore.getState().commitObjectUpdate(obj.id, k === CUSTOM ? { equipment: k, custom: obj.custom || { pickFt: cur.aisleFt, moveFt: cur.travelFt } } : { equipment: k })
  }
  const cp = equipmentOf(obj) === CUSTOM ? customProfile(obj) : null
  const setCustom = (f) => (t) => { const v = parseFloat(String(t).replace(/[′'fts]+$/g, '')); if (!(v > 0)) return; useCanvasStore.getState().commitObjectUpdate(obj.id, { custom: { pickFt: cp.aisleFt, moveFt: cp.travelFt, [f]: v } }) }
  return (
    <>
      <Head caption="Section" />
      <Sec aria-label="Section settings">
        <LockedFields locked={locked}>
          <Field label="Name"><TextInput words aria="Name" value={obj.label || ''} onCommit={commit} /></Field>
          <Field label="Equipment" title="The aisle checks of the racks in this section use it">
            <SelectField words chevron aria="Section equipment" value={equipmentOf(obj) || ''} onChange={e => setEquip(e.target.value)}>
              <option value="">Project forklift ({P[projectKey]?.label || projectKey})</option>
              {Object.values(P).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value={CUSTOM}>Custom</option>
            </SelectField>
          </Field>
          {cp && (
            <Grid2>
              <Field label="Aisle to pick (ft)" title="Turn and put away"><TextInput aria="Aisle to pick (ft)" value={String(cp.aisleFt)} onCommit={setCustom('pickFt')} /></Field>
              <Field label="Space to move (ft)" title="Drive straight"><TextInput aria="Space to move (ft)" value={String(cp.travelFt)} onCommit={setCustom('moveFt')} /></Field>
            </Grid2>
          )}
          {obj.shape === 'poly'
            ? <Field label="Area"><StaticField aria="Section area">{Math.round(areaOf(obj) / (gs * gs)).toLocaleString('en-US')} sq ft</StaticField></Field>
            : <Grid2>
                <Field label="Width"><TextInput aria="Section width" value={feet(obj.width, gs)} onCommit={size('w')} /></Field>
                <Field label="Length"><TextInput aria="Section length" value={feet(obj.height, gs)} onCommit={size('h')} /></Field>
              </Grid2>}
          <Field label="Colour">
            <div role="group" aria-label="Section colour" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" aria-label="No colour" aria-pressed={!obj.color} title="No colour" onClick={() => setSectionColor(useCanvasStore, null)}
                style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${!obj.color ? C.accent : C.separator}`, background: '#F4F8F5', cursor: 'pointer', padding: 0 }} />
              {SECTION_COLORS.map(k => (
                <button key={k.id} type="button" aria-label={`Colour ${k.name}`} aria-pressed={obj.color === k.id} title={k.name} onClick={() => setSectionColor(useCanvasStore, k.id)}
                  style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${obj.color === k.id ? C.strong : 'transparent'}`, background: k.c, cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
          </Field>
          <Field label="Boundary">
            <Seg aria="Section boundary" value={b} onChange={v => setSectionBoundary(useCanvasStore, obj.id, v)} options={BOUNDARIES.map(x => ({ value: x.id, label: x.label, aria: x.label }))} />
          </Field>
          {b === 'wall' && <Field label="Wall thickness (in)"><NumInput aria="Wall thickness (in)" value={wallInOf(obj)} min={1} onCommit={v => setSectionWallIn(useCanvasStore, obj.id, v)} /></Field>}
        </LockedFields>
      </Sec>
    </>
  )
}

export function SectionsList() {
  const { objects, gs, elevations } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40, elevations: s.elevations })))
  const ledger = useBayLedger(objects, gs)
  const rows = useMemo(() => {
    const secs = objects.filter(isSection)
    if (!secs.length) return []
    const m = membership(objects)
    const fig = (ids) => (ids.length ? rowsFigure(objects, ids, gs, ledger, elevations) : { rows: 0, positions: 0 })
    return [...secs.map(s => ({ id: s.id, name: s.label || 'Section', ...fig(m.bySection.get(s.id) || []) })), { id: null, name: 'Unassigned', ...fig(m.unassigned) }]
  }, [objects, gs, ledger, elevations])
  if (!rows.length) return null
  const cell = { padding: '6px 8px', fontSize: 12, borderTop: `1px solid ${C.divider}` }
  return (
    <Sec aria-label="Sections">
      <SecLabel>Sections</SecLabel>
      <table aria-label="Sections list" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Section', 'Rows', 'Positions'].map((h, i) => <th key={h} style={{ ...cell, borderTop: 'none', color: C.muted, fontSize: 11, fontWeight: 500, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id || 'unassigned'} data-section-row={r.id || 'unassigned'} className={r.id ? 'st-hov' : undefined}
              style={{ cursor: r.id ? 'pointer' : 'default' }}
              onMouseEnter={() => r.id && useSectionHover.setState({ id: r.id })} onMouseLeave={() => useSectionHover.setState({ id: null })}
              onClick={() => { if (!r.id) return; useSectionHover.setState({ id: null }); useCanvasStore.getState().selectObject(r.id, false) }}>
              <td style={{ ...cell, color: r.id ? C.strong : C.muted }}>{r.name}</td>
              <td style={{ ...cell, fontFamily: MONO, color: C.text, textAlign: 'right' }}>{r.rows}</td>
              <td style={{ ...cell, fontFamily: MONO, color: C.text, textAlign: 'right' }}>{r.positions.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sec>
  )
}
