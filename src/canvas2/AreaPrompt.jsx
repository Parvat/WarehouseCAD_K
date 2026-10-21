import { X } from 'lucide-react'
import { useAreaPrompt, answerArea, answerChoice, dismissAreaNote } from '../utils/rackingAreaTool'

/* The racking area / zone question (utils/rackingAreaTool.js): a racking area
   with hand edits about to be resized or rebuilt, or a zone about to go over
   racks. Continue does it (one undo step); Cancel leaves everything as it was.
   A floating bar like the Row group's (RowGroupBar), stacked above it in the canvas's bottom row (Canvas2.jsx):
   white, 1px line, radius 4, the theme shadow; the zone status is a 32px chip. */
const box = {
  padding: '4px 4px 4px 12px', minHeight: 32, maxWidth: 640, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  fontSize: 12, lineHeight: '22px',
}

export function AreaPrompt() {
  const q = useAreaPrompt(s => s.question), note = useAreaPrompt(s => s.note)
  if (!q && note) return (
    <div role="status" aria-label="Zone change" className="t-float" style={{ ...box, padding: '0 0 0 12px', flexWrap: 'nowrap' }}>
      <span style={{ fontWeight: 600 }}>{note}</span>
      <button type="button" aria-label="Dismiss" title="Dismiss" className="t-icon" style={{ height: 30 }} onClick={dismissAreaNote}>
        <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </button>
    </div>
  )
  if (!q) return null
  return (
    <div role="alertdialog" aria-label="Racking area question" className="t-float" style={box}>
      <span style={{ fontWeight: 600 }}>{q.text}</span>
      {q.choices
        ? q.choices.map((c, i) => <button key={c.label} type="button" className={'t-btn ' + (i === q.choices.length - 1 ? 't-btn--primary' : 't-btn--secondary')} onClick={() => answerChoice(i)}>{c.label}</button>)
        : <>
            <button type="button" className="t-btn t-btn--primary" onClick={() => answerArea(true)}>Continue</button>
            <button type="button" className="t-btn t-btn--secondary" onClick={() => answerArea(false)}>Cancel</button>
          </>}
    </div>
  )
}
