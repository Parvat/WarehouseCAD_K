import { useEffect, useMemo, useState } from 'react'
import { Trash2, Star } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { updateType, removeType, setDefault, legendCounts, uniqueTypeName } from '../../utils/elevations'
import { useElevView, setShowColors } from '../../utils/elevationDraw'
import { commitTable } from '../../utils/elevEditor'
import { bayLedger } from '../../utils/bayLedger'

/* ── Elevation types — the layout's list, shown in Properties when nothing is selected (ELEVATIONS_PLAN.md) ─────────
   Each type's colour (click the swatch to change it), name (double-click to rename — names stay unique), bay count
   and the default; Default and Delete act on the row picked (a deleted type's bays go back to the default). Types are
   made and assigned from a selection's Elevation section (components/Elevations/ElevationSection.jsx), never here.
   Every change is one undo step. */

const S = {
  mono9: { fontSize: 9, fontFamily: 'var(--font-mono)' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 22, padding: '0 7px', fontSize: 11, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer' },
}
const store = useCanvasStore

function Name({ t }) {
  const [edit, setEdit] = useState(false), [text, setText] = useState(t.name)
  useEffect(() => setText(t.name), [t.name])
  if (!edit) return <span onDoubleClick={() => setEdit(true)} title="Double-click to rename" style={{ flex: 1, minWidth: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
  const done = () => { setEdit(false); const v = text.trim(); if (v && v !== t.name) commitTable(store, tb => updateType(tb, t.id, { name: uniqueTypeName(tb, v, t.id) })) }
  return <input autoFocus aria-label="Type name" value={text} onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setText(t.name); setEdit(false) } }}
    style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 2 }} />
}

export function ElevationTypesList() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const T = useCanvasStore(s => s.elevations)
  const showColors = useElevView(s => s.showColors)
  const [pickedId, setPicked] = useState(null)
  const counts = useMemo(() => {
    const L = bayLedger(objects, gridSize, T)
    return new Map(legendCounts(objects, T, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays]))
  }, [objects, gridSize, T])
  if (!T) return null
  const picked = T.types.find(t => t.id === pickedId) || T.types.find(t => t.id === T.defaultId) || T.types[0]
  return (
    <SectionHeader title="Elevation types" defaultOpen={true}>
      <div style={{ padding: '4px 13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="list" aria-label="Elevation types" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {T.types.map(t => {
            const on = t.id === picked.id
            return (
              <div key={t.id} role="listitem" data-type-id={t.id} onClick={() => setPicked(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 2, cursor: 'pointer',
                background: on ? 'var(--surface2)' : 'transparent', border: `1px solid ${on ? 'var(--border)' : 'transparent'}`,
              }}>
                <label onClick={e => e.stopPropagation()} title="Colour" style={{ position: 'relative', width: 13, height: 13, flexShrink: 0, cursor: 'pointer' }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 3, background: t.color, border: '1px solid rgba(0,0,0,0.25)' }} />
                  <input aria-label={`${t.name} colour`} type="color" value={t.color} onChange={e => commitTable(store, tb => updateType(tb, t.id, { color: e.target.value }))}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                </label>
                <Name t={t} />
                {t.id === T.defaultId && <span title="Layout default" style={{ ...S.mono9, color: 'var(--text3)' }}>default</span>}
                <span title="Bays (each side of a back-to-back one bay)" style={{ ...S.mono9, color: 'var(--text2)' }}>{counts.get(t.id) || 0}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" aria-label="Set as default" disabled={picked.id === T.defaultId} style={{ ...S.btn, opacity: picked.id === T.defaultId ? 0.5 : 1 }} onClick={() => commitTable(store, tb => setDefault(tb, picked.id))}><Star size={12} /> Default</button>
          <button type="button" aria-label="Delete type" disabled={T.types.length <= 1} title="Delete — its bays go back to the default" style={{ ...S.btn, color: 'var(--red)', opacity: T.types.length <= 1 ? 0.5 : 1 }} onClick={() => { commitTable(store, tb => removeType(tb, picked.id)); setPicked(null) }}><Trash2 size={12} /> Delete</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={showColors} onChange={e => setShowColors(e.target.checked)} aria-label="Show colours" /> Show colours on the plan and PDF
        </label>
        <div style={{ ...S.mono9, color: 'var(--text3)', lineHeight: 1.5 }}>Select racks or bays to set or edit their elevation.</div>
      </div>
    </SectionHeader>
  )
}
