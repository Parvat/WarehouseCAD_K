import { useEffect } from 'react'
import { useBusy, cancelBusy } from '../utils/busyJob'
import { C, MONO, Btn } from './cardParts'

/* ── (gen-lock) The lock while a long job runs (utils/busyJob.js: Generate, Regenerate, Fill section) ────────────────
   A clear layer over the whole window takes every pointer (no select, drag, draw, pan or zoom) and every key but Esc,
   which cancels. Over the plan's middle: a dark island with the job's name, its percentage, a progress bar and Cancel.
   The island fades in after a moment (250 ms), so a quick job never flashes it; the lock itself is on at once. */
export function BusyLock() {
  const job = useBusy(s => s.job)
  useEffect(() => {
    if (!job) return
    const key = (e) => {
      e.stopImmediatePropagation()
      e.preventDefault()
      if (e.type === 'keydown' && e.key === 'Escape') cancelBusy()
    }
    const opts = { capture: true }
    window.addEventListener('keydown', key, opts)
    window.addEventListener('keyup', key, opts)
    window.addEventListener('keypress', key, opts)
    return () => {
      window.removeEventListener('keydown', key, opts)
      window.removeEventListener('keyup', key, opts)
      window.removeEventListener('keypress', key, opts)
    }
  }, [!!job]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!job) return null
  const pct = Math.round((job.progress || 0) * 100)
  const stop = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault() }
  return (
    <div data-busy-lock aria-busy="true" onWheel={stop} onContextMenu={stop}
      style={{ position: 'fixed', inset: 0, zIndex: 400, cursor: 'progress', background: 'transparent' }}>
      <div role="dialog" aria-label={job.label} className="st-busy-card"
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 300, padding: '14px 16px', borderRadius: 12, background: C.island, color: C.text, boxShadow: '0 8px 24px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ flex: 1, fontWeight: 600, color: C.strong }}>{job.label}…</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{pct}%</span>
        </div>
        <div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          style={{ height: 6, borderRadius: 3, background: C.inset, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: C.accent, transition: 'width .15s linear' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, color: C.muted, fontSize: 12 }}>Nothing changes until it finishes. Esc cancels.</span>
          <Btn kind="ghost" onClick={cancelBusy} style={{ height: 30 }}>Cancel</Btn>
        </div>
      </div>
    </div>
  )
}
