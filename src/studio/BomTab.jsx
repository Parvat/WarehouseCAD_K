import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { computeBom, bomCsv } from '../utils/bom'
import { useLayoutCheck } from '../utils/layoutCheck'
import { rackFootprint } from '../generate/rackFootprint'
import { C, MONO, Note, Btn, Sec } from './cardParts'
import { Icon } from './Icon'

/* The BOM tab (right card, beside Properties and Elevations): the layout's bill of materials (utils/bom.js) — its
   flags first in the warning style, then the lines grouped by part (part, size, qty). A click on a line shades the
   racks it comes from on the plan (Check layout's highlight: it stays until the next click on the canvas); again, it
   goes. Full view opens the same table wide (a modal, STUDIO.md §1); Download CSV saves it. */

const SELECT = '#2E7D5B'
/** Outline the racks of BOM line `line` on the plan (or clear it when it is the one outlined). */
export function highlightLine(line, objects) {
  const hl = useLayoutCheck.getState().highlight
  if (!line || (hl?.kind === 'bom' && hl.key === line.key)) { useLayoutCheck.setState({ highlight: null }); return }
  const ids = new Set(line.ids)
  const shapes = objects.filter(o => ids.has(o.id)).map(r => { const f = rackFootprint(r); return { x: f.x, y: f.y, w: f.w, h: f.h, color: SELECT, mode: 'fill' } })
  useLayoutCheck.setState({ highlight: { shapes, at: Date.now(), kind: 'bom', key: line.key } })
}
/** Save the BOM as a CSV file (part, size, qty; the flags as # comment lines). */
export function downloadCsv(bom, filename) {
  const blob = new Blob([bomCsv(bom)], { type: 'text/csv' }), url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const csvName = (name) => `${String(name || 'warehouse-layout').replace(/\.(wcad|pdf)$/i, '')}-bom.csv`

function BomTable({ bom, picked, onPick, wide = false }) {
  const cell = { padding: wide ? '7px 10px' : '6px 8px', fontSize: wide ? 13 : 12, borderTop: `1px solid ${C.divider}`, verticalAlign: 'top' }
  const head = { ...cell, borderTop: 'none', color: C.muted, fontSize: 11, fontWeight: 500, textAlign: 'left' }
  let last = null
  return (
    <table aria-label={wide ? 'Bill of materials, full view' : 'Bill of materials'} style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th style={head}>Part</th><th style={head}>Size</th><th style={{ ...head, textAlign: 'right' }}>Qty</th></tr></thead>
      <tbody>
        {bom.lines.map(l => {
          const first = l.part !== last; last = l.part
          const on = picked === l.key
          return (
            <tr key={l.key} data-bom-line={l.key} aria-selected={on} className="st-hov" title="Show its racks on the plan" onClick={() => onPick(l)}
              style={{ cursor: 'pointer', background: on ? C.active : undefined }}>
              <td style={{ ...cell, color: first ? C.strong : 'transparent', fontWeight: first ? 500 : 400 }}>{l.part}</td>
              <td style={{ ...cell, fontFamily: MONO, color: C.text }}>{l.size || '—'}</td>
              <td style={{ ...cell, fontFamily: MONO, color: C.strong, textAlign: 'right' }}>{l.qty.toLocaleString('en-US')}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function BomTab() {
  const { objects, T, gs, filename } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gs: s.gridSize || 40, filename: s.currentFilename })))
  const bom = useMemo(() => computeBom(objects, T, { gridSize: gs }), [objects, T, gs])
  const hl = useLayoutCheck(s => s.highlight)
  const picked = hl?.kind === 'bom' ? hl.key : null
  const [full, setFull] = useState(false)
  const pick = (l) => highlightLine(l, objects)
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
  const root = typeof document !== 'undefined' ? document.querySelector('[data-theme]') || document.body : null
  return (
    <div role="tabpanel" aria-label="BOM" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Sec>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Btn kind="inset" style={{ height: 28, padding: '0 8px', fontSize: 12 }} onClick={() => setFull(true)} disabled={!bom.lines.length}>Full view</Btn>
          <Btn kind="inset" style={{ height: 28, padding: '0 8px', fontSize: 12 }} onClick={() => downloadCsv(bom, csvName(filename))} disabled={!bom.lines.length}>Download CSV</Btn>
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
          <div role="dialog" aria-label="Bill of materials" data-card-dark style={{ width: 'min(960px, 100%)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', background: '#1F2321', border: '1px solid #323835', borderRadius: 12, boxShadow: '0 18px 60px rgba(0,0,0,.35)', color: C.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${C.divider}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.strong, flex: 1 }}>Bill of materials</span>
              <Btn kind="inset" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => downloadCsv(bom, csvName(filename))}>Download CSV</Btn>
              <button type="button" aria-label="Close" onClick={() => setFull(false)} style={{ width: 28, height: 28, border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="Close" /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {flags}
              <BomTable bom={bom} picked={picked} onPick={pick} wide />
            </div>
          </div>
        </div>,
        root,
      )}
    </div>
  )
}
