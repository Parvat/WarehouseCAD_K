import { useSyncExternalStore, useState } from 'react'
import { getDebug, subscribeDebug, clearDebug } from './debugLog'

/* TEMPORARY on-screen diagnostic. Delete with debugLog.js.
   Newest entry first, so the thing that just happened is at the top of a
   screenshot without scrolling. */

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function DebugPanel() {
  const { entries, census } = useSyncExternalStore(subscribeDebug, getDebug, getDebug)
  const [open, setOpen] = useState(true)

  const copy = () => {
    const text = [
      '--- CENSUS ---', ...(census || []),
      '', '--- LOG (newest first) ---',
      ...entries.flatMap(e => [`[${e.t}] ${e.title}`, ...e.lines.map(l => '    ' + l), '']),
    ].join('\n')
    try { navigator.clipboard.writeText(text) } catch { /* ignore */ }
  }

  return (
    <div style={{
      position: 'absolute', left: 8, bottom: 8, zIndex: 60,
      width: open ? 560 : 150, maxHeight: '52vh',
      display: 'flex', flexDirection: 'column',
      background: 'rgba(8,12,18,0.93)', color: '#dbe4f0',
      border: '1px solid #35507a', borderRadius: 6,
      font: `11px/1.45 ${mono}`, pointerEvents: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
        borderBottom: open ? '1px solid #24374f' : 'none', color: '#8fb6ef',
      }}>
        <strong style={{ flex: 1 }}>canvas2 debug</strong>
        {open && <button onClick={copy} style={btn}>copy</button>}
        {open && <button onClick={clearDebug} style={btn}>clear</button>}
        <button onClick={() => setOpen(o => !o)} style={btn}>{open ? 'hide' : 'show'}</button>
      </div>

      {open && (
        <div style={{ overflow: 'auto', padding: '6px 8px' }}>
          {census && (
            <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px dashed #24374f' }}>
              {census.map((l, i) => (
                <div key={i} style={{ color: /\bNO\b|MISMATCH|0 hittable/.test(l) ? '#ff9a8a' : '#cfe0f5' }}>{l}</div>
              ))}
            </div>
          )}
          {entries.length === 0 && <div style={{ color: '#6f8199' }}>
            drag a rack out of the building, then drag the building
          </div>}
          {entries.map(e => (
            <div key={e.id} style={{ marginBottom: 7 }}>
              <div style={{ color: '#ffd479' }}>[{e.t}] {e.title}</div>
              {e.lines.map((l, i) => (
                <div key={i} style={{
                  paddingLeft: 10,
                  color: /MISMATCH|WOULD MOVE|still parented|NOT cleared/.test(l) ? '#ff9a8a'
                       : /cleared|correct|ok\b/.test(l) ? '#9be59b' : '#cfe0f5',
                  whiteSpace: 'pre-wrap',
                }}>{l}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const btn = {
  background: '#16243a', color: '#8fb6ef', border: '1px solid #35507a',
  borderRadius: 4, padding: '1px 7px', cursor: 'pointer', font: `11px ${mono}`,
}
