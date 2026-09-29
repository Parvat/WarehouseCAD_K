import { usePlacement } from '../utils/placement'
import { useCopyPrompt, copyNow, buttonText } from '../utils/copyPrompt'

/* The "Copy this change" note at the bottom of the canvas (utils/copyPrompt.js):
   a copy on offer (one button per part, each with its copy count), a change
   that can't be copied (a warning, with why), what the last copy did, or a
   row being placed. Plain DOM — no Konva — so it renders anywhere. */

const box = {
  position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 60,
  maxWidth: 'min(640px, calc(100% - 32px))', padding: '8px 10px', borderRadius: 8,
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
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #6B7280)', fontSize: 14, lineHeight: 1, padding: '0 2px' }

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

export function CopyNote() {
  const placing = usePlacement(s => s.active)
  const offer = useCopyPrompt(s => s.offer)
  const report = useCopyPrompt(s => s.report)
  const setHover = useCopyPrompt(s => s.setHover)
  const dismiss = useCopyPrompt(s => s.dismiss)
  if (placing) {
    return (
      <div role="status" aria-label="Placing row" style={box}>
        <div>{placing.blocked
          ? <span style={{ color: 'var(--red, #C0392B)', fontWeight: 600 }}>Can't place here — {placing.blocked}</span>
          : <span>Click to place{placing.snapped?.cross || placing.snapped?.run ? <span style={{ color: 'var(--text3, #6B7280)' }}> · snapped to {[placing.snapped.cross, placing.snapped.run].filter(Boolean).join(', ')}</span> : null}</span>}
          <span style={{ color: 'var(--text3, #6B7280)' }}> · Esc to cancel</span></div>
        {!placing.blocked && <Lines warnings={placing.warnings} />}
      </div>
    )
  }
  if (offer && offer.blocked) {
    // a row change the note can't copy: a warning, no buttons
    return (
      <div role="alert" aria-label="Can't copy this change" style={{ ...box, border: '1px solid var(--amber, #B87309)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--amber, #B87309)', fontWeight: 600 }}>{offer.text}</span>
          <button style={closeBtn} aria-label="Dismiss" onClick={dismiss}>×</button>
        </div>
      </div>
    )
  }
  if (offer) {
    // one button per part: a diagonal drag offers its across part and its along part
    return (
      <div role="status" aria-label="Copy this change" style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{offer.text}.</span>
          {offer.parts.map((p, i) => p.count > 0 && (
            <button key={p.button} style={btn} aria-label={buttonText(p.button, p.count)}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              onClick={() => copyNow(i)}>
              {buttonText(p.button, p.count)}
            </button>
          ))}
          <button style={closeBtn} aria-label="Dismiss" title="Keep it here only" onClick={dismiss}>×</button>
        </div>
        {(offer.done || []).map((t, i) => <div key={'d' + i} style={line('var(--text3, #6B7280)')}>{t}</div>)}
        {(offer.notes || []).map((t, i) => <div key={'n' + i} style={line('var(--amber, #B87309)')}>{t}</div>)}
        <Lines skipped={offer.parts.flatMap(p => p.skipped)} warnings={offer.parts.flatMap(p => p.warnings)} />
      </div>
    )
  }
  if (report) {
    return (
      <div role="status" aria-label="Copy result" style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{report.text}.</span>
          <button style={closeBtn} aria-label="Dismiss" onClick={dismiss}>×</button>
        </div>
        <Lines skipped={report.skipped} warnings={report.warnings} />
      </div>
    )
  }
  return null
}
