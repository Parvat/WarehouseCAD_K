import { useState, useEffect, useRef } from 'react'
import { useRackingSettings } from '../../utils/fillTool'
import { Sparkles, X, Loader2 } from 'lucide-react'
import { generateAndPlaceBatched, regenerateRacking } from '../../generate/traceGenerate'
import { regenBuilding, regenSummary } from '../../generate/regenerate'
import { useCanvasStore } from '../../store/useCanvasStore'
import { openSetup, defaultPallet, projectOf, generateBrief, BUILDING_DEFAULTS } from '../../utils/project'
import { useRules } from '../../rules/useRules'
import { Note } from '../shared/Note'

// Trace CAD — "Describe → Generate" Brief.
// The Generate button in the top bar and the panel it opens under itself. It only CALLS the store (via
// generateAndPlace); it never modifies store logic. Esc, a click outside and its X close the panel.

/* Module scope, NOT inside GeneratePanel. A component declared in a render body
   is a brand-new function identity every render, so React tears down the old
   subtree and mounts a fresh one instead of updating it — which blurs the input
   after every single keystroke. Nothing here closes over state, so it has no
   reason to live in the component. */
function Field({ label, children }) {
  return (
    <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="t-cap">{label}</span>
      {children}
    </label>
  )
}

/** A number input with its unit inside, right-aligned in steel. */
function Num({ unit = 'ft', ...props }) {
  return (
    <span className="t-field">
      <input className="t-input" type="number" {...props} />
      <span className="t-unit">{unit}</span>
    </span>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-head" style={{ color: 'var(--ink)', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>{title}</div>
      {children}
    </div>
  )
}

/** A segmented row of secondary buttons; the chosen one pine. */
function Seg({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 8 }}>
      {options.map(o => (
        <button key={String(o.key)} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className="t-btn t-btn--secondary" style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>{o.label}</button>
      ))}
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

export function GeneratePanel() {
  /* closed to start: a new project's first step is the start screen (components/Project/ProjectSetup.jsx), which
     generates itself; this panel is for later — regenerate, or start over with another size */
  const [open, setOpen]     = useState(false)
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

  /* Esc and a click outside close it, like every other popover (the Project setup link opens a modal over it —
     a click in that modal is not "outside"; its own Esc closes the modal first) */
  const wrapRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return
      if (e.target.closest?.('[role="dialog"], .t-backdrop')) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.t-backdrop')) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  /* under the button, right-aligned to it: a popover off the top bar */
  const box = {
    position: 'absolute', right: 0, top: 'calc(100% + 16px)', zIndex: 120, width: 320,
    // never past the window's bottom: the panel scrolls, so Generate and the Regenerate question stay reachable
    maxHeight: 'calc(100vh - 76px)', overflowY: 'auto',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => (open ? setOpen(false) : openPanel())} aria-expanded={open} aria-haspopup="dialog"
        title="Describe the building and generate a layout" className="t-btn t-btn--secondary">
        <Sparkles size={16} strokeWidth={1.5} absoluteStrokeWidth /> Generate
      </button>

      {open && (
        <div role="dialog" aria-label="Describe the building" className="t-float" style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 8px 0 16px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Describe the building</span>
            <button type="button" className="t-icon" aria-label="Close" title="Close (Esc)" onClick={() => setOpen(false)}>
              <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Section title="Building">
              <div style={{ display: 'flex', gap: 8 }}>
                <Field label="Length">
                  <Num aria-label="Length (ft)" value={lengthFt} onChange={e => setL(e.target.value)} />
                </Field>
                <Field label="Width">
                  <Num aria-label="Width (ft)" value={widthFt} onChange={e => setW(e.target.value)} />
                </Field>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="t-cap">Column grid</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Num aria-label="Column grid across (ft)" value={gridXFt} onChange={e => setGridX(e.target.value)} />
                  <span className="t-num" style={{ color: 'var(--steel)', fontSize: 13, flexShrink: 0 }}>×</span>
                  <Num aria-label="Column grid along (ft)" value={gridYFt} onChange={e => setGridY(e.target.value)} />
                </div>
              </div>

              <Field label="Max rack run">
                <Num min="20" value={maxRunFt} onChange={e => setMaxRun(e.target.value)}
                  aria-label="Max rack run (ft)" title="Longest continuous rack run before a cross-aisle" />
              </Field>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="t-cap">Columns along wall</span>
                <Seg label="Columns along wall" value={columnsAlongWall} onChange={setColumnsAlongWall}
                  options={[{ key: true, label: 'Yes' }, { key: false, label: 'No' }]} />
                <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.5 }}>
                  {columnsAlongWall
                    ? 'Column grid starts at the wall — a line sits on it.'
                    : 'Column grid inset one pitch from the wall — no column on it.'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="t-cap">Row direction</span>
                <Seg label="Row direction" value={orientation} onChange={setOrientation}
                  options={[{ key: 'auto', label: 'Auto' }, { key: 'horizontal', label: 'Horizontal' }, { key: 'vertical', label: 'Vertical' }]} />
              </div>
            </Section>

            {/* the pallet, the forklift (its aisle) and the wall clearance come from Project setup */}
            <Note level="note" aria-label="From Project setup">
              <span>
                Pallet {pallet ? <>{pallet.name} (<span className="t-num">{pallet.faceIn}"</span> face)</> : '—'} · {mheOptions[mhe]?.label || mhe} · aisle <span className="t-num">{aisleFt} ft</span> · wall clearance <span className="t-num">{wallClearIn}"</span> —{' '}
                <button type="button" onClick={() => openSetup('settings')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>Project setup</button>
              </span>
            </Note>

            <button type="button" onClick={run} disabled={generating} className="t-btn t-btn--primary t-btn--40 t-btn--block"
              style={generating ? { cursor: 'progress', opacity: 0.75 } : undefined}>
              {generating
                ? <><Loader2 size={16} className="animate-spin" /> Generating… <span className="t-num">{Math.round(progress * 100)}%</span></>
                : <><Sparkles size={16} strokeWidth={1.5} absoluteStrokeWidth /> Generate layout</>}
            </button>

            {ask && (
              <div ref={askRef} role="dialog" aria-label="Regenerate or start over" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>This building already has a layout.</div>
                <div>
                  <strong style={{ fontWeight: 600 }}>Regenerate racking</strong> keeps the building, zones{ask.zones ? ` (${ask.zones})` : ''}, hand-placed racks{ask.handPlaced ? ` (${ask.handPlaced})` : ''}, text, dimensions, layers and elevation types,
                  and refills <strong style={{ fontWeight: 600 }}>{ask.rows} row{ask.rows === 1 ? '' : 's'}</strong> ({ask.racks.length} rack{ask.racks.length === 1 ? '' : 's'}) with the settings above.
                </div>
                {ask.handEdits || !ask.editsKnown
                  ? <Note level="warning" data-testid="regen-edits">
                      {!ask.editsKnown ? "Hand edits to these racks can't be detected — any will be lost."
                        : `${ask.handEdits} hand edit${ask.handEdits === 1 ? '' : 's'} to generated racks will be lost.`}
                    </Note>
                  : <div data-testid="regen-edits" style={{ color: 'var(--steel)' }}>No hand edits to generated racks.</div>}
                <div style={{ color: 'var(--steel)' }}><strong style={{ fontWeight: 600 }}>Start over</strong> draws a new building from the size above; everything in the old one goes.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={regenerate} className="t-btn t-btn--primary" style={{ flex: 1 }}>Regenerate racking</button>
                  <button type="button" onClick={startOver} className="t-btn t-btn--secondary">Start over</button>
                  <button type="button" onClick={() => setAsk(null)} className="t-btn t-btn--secondary">Cancel</button>
                </div>
              </div>
            )}

            {result?.failed && !generating && (
              <Note level="error" role="alert">Nothing fits — the layout is unchanged.</Note>
            )}
            {result != null && !result.failed && !generating && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div className="t-num" style={{ fontSize: 18, fontWeight: 500, color: 'var(--pine)' }}>
                  {result.total.toLocaleString()} <span style={{ fontSize: 12, color: 'var(--steel)' }}>·</span> {result.usable.toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
                  positions · usable after column and narrow-aisle losses
                </div>
                {result.regenerated && (
                  <div data-testid="regen-result" style={{ fontSize: 12, color: 'var(--steel)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                    Regenerated <strong style={{ fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{result.orientation}</strong> — {result.rows} row{result.rows === 1 ? '' : 's'} replaced{result.handPlaced ? `, ${result.handPlaced} hand-placed kept` : ''}
                  </div>
                )}
                {result.horizontalTotal != null && (
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                    Auto-picked <strong style={{ fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{result.orientation}</strong> — <span className="t-num">{result.horizontalUsable.toLocaleString()}</span> usable horizontal vs <span className="t-num">{result.verticalUsable.toLocaleString()}</span> vertical
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
