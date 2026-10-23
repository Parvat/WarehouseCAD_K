import { useState, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRackingSettings } from '../../utils/fillTool'
import { Icon } from '../../studio/Icon'   // the Studio icon set (STUDIO.md §9)
import { C, MONO, fieldBox, Field, Seg, Btn, Note } from '../../studio/cardParts'
import { regenerateRacking } from '../../generate/traceGenerate'
import { regenBuilding, regenSummary } from '../../generate/regenerate'
import { layoutSpec } from '../../generate/sizingLayout'
import { useCanvasStore } from '../../store/useCanvasStore'
import { openSetup, defaultPallet, projectOf, commitProject } from '../../utils/project'
import { useGenFields, setGenField, fillGenFields, genBrief, startOverLayout, projectWithDraft } from '../../utils/genFields'
import { useViewPrefs } from '../../studio/viewPrefs'
import { useRules } from '../../rules/useRules'

/* ── Generate / Regenerate, inside the right card (STUDIO.md §7; design/studio/Studio.dc.html panel "gen", C4) ──────
   Opened from the top bar's Generate / Regenerate (no modal); its X and Cancel go back to the card that was showing.
     header   — the Generate icon, "Generate layout" / "Regenerate layout", X
     fields   — Building width · Building length / Column grid / Max run · Wall clearance (30h, mono, units after)
     Row direction (Auto · Horizontal · Vertical), Columns along wall (Yes · No)
     Forklift — the project's forklift and its aisle. Wall clearance and Forklift are the project's (the same values
                Project settings edits), held as the card's draft: written to Project settings only when Generate /
                Regenerate runs — Cancel or X drops them
     amber    — on a layout: "Keeps zones, doors and columns. Replaces racking." and the hand edits it would lose
     blue     — where the rest comes from: the pallet from Project settings, frame and flue from Rules (each opens it)
     footer   — Cancel · Generate / Regenerate (primary)
   On a layout (a building with racks or zones) the primary regenerates the racking (generate/regenerate.js): the
   building, zones, hand-placed racks, text, dimensions, layers and elevation types kept. On an empty plan it draws a
   new building from the fields. Starting over on a layout is the layout menu's ("Start over with a new building"). */

const unit = { color: C.strong, fontFamily: MONO, fontSize: 12 }
/** A number in the 30h field with its unit after it (240′, 3″): the input as wide as its digits. */
function UnitNum({ value, onChange, aria, u, min = 0, title, disabled }) {
  const w = Math.max(1, String(value ?? '').length)
  return (
    <input type="number" aria-label={aria} title={title} min={min} value={value} disabled={disabled} className="st-field" onChange={e => onChange(e.target.value)}
      style={{ ...unit, width: `${w}ch`, minWidth: 0, padding: 0, border: 0, background: 'transparent', outline: 'none' }} />
  )
}
const box = (extra) => ({ ...fieldBox(), gap: 0, ...extra })

export function GeneratePanel({ onClose } = {}) {
  const f = useGenFields()
  /* The forklift (its aisle), the default pallet and the wall clearance are the project's (utils/project.js); the
     column check follows the same forklift (ProjectSync). */
  const { rules, mheOptions } = useRules()
  const project = useCanvasStore(s => projectOf(s.elevations))
  /* the card's draft of the project's forklift and wall clearance: shown at once, written only by the run */
  const [draft, setDraft] = useState({})
  const mhe = draft.mhe ?? (project?.equipment?.mhe || useRackingSettings.getState().mhe || 'reach')
  const aisleFt = mheOptions[mhe]?.aisleFt ?? 10.5
  const pallet = defaultPallet(project)
  const wallClearIn = draft.wallClearIn ?? (project?.rules?.wallClearIn ?? useRackingSettings.getState().wallClearIn ?? 0)
  const spec = useMemo(() => layoutSpec({}, rules), [rules])
  /** The draft into Project settings (one undo step), as the run starts → the project the run uses. Nothing changed: none. */
  const commitDraft = () => {
    const next = projectWithDraft(project, draft)
    setDraft({})
    if (!next) return project
    commitProject(useCanvasStore, next)
    return next
  }

  /* the project's building fills the fields once, as the card opens */
  useEffect(() => { fillGenFields(project) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* The row direction and max run are shared with the Fill racking tool (utils/fillTool.js): a field changed here
     is what a fill uses next (opening the card changes nothing). */
  const syncedOnce = useRef(false)
  useEffect(() => {
    if (!syncedOnce.current) { syncedOnce.current = true; return }
    const set = useRackingSettings.getState().setSetting
    if (f.orientation !== 'auto') set('orientation', f.orientation)
    set('maxRunFt', Number(f.maxRunFt) || 150)
  }, [f.orientation, f.maxRunFt])

  /* Generating is a real wait on a big building — thousands of bay rects and a history snapshot per object. */
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

  /* On a layout (a building with racks or zones): what a regenerate keeps, replaces and loses, said before the click */
  const { objects, hasRacks } = useCanvasStore(useShallow(s => ({ objects: s.objects, hasRacks: s.objects.some(o => /^rack_/.test(o.type || '')) })))
  const fp = useMemo(() => regenBuilding(objects), [objects])
  const onLayout = !!fp && objects.some(o => o.parentId === fp.id)
  const ask = useMemo(() => (onLayout ? regenSummary(objects, fp) : null), [onLayout, objects, fp])
  const label = hasRacks ? 'Regenerate' : 'Generate'
  const run = () => {
    if (generating) return
    if (onLayout) regenerate()
    else startOver()
  }
  const startOver = async () => {
    commitDraft()
    setGenerating(true)
    setProgress(0)
    try {
      const outcome = await startOverLayout(useCanvasStore, { rules, mheOptions, onProgress: setProgress })
      setResult(outcome)
    } finally {
      setGenerating(false)
    }
  }
  const regenerate = () => {
    const pr = commitDraft()
    const outcome = regenerateRacking(genBrief(pr, mheOptions), { rules, beamIn: useRackingSettings.getState().beamIn ?? 96 })
    setResult(outcome ? { ...outcome, regenerated: true } : { failed: true })
  }

  const fieldsGrid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }
  return (
    <div aria-label="Generate" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px', flexShrink: 0 }}>
        <Icon name="Generate" active />
        <span style={{ fontWeight: 600, color: C.strong }}>{label} layout</span>
        <button type="button" className="st-hov" aria-label="Close" onClick={() => onClose?.()} style={{ marginLeft: 'auto', width: 26, height: 26, border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><Icon name="Close" color={C.muted} /></button>
      </div>

      {/* the fields — the part that scrolls on a short window; the footer stays */}
      <div style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...fieldsGrid, padding: '0 16px 12px' }}>
          <Field label="Building width"><span style={box()}><UnitNum aria="Building width (ft)" value={f.widthFt} onChange={v => setGenField('widthFt', v)} u="′" />′</span></Field>
          <Field label="Building length"><span style={box()}><UnitNum aria="Building length (ft)" value={f.lengthFt} onChange={v => setGenField('lengthFt', v)} u="′" />′</span></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Column grid"><span style={box()}><UnitNum aria="Column grid X (ft)" value={f.gridXFt} onChange={v => setGenField('gridXFt', v)} />′<span style={{ margin: '0 6px' }}>×</span><UnitNum aria="Column grid Y (ft)" value={f.gridYFt} onChange={v => setGenField('gridYFt', v)} />′</span></Field>
          </div>
          <Field label="Max run" title="Longest continuous rack run before a cross-aisle"><span style={box()}><UnitNum aria="Max rack run (ft)" min={20} value={f.maxRunFt} onChange={v => setGenField('maxRunFt', v)} />′</span></Field>
          <Field label="Wall clearance" title="From each wall's inner face — Project settings' value"><span style={box({ opacity: project ? 1 : 0.45 })}><UnitNum aria="Wall clearance (in)" disabled={!project} value={wallClearIn} onChange={v => setDraft(d => ({ ...d, wallClearIn: Math.max(0, Number(v) || 0) }))} />″</span></Field>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px 12px' }}>
          <span style={{ color: C.muted, fontSize: 12 }}>Row direction</span>
          <Seg aria="Row direction" value={f.orientation} onChange={v => setGenField('orientation', v)} options={[{ value: 'auto', label: 'Auto' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }]} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px 12px' }}>
          <span style={{ color: C.muted, fontSize: 12 }} title={f.columnsAlongWall ? 'Column grid starts at the wall — a line sits on it.' : 'Column grid inset one pitch from the wall — no column on it.'}>Columns along wall</span>
          <Seg aria="Columns along wall" value={f.columnsAlongWall} onChange={v => setGenField('columnsAlongWall', v)} options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 12px' }}>
          <span style={{ flex: 1, color: C.muted, fontSize: 12 }}>Forklift</span>
          <span style={{ position: 'relative', height: 30, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 6, background: C.inset, color: C.strong, opacity: project ? 1 : 0.45 }}>
            {mheOptions[mhe]?.label || mhe} · <span style={{ fontFamily: MONO, fontSize: 12 }}>{ftIn(aisleFt)}</span><Icon name="Chevron" size={12} color={C.muted} />
            <select aria-label="Forklift" value={mhe} disabled={!project} onChange={e => setDraft(d => ({ ...d, mhe: e.target.value }))}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: project ? 'pointer' : 'not-allowed', width: '100%' }}>
              {Object.entries(mheOptions).map(([k, o]) => <option key={k} value={k}>{o.label || k} · {ftIn(o.aisleFt)}</option>)}
            </select>
          </span>
        </div>

        {ask && (
          <Note level="warning" data-testid="regen-edits" style={{ margin: '0 16px 8px' }}>
            Keeps zones, doors and columns. Replaces racking.
            {!ask.editsKnown ? " Hand edits to these racks can't be detected — any will be lost."
              : ask.handEdits ? ` ${ask.handEdits} hand edit${ask.handEdits === 1 ? '' : 's'} to generated racks will be lost.` : ''}
          </Note>
        )}
        <Note level="note" aria-label="From Project settings and Rules" style={{ margin: '0 16px 12px' }}>
          Pallet {pallet ? pallet.name : '—'} comes from <button type="button" onClick={() => openSetup('settings')} style={linkSt}>Project settings</button>;
          frame {spec.depthIn}″ and flue {spec.flueIn}″ from <button type="button" onClick={() => useViewPrefs.getState().setRulesOpen(true)} style={linkSt}>Rules</button>.
        </Note>
        {result?.failed && !generating && <Note level="error" role="alert" style={{ margin: '0 16px 12px' }}>Nothing fits — the layout is unchanged.</Note>}
        {result != null && !result.failed && !generating && (
          <div data-testid="regen-result" style={{ margin: '0 16px 12px', color: C.muted, fontSize: 12 }}>
            <span style={{ fontFamily: MONO, color: C.strong }}>{result.total.toLocaleString()}</span> positions · <span style={{ fontFamily: MONO, color: C.accent }}>{result.usable.toLocaleString()}</span> usable
            {result.regenerated ? <> · {result.rows} row{result.rows === 1 ? '' : 's'} replaced{result.handPlaced ? `, ${result.handPlaced} hand-placed kept` : ''}</> : null}
            {result.horizontalTotal != null ? <> · auto-picked {result.orientation}</> : null}
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${C.divider}`, flexShrink: 0 }}>
        <Btn kind="ghost" onClick={() => onClose?.()}>Cancel</Btn>
        <Btn kind="primary" onClick={run} disabled={generating} style={{ flex: 1, cursor: generating ? 'progress' : 'pointer', opacity: generating ? 0.75 : 1 }}>
          {generating ? <>Generating… {Math.round(progress * 100)}%</> : label}
        </Btn>
      </div>
    </div>
  )
}

const linkSt = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit' }
/** 10.5 ft → 10′ 6″ (the mockup's forklift aisle) */
function ftIn(ft) {
  const t = Math.round((Number(ft) || 0) * 12), a = Math.floor(t / 12), b = t % 12
  return `${a}′ ${b}″`
}
