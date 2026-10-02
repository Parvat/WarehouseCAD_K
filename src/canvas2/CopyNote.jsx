import { usePlacement } from '../utils/placement'
import { useCopyPrompt, copyPending, dontCopy, questionText, matchReport, showAfterAction, beginMatch } from '../utils/copyPrompt'
import { sectionLabel } from '../utils/sectionCopy'
import { useCanvasStore } from '../store/useCanvasStore'
import { applySectionSync, syncWarningText } from '../components/RightPanel/panels/RackRowPanelCore'

/* The bottom-of-canvas bar for copying row changes across sections
   (utils/copyPrompt.js): the pending set ("Section N: K changes · Copy to
   other sections", its tooltip listing them), the question asked when the
   user moves on to another section, a one-line message, what the last copy
   did, or a row being placed. The pending set's ✕ (and Esc, when nothing else is
   active) dismisses it, as "Don't copy". Plain DOM — no Konva — so it renders anywhere. */

const wrap = {
  position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 60,
  width: 'max-content', maxWidth: 'min(640px, calc(100% - 32px))', display: 'flex', flexDirection: 'column', gap: 6,
}
const box = {
  padding: '8px 10px', borderRadius: 8,
  background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.14)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text, #0B101D)',
  display: 'flex', flexDirection: 'column', gap: 4,
}
const line = (color) => ({ fontSize: 11, color, fontFamily: 'var(--font-mono)', lineHeight: 1.35 })
const btn = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid var(--accent-solid, #0B101D)',
  whiteSpace: 'nowrap',
}
const btn2 = { ...btn, background: 'var(--surface, #fff)', color: 'var(--text, #0B101D)', border: '1px solid var(--border, #E6E9EF)' }
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #6B7280)', fontSize: 14, lineHeight: 1, padding: '0 2px' }
const row = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }

function Lines({ skipped = [], warnings = [] }) {
  return (
    <>
      {skipped.length > 0 && (
        <div role="alert" aria-label="Copies not made" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {skipped.map((t, i) => <div key={i} style={line('var(--red, #C0392B)')}>Not copied — {t}</div>)}
        </div>
      )}
      {warnings.length > 0 && (
        <div aria-label="Copy warnings" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {warnings.map((t, i) => <div key={i} style={line('var(--amber, #B87309)')}>Check — {t}</div>)}
        </div>
      )}
    </>
  )
}

/** The bar's "Match bays in section 3 (from row 5)": the right panel's
 *  "Match bays in this section" (applySectionSync — same rows, warnings and
 *  single undo) from the row last given a bay change in the set. */
export const matchText = (p) => `Match bays in section ${sectionLabel(p.section)} (from row ${p.matchFrom.rowIndex ?? '?'})`
export function matchBays(p) {
  if (!p || !p.matchFrom) return null
  beginMatch()   // a finished action: its rows don't join the set (utils/copyPrompt.js)
  const r = applySectionSync(useCanvasStore.getState, p.matchFrom.id)
  showAfterAction(matchReport(r, p.section, p.matchFrom.rowIndex, syncWarningText(r.warnings)))
  return r
}

/** "Section 3: 4 changes (2 will be copied)" — the pending set: every change,
 *  and how many of them go to the other sections. */
export const barText = (p) => `Section ${sectionLabel(p.section)}: ${p.count} change${p.count === 1 ? '' : 's'} (${p.copyCount ? p.copyCount : 'none'} will be copied)`

function Body() {
  const placing = usePlacement(s => s.active)
  const pending = useCopyPrompt(s => s.pending)
  const question = useCopyPrompt(s => s.question)
  const message = useCopyPrompt(s => s.message)
  const report = useCopyPrompt(s => s.report)
  const setHover = useCopyPrompt(s => s.setHover)
  const dismissReport = useCopyPrompt(s => s.dismissReport)
  const out = []
  if (placing) {
    out.push(
      <div key="place" role="status" aria-label="Placing row" style={box}>
        <div>{placing.blocked
          ? <span style={{ color: 'var(--red, #C0392B)', fontWeight: 600 }}>Can't place here — {placing.blocked}</span>
          : <span>Click to place{placing.snapped?.cross || placing.snapped?.run ? <span style={{ color: 'var(--text3, #6B7280)' }}> · snapped to {[placing.snapped.cross, placing.snapped.run].filter(Boolean).join(', ')}</span> : null}</span>}
          <span style={{ color: 'var(--text3, #6B7280)' }}> · Esc to cancel</span></div>
        {!placing.blocked && <Lines warnings={placing.warnings} />}
      </div>)
  }
  if (question) {
    out.push(
      <div key="q" role="alertdialog" aria-label="Copy your changes?" style={{ ...box, border: '1px solid var(--accent-solid, #0B101D)' }}>
        <div style={row}>
          <span style={{ fontWeight: 600 }}>{questionText(question)}</span>
          <button style={btn} aria-label="Copy changes to other sections" onClick={() => copyPending(question.fpId)}>Copy</button>
          <button style={btn2} aria-label="Don't copy" onClick={dontCopy}>Don't copy</button>
        </div>
      </div>)
  } else if (pending) {
    const tip = pending.lines.join('\n')
    out.push(
      <div key="bar" role="status" aria-label="Pending changes" title={tip} style={box}>
        <div style={row}>
          <span title={tip}>{barText(pending)}</span>
          {/* only when copying would really do something; a bar with just a bay change offers Match bays */}
          {pending.copyable && (
            <button style={btn} aria-label="Copy to other sections" title={tip}
              onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
              onFocus={() => setHover(true)} onBlur={() => setHover(false)}
              onClick={() => copyPending(pending.fpId)}>
              Copy to other sections
            </button>
          )}
          {pending.matchFrom && (
            <button style={btn2} aria-label={matchText(pending)}
              title="Every other row in this section copies this row's beam lengths and start point, so uprights line up across the aisles."
              onClick={() => matchBays(pending)}>
              {matchText(pending)}
            </button>
          )}
          {/* Dismiss: the bar closes and the set clears, the changes staying where they were made (Don't copy) */}
          <button style={closeBtn} aria-label="Dismiss pending changes" title="Dismiss — keep the changes where they were made; nothing is copied"
            onClick={dontCopy}>✕</button>
        </div>
      </div>)
  }
  if (message || report) {
    out.push(
      <div key="msg" role="status" aria-label="Copy result" style={box}>
        <div style={row}>
          <span>{message || `${report.text}.`}</span>
          <button style={closeBtn} aria-label="Dismiss" onClick={dismissReport}>×</button>
        </div>
        {report && <Lines skipped={report.skipped} warnings={report.warnings} />}
      </div>)
  }
  return out.length ? out : null
}

export function CopyNote() {
  return <div style={wrap}><Body /></div>
}
