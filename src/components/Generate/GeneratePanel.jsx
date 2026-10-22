import { useState, useEffect, useRef } from 'react'
import { useRackingSettings } from '../../utils/fillTool'
import { Icon } from '../../studio/Icon'   // the Studio icon set (STUDIO.md §9)
import { generateAndPlaceBatched, regenerateRacking } from '../../generate/traceGenerate'
import { regenBuilding, regenSummary } from '../../generate/regenerate'
import { useCanvasStore } from '../../store/useCanvasStore'
import { openSetup, defaultPallet, projectOf, generateBrief, BUILDING_DEFAULTS } from '../../utils/project'
import { useRules } from '../../rules/useRules'
import { useRightPanelWidth } from '../../utils/rightPanel'

// Trace CAD — "Describe → Generate" Brief.
// A self-contained floating card. It only CALLS the store (via generateAndPlace);
// it never modifies store logic.

/* The CAD's own panels sit at 2px — anything rounder reads as a web card
   dropped on top of a drawing. Cards keep 4px. */
const R = 2

const labelSt = { fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.02em' }
const sectionSt = {
  fontSize: 10.5, color: 'var(--text)', fontWeight: 700, letterSpacing: '.04em',
  paddingBottom: 4, marginTop: 2, borderBottom: '1px solid var(--border)',
}

/* Module scope, NOT inside GeneratePanel. A component declared in a render body
   is a brand-new function identity every render, so React tears down the old
   subtree and mounts a fresh one instead of updating it — which blurs the input
   after every single keystroke. Nothing here closes over state, so it has no
   reason to live in the component. */
function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={labelSt}>{label}</div>
      {children}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionSt}>{title}</div>
      {children}
    </div>
  )
}

// The one rack type Generate ever produces — standard selective, single
// rows against the walls and double-deep back-to-back interior pairs
// (rowBands' own STEP 1/STEP 3 shape, unchanged). That's the layout big
// warehouses actually run for max space, not a dealer choice to expose
// here; a customer who genuinely wants single rows throughout still
// builds that from the object library or edits a placed row by hand.
// (utils/project.js generateBrief: rackType 'rack_double_row')

export function GeneratePanel({ embedded = false, onClose } = {}) {
  /* closed to start: a new project's first step is the start screen (components/Project/ProjectSetup.jsx), which
     generates itself; this panel is for later — regenerate, or start over with another size. Studio: `embedded`, it
     is the right card's content (src/studio/StudioFrame.jsx), open while shown; its X calls `onClose`. */
  const [open, setOpen]     = useState(embedded)
  const [lengthFt, setL]    = useState(BUILDING_DEFAULTS.lengthFt)
  const [widthFt, setW]     = useState(BUILDING_DEFAULTS.widthFt)
  // Auto (BUG 47) is the default — generateAndPlaceBatched runs both
  // orientations and places whichever scores more pallet capacity. The
  // Horizontal/Vertical buttons are an explicit override, still exactly
  // the manual single-orientation path GeneratePanel has had since BUG 43.
  const [orientation, setOrientation] = useState('auto')
  /* The forklift (its aisle), the default pallet and the wall clearance are the project's (Project setup,
     utils/project.js) — read here, set there; the column check follows the same forklift (ProjectSync). */
  const { rules, mheOptions } = useRules()
  const project = useCanvasStore(s => projectOf(s.elevations))
  const mhe = project?.equipment?.mhe || useRackingSettings.getState().mhe || 'reach'
  const aisleFt = mheOptions[mhe]?.aisleFt ?? 10.5
  const pallet = defaultPallet(project)
  const wallClearIn = project?.rules?.wallClearIn ?? useRackingSettings.getState().wallClearIn ?? 0
  const [gridXFt, setGridX]   = useState(BUILDING_DEFAULTS.gridXFt)
  const [gridYFt, setGridY]   = useState(BUILDING_DEFAULTS.gridYFt)
  /* Longest continuous rack run before a cross-aisle — long runs get as many
     evenly spaced cross-aisles as it takes to stay this short. */
  const [maxRunFt, setMaxRun] = useState(BUILDING_DEFAULTS.maxRunFt)
  // Whether the interior column grid's own origin sits flush on the wall
  // (Yes, a line on it) or inset one full pitch off it (No, none on it) —
  // see sizingLayout.js's columnGridObject/axisFrame (BUG 69).
  const [columnsAlongWall, setColumnsAlongWall] = useState(false)
  const [result, setResult]   = useState(null)

  /* The row direction and max run are shared with the Fill racking tool (utils/fillTool.js): a field changed here
     is what a fill uses next (opening the panel changes nothing). */
  const syncedOnce = useRef(false)
  useEffect(() => {
    if (!syncedOnce.current) { syncedOnce.current = true; return }
    const set = useRackingSettings.getState().setSetting
    if (orientation !== 'auto') set('orientation', orientation)
    set('maxRunFt', Number(maxRunFt) || 150)
  }, [orientation, maxRunFt])

  /* Generating is a real wait on a big building — thousands of bay rects and a
     history snapshot per object. Without a flag the click just looks dead. */
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress]     = useState(0)


  /* A layout already there: Generate asks — Regenerate racking (generate/regenerate.js: the building, zones,
     hand-placed racks, text, dimensions, layers and elevation types kept; only the generated racks refilled, with
     the rows and hand edits that loses counted) or Start over (a new building, as before). */
  const [ask, setAsk] = useState(null)
  const askRef = useRef(null)
  useEffect(() => { if (ask) askRef.current?.scrollIntoView({ block: 'nearest' }) }, [ask])
  const brief = () => generateBrief(project, mheOptions, { lengthFt, widthFt, gridXFt, gridYFt, maxRunFt, columnsAlongWall, orientation })
  const run = () => {
    if (generating) return
    const objects = useCanvasStore.getState().objects
    const fp = regenBuilding(objects)
    if (fp && objects.some(o => o.parentId === fp.id)) { setAsk(regenSummary(objects, fp)); return }
    startOver()
  }
  const startOver = async () => {
    setAsk(null)
    setGenerating(true)
    setProgress(0)
    try {
      const outcome = await generateAndPlaceBatched(brief(), { onProgress: setProgress, rules })
      setResult(outcome)
    } finally {
      setGenerating(false)
    }
  }
  const regenerate = () => {
    setAsk(null)
    const outcome = regenerateRacking(brief(), { rules, beamIn: useRackingSettings.getState().beamIn ?? 96 })
    setResult(outcome ? { ...outcome, regenerated: true } : { failed: true })
  }

  /* opened: the start screen's building and layout choices (project.building) are where it starts */
  const openPanel = () => {
    const g = project?.building
    if (g) {
      if (g.lengthFt) setL(g.lengthFt); if (g.widthFt) setW(g.widthFt)
      if (g.gridXFt != null) setGridX(g.gridXFt); if (g.gridYFt != null) setGridY(g.gridYFt)
      if (g.maxRunFt) setMaxRun(g.maxRunFt); if (g.orientation) setOrientation(g.orientation)
      if (g.columnsAlongWall != null) setColumnsAlongWall(!!g.columnsAlongWall)
    }
    setOpen(true)
  }

  /* embedded: the project's building fills the fields once, as opening the floating panel did */
  useEffect(() => { if (embedded) openPanel() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* over the canvas's top right: past the right panel, as wide as it is (a rack selected widens it) */
  const right = useRightPanelWidth().width + 24
  const box = embedded ? { fontFamily: 'var(--font-ui)', color: 'var(--text)' } : {
    position: 'fixed', right, top: 60, zIndex: 40, width: 236,
    // never past the window's bottom: the panel scrolls, so Generate and the Regenerate question stay reachable
    maxHeight: 'calc(100vh - 76px)', overflowY: 'auto',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: R, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    fontFamily: 'var(--font-ui)', color: 'var(--text)',
  }
  const inputSt = {
    width: '100%', minWidth: 0, padding: '6px 8px', marginTop: 3,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: R, color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: 12,
  }

  if (!open) {
    return (
      <button onClick={openPanel} style={{
        position: 'fixed', right, top: 60, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        background: 'var(--accent)', color: '#fff', border: 'none',
        borderRadius: R, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        fontFamily: 'var(--font-ui)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <Icon name="Generate" color="currentColor" /> Generate
      </button>
    )
  }

  return (
    <div style={box}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Describe the building</span>
        <button aria-label="Close" onClick={() => (embedded ? onClose?.() : setOpen(false))} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
          display: 'flex', padding: 0,
        }}><Icon name="Close" color="currentColor" /></button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="BUILDING">
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label="LENGTH (ft)">
              <input style={inputSt} type="number" value={lengthFt} onChange={e => setL(e.target.value)} />
            </Field>
            <Field label="WIDTH (ft)">
              <input style={inputSt} type="number" value={widthFt} onChange={e => setW(e.target.value)} />
            </Field>
          </div>

          <div>
            <div style={labelSt}>COLUMN GRID (ft)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={inputSt} type="number" value={gridXFt} onChange={e => setGridX(e.target.value)} />
              <span style={{ ...labelSt, marginTop: 3, flexShrink: 0 }}>×</span>
              <input style={inputSt} type="number" value={gridYFt} onChange={e => setGridY(e.target.value)} />
            </div>
          </div>

          <Field label="MAX RACK RUN (ft)">
            <input style={inputSt} type="number" min="20" value={maxRunFt} onChange={e => setMaxRun(e.target.value)}
              aria-label="Max rack run (ft)" title="Longest continuous rack run before a cross-aisle" />
          </Field>

          <div>
            <div style={labelSt}>COLUMNS ALONG WALL</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
              {[
                { key: true,  label: 'Yes' },
                { key: false, label: 'No' },
              ].map(o => (
                <button key={String(o.key)} onClick={() => setColumnsAlongWall(o.key)} style={{
                  flex: 1, padding: '6px 8px',
                  background: columnsAlongWall === o.key ? 'var(--accent)' : 'var(--surface2)',
                  color: columnsAlongWall === o.key ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: R,
                  cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                }}>{o.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.35 }}>
              {columnsAlongWall
                ? 'Column grid starts at the wall — a line sits on it.'
                : 'Column grid inset one pitch from the wall — no column on it.'}
            </div>
          </div>

          <div>
            <div style={labelSt}>ROW DIRECTION</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
              {[
                { key: 'auto',       label: 'Auto' },
                { key: 'horizontal', label: 'Horizontal' },
                { key: 'vertical',   label: 'Vertical' },
              ].map(o => (
                <button key={o.key} onClick={() => setOrientation(o.key)} style={{
                  flex: 1, padding: '6px 8px',
                  background: orientation === o.key ? 'var(--accent)' : 'var(--surface2)',
                  color: orientation === o.key ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: R,
                  cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                }}>{o.label}</button>
              ))}
            </div>
          </div>
        </Section>

        {/* the pallet, the forklift (its aisle) and the wall clearance come from Project setup */}
        <div aria-label="From Project setup" style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.45 }}>
          Pallet {pallet ? `${pallet.name} (${pallet.faceIn}" face)` : '—'} · {mheOptions[mhe]?.label || mhe} · aisle {aisleFt} ft · wall clearance {wallClearIn}" —{' '}
          <button type="button" onClick={() => openSetup('settings')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 10.5, textDecoration: 'underline' }}>Project setup</button>
        </div>

        <button onClick={run} disabled={generating} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '9px', marginTop: 2,
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: R,
          cursor: generating ? 'progress' : 'pointer',
          opacity: generating ? 0.75 : 1,
          fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-ui)',
        }}>
          {generating
            ? <>Generating… {Math.round(progress * 100)}%</>
            : <><Icon name="Generate" color="currentColor" /> Generate layout</>}
        </button>

        {ask && (
          <div ref={askRef} role="dialog" aria-label="Regenerate or start over" style={{ padding: '9px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>This building already has a layout.</div>
            <div>
              <strong>Regenerate racking</strong> keeps the building, zones{ask.zones ? ` (${ask.zones})` : ''}, hand-placed racks{ask.handPlaced ? ` (${ask.handPlaced})` : ''}, text, dimensions, layers and elevation types,
              and refills <strong>{ask.rows} row{ask.rows === 1 ? '' : 's'}</strong> ({ask.racks.length} rack{ask.racks.length === 1 ? '' : 's'}) with the settings above.
            </div>
            <div data-testid="regen-edits" style={{ color: ask.handEdits || !ask.editsKnown ? 'var(--red)' : 'var(--text3)' }}>
              {!ask.editsKnown ? "Hand edits to these racks can't be detected — any will be lost."
                : ask.handEdits ? `${ask.handEdits} hand edit${ask.handEdits === 1 ? '' : 's'} to generated racks will be lost.`
                : 'No hand edits to generated racks.'}
            </div>
            <div style={{ color: 'var(--text3)' }}><strong>Start over</strong> draws a new building from the size above; everything in the old one goes.</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button type="button" onClick={regenerate} style={{ flex: 1, padding: '6px 8px', borderRadius: R, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 600 }}>Regenerate racking</button>
              <button type="button" onClick={startOver} style={{ padding: '6px 8px', borderRadius: R, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5 }}>Start over</button>
              <button type="button" onClick={() => setAsk(null)} style={{ padding: '6px 8px', borderRadius: R, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text3)', fontSize: 11.5 }}>Cancel</button>
            </div>
          </div>
        )}

        {result?.failed && !generating && (
          <div role="alert" style={{ fontSize: 11, color: 'var(--red)' }}>Nothing fits — the layout is unchanged.</div>
        )}
        {result != null && !result.failed && !generating && (
          <div style={{
            padding: '8px 10px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 4,
          }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--accent)' }}>
              {result.total.toLocaleString()} <span style={{ fontSize: 11, color: 'var(--text3)' }}>·</span> {result.usable.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
              positions · usable after column and narrow-aisle losses
            </div>
            {result.regenerated && (
              <div data-testid="regen-result" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                Regenerated <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{result.orientation}</strong> — {result.rows} row{result.rows === 1 ? '' : 's'} replaced{result.handPlaced ? `, ${result.handPlaced} hand-placed kept` : ''}
              </div>
            )}
            {result.horizontalTotal != null && (
              <div style={{
                fontSize: 10, color: 'var(--text3)', marginTop: 6,
                paddingTop: 6, borderTop: '1px solid var(--border)',
              }}>
                Auto-picked <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{result.orientation}</strong> — {result.horizontalUsable.toLocaleString()} usable horizontal vs {result.verticalUsable.toLocaleString()} vertical
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
