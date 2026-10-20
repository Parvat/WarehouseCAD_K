import { useEffect } from 'react'
import { X, OctagonAlert, TriangleAlert, Info } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useLayoutCheck, goToIssue, exportAnyway, showIssues, remindersLabel } from '../../utils/layoutCheck'
import { getCanvasContainerSize } from '../../utils/canvasContainer'
import { openSetup } from '../../utils/project'

/* "Check layout" (utils/layoutCheck.js): the last check's problems, grouped
   ERRORS / WARNINGS. Clicking one selects its object(s) and zooms to the spot. REMINDERS (something the project
   leaves unset — a clear height, a sprinkler height) open Project settings.
   It only reports; the top bar's button runs it again. */

const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 13px 6px' }
const title = { fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' }
const group = (color) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px 4px', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.04em' })
const itemBtn = {
  display: 'block', width: '100%', textAlign: 'left', padding: '6px 13px 6px 31px', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: 12, lineHeight: 1.35, color: 'var(--text)', fontFamily: 'var(--font-ui)',
}

function Group({ label, items, color, Icon }) {
  if (!items.length) return null
  return (
    <div role="group" aria-label={label}>
      <div style={group(color)}><Icon size={13} strokeWidth={1.5} absoluteStrokeWidth />{label} ({items.length})</div>
      {items.map((it, i) => (
        <button key={it.kind + i} type="button" style={itemBtn} aria-label={it.text} title="Show it on the drawing"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          onClick={() => goToIssue(useCanvasStore, it, getCanvasContainerSize())}>
          {it.text}
        </button>
      ))}
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
    <div aria-label="Layout check" style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 8 }}>
      <div style={head}>
        <span style={title}>Layout check</span>
        <button type="button" aria-label="Close layout check" onClick={close}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}>
          <X size={14} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
      {none && <div style={{ padding: '4px 13px 6px', fontSize: 12, color: 'var(--text2)' }}>{remindersLabel(result) || 'No issues found.'}</div>}
      <Group label="Errors" items={result.errors} color="var(--red, #C0392B)" Icon={OctagonAlert} />
      <Group label="Warnings" items={result.warnings} color="var(--amber, #B87309)" Icon={TriangleAlert} />
      {!!result.reminders?.length && (
        <div role="group" aria-label="Reminders">
          <div style={group('var(--text3)')}><Info size={13} strokeWidth={1.5} absoluteStrokeWidth />Reminders ({result.reminders.length})</div>
          {result.reminders.map((it, i) => (
            <button key={it.kind + i} type="button" style={{ ...itemBtn, color: 'var(--text2)' }} aria-label={it.text} title="Open Project settings"
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              onClick={() => openSetup('settings')}>
              {it.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* PDF export with errors: asked, never blocked. */
/* THEME.md overlay: dimmed backdrop, white box, 1px line, radius 2; X, Esc and a click outside close it (nothing
   exported, the result stays for the top bar's count). */
const dlgBtn = { height: 36, padding: '0 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500 }
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
      position: 'fixed', inset: 0, zIndex: 200, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div role="alertdialog" aria-modal="true" aria-label="Export anyway?" aria-labelledby="export-ask-title"
        style={{ width: 400, maxWidth: '100%', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 2, fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <span id="export-ask-title" style={{ fontSize: 15, fontWeight: 600 }}>Export with errors</span>
          <button type="button" aria-label="Close" title="Close (Esc)" onClick={close}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 2, background: 'transparent', color: 'var(--steel)', cursor: 'pointer' }}>
            <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        </div>
        <div style={{ padding: '16px', fontSize: 14, lineHeight: 1.5 }}>{n} error{n === 1 ? '' : 's'} found. Export anyway?</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 16px 16px' }}>
          <button type="button" onClick={showIssues}
            style={{ ...dlgBtn, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)' }}>
            Show issues
          </button>
          <button type="button" onClick={() => exportAnyway(onExport)}
            style={{ ...dlgBtn, border: '1px solid var(--pine)', background: 'var(--pine)', color: '#FFFFFF' }}>
            Export anyway
          </button>
        </div>
      </div>
    </div>
  )
}
