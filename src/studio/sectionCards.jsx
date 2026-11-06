import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useBayLedger } from '../components/RightPanel/useBayLedger'
import { rowsFigure } from './SelectionBar'
import { membership, isSection, areaOf } from '../utils/sectionAreas'
import { useSectionHover } from '../canvas2/sectionTool'
import { useLocked } from './useLocked'
import { Head, Sec, Grid2, Field, TextInput, StaticField, SecLabel, C, MONO, LockedFields } from './cardParts'

/* Sections in the right card (STUDIO.md §7a Sections): a selected section's block — its Name (typed: one undo step),
   its Width and Length (a rectangle) or its Area (a custom shape); and, with nothing selected, the Sections list under
   the Layout summary — each section's rows and positions (the racks whose centre it holds), then Unassigned. A row's
   hover lights its section on the plan; a click selects it. */
const feet = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′ ${i}″` : `${f}′` }

export function SectionMain({ obj }) {
  const gs = useCanvasStore(s => s.gridSize) || 40
  const locked = useLocked(obj)
  const commit = (label) => { const t = String(label || '').trim(); if (t && t !== obj.label) useCanvasStore.getState().commitObjectUpdate(obj.id, { label: t }) }
  return (
    <>
      <Head caption="Section" />
      <Sec aria-label="Section settings">
        <LockedFields locked={locked}>
          <Field label="Name"><TextInput words aria="Name" value={obj.label || ''} onCommit={commit} /></Field>
          {obj.shape === 'poly'
            ? <Field label="Area"><StaticField aria="Section area">{Math.round(areaOf(obj) / (gs * gs)).toLocaleString('en-US')} sq ft</StaticField></Field>
            : <Grid2>
                <Field label="Width"><StaticField aria="Section width">{feet(obj.width, gs)}</StaticField></Field>
                <Field label="Length"><StaticField aria="Section length">{feet(obj.height, gs)}</StaticField></Field>
              </Grid2>}
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
