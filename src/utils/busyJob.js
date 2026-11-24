// busyJob.js — (gen-lock) a long job (Generate, Regenerate, Fill section) runs with the canvas locked: no select, drag,
// draw or keys but Esc, a progress bar and Cancel over the plan (studio/BusyLock.jsx). Nothing is placed until the job
// reaches 100%: between its steps the store shows the layout exactly as it was before the job, so the plan never shows
// a half-built layout, and the finished result lands in one store write. Cancel or Esc puts the layout back exactly as
// it was — the store's state and the autosave both (held while the job runs: the finished layout is saved once).
import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { autoLoad, autoSave, clearAutoSave, holdAutoSave, serializeScene } from './saveLoad'

/** { job: { label, progress } | null } — what the lock shows */
export const useBusy = create(() => ({ job: null }))
export const isBusy = () => !!useBusy.getState().job

let cancelled = false
/** Cancel / Esc: the job stops at its next step; the layout goes back as it was. */
export function cancelBusy() { if (useBusy.getState().job) cancelled = true }

class Cancelled extends Error {}
const frame = () => new Promise(r => requestAnimationFrame(() => r()))

/** Runs `job(pause)` under the lock → its result, or `{ cancelled: true }` (the layout as before), or null when another
 *  job is running. `job` is the work itself, writing the store as it goes; `await pause(p)` between its steps: the
 *  store shows the layout as it was before the job, the lock paints progress `p` (0…1), and the job's own state comes
 *  back — or the job ends there when Cancel or Esc was pressed. Its result is what the store holds when it returns. */
export async function runBusy(label, job) {
  if (useBusy.getState().job) return null
  const s0 = useCanvasStore.getState(), saved0 = autoLoad()
  const restore = () => {
    useCanvasStore.setState(s0, true)
    holdAutoSave(false)
    if (autoLoad() !== saved0) { if (saved0 != null) autoSave(saved0); else clearAutoSave() }
  }
  cancelled = false
  useBusy.setState({ job: { label, progress: 0 } })
  const pause = async (p) => {
    const w = useCanvasStore.getState()
    if (w !== s0) useCanvasStore.setState(s0, true)
    useBusy.setState({ job: { label, progress: Math.max(0, Math.min(1, p)) } })
    await frame()                     // the bar painted
    await frame()                     // and a frame for what was pressed meanwhile (Cancel, Esc) to land
    if (cancelled) throw new Cancelled()
    if (w !== s0) useCanvasStore.setState(w, true)
  }
  try {
    await frame()                     // the lock is up before any work blocks the thread
    if (cancelled) throw new Cancelled()
    holdAutoSave(true)
    const out = await job(pause)
    holdAutoSave(false)
    const fin = useCanvasStore.getState()
    if (fin !== s0) { try { autoSave(serializeScene(fin)) } catch { /* storage full */ } }
    return out
  } catch (e) {
    restore()
    if (e instanceof Cancelled) return { cancelled: true }
    throw e
  } finally {
    holdAutoSave(false)
    useBusy.setState({ job: null })
    cancelled = false
  }
}

/** A step generator (each `yield p` a progress point, its return the result) run under the lock: a pause at each step.
 *  `onProgress` (0…1) follows the bar. */
export function runSteps(label, it, onProgress) {
  return runBusy(label, async (pause) => {
    onProgress?.(0)
    let r
    while (!(r = it.next()).done) { onProgress?.(r.value); await pause(r.value) }
    onProgress?.(1)
    return r.value
  })
}
/** A step generator run to its end at once (no lock) → its result. */
export function drainSteps(it) { let r; while (!(r = it.next()).done); return r.value }
