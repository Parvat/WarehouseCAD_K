import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { computeBom, bomCsv, bomGroups, byRowTable, qtyText, rowsText } from '../utils/bom'
import { bomXlsx } from '../export/bomXlsx'
import { useLayoutCheck } from '../utils/layoutCheck'
import { rackFootprint } from '../generate/rackFootprint'
import { colorOf } from '../utils/sectionAreas'
import { C, MONO, Note, Btn, Sec } from './cardParts'
import { Icon } from './Icon'
import { openTally, useBomCards, cardOpen } from './tally'

/* The BOM tab (right card, beside Properties and Elevations): the layout's bill of materials (utils/bom.js) — its
   flags first in the warning style; the buttons Tally · xlsx · CSV; then the Total card (every part of the layout),
   then one card per drawn section (its colour, name, rows R… · N lines; a click on its header collapses or expands it —
   the first open, the rest collapsed, remembered per layout), Unassigned last when it holds racks. A part on one line
   ("Frame 21 ft x 42 in"), its quantity on the right; beams with their pairs beside ("18 (9 pr)"). A click on a part
   shades the racks it comes from on the plan (Check layout's highlight: it stays until the next click on the canvas);
   again, it goes. Tally opens the drawer at the bottom of the canvas (studio/TallyDrawer.jsx); its Pop out the wide
   modal (the Summary / By row tables below). xlsx saves the By row table, CSV the Summary. */

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
export const baseName = (name) => String(name || 'warehouse-layout').replace(/\.(wcad|pdf)$/i, '')

/** A part on one line: "Frame 21 ft x 42 in", "Beam 96 in x 4 in face", "Row spacer 9 in flue", "Anchor". */
const words = (s) => s.replace(/(\d+(?:\.\d+)?)′-(\d+(?:\.\d+)?)″/g, '$1 ft $2 in').replace(/(\d+(?:\.\d+)?)′/g, '$1 ft').replace(/(\d+(?:\.\d+)?)″/g, '$1 in').replace(/ × /g, ' x ')
const SHORT = { 'Upright frame': 'Frame' }
export const partName = (l) => [SHORT[l.part] || l.part, l.size ? words(l.size) : ''].filter(Boolean).join(' ')
const n = (v) => v.toLocaleString('en-US')

/** The BOM table of the wide modal (Summary): part, size, qty, grouped — each section, then the Total. */
export function BomTable({ bom, picked, onPick, wide = false }) {
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
                <tr key={key} data-bom-line={l.key} data-bom-group={g.id} data-part={l.part} data-size={l.size} data-qty={l.qty} data-pairs={l.part === 'Beam' ? l.pairs : undefined}
                  aria-selected={on} className="st-hov" title="Show its racks on the plan" onClick={() => onPick({ ...l, key })}
                  style={{ cursor: 'pointer', background: on ? C.active : undefined }}>
                  <td style={{ ...cell, color: first ? C.strong : 'transparent', fontWeight: first ? 500 : 400 }}>{l.part}</td>
                  <td style={{ ...cell, fontFamily: MONO, color: C.text }}>{l.size || '—'}</td>
                  <td style={{ ...cell, fontFamily: MONO, color: C.strong, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {l.part === 'Beam'
                      ? <>{n(l.qty)}{' '}<span style={{ display: wide ? 'inline' : 'block', color: C.muted, fontSize: 11 }}>{qtyText(l).slice(n(l.qty).length + 1)}</span></>
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

/** The By row table of the wide modal: parts down, R1 … Rn across by section, each section's Total, the grand Total. */
export function ByRowTable({ bom }) {
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

/** A card's parts: one line each — the part on one line, its quantity on the right (beams with their pairs). */
function PartLines({ g, picked, onPick }) {
  if (!g.lines.length) return <span style={{ color: C.muted, fontSize: 12, padding: '0 12px 10px' }}>No racks</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 4px 6px' }}>
      {g.lines.map(l => {
        const key = g.id + '|' + l.key, on = picked === key, name = partName(l)
        return (
          <button key={key} type="button" data-bom-line={l.key} data-bom-group={g.id} data-part={l.part} data-size={l.size} data-qty={l.qty} data-pairs={l.part === 'Beam' ? l.pairs : undefined}
            aria-pressed={on} className="st-hov" title={`${name} · show its racks on the plan`} onClick={() => onPick({ ...l, key })}
            style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, padding: '5px 8px', border: 0, borderRadius: 6, background: on ? C.select + '55' : 'transparent', color: C.text, fontSize: 12, textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ fontFamily: MONO, color: C.strong, whiteSpace: 'nowrap' }}>
              {n(l.qty)}{l.part === 'Beam' && <span style={{ color: C.muted }}> ({n(l.pairs)} pr)</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const range = (rows) => [rows.length ? rowsText(rows) : null, `${rows.length} line${rows.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')

export function BomTab() {
  const { objects, T, gs, filename } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gs: s.gridSize || 40, filename: s.currentFilename })))
  const bom = useMemo(() => computeBom(objects, T, { gridSize: gs }), [objects, T, gs])
  const hl = useLayoutCheck(s => s.highlight)
  const picked = hl?.kind === 'bom' ? hl.key : null
  const cards = useBomCards(s => s.cards), layout = filename || ''
  const pick = (l) => highlightLine(l, objects)
  const total = bomGroups(bom).find(g => g.total)
  const sections = bom.hasSections ? bom.sections : []
  const csv = () => downloadCsv(bom, baseName(filename) + '-bom.csv')
  const xlsx = () => downloadXlsx(bom, baseName(filename) + '-bom.xlsx', baseName(filename))
  const small = { height: 28, padding: '0 10px', fontSize: 12 }
  return (
    <div role="tabpanel" aria-label="BOM" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Sec>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Btn kind="primary" style={small} onClick={openTally} disabled={!bom.lines.length}>Tally</Btn>
          <Btn kind="inset" style={small} aria-label="Download xlsx" title="Download xlsx" onClick={xlsx} disabled={!bom.lines.length}>xlsx</Btn>
          <Btn kind="inset" style={small} aria-label="Download CSV" title="Download CSV" onClick={csv} disabled={!bom.lines.length}>CSV</Btn>
        </div>
        {bom.flags.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bom.flags.map(f => <Note key={f.key} level="warning" role="alert" data-bom-flag={f.key}>{f.text}</Note>)}
          </div>
        )}
        {bom.lines.length
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* the Total: every part of the layout */}
              <section data-bom-card="total" aria-label="Total parts" style={{ borderRadius: 8, background: C.active, minWidth: 0 }}>
                <div data-bom-group-head="total" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 12px 6px' }}>
                  <span style={{ flex: 1, color: C.strong, fontWeight: 600, fontSize: 13 }}>Total</span>
                  <span data-bom-rows style={{ color: C.muted, fontSize: 11, whiteSpace: 'nowrap' }}>{range(total.rows)}</span>
                </div>
                <PartLines g={total} picked={picked} onPick={pick} />
              </section>
              {sections.map((g, i) => {
                const open = cardOpen(cards, layout, g.id, i === 0)
                const sw = colorOf(objects.find(o => o.id === g.id))?.c
                return (
                  <section key={g.id} data-bom-card={g.id} aria-label={`${g.name} parts`} style={{ borderRadius: 8, border: '1px solid #323835', overflow: 'hidden', minWidth: 0 }}>
                    <button type="button" data-bom-group-head={g.id} aria-expanded={open} title={open ? 'Collapse' : 'Expand'}
                      onClick={() => useBomCards.getState().setOpen(layout, g.id, !open)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 12px', border: 0, background: '#252A27', color: C.strong, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
                      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: sw || 'transparent', border: sw ? 'none' : `1px solid ${C.faint}` }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12 }}>{g.name}</span>
                      <span data-bom-rows style={{ color: C.muted, fontSize: 11, whiteSpace: 'nowrap' }}>{range(g.rows)}</span>
                      <span aria-hidden style={{ display: 'flex', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}><Icon name="Chevron" size={12} color={C.muted} /></span>
                    </button>
                    {open && <div style={{ paddingTop: 6 }}><PartLines g={g} picked={picked} onPick={pick} /></div>}
                  </section>
                )
              })}
            </div>
          : <span style={{ color: C.muted, fontSize: 12 }}>No selective or back-to-back racks yet.</span>}
        <span style={{ color: C.muted, fontSize: 11 }}>Selective and back-to-back racking · quantities only. Click a line to see its racks.</span>
      </Sec>
    </div>
  )
}
