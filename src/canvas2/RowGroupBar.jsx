import { usePlacement, cancelPlacement } from '../utils/placement'
import { placingName } from '../utils/placingName'
import { useRowGroup, clearGroup, applyPending, dismissPending } from '../utils/rowGroupTool'
import { rowsOf } from '../utils/rowGroup'
import { useCanvasStore } from '../store/useCanvasStore'
import { useEffect } from 'react'
import { useNotice, clearNotice, NOTICE_MS } from '../utils/notice'
import { useAreaPrompt, answerArea, answerChoice, dismissAreaNote } from '../utils/rackingAreaTool'
import { FILL_TOOL } from '../utils/fillTool'
import { SPLIT_TOOL } from '../utils/splitTool'
import { B, MONO, modePill, Sep, barBtn, CloseBtn, NoticePill } from '../studio/barParts'

/* The Row group's mode bar and the notices (STUDIO.md §1; design/studio/Studio.dc.html C8 and C6):
     - the Row group (utils/rowGroupTool.js; rows picked with the Row group tool, or the selection bar's Row group):
       a mode bar at the top, centred, top 76 — "Row group · N rows", the one "Ask | Auto apply" switch, and in Ask,
       after an edit to a group row, the positions it loses to narrow aisles, "Apply to N" (its live preview on the
       canvas: RowGroupPreview.jsx) and Skip; ✕ clears the group (Esc too). The edit's summary and the rows it warns
       about or skips are the card's (RowGroupNote — the C8 card's amber note);
     - the notices, stacked above the tool pill, 76 from the bottom: a racking area's question (its own answers), a
       zone's result (Undo, ✕), a row being placed (paste, duplicate, the library, a split piece: where it goes or why
       it can't; ✕ cancels as Esc does), the Row group's last result with the rows it names (Undo when it is the step
       just made, ✕), and a short note (utils/notice.js — what Ctrl+A kept; it goes after NOTICE_MS, ✕).
   Plain DOM — no Konva — so it renders anywhere. */

const stack = {
  position: 'fixed', left: '50%', bottom: 76, transform: 'translateX(-50%)', zIndex: 150,
  display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 8, pointerEvents: 'none',
}
const live = { pointerEvents: 'auto' }

/** A row as the bar names it: "Section 4, row 7" (stamped), else "Row at 93' across". */
export function rowLabel(key, objects, gridSize = 40) {
  if (key.startsWith('s|')) { const [, , sec, ri] = key.split('|'); return `Section ${sec}, row ${ri}` }
  const r = rowsOf(objects, gridSize).get(key)
  const o = r && objects.find(x => x.id === r.ids[0])
  if (!o) return 'A row'
  const fp = objects.find(x => x.id === o.parentId)
  const vert = ((((o.rotation || 0) % 180) + 180) % 180) === 90
  const at = vert ? (o.x + o.width / 2 - o.height / 2 - (fp?.x || 0)) : (o.y - (fp?.y || 0))
  return `Row at ${Math.round(at / gridSize * 10) / 10}' across`
}

/** "Ask | Auto apply": one switch, both words shown, the current one filled (the bar's segmented look). */
function AskAuto({ auto, onChange }) {
  const seg = (on) => ({ height: 28, display: 'flex', alignItems: 'center', padding: '0 10px', borderRadius: 6, fontSize: 12, background: on ? B.active : 'transparent', color: on ? B.accent : B.muted })
  return (
    <button type="button" role="switch" aria-checked={auto} aria-label="Auto apply"
      title={auto ? 'Auto apply: an edit to one row is applied to the others at once (one undo step)' : 'Ask: after an edit to one row, the bar asks before applying it to the others'}
      onClick={() => onChange(!auto)}
      style={{ display: 'flex', padding: 2, border: 0, borderRadius: 6, background: B.inset, flexShrink: 0 }}>
      <span style={seg(!auto)}>Ask</span>
      <span style={seg(auto)}>Auto apply</span>
    </button>
  )
}

/** The Row group's mode bar (C8). Not while Fill racking or Split is on — their own bar is. */
function GroupBar() {
  const keys = useRowGroup(s => s.keys)
  const pending = useRowGroup(s => s.pending)
  const alwaysApply = useRowGroup(s => s.alwaysApply)
  const setAlwaysApply = useRowGroup(s => s.setAlwaysApply)
  const setHover = useRowGroup(s => s.setHover)
  const tool = useCanvasStore(s => s.activeTool)
  if (!(keys.length || pending) || tool === FILL_TOOL || tool === SPLIT_TOOL) return null
  const s = pending && pending.summary
  return (
    <div role="toolbar" aria-label="Row group" data-mode-bar="row-group" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Row group</span>
      <span style={{ color: B.muted, fontSize: 12 }}><span style={{ fontFamily: MONO, color: B.text }}>{keys.length}</span> row{keys.length === 1 ? '' : 's'}</span>
      <Sep />
      <AskAuto auto={alwaysApply} onChange={setAlwaysApply} />
      {s && (
        <span role="alertdialog" aria-label="Apply to the other rows?" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sep />
          {s.narrowLost > 0 && (
            <span title={`${s.narrowLost} position${s.narrowLost === 1 ? '' : 's'} lost to narrow aisles`} style={{ height: 22, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 4, background: B.warnBg, color: B.warnFg, fontSize: 12 }}>
              <span style={{ fontFamily: MONO }}>−{s.narrowLost.toLocaleString('en-US')}</span>&nbsp;positions
            </span>
          )}
          <button type="button" aria-label="Skip" title="Skip — the edit stays on its own row" onClick={dismissPending} style={barBtn(false)}>Skip</button>
          {s.apply > 0 && (
            <button type="button" aria-label="Apply to the other rows" title={s.text} style={barBtn(true)}
              onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
              onFocus={() => setHover(true)} onBlur={() => setHover(false)}
              onClick={applyPending}>Apply to {s.apply}</button>
          )}
        </span>
      )}
      <CloseBtn label="Clear the row group" title="Clear the row group (Esc)" onClick={clearGroup} />
    </div>
  )
}

/** The pending edit as the C8 card says it — its summary in the amber note, with the rows it warns about or skips. */
export function RowGroupNote() {
  const pending = useRowGroup(s => s.pending)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const s = pending && pending.summary
  if (!s) return null
  return (
    <div role="note" aria-label="Row group edit" style={{ margin: '12px 16px', padding: '8px 10px', borderRadius: 6, background: B.warnBg, color: B.warnFg, fontSize: 12, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span>{s.text}</span>
      {s.warned.length > 0 && (
        <span aria-label="Rows with warnings" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {s.warned.map((t, i) => <span key={i}>Warning — {rowLabel(t.key, objects, gridSize)}: {t.reasons.join(', ')}</span>)}
        </span>
      )}
      {s.skipped.length > 0 && (
        <span role="alert" aria-label="Rows skipped" style={{ display: 'flex', flexDirection: 'column', gap: 1, color: B.errFg }}>
          {s.skipped.map((t, i) => <span key={i}>Skipped — {rowLabel(t.key, objects, gridSize)}: {t.reason}</span>)}
        </span>
      )}
    </div>
  )
}

/* a zone's result (rackingAreaTool's zoneNote — "Office moved · 12 bays removed · 9 restored"): its numbers in mono,
   the restored count in the accent (C6) */
function zoneNoteText(note) {
  return String(note).split(' · ').map((part, i) => {
    const m = part.match(/^(\d[\d,]*)(\s.*)$/)
    const body = m ? <><span style={{ fontFamily: MONO, color: /restored/.test(m[2]) ? B.accent : undefined }}>{m[1]}</span>{m[2]}</> : part
    return <span key={i}>{i ? ' · ' : ''}{body}</span>
  })
}

/** The Row group results a Ctrl+Z takes back (the step just made): an apply, a split — not a "Nothing applied". */
const undoableResult = (message) => /^(Applied to|Split )/.test(String(message || ''))

function Notices() {
  const placing = usePlacement(s => s.active)
  const pending = useRowGroup(s => s.pending)
  const message = useRowGroup(s => s.message)
  const report = useRowGroup(s => s.report)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const q = useAreaPrompt(s => s.question), areaNote = useAreaPrompt(s => s.note)
  // a short note (utils/notice.js) — what Ctrl+A kept; it goes after NOTICE_MS
  const notice = useNotice()
  useEffect(() => { if (!notice.text) return; const k = setTimeout(clearNotice, NOTICE_MS); return () => clearTimeout(k) }, [notice.at, notice.text])
  const undo = (then) => () => { useCanvasStore.getState().undo(); then?.() }
  const out = []
  if (q) {
    out.push(
      <div key="area-q" style={live}>
        <NoticePill role="alertdialog" label="Racking area question"
          actions={q.choices
            ? q.choices.map((c, i) => <button key={c.label} type="button" style={barBtn(i === q.choices.length - 1)} onClick={() => answerChoice(i)}>{c.label}</button>)
            : <><button type="button" style={barBtn(false)} onClick={() => answerArea(false)}>Cancel</button><button type="button" style={barBtn(true)} onClick={() => answerArea(true)}>Continue</button></>}>
          {q.text}
        </NoticePill>
      </div>)
  } else if (areaNote) {
    // the zone's change and the bays it took or gave back are one undo step (rackingAreaTool's keeper)
    out.push(<div key="area-note" style={live}><NoticePill label="Zone change" onUndo={undo(dismissAreaNote)} onClose={dismissAreaNote} closeLabel="Dismiss">{zoneNoteText(areaNote)}</NoticePill></div>)
  }
  if (placing) {
    const lines = !placing.blocked && placing.warnings?.length ? placing.warnings.map(t => ({ text: `Check — ${t}`, tone: 'amber' })) : []
    out.push(
      <div key="place" style={live}>
        <NoticePill label={`Placing ${placingName(placing.items)}`} lines={lines} onClose={() => cancelPlacement()} closeLabel="Cancel placing" closeTitle={placing.escHint || 'Esc to cancel'}>
          <span style={{ fontWeight: 600, color: B.strong }}>Placing {placingName(placing.items)}</span><span style={{ color: B.muted }}> · </span>{placing.blocked
            ? <span style={{ color: B.errFg, fontWeight: 600 }}>Can't place here — {placing.blocked}</span>
            : <span>Click to place{placing.snapped?.cross || placing.snapped?.run ? <span style={{ color: B.muted }}> · snapped to {[placing.snapped.cross, placing.snapped.run].filter(Boolean).join(', ')}</span> : null}</span>}
          <span style={{ color: B.muted }}> · {placing.escHint || 'Esc to cancel'}</span>
        </NoticePill>
      </div>)
  }
  if (message && !pending) {
    const lines = report ? [...report.warned.map(t => ({ text: `Warning — ${rowLabel(t.key, objects, gridSize)}: ${t.reasons.join(', ')}`, tone: 'amber' })), ...report.skipped.map(t => ({ text: `Skipped — ${rowLabel(t.key, objects, gridSize)}: ${t.reason}`, tone: 'red' }))] : []
    const close = () => useRowGroup.setState({ message: null, report: null })
    out.push(<div key="group-result" style={live}><NoticePill label="Row group result" lines={lines} onUndo={undoableResult(message) ? undo(close) : null} onClose={close}>{message}</NoticePill></div>)
  }
  if (notice.text) {
    out.push(
      <div key="notice" style={live}>
        <NoticePill label="Notice" onClose={clearNotice}>{notice.text}{notice.hint && <span style={{ color: B.muted }}> · {notice.hint}</span>}</NoticePill>
      </div>)
  }
  return out.length ? <div style={stack}>{out}</div> : null
}

/** The Row group's mode bar and the notices (both fixed: the mode bar at the top, the notices above the tool pill). */
export function RowGroupBar() {
  return <><GroupBar /><Notices /></>
}
