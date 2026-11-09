import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { computeBom, bomCsv, bomGroups, byRowTable, qtyText, rowsText } from '../utils/bom'
import { bomXlsx } from '../export/bomXlsx'
import { useLayoutCheck } from '../utils/layoutCheck'
import { rackFootprint } from '../generate/rackFootprint'
import { C, MONO, Note, Btn, Sec, Seg } from './cardParts'
import { Icon } from './Icon'
import { useViewPrefs } from './viewPrefs'

/* The BOM tab (right card, beside Properties and Elevations): the layout's bill of materials (utils/bom.js) — its
   flags first in the warning style, then the lines grouped by part (part, size, qty), per drawn section (its rows R…)
   then Unassigned and the grand Total (with no section drawn, the Total alone). Beams are counted one by one, their
   pairs beside. A click on a line shades the racks it comes from on the plan (Check layout's highlight: it stays until
   the next click on the canvas); again, it goes. Full view opens it wide (a modal, STUDIO.md §1) with a Summary / By
   row switch — By row: the parts down, R1 … Rn across by section, each section's Total and the grand Total, as a
   dealer's sheet; Download xlsx saves that table, Download CSV the Summary. */

const SELECT = '#2E7D5B'
/** Outline the racks of BOM line `line` on the plan (or clear it when it is the one outlined). */
export function highlightLine(line, objects) {
  const hl = useLayoutCheck.getState().highlight
  if (!line || (hl?.kind === 'bom' && hl.key === line.key)) { useLayoutCheck.setState({ highlight: null }); return }
  const ids = new Set(line.ids)
  const shapes = objects.filter(o => ids.has(o.id)).map(r => { const f = rackFootprint(r); return { x: f.x, y: f.y, w: f.w, h: f.h, color: SELECT, mode: 'fill' } })
  useLayoutCheck.setState({ highlight: { shapes, at: Date.now(), kind: 'bom', key: line.key } })
}
const save = (blob, filename) => {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/** Save the BOM as a CSV file (section, rows, part, size, qty, pairs; the flags as # comment lines). */
export function downloadCsv(bom, filename) { save(new Blob([bomCsv(bom)], { type: 'text/csv' }), filename) }
/** Save the By row table as an .xlsx file. */
export function downloadXlsx(bom, filename, title) { save(new Blob([bomXlsx(bom, title)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename) }
const baseName = (name) => String(name || 'warehouse-layout').replace(/\.(wcad|pdf)$/i, '')

function BomTable({ bom, picked, onPick, wide = false }) {
  const cell = { padding: wide ? '7px 10px' : '6px 8px', fontSize: wide ? 13 : 12, borderTop: `1px solid ${C.divider}`, verticalAlign: 'top' }
  const head = { ...cell, borderTop: 'none', color: C.muted, fontSize: 11, fontWeight: 500, textAlign: 'left' }
  const groups = bomGroups(bom)
  return (
    <table aria-label={wide ? 'Bill of materials, full view' : 'Bill of materials'} style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th style={head}>Part</th><th style={head}>Size</th><th style={{ ...head, textAlign: 'right' }}>Qty</th></tr></thead>
      {groups.map(g => {
        let last = null
        return (
          <tbody key={g.id} data-bom-section={g.id}>
            {(bom.hasSections || g.rows.length > 0) && (
              <tr data-bom-group-head={g.id}>
                <td colSpan={3} style={{ ...cell, paddingTop: wide ? 14 : 12, borderTop: g.total ? `1px solid ${C.separator}` : cell.borderTop }}>
                  <span style={{ color: C.strong, fontWeight: 600, fontSize: wide ? 13 : 12 }}>{g.name}</span>
                  {g.rows.length > 0 && <span data-bom-rows style={{ color: C.muted, fontSize: 11, marginLeft: 8 }}>{rowsText(g.rows)}</span>}
                </td>
              </tr>
            )}
            {!g.lines.length && <tr><td colSpan={3} style={{ ...cell, color: C.muted }}>No racks</td></tr>}
            {g.lines.map(l => {
              const first = l.part !== last; last = l.part
              const key = g.id + '|' + l.key, on = picked === key
              return (
                <tr key={key} data-bom-line={l.key} data-bom-group={g.id} aria-selected={on} className="st-hov" title="Show its racks on the plan" onClick={() => onPick({ ...l, key })}
                  style={{ cursor: 'pointer', background: on ? C.active : undefined }}>
                  <td style={{ ...cell, color: first ? C.strong : 'transparent', fontWeight: first ? 500 : 400 }}>{l.part}</td>
                  <td style={{ ...cell, fontFamily: MONO, color: C.text }}>{l.size || '—'}</td>
                  <td style={{ ...cell, fontFamily: MONO, color: C.strong, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* beams: the pairs beside — under them in the narrow card ("468 (234 pairs)" either way as text) */}
                    {l.part === 'Beam'
                      ? <>{l.qty.toLocaleString('en-US')}{' '}<span style={{ display: wide ? 'inline' : 'block', color: C.muted, fontSize: 11 }}>{qtyText(l).slice(l.qty.toLocaleString('en-US').length + 1)}</span></>
                      : qtyText(l)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        )
      })}
    </table>
  )
}

/** The By row table: parts down, R1 … Rn across by section, each section's Total, the grand Total. */
function ByRowTable({ bom }) {
  const { groups, parts } = useMemo(() => byRowTable(bom), [bom])
  const many = bom.hasSections
  const cell = { padding: '6px 8px', fontSize: 12, borderTop: `1px solid ${C.divider}`, fontFamily: MONO, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }
  const head = { ...cell, borderTop: 'none', color: C.muted, fontSize: 11, fontFamily: 'inherit', fontWeight: 500 }
  const sum = { ...cell, color: C.strong, fontWeight: 600, background: C.inset }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table aria-label="Bill of materials by row" style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead>
          {many && (
            <tr>
              <th colSpan={2} style={head} />
              {groups.map(g => <th key={g.id} colSpan={g.rows.length + 1} data-byrow-section={g.id} style={{ ...head, textAlign: 'center', color: C.strong, borderBottom: `1px solid ${C.separator}` }}>{g.name}</th>)}
              <th style={head} />
            </tr>
          )}
          <tr>
            <th style={{ ...head, textAlign: 'left' }}>Part</th><th style={{ ...head, textAlign: 'left' }}>Size</th>
            {groups.map(g => [
              ...g.rows.map(no => <th key={'r' + no} style={head} data-byrow-col={no}>R{no}</th>),
              ...(many ? [<th key={'t' + g.id} style={{ ...head, color: C.strong }}>Total</th>] : []),
            ])}
            <th style={{ ...head, color: C.strong }}>{many ? 'Grand total' : 'Total'}</th>
          </tr>
        </thead>
        <tbody>
          {parts.map(p => (
            <tr key={p.key} data-byrow-part={p.key}>
              <td style={{ ...cell, fontFamily: 'inherit', textAlign: 'left', color: p.pairs ? C.muted : C.strong, paddingLeft: p.pairs ? 20 : 8 }}>{p.pairs ? 'pairs' : p.part}</td>
              <td style={{ ...cell, textAlign: 'left' }}>{p.pairs ? '' : p.size || '—'}</td>
              {groups.map(g => [
                ...g.rows.map(no => <td key={'r' + no} data-row={no} style={{ ...cell, color: p.cells[no] ? C.text : C.faint }}>{p.cells[no] || 0}</td>),
                ...(many ? [<td key={'t' + g.id} data-section-total={g.id} style={sum}>{p.totals[g.id] || 0}</td>] : []),
              ])}
              <td data-grand-total style={sum}>{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BomTab() {
  const { objects, T, gs, filename } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gs: s.gridSize || 40, filename: s.currentFilename })))
  const bom = useMemo(() => computeBom(objects, T, { gridSize: gs }), [objects, T, gs])
  const hl = useLayoutCheck(s => s.highlight)
  const picked = hl?.kind === 'bom' ? hl.key : null
  const [full, setFull] = useState(false)
  const [view, setView] = useState('summary')
  const pick = (l) => highlightLine(l, objects)
  // while the full view is open the plan shows the R labels, whatever the island's Rows says
  useEffect(() => { useViewPrefs.getState().setBomFull(full); return () => useViewPrefs.getState().setBomFull(false) }, [full])
  useEffect(() => {
    if (!full) return
    const k = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setFull(false) } }
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true)
  }, [full])
  const flags = bom.flags.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {bom.flags.map(f => <Note key={f.key} level="warning" role="alert" data-bom-flag={f.key}>{f.text}</Note>)}
    </div>
  )
  const csv = () => downloadCsv(bom, baseName(filename) + '-bom.csv')
  const xlsx = () => downloadXlsx(bom, baseName(filename) + '-bom.xlsx', baseName(filename))
  const root = typeof document !== 'undefined' ? document.querySelector('[data-theme]') || document.body : null
  return (
    <div role="tabpanel" aria-label="BOM" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Sec>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Btn kind="inset" style={{ height: 28, padding: '0 8px', fontSize: 12 }} onClick={() => setFull(true)} disabled={!bom.lines.length}>Full view</Btn>
          <Btn kind="inset" style={{ height: 28, padding: '0 8px', fontSize: 12 }} onClick={csv} disabled={!bom.lines.length}>Download CSV</Btn>
        </div>
        {flags}
        {bom.lines.length
          ? <BomTable bom={bom} picked={picked} onPick={pick} />
          : <span style={{ color: C.muted, fontSize: 12 }}>No selective or back-to-back racks yet.</span>}
        <span style={{ color: C.muted, fontSize: 11 }}>Selective and back-to-back racking · quantities only. Click a line to see its racks.</span>
      </Sec>
      {full && root && createPortal(
        <div data-bom-modal style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgb(15 18 16 / .55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setFull(false) }}>
          <div role="dialog" aria-label="Bill of materials" data-card-dark style={{ width: view === 'rows' ? 'min(1400px, 100%)' : 'min(960px, 100%)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', background: '#1F2321', border: '1px solid #323835', borderRadius: 12, boxShadow: '0 18px 60px rgba(0,0,0,.35)', color: C.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${C.divider}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.strong, flex: 1 }}>Bill of materials</span>
              <div style={{ width: 180 }}>
                <Seg aria="BOM view" value={view} onChange={setView} options={[{ value: 'summary', label: 'Summary' }, { value: 'rows', label: 'By row' }]} />
              </div>
              <Btn kind="inset" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={xlsx}>Download xlsx</Btn>
              <Btn kind="inset" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={csv}>Download CSV</Btn>
              <button type="button" aria-label="Close" onClick={() => setFull(false)} style={{ width: 28, height: 28, border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="Close" /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {flags}
              {view === 'rows' ? <ByRowTable bom={bom} /> : <BomTable bom={bom} picked={picked} onPick={pick} wide />}
            </div>
          </div>
        </div>,
        root,
      )}
    </div>
  )
}
