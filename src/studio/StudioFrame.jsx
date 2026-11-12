import { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { generateBlocked } from '../utils/sectionEdit'
import { regenBuilding } from '../generate/regenerate'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutCheck, runLayoutCheck, checkLabel, exportWithCheck, shownCheck } from '../utils/layoutCheck'
import { ExportCheckDialog } from '../components/RightPanel/LayoutCheckPanel'
import { RulesPanel } from '../components/Rules/RulesPanel'
import { LayoutMenu, doZoom } from '../components/Toolbar/TopBar'
import { RightPanelTabs } from '../components/RightPanel/index'
import { GeneratePanel } from '../components/Generate/GeneratePanel'
import { useRightPanel, setRightPanel } from '../utils/rightPanel'
import { useColumnCheck } from '../generate/useColumnCheck'
import { useElevView, setShowColors } from '../utils/elevationDraw'
import { useViewPrefs, fitRef, CARD_W } from './viewPrefs'
import { TallyHost } from './TallyDrawer'
import { useShownTallyH, TALLY_BOTTOM, TALLY_ISLAND_GAP, ISLAND_H, TALLY_CARD_GAP } from './tally'
import { useElevTab } from '../utils/elevTab'
import { Icon } from './Icon'
import { CheckCard } from './cards'
import { Toggle } from './cardParts'
import { lineNumbering, setLineNumbering } from '../utils/lineNames'
import { LayerBody } from '../components/RightPanel/LayerPanel'
import { useHelp, toggleHelp, closeHelp, HelpBody } from './HelpCard'

/* The Studio frame (STUDIO.md §1; every value from design/studio/Studio.dc.html, screen C1): the canvas fills the
   window and these islands float on it — top-left (logo, project name ▾, Auto-saved), top-right (undo, redo,
   Generate / Regenerate, Check with its count chip, Export), the right card (300 wide, top 76, as tall as its content
   down to 76px above the bottom, then it scrolls inside; Properties / Elevations, or Generate), bottom-left (Hub,
   zoom) and bottom-right (Aisles, Checks, Elevations, Fit). The rail, its flyout and the tool pill are the library's
   (components/LeftPanel/FloatingToolbar.jsx, studio mode). */

const RACK = /^rack_/

/* a transparent island button: 32 (top bar) or 30 (bottom bars) square or padded, radius 6 */
const ghost = (extra) => ({ border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', ...extra })

function TopLeft({ onHub }) {
  const name = useCanvasStore(s => s.currentFilename)
  const [menu, setMenu] = useState(false)
  const rules = useViewPrefs(s => s.rulesOpen), setRules = useViewPrefs.getState().setRulesOpen
  const wrap = useRef(null)
  useEffect(() => {
    if (!menu) return
    const down = (e) => { if (!wrap.current?.contains(e.target)) setMenu(false) }
    const key = (e) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [menu])
  return (
    <div ref={wrap}>
      <div className="st-island" data-island="top-left" style={{ left: 16, top: 16, height: 44, gap: 10, padding: '0 12px 0 14px' }}>
        <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0l6 6-6 6-6-6z" fill="#7BD3A4" /></svg>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Trace</span>
        <span style={{ width: 1, height: 18, background: '#3A403C' }} />
        <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="Layout menu" onClick={() => setMenu(m => !m)}
          style={ghost({ height: 30, gap: 6, padding: '0 8px', fontSize: 13, color: '#E8EAE6' })}>
          {name || 'Untitled layout'}<Icon name="Chevron" size={12} color="#9AA29C" />
        </button>
        <span style={{ height: 22, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 6, background: '#2A2F2C', color: '#9AA29C', fontSize: 12 }}>Auto-saved</span>
      </div>
      {menu && <LayoutMenu style={{ left: 120, top: 66 }} onClose={() => setMenu(false)} onRules={() => setRules(true)} onHub={onHub} />}
      {rules && <RulesPanel onClose={() => setRules(false)} />}
    </div>
  )
}

/* Check's count: errors in the mockup's chip colours, warnings in the warning level's; none when clean */
function CheckChip() {
  // the items marked as OK don't count (utils/layoutCheck.js shownCheck)
  const T = useCanvasStore(s => s.elevations)
  const result = shownCheck(useLayoutCheck(s => s.result), T)
  const e = result ? result.errors.length : 0, w = result ? result.warnings.length : 0
  if (!e && !w) return null
  const c = e ? { bg: '#5A2A20', fg: '#FFB4A3', n: e } : { bg: '#3A2E17', fg: '#F2C77A', n: w }
  return <span data-check-chip={e ? 'error' : 'warning'} style={{ height: 18, padding: '0 6px', borderRadius: 9, background: c.bg, color: c.fg, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, display: 'flex', alignItems: 'center' }}>{c.n}</span>
}

function TopRight() {
  const { undo, redo, exportAsPDF, hasRacks } = useCanvasStore(useShallow(s => ({ undo: s.undo, redo: s.redo, exportAsPDF: s.exportAsPDF, hasRacks: s.objects.some(o => RACK.test(o.type || '')) })))
  // 2 or more sections in the building: Generate is off — each section is filled with Fill racking (STUDIO.md §7a Sections)
  const blocked = useCanvasStore(s => generateBlocked(s.objects, regenBuilding(s.objects)))
  const T = useCanvasStore(s => s.elevations)
  const result = shownCheck(useLayoutCheck(s => s.result), T)
  const card = useViewPrefs(s => s.card)
  /* STUDIO.md §7: "Generate" on an empty plan, "Regenerate" when racks exist */
  const genLabel = hasRacks ? 'Regenerate' : 'Generate'
  const check = () => { useViewPrefs.getState().setCard('tabs'); setRightPanel({ tab: 'properties' }); runLayoutCheck(useCanvasStore) }
  return (
    <div className="st-island" data-island="top-right" style={{ right: 16, top: 16, height: 44, gap: 4, padding: '0 6px' }}>
      <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={undo} style={ghost({ width: 32, height: 32 })}><Icon name="Undo" /></button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" onClick={redo} style={ghost({ width: 32, height: 32 })}><Icon name="Redo" /></button>
      <span style={{ width: 1, height: 18, background: '#3A403C', margin: '0 4px' }} />
      <button type="button" aria-label={genLabel} aria-pressed={card === 'generate'} disabled={!!blocked} title={blocked || undefined} onClick={() => useViewPrefs.getState().setCard(card === 'generate' ? 'tabs' : 'generate')}
        style={ghost({ height: 32, padding: '0 10px', fontSize: 13, color: '#E8EAE6', gap: 6 })}>
        <Icon name="Generate" active />{genLabel}
      </button>
      <button type="button" aria-label={checkLabel(result)} title="List every problem in the layout — nothing is changed" onClick={check}
        style={ghost({ height: 32, padding: '0 10px', fontSize: 13, color: '#E8EAE6', gap: 8 })}>
        Check<CheckChip />
      </button>
      <ExportCheckDialog onExport={exportAsPDF} />
      <button type="button" className="st-primary" title="Export PDF" onClick={() => exportWithCheck(useCanvasStore, exportAsPDF)}
        style={{ height: 32, padding: '0 14px', border: 0, borderRadius: 6, background: '#7BD3A4', color: '#0F2A1F', fontSize: 13, fontWeight: 600 }}>Export</button>
    </div>
  )
}

/* The right card: Properties / Elevations (the existing panels, restyled in later steps), or Generate. */
function RightCard() {
  const card = useViewPrefs(s => s.card)
  const tab = useRightPanel(s => s.tab)
  /* Check layout open: the card is the check (C5) until its X — Generate, opened after, comes first */
  const checkOpen = useLayoutCheck(s => s.open && !!s.result)
  const seg = (on) => ({ flex: 1, height: 28, border: 0, borderRadius: 6, background: on ? '#3A403C' : 'transparent', fontSize: 13, fontWeight: on ? 500 : 400, color: on ? '#F2F4F1' : '#9AA29C' })
  /* the Elevations tab sizes its sheet from the room the card has (C2, C3); nothing in it scrolls the card itself */
  const full = card === 'tabs' && tab === 'elevations'
  /* its width: the left edge dragged (300–640), double-click back to 300 — remembered, the same for every tab (STUDIO.md
     §7); the grip shows on the edge's hover, and while an elevation is edited on the sheet (C21) */
  const cardW = useViewPrefs(s => s.cardW), onSheet = useElevTab(s => !!s.editing?.sheet)
  /* the Tally drawer open: the card ends 12px above the bottom-right island, which stands 12px above the drawer */
  // (drawn short enough that the card keeps 360px — tally.js shownTallyH; fixes-x)
  const tallyH = useShownTallyH()
  const [edgeHover, setEdgeHover] = useState(false)
  const startEdge = (ev) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    const x0 = ev.clientX, w0 = useViewPrefs.getState().cardW
    let raf = 0, last = w0
    const move = (m) => { last = w0 + (x0 - m.clientX); if (!raf) raf = requestAnimationFrame(() => { raf = 0; useViewPrefs.getState().setCardW(last, { save: false }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cancelAnimationFrame(raf); useViewPrefs.getState().setCardW(last) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div className="st-island" aria-label="Right panel" data-island="right-card" style={{
      right: 16, top: 76, width: cardW, maxHeight: tallyH ? `calc(100vh - ${76 + TALLY_BOTTOM + tallyH + TALLY_ISLAND_GAP + ISLAND_H + TALLY_CARD_GAP}px)` : 'calc(100vh - 152px)',
      flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden',
    }}>
      {/* the left edge: a 6px strip to drag, the 3×32 grip */}
      <div role="separator" aria-orientation="vertical" aria-label="Resize right panel" title="Drag to widen · double-click to reset"
        onPointerDown={startEdge} onDoubleClick={() => useViewPrefs.getState().setCardW(CARD_W)} onPointerEnter={() => setEdgeHover(true)} onPointerLeave={() => setEdgeHover(false)}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}>
        {(edgeHover || onSheet) && <span aria-hidden style={{ width: 3, height: 32, borderRadius: 2, background: '#4A514D' }} />}
      </div>
      {card === 'tabs' && checkOpen
        ? <div data-card-dark style={{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}><CheckCard /></div>
        : card === 'generate'
        ? <div data-card-dark style={{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* C4: its X and Cancel go back to the card that was showing (Properties / Elevations, or the check) */}
            <GeneratePanel embedded onClose={() => useViewPrefs.getState().setCard('tabs')} />
          </div>
        : <>
            <div style={{ padding: 8, flexShrink: 0 }}>
              <div role="tablist" aria-label="Right panel tabs" style={{ display: 'flex', padding: 3, borderRadius: 8, background: '#2A2F2C' }}>
                <button type="button" role="tab" aria-selected={tab === 'properties'} style={seg(tab === 'properties')} onClick={() => setRightPanel({ tab: 'properties' })}>Properties</button>
                <button type="button" role="tab" aria-selected={tab === 'elevations'} style={seg(tab === 'elevations')} onClick={() => setRightPanel({ tab: 'elevations' })}>Elevations</button>
                <button type="button" role="tab" aria-selected={tab === 'bom'} style={seg(tab === 'bom')} onClick={() => setRightPanel({ tab: 'bom' })}>BOM</button>
              </div>
            </div>
            {/* Properties: the Studio card contents (src/studio/cards.jsx, cardParts.jsx); Elevations: the sheet, then
                the list or the editor (components/Elevations/ElevationsTab.jsx — C2, C3) */}
            {/* (fixes-x: with the Tally drawer open the card always scrolls inside — the Elevations tab too, so an elevation is
                edited however short the card) */}
            <div data-card-dark style={{ flex: '0 1 auto', minHeight: 0, overflowY: full && !tallyH ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
              <RightPanelTabs tab={tab} />
            </div>
          </>}
    </div>
  )
}

function BottomLeft({ onHub }) {
  const zoom = useCanvasStore(s => s.zoom)
  return (
    <div className="st-island" data-island="bottom-left" style={{ left: 16, bottom: 'calc(20px + var(--tally-lift, 0px))', height: 40, gap: 2, padding: '0 4px' }}>
      <button type="button" title="Back to hub" onClick={onHub} style={ghost({ height: 30, padding: '0 10px', fontSize: 13, color: '#C9CEC9' })}>Hub</button>
      <span style={{ width: 1, height: 18, background: '#3A403C' }} />
      <button type="button" aria-label="Zoom out" onClick={() => doZoom(0.85)} style={ghost({ width: 30, height: 30, color: '#C9CEC9', fontSize: 16 })}>−</button>
      <span aria-label="Zoom" style={{ width: 44, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8EAE6' }}>{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => doZoom(1.18)} style={ghost({ width: 30, height: 30, color: '#C9CEC9', fontSize: 16 })}>+</button>
    </div>
  )
}

/* A small card over the bottom-right island (Layers, the shortcut sheet): closed by a click outside it and its button
   (`wrap`), or Esc — Esc is the card's alone while it is open (taken before the canvas's keys). */
function useCloses(open, close, wrap) {
  useEffect(() => {
    if (!open) return
    const down = (e) => { if (!wrap.current?.contains(e.target)) close() }
    const key = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close() } }
    document.addEventListener('mousedown', down); window.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true) }
  }, [open]) // eslint-disable-line
}
/* the cards above the bottom-right island: dark island style, radius 10, right-aligned with it */
const overIsland = (extra) => ({ right: 16, bottom: 'calc(68px + var(--tally-island-lift, 0px))', flexDirection: 'column', alignItems: 'stretch', borderRadius: 10, ...extra })

/* The bottom-right island (STUDIO.md §1): View · Layers · Fit · ?. View opens a card above it with the display switches —
   Aisle labels, Checks, Elevation colours, Section names, Row numbers (each remembered as before); Layers opens its own
   card, each layer's show toggle and padlock. A click outside or Esc closes either. While the Tally drawer is
   open it stands 12px above the drawer's top edge (--tally-island-lift: TallyDrawer.jsx), its cards with it. */
function BottomRight() {
  const showAisles = useCanvasStore(s => s.showAisles ?? true)
  const toggleAisles = useCanvasStore(s => s.toggleAisles)
  const { showMarks, setShowMarks } = useColumnCheck()
  const showColors = useElevView(s => s.showColors)
  const { sectionNames, setSectionNames, rowLabels, setRowLabels } = useViewPrefs(useShallow(s => ({ sectionNames: s.sectionNames, setSectionNames: s.setSectionNames, rowLabels: s.rowLabels, setRowLabels: s.setRowLabels })))
  const [view, setView] = useState(false), [layers, setLayers] = useState(false)
  const numbering = useCanvasStore(s => lineNumbering(s.elevations))
  const help = useHelp(s => s.open)
  const viewWrap = useRef(null), layersWrap = useRef(null), helpWrap = useRef(null)
  useCloses(view, () => setView(false), viewWrap)
  useCloses(layers, () => setLayers(false), layersWrap)
  useCloses(help, closeHelp, helpWrap)
  const tog = (on) => ({ height: 30, padding: '0 10px', border: 0, borderRadius: 6, background: on ? '#2E4A3C' : 'transparent', color: on ? '#7BD3A4' : '#C9CEC9', fontSize: 12 })
  const sw = (label, on, onClick, title) => (
    <div key={label} title={title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 30, padding: '0 6px', fontSize: 12, color: '#E8EAE6' }}>
      <span>{label}</span><Toggle on={on} onClick={onClick} label={label} />
    </div>
  )
  return (
    <div className="st-island" data-island="bottom-right" style={{ right: 16, bottom: 'calc(20px + var(--tally-island-lift, 0px))', height: 40, gap: 2, padding: '0 4px' }}>
      {/* View: the display switches, in a small card above (STUDIO.md §1) */}
      <span ref={viewWrap} style={{ display: 'flex' }}>
        <button type="button" aria-label="View" aria-haspopup="dialog" aria-expanded={view} aria-pressed={view} onClick={() => setView(o => !o)} style={tog(view)}>View</button>
        {view && (
          <div className="st-island" role="dialog" aria-label="View card" data-card-dark style={overIsland({ width: 232, padding: 8, gap: 2, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' })}>
            {sw('Aisle labels', showAisles, toggleAisles)}
            {sw('Checks', showMarks, () => setShowMarks(!showMarks))}
            {sw('Elevation colours', showColors, () => setShowColors(!showColors))}
            {sw('Section names', sectionNames, () => setSectionNames(!sectionNames), "The sections' legend — each section's colour and name, outside the building at its bottom-left")}
            {sw('Row numbers', rowLabels, () => setRowLabels(!rowLabels), 'The row numbers R1, R2 … at the row starts')}
            {/* the rack lines' numbering (utils/lineNames.js), saved with the layout — greyed while Row numbers is off
                (legend round: moved here from the BOM tab) */}
            <div data-view-numbering aria-disabled={!rowLabels} title={rowLabels ? 'Continuous: R1 … across the layout · Per section: each section from R1' : 'Turn Row numbers on to choose'}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 30, padding: '0 6px', fontSize: 12, whiteSpace: 'nowrap', opacity: rowLabels ? 1 : 0.4, pointerEvents: rowLabels ? 'auto' : 'none' }}>
              {/* a sub-row of Row numbers (legend polish): a tree branch — 1px, the dividers' grey — drops from under its label and
                  turns right into this row; the choices at the row labels' size, the one in force in the green accent, a dot
                  between, on the toggles' edge */}
              <span aria-hidden data-numbering-branch style={{ position: 'absolute', left: 10, top: -7, width: 10, height: 22, borderLeft: '1px solid #3A403C', borderBottom: '1px solid #3A403C' }} />
              <span role="group" aria-label="Line numbering" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                {[['continuous', 'Continuous'], ['section', 'Per section']].map(([v, label], i) => (
                  <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span aria-hidden style={{ width: 3, height: 3, borderRadius: 2, background: '#4A514D' }} />}
                    <button type="button" aria-label={label} aria-pressed={numbering === v} disabled={!rowLabels} onClick={() => setLineNumbering(useCanvasStore, v)}
                      style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 400, color: numbering === v ? '#7BD3A4' : '#9AA29C' }}>{label}</button>
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}
      </span>
      {/* Layers: each layer's show toggle and padlock, in its own card above (STUDIO.md §1) */}
      <span ref={layersWrap} style={{ display: 'flex' }}>
        <button type="button" aria-label="Layers" aria-haspopup="dialog" aria-expanded={layers} aria-pressed={layers} onClick={() => setLayers(o => !o)} style={tog(layers)}>Layers</button>
        {layers && (
          <div className="st-island" role="dialog" aria-label="Layers card" data-card-dark style={overIsland({ width: 232, padding: 8 })}>
            <LayerBody />
          </div>
        )}
      </span>
      <button type="button" aria-label="Fit" title="Fit to content" onClick={() => fitRef.current?.()} style={ghost({ width: 30, height: 30 })}><Icon name="Full screen" /></button>
      {/* ?: every mouse and key action (studio/HelpCard.jsx); the ? key the same */}
      <span ref={helpWrap} style={{ display: 'flex' }}>
        <button type="button" aria-label="Shortcuts" title="Shortcuts (?)" aria-haspopup="dialog" aria-expanded={help} aria-pressed={help} onClick={toggleHelp} style={tog(help)}>?</button>
        {help && (
          <div className="st-island" data-card-dark style={overIsland({ width: 420, maxHeight: 'calc(100vh - 160px)', overflow: 'hidden' })}>
            <HelpBody />
          </div>
        )}
      </span>
    </div>
  )
}

export function StudioFrame({ onHub }) {
  return (
    <>
      <TopLeft onHub={onHub} />
      <TopRight />
      <RightCard />
      <BottomLeft onHub={onHub} />
      <BottomRight />
      <TallyHost />
    </>
  )
}
