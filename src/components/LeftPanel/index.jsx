import { useState }               from 'react'
import { DrawingTools }           from './DrawingTools'
import { FloorPlanPicker }        from './FloorPlanPicker'
import { ForkliftPanel }          from './ForkliftPanel'
import { AnnotationPanel }        from './AnnotationPanel'
import { WarehouseObjectPicker }  from './WarehouseObjectPicker'

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  {
    id: 'tools',
    label: 'Tools',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" width="14" height="14" strokeWidth="1.6">
        <path d="M3 15 L6 12 L14 4 L16 6 L8 14 Z" strokeLinejoin="round"/>
        <path d="M14 4 L16 2 L18 4 L16 6 Z" fill="currentColor" strokeWidth="1"/>
        <line x1="3" y1="17" x2="17" y2="17"/>
      </svg>
    ),
  },
  {
    id: 'objects',
    label: 'Objects',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" width="14" height="14" strokeWidth="1.6">
        <rect x="2" y="2" width="7" height="7" rx="1"/>
        <rect x="11" y="2" width="7" height="7" rx="1"/>
        <rect x="2" y="11" width="7" height="7" rx="1"/>
        <rect x="11" y="11" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
]

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState('tools')

  return (
    <div style={{
      width: 224, flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface2)',
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 3, padding: '7px 2px 6px',
                border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text3)',
                cursor: 'pointer', transition: 'all 0.12s',
                fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 600,
                letterSpacing: '0.03em', textTransform: 'uppercase',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)' }}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab content — each pane scrolls independently ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 'tools'     && <><FloorPlanPicker /><DrawingTools /><AnnotationPanel /></>}
        {activeTab === 'objects'   && (
          <>
            {/* <ForkliftPanel /> */}
            <WarehouseObjectPicker />
          </>
        )}
      </div>
    </div>
  )
}