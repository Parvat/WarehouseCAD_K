import { useEffect } from 'react'
import { X, OctagonAlert, TriangleAlert, Info } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useLayoutCheck, goToIssue, exportAnyway, showIssues, remindersLabel } from '../../utils/layoutCheck'
import { getCanvasContainerSize } from '../../utils/canvasContainer'
import { openSetup } from '../../utils/project'
import { Note } from '../shared/Note'

/* "Check layout" (utils/layoutCheck.js): the last check's problems, grouped
   ERRORS / WARNINGS. Clicking one selects its object(s) and zooms to the spot. REMINDERS (something the project
   leaves unset — a clear height, a sprinkler height) open Project settings.
   It only reports; the top bar's button runs it again. */

/* Each group is one shared Note box (components/shared/Note.jsx, M1): errors in the error box, warnings in the
   warning box, reminders in the note box — its items the problems, one per line, each a button to the spot. */
const itemBtn = {
  display: 'block', width: '100%', textAlign: 'left', padding: '4px 0', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: 12, lineHeight: 1.5, color: 'inherit', fontFamily: 'var(--font-ui)', borderRadius: 2,
}
const hoverOn = e => { e.currentTarget.style.textDecoration = 'underline' }
const hoverOff = e => { e.currentTarget.style.textDecoration = 'none' }

function Group({ label, items, level, Icon }) {
  if (!items.length) return null
  return (
    <div role="group" aria-label={label}>
      <Note level={level} icon={Icon} title={<>{label} (<span className="t-num">{items.length}</span>)</>}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it, i) => (
            <button key={it.kind + i} type="button" style={itemBtn} aria-label={it.text} title="Show it on the drawing"
              onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              onClick={() => goToIssue(useCanvasStore, it, getCanvasContainerSize())}>
              {it.text}
            </button>
          ))}
        </div>
      </Note>
    </div>
  )
}

export function LayoutCheckPanel() {
  const result = useLayoutCheck(s => s.result)
  const open = useLayoutCheck(s => s.open)
  const close = useLayoutCheck(s => s.close)
  if (!open || !result) return null
  const none = !result.errors.length && !result.warnings.length
  return (
    <div aria-label="Layout check" style={{ borderBottom: '1px solid var(--line)', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40, marginRight: -8 }}>
        <span className="t-head">Layout check</span>
        <button type="button" aria-label="Close layout check" onClick={close} className="t-icon">
          <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
      {none && <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{remindersLabel(result) || 'No issues found.'}</div>}
      <Group label="Errors" items={result.errors} level="error" Icon={OctagonAlert} />
      <Group label="Warnings" items={result.warnings} level="warning" Icon={TriangleAlert} />
      {!!result.reminders?.length && (
        <div role="group" aria-label="Reminders">
          <Note level="note" icon={Info} title={<>Reminders (<span className="t-num">{result.reminders.length}</span>)</>}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {result.reminders.map((it, i) => (
                <button key={it.kind + i} type="button" style={itemBtn} aria-label={it.text} title="Open Project settings"
                  onMouseEnter={hoverOn} onMouseLeave={hoverOff}
                  onClick={() => openSetup('settings')}>
                  {it.text}
                </button>
              ))}
            </div>
          </Note>
        </div>
      )}
    </div>
  )
}

/* PDF export with errors: asked, never blocked. */
/* THEME.md overlay: dimmed backdrop, white box, 1px line, radius 2; X, Esc and a click outside close it (nothing
   exported, the result stays for the top bar's count). */
export function ExportCheckDialog({ onExport }) {
  const ask = useLayoutCheck(s => s.askExport)
  const close = () => useLayoutCheck.setState({ askExport: null })
  useEffect(() => {
    if (!ask) return
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [ask])
  if (!ask) return null
  const n = ask.errors
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) close() }} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div role="alertdialog" aria-modal="true" aria-label="Export anyway?" aria-labelledby="export-ask-title"
        style={{ width: 400, maxWidth: '100%', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 2, boxShadow: 'var(--shadow-pop)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
        <div className="t-modal-head">
          <span id="export-ask-title" className="t-modal-title">Export with errors</span>
          <button type="button" aria-label="Close" title="Close (Esc)" onClick={close} className="t-icon">
            <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        </div>
        <div style={{ padding: 16, fontSize: 14, lineHeight: 1.5 }}><span className="t-num">{n}</span> error{n === 1 ? '' : 's'} found. Export anyway?</div>
        <div className="t-modal-foot">
          <button type="button" onClick={showIssues} className="t-btn t-btn--secondary t-btn--36">
            Show issues
          </button>
          <button type="button" onClick={() => exportAnyway(onExport)} className="t-btn t-btn--primary t-btn--36">
            Export anyway
          </button>
        </div>
      </div>
    </div>
  )
}
