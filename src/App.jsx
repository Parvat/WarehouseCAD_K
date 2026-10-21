import { useState, useEffect } from 'react'
import { TopBar }     from './components/Toolbar/TopBar'
import { RightPanel } from './components/RightPanel/index'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useCanvasStore } from './store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { FloatingToolbar } from './components/LeftPanel/FloatingToolbar'
import { ArrowLeft } from 'lucide-react'
import { Canvas2 } from './canvas2/Canvas2'
import { ColumnCheckProvider } from './generate/useColumnCheck'
import { RulesProvider } from './rules/useRules'
import { Login } from './shell/Login'
import { Hub } from './shell/Hub'
import { nanoid } from 'nanoid'
import { installAisleKeeper } from './utils/aisleKeeper'
import { installRowEditKeeper } from './utils/rowEditKeeper'
import { installRowGroupWatcher } from './utils/rowGroupTool'
import { installPairKeeper } from './utils/pairCarryOn'
import { trackCanvasPointer } from './utils/pasteAt'
import { installLayerKeeper } from './utils/layers'
import { installLevelsKeeper } from './utils/rackLevels'
import { installElevationsKeeper } from './utils/elevations'
import { installLiveRecheck } from './utils/layoutCheck'
import { installAreaKeeper } from './utils/rackingAreaTool'
import { installToolKeeper } from './utils/toolSwitch'
import { installProjectKeeper } from './utils/project'
import { useRackingSettings } from './utils/fillTool'
import { ProjectSync } from './components/Project/ProjectSync'
import { ProjectSetup } from './components/Project/ProjectSetup'

/* Aisle labels only ever pair two directly facing rows: re-pairs them after
   deletes, pastes, undo/redo and every commit (utils/aisleKeeper.js). Once,
   for the life of the app (and once per hot reload of this module). */
const stopAisleKeeper = installAisleKeeper(useCanvasStore, nanoid)
if (import.meta.hot) import.meta.hot.dispose(() => stopAisleKeeper())
/* A copied row loses the row it was copied from's stamps (utils/rowEditKeeper.js). */
const stopRowEditKeeper = installRowEditKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopRowEditKeeper())
/* A pair that grows a bay where its carried-on single stands takes that bay over from it — folded into the
   edit's own history entry (utils/pairCarryOn.js). Before the Row group's watcher, which then reads the
   edit with the takeover in it. */
const stopPairKeeper = installPairKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopPairKeeper())
/* The Row group: an edit to one row of the group is offered to the others (utils/rowGroupTool.js). */
const stopRowGroupWatcher = installRowGroupWatcher(useCanvasStore, nanoid)
if (import.meta.hot) import.meta.hot.dispose(() => stopRowGroupWatcher())
/* The layer list is always the seven standard layers (utils/layers.js). */
const stopLayerKeeper = installLayerKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopLayerKeeper())
/* Every beam rack has levels — 4 unless set (utils/rackLevels.js). */
const stopLevelsKeeper = installLevelsKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopLevelsKeeper())
/* Elevation types: made from the racks' levels on load, kept consistent after each action, folded into that
   action's history entry (utils/elevations.js). */
const stopElevationsKeeper = installElevationsKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopElevationsKeeper())
/* Check layout: while its list is open, re-checked after every committed change (utils/layoutCheck.js). */
const stopLiveRecheck = installLiveRecheck(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopLiveRecheck())
/* A zone placed, moved or resized over racks, a racking area deleted with its
   racks: taken back and asked about (utils/rackingAreaTool.js). Installed
   after the copy watcher on purpose. */
const stopAreaKeeper = installAreaKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopAreaKeeper())
/* a tool ends fully when another is chosen: its box, hover, ghost, the measure mode (utils/toolSwitch.js) */
const stopToolKeeper = installToolKeeper(useCanvasStore)
if (import.meta.hot) import.meta.hot.dispose(() => stopToolKeeper())
/* The project (utils/project.js): a layout without one is given one from what it uses — the forklift, wall clearance
   and pallet in the Racking settings, the units — nothing moves; a new empty layout opens Project setup. After the
   elevations keeper, which gives a layout its types first. */
const stopProjectKeeper = installProjectKeeper(useCanvasStore, () => { const r = useRackingSettings.getState(); return { mhe: r.mhe, wallClearIn: r.wallClearIn, palletWIn: r.palletWIn, palletDIn: r.palletDIn, units: useCanvasStore.getState().unit } })
if (import.meta.hot) import.meta.hot.dispose(() => stopProjectKeeper())
/* Paste lands at the mouse cursor: remember where it last was over the canvas. */
const stopPointer = trackCanvasPointer(window)
if (import.meta.hot) import.meta.hot.dispose(() => stopPointer())

// Simple placeholder for apps that don't exist yet (Inspect / Label).
function Placeholder({ title, onBack }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', color: 'var(--ink)',
      fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 48, borderBottom: '1px solid var(--line)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)',
          fontWeight: 600, fontSize: 18, color: 'var(--pine)' }}>
          <span style={{ width: 8, height: 8, background: 'currentColor', borderRadius: 1, transform: 'rotate(45deg)', display: 'inline-block' }} />Trace
        </div>
        <button type="button" onClick={onBack} className="t-btn t-btn--secondary">
          <ArrowLeft size={16} strokeWidth={1.5} absoluteStrokeWidth /> Hub
        </button>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>/ {title}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, color: 'var(--pine)' }}>{title}</div>
        <div style={{ color: 'var(--steel)', fontSize: 14 }}>This app reads a layout from Draw. Coming next.</div>
      </div>
    </div>
  )
}

export default function App() {
  useKeyboardShortcuts()
  const { uiTheme, uiScale, restoreAutoSave, hasAutoSave, setUiTheme } = useCanvasStore(useShallow(s => ({ uiTheme: s.uiTheme, uiScale: s.uiScale, restoreAutoSave: s.restoreAutoSave, hasAutoSave: s.hasAutoSave, setUiTheme: s.setUiTheme })))
  const [view, setView] = useState('login')

  useEffect(() => {
    if (hasAutoSave()) restoreAutoSave()
    setUiTheme('trace')   // default the CAD to the Trace pine-on-paper skin
  }, []) // eslint-disable-line

  // a new project's start screen: <ProjectSetup /> opens it while the CAD is on screen (utils/project.js
  // installStartScreen) — entering on an empty layout, File → New while already in, a refresh

  if (view === 'login') return <Login onEnter={() => setView('hub')} />
  if (view === 'hub')   return <Hub onOpen={setView} />
  if (view === 'inspect' || view === 'label')
    return <Placeholder title={view === 'inspect' ? 'Inspect' : 'Label'} onBack={() => setView('hub')} />

  // ── Draw = the real CAD ────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      data-theme={uiTheme}
      data-scale={uiScale}
      style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-ui)' }}
    >
      {/* The column check is a read-only lens over the canvas store, so the
          provider wraps the editor rather than living in it. The forklift
          input (GeneratePanel) and the absorb/remove list (RightPanel) both
          read one derived result. The on-canvas red conflict markings
          (ColumnCheckOverlay) were an SVG-engine-only overlay, retired with
          it — see CANVAS2_BUGLOG.md's final entry. */}
      <RulesProvider>
      <ColumnCheckProvider>
        <TopBar />
        <ProjectSync />
        <ProjectSetup />
        <div className="flex flex-1 min-h-0 overflow-hidden">
                    <FloatingToolbar />
          <div className="flex flex-col flex-1 min-w-0 min-h-0" style={{ position: 'relative' }}>
            {/* back to the hub: first in the canvas's bottom row (Canvas2.jsx), the elevation chip beside it —
                never over the left panel's footer (Project settings). Generate lives in the top bar. */}
            <Canvas2 hubButton={
              <button type="button" onClick={() => setView('hub')} title="Back to hub" data-float-avoid className="t-btn t-btn--secondary"
                style={{ boxShadow: 'var(--shadow-pop)' }}>
                <ArrowLeft size={16} strokeWidth={1.5} absoluteStrokeWidth /> Hub
              </button>
            } />
          </div>
          <RightPanel />
        </div>
      </ColumnCheckProvider>
      </RulesProvider>
    </div>
  )
}
