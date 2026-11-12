import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { computeBom, byRowTable, rowsText, partShort, sizeWords } from '../utils/bom'
import { rackLinesNow } from '../utils/rackLines'
import { useLayoutCheck } from '../utils/layoutCheck'
import { C, MONO, Note, Btn, Seg } from './cardParts'
import { Icon } from './Icon'
import { useViewPrefs } from './viewPrefs'
import { BomTable, ByRowTable, highlightLine, downloadCsv, downloadXlsx, baseName, PART_CELL, SIZE_CELL } from './BomTab'
import { setTallyFocus, setTallied, clearTallied, checkedNos } from './tally'
import { useTally, closeTally, popOutTally, closeTallyModal, TALLY_LEFT, TALLY_RIGHT, TALLY_BOTTOM, TALLY_ISLAND_GAP, selectedLineNos, useShownTallyH } from './tally'

/* The Tally (STUDIO.md §1, §7a BOM): the BOM tab's Tally opens a drawer docked at the bottom of the canvas — full width,
   left 16 to right 16 (the right card ends 12px above it), its height dragged by its top edge (200 … 70% of the window, 330 at first),
   remembered; island style, radius 10. Header: Tally · Summary / By row · the hint · Pop out (the wide modal, below) ·
   xlsx · ✕; Esc closes it. By row: the section labels over their rows (LEFT · R1–R9), the Bays row then the parts down (Part | Size), R1 … across (compact, min 36px), a
   Total per section and the grand Total (highlighted); it scrolls sideways, Part and Size stay. Linked to the plan
   (canvas2/TallyHighlight.jsx): an R column under the pointer lights its line on the plan with a tag (R6 · 12 bays ·
   48 positions); a click on a rack on the plan lights its column and scrolls it into view; a click on a section's Total
   column lights all its racks. The plan stays usable above it; on opening the plan fits into the room above it, and
   the R labels show while it is open. */

const HL = C.select, HL_BG = C.select + '40'
/* a tallied column: dimmed, a green tick in its header (tally-2) */
const TICK = '#2E7D5B', DIM = 0.4

/** The drawer's By row table: the Bays row, then the parts; Part | Size fixed while the R columns scroll; compact R
 *  columns (min 36 px) so more lines fit before it scrolls. */
function TallyTable({ bom, scrollRef, lineOf, checked }) {
  const { groups, parts } = useMemo(() => byRowTable(bom), [bom])
  const { hover, cols, section } = useTally(useShallow(s => ({ hover: s.hover, cols: s.cols, section: s.section })))
  const { setHover, setSection } = useTally.getState()
  const many = bom.hasSections
  // the fixed columns' offsets, measured: Size sits right of Part, the second header row under the first
  const partRef = useRef(null), headRef = useRef(null)
  const [fix, setFix] = useState({ size: 0, top: 0 })
  useLayoutEffect(() => {
    const size = partRef.current?.offsetWidth || 0, top = headRef.current?.offsetHeight || 0
    if (size !== fix.size || top !== fix.top) setFix({ size, top })
  })
  const lit = (no) => hover === no || cols.includes(no) || (section && section.nos.includes(no))
  const cell = { padding: '5px 6px', minWidth: 36, fontSize: 12, borderTop: `1px solid ${C.divider}`, fontFamily: MONO, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }
  const head = { ...cell, borderTop: 'none', color: C.muted, fontSize: 11, fontFamily: 'inherit', fontWeight: 500, position: 'sticky', top: 0, background: C.island, zIndex: 1 }
  const stick = (left, edge) => ({ position: 'sticky', left, zIndex: 2, background: C.island, minWidth: 0, padding: '5px 10px', ...(edge ? { borderRight: `1px solid ${C.divider}` } : null) })
  const grand = { ...cell, padding: '5px 10px', color: C.accent, fontWeight: 600, background: C.active }
  const sum = (on) => ({ ...cell, padding: '5px 8px', color: C.strong, fontWeight: 600, background: on ? HL_BG : C.inset, cursor: 'pointer' })
  const rowCell = (no, extra) => (lit(no) ? { ...extra, background: HL_BG, color: C.strong } : extra)
  const pickSection = (g) => setSection(section?.id === g.id ? null : { id: g.id, nos: g.rows })
  const groupLabel = (g) => (many ? g.name : 'Total').toUpperCase() + ' · ' + rowsText(g.rows)
  return (
    <div ref={scrollRef} style={{ overflow: 'auto', flex: 1, minHeight: 0 }} onMouseLeave={() => setHover(null)}>
      <table aria-label="Tally by row" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead>
          <tr ref={headRef}>
            <th colSpan={2} style={{ ...head, ...stick(0, true), zIndex: 3 }} />
            {groups.map(g => <th key={g.id} colSpan={g.rows.length + (many ? 1 : 0)} data-tally-section={g.id}
              style={{ ...head, textAlign: 'left', color: C.muted, fontSize: 10.5, letterSpacing: '.06em', fontWeight: 600, borderBottom: `1px solid ${C.separator}` }}>{groupLabel(g)}</th>)}
            <th style={head} />
          </tr>
          <tr>
            <th ref={partRef} data-tally-fixed style={{ ...head, ...stick(0), zIndex: 3, top: fix.top, textAlign: 'left' }}>Part</th>
            <th data-tally-fixed style={{ ...head, ...stick(fix.size, true), zIndex: 3, top: fix.top, textAlign: 'left' }}>Size</th>
            {groups.map(g => [
              ...g.rows.map(no => (
                <th key={'r' + no} data-tally-col={no} data-tallied={checked.has(no) || undefined} aria-selected={lit(no)} onMouseEnter={() => setHover(no)} title={`R${no} — hover to see it on the plan`}
                  style={rowCell(no, { ...head, top: fix.top, cursor: 'default', ...(lit(no) ? { color: C.strong, boxShadow: `inset 0 -2px 0 ${HL}` } : null) })}>
                  {/* the tallied mark: checked off, the column dims and the line gets a tick on the plan (saved with the layout) */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <button type="button" role="checkbox" aria-checked={checked.has(no)} aria-label={`Tallied R${no}`} title={checked.has(no) ? 'Tallied — click to uncheck' : 'Mark this line tallied'}
                      onClick={(e) => { e.stopPropagation(); const l = lineOf(no); if (l) setTallied(useCanvasStore, l, !checked.has(no)) }}
                      style={{ width: 13, height: 13, padding: 0, border: `1px solid ${checked.has(no) ? TICK : C.faint}`, borderRadius: 3, background: checked.has(no) ? TICK : 'transparent', color: '#FFFFFF', fontSize: 9, lineHeight: '11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {checked.has(no) ? '✓' : ''}
                    </button>
                    R{no}
                  </span>
                </th>
              )),
              ...(many ? [<th key={'t' + g.id} data-tally-total={g.id} aria-selected={section?.id === g.id} onClick={() => pickSection(g)} title={`Show every rack of ${g.name} on the plan`}
                style={{ ...head, top: fix.top, padding: '5px 8px', color: C.strong, cursor: 'pointer', ...(section?.id === g.id ? { boxShadow: `inset 0 -2px 0 ${HL}` } : null) }}>Total</th>] : []),
            ])}
            <th style={{ ...head, top: fix.top, padding: '5px 10px', color: C.accent, background: C.active }}>{many ? 'Grand total' : 'Total'}</th>
          </tr>
        </thead>
        <tbody>
          {parts.map(p => (
            <tr key={p.key} data-tally-part={p.key}>
              <td style={{ ...cell, ...PART_CELL, ...stick(0) }}>{partShort(p.part)}</td>
              <td style={{ ...cell, ...SIZE_CELL, ...stick(fix.size, true) }}>{sizeWords(p.size)}</td>
              {groups.map(g => [
                ...g.rows.map(no => <td key={'r' + no} data-row={no} onMouseEnter={() => setHover(no)} style={rowCell(no, { ...cell, color: p.cells[no] ? C.text : C.faint, ...(checked.has(no) ? { opacity: DIM } : null) })}>{p.cells[no] || 0}</td>),
                ...(many ? [<td key={'t' + g.id} data-section-total={g.id} onClick={() => pickSection(g)} style={sum(section?.id === g.id)}>{p.totals[g.id] || 0}</td>] : []),
              ])}
              <td data-grand-total style={grand}>{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Drawer({ bom, flags, xlsx }) {
  // (drawn no taller than leaves the right card 360px — tally.js shownTallyH; fixes-x)
  const view = useTally(s => s.view), height = useShownTallyH()
  const scrollRef = useRef(null)
  // a click on a rack on the plan: its column(s) lit and scrolled into view
  useEffect(() => {
    let last = null
    const run = (st) => {
      if (st.selectedIds === last) return
      last = st.selectedIds
      const nos = selectedLineNos(st, rackLinesNow(st.objects, st.gridSize || 40))
      useTally.getState().setCols(nos)
      if (!nos.length) return
      requestAnimationFrame(() => scrollRef.current?.querySelector(`th[data-tally-col="${nos[0]}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' }))
    }
    run(useCanvasStore.getState())
    return useCanvasStore.subscribe(run)
  }, [])
  // its top edge dragged: the height, rAF-coalesced, written on release
  const startEdge = (ev) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    const y0 = ev.clientY, h0 = height
    let raf = 0, last = h0
    const move = (m) => { last = h0 + (y0 - m.clientY); if (!raf) raf = requestAnimationFrame(() => { raf = 0; useTally.getState().setHeight(last, { save: false }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cancelAnimationFrame(raf); useTally.getState().setHeight(last) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const small = { height: 28, padding: '0 10px', fontSize: 12 }
  const { objects, gs, T } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40, T: s.elevations })))
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  const checked = useMemo(() => checkedNos(objects, lines, T), [objects, lines, T])
  const lineOf = (no) => lines.find(l => l.no === no) || null
  const total = bom.rows.length, done = bom.rows.filter(r => checked.has(r.no)).length
  const focus = useTally(s => s.focus)
  return (
    <div className="st-island" role="region" aria-label="Tally" data-tally-drawer data-card-dark
      style={{ left: TALLY_LEFT, right: TALLY_RIGHT, bottom: TALLY_BOTTOM, height, flexDirection: 'column', alignItems: 'stretch', borderRadius: 10, overflow: 'hidden' }}>
      <div role="separator" aria-orientation="horizontal" aria-label="Resize tally" title="Drag to resize" onPointerDown={startEdge}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, cursor: 'row-resize', zIndex: 5, touchAction: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px', borderBottom: `1px solid ${C.divider}`, flexShrink: 0, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.strong }}>Tally</span>
        <div style={{ width: 160, flexShrink: 0 }}>
          <Seg aria="Tally view" value={view} onChange={useTally.getState().setView} options={[{ value: 'summary', label: 'Summary' }, { value: 'rows', label: 'By row' }]} />
        </div>
        <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Hover a column or click a rack to match them</span>
        <span data-tally-count style={{ color: done ? TICK : C.muted, fontSize: 12, whiteSpace: 'nowrap', fontFamily: MONO }}>{done} / {total} checked</span>
        <Btn kind="inset" style={small} onClick={() => clearTallied(useCanvasStore)} disabled={!done}>Clear checks</Btn>
        <Btn kind="inset" style={{ ...small, ...(focus ? { background: C.active, color: C.accent } : null) }} aria-pressed={focus} title={focus ? 'Restore (Esc)' : 'Hide the rest of the chrome'} onClick={() => setTallyFocus(!focus)}>Focus</Btn>
        <Btn kind="inset" style={small} onClick={popOutTally}>Pop out</Btn>
        <Btn kind="inset" style={small} aria-label="Download xlsx" title="Download xlsx" onClick={xlsx}>xlsx</Btn>
        <button type="button" aria-label="Close tally" title="Close (Esc)" onClick={closeTally}
          style={{ width: 28, height: 28, border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="Close" /></button>
      </div>
      {flags && <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>{flags}</div>}
      {view === 'rows'
        ? <TallyTable bom={bom} scrollRef={scrollRef} lineOf={lineOf} checked={checked} />
        : <div ref={scrollRef} style={{ overflow: 'auto', flex: 1, minHeight: 0, padding: '4px 16px 12px' }}><SummaryTable bom={bom} /></div>}
    </div>
  )
}

function SummaryTable({ bom }) {
  const objects = useCanvasStore(s => s.objects)
  const hl = useLayoutCheck(s => s.highlight)
  return <BomTable bom={bom} picked={hl?.kind === 'bom' ? hl.key : null} onPick={(l) => highlightLine(l, objects)} wide />
}

/** The wide modal (the drawer's Pop out): Summary / By row, Download xlsx · Download CSV; Esc or ✕ closes it. */
function Modal({ bom, flags, xlsx, csv }) {
  const [view, setView] = useState('summary')
  const root = document.querySelector('[data-theme]') || document.body
  return createPortal(
    <div data-bom-modal style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgb(15 18 16 / .55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onMouseDown={e => { if (e.target === e.currentTarget) closeTallyModal() }}>
      <div role="dialog" aria-label="Bill of materials" data-card-dark style={{ width: view === 'rows' ? 'min(1400px, 100%)' : 'min(960px, 100%)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', background: '#1F2321', border: '1px solid #323835', borderRadius: 12, boxShadow: '0 18px 60px rgba(0,0,0,.35)', color: C.text, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${C.divider}` }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.strong, flex: 1 }}>Bill of materials</span>
          <div style={{ width: 180 }}>
            <Seg aria="BOM view" value={view} onChange={setView} options={[{ value: 'summary', label: 'Summary' }, { value: 'rows', label: 'By row' }]} />
          </div>
          <Btn kind="inset" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={xlsx}>Download xlsx</Btn>
          <Btn kind="inset" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={csv}>Download CSV</Btn>
          <button type="button" aria-label="Close" onClick={closeTallyModal} style={{ width: 28, height: 28, border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="Close" /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {flags}
          {view === 'rows' ? <ByRowTable bom={bom} /> : <SummaryTable bom={bom} />}
        </div>
      </div>
    </div>,
    root,
  )
}

/** Always mounted (StudioFrame): the drawer or the modal, whichever is open; the R labels shown while either is. */
export function TallyHost() {
  const { open, modal } = useTally(useShallow(s => ({ open: s.open, modal: s.modal })))
  const { objects, T, gs, filename } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gs: s.gridSize || 40, filename: s.currentFilename })))
  const any = open || modal
  const bom = useMemo(() => (any ? computeBom(objects, T, { gridSize: gs }) : null), [any, objects, T, gs])
  useEffect(() => { useViewPrefs.getState().setBomFull(any); return () => useViewPrefs.getState().setBomFull(false) }, [any])
  // the bottom islands stand above the open drawer: Hub · zoom, the tool pill and the notices 8px; View · Layers · Fit · ?
  // 12px, at the right (the right card ends 12px above it: StudioFrame RightCard)
  const height = useShownTallyH()
  useEffect(() => {
    const root = document.querySelector('[data-theme]') || document.documentElement
    root.style.setProperty('--tally-lift', open ? `${height + 8}px` : '0px')
    root.style.setProperty('--tally-island-lift', open ? `${height + TALLY_ISLAND_GAP}px` : '0px')
    return () => { root.style.setProperty('--tally-lift', '0px'); root.style.setProperty('--tally-island-lift', '0px') }
  }, [open, height])
  // Focus: the chrome hidden (studio.css [data-tally-focus])
  const focus = useTally(s => s.open && s.focus)
  useEffect(() => {
    const root = document.querySelector('[data-theme]') || document.documentElement
    if (focus) root.setAttribute('data-tally-focus', '1'); else root.removeAttribute('data-tally-focus')
    return () => root.removeAttribute('data-tally-focus')
  }, [focus])
  useEffect(() => {
    if (!any) return
    // Esc: the modal closes (and nothing else hears it); the drawer closes
    const k = (e) => {
      if (e.key !== 'Escape') return
      if (useTally.getState().modal) { e.stopImmediatePropagation(); closeTallyModal(); return }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return
      // in Focus, Esc restores the chrome first; again, it closes the drawer
      if (useTally.getState().focus) { setTallyFocus(false); return }
      closeTally()
    }
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true)
  }, [any])
  if (!bom) return null
  const flags = bom.flags.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {bom.flags.map(f => <Note key={f.key} level="warning" role="alert" data-bom-flag={f.key}>{f.text}</Note>)}
    </div>
  )
  const csv = () => downloadCsv(bom, baseName(filename) + '-bom.csv')
  const xlsx = () => downloadXlsx(bom, baseName(filename) + '-bom.xlsx', baseName(filename))
  return modal ? <Modal bom={bom} flags={flags} xlsx={xlsx} csv={csv} /> : <Drawer bom={bom} flags={flags} xlsx={xlsx} />
}
