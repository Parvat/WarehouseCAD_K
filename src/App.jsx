import { useState, useEffect } from 'react'
import { TopBar }     from './components/Toolbar/TopBar'
import { LeftPanel }  from './components/LeftPanel/index'
import { RightPanel } from './components/RightPanel/index'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useCanvasStore } from './store/useCanvasStore'
import { FloatingToolbar } from './components/LeftPanel/FloatingToolbar'
import { GeneratePanel } from './components/Generate/GeneratePanel'
import { Canvas2 } from './canvas2/Canvas2'
import { ColumnCheckProvider } from './generate/useColumnCheck'
import { RulesProvider } from './rules/useRules'
import { Login } from './shell/Login'
import { Hub } from './shell/Hub'

// Simple placeholder for apps that don't exist yet (Inspect / Label).
function Placeholder({ title, onBack }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F2F1EC', color: '#161C18',
      fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 56, borderBottom: '1.5px solid #14392B', background: '#ECEAE1',
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: "'Oswald', sans-serif",
          fontWeight: 700, fontSize: 19, color: '#14392B' }}>
          <span style={{ width: 8, height: 8, background: 'currentColor', borderRadius: 1, transform: 'rotate(45deg)', display: 'inline-block' }} />Trace
        </div>
        <button onClick={onBack} style={{ fontSize: 13, color: '#6E7A6F', background: 'none', border: 'none',
          cursor: 'pointer', fontWeight: 500 }}>← Hub</button>
        <span style={{ fontSize: 13, color: '#161C18', fontWeight: 600 }}>/ {title}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 24, color: '#14392B' }}>{title}</div>
        <div style={{ color: '#6E7A6F', fontSize: 14 }}>This app reads a layout from Draw. Coming next.</div>
      </div>
    </div>
  )
}

export default function App() {
  useKeyboardShortcuts()
  const { uiTheme, uiScale, restoreAutoSave, hasAutoSave, setUiTheme } = useCanvasStore()
  const [view, setView] = useState('login')

  useEffect(() => {
    if (hasAutoSave()) restoreAutoSave()
    setUiTheme('trace')   // default the CAD to the Trace pine-on-paper skin
  }, []) // eslint-disable-line

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
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <FloatingToolbar />
          <Canvas2 />
          <RightPanel />
        </div>
        <GeneratePanel />
      </ColumnCheckProvider>
      </RulesProvider>
      <button onClick={() => setView('hub')} title="Back to hub" style={{
        position: 'fixed', left: 12, bottom: 36, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)',
        fontFamily: 'var(--font-ui)', boxShadow: '0 2px 8px rgba(20,57,43,0.12)',
      }}>← Hub</button>
    </div>
  )
}
