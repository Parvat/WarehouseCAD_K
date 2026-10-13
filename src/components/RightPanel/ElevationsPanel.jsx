import { useEffect, useMemo, useState } from 'react'
import { Paintbrush, Copy, Trash2, Plus, Star, Minus } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { tableOf, editTable, addType, updateType, removeType, setDefault, legendCounts, typeDepths, beamFace, ELEV_ID } from '../../utils/elevations'
import { useElevView, setShowColors, sideViewSVG, ftIn } from '../../utils/elevationDraw'
import { startPainting, usePaint, PAINT_TOOL } from '../../utils/elevPaint'
import { bayLedger } from '../../utils/bayLedger'

/* ── Elevations — the layout's rack elevation types (ELEVATIONS_PLAN.md) ─────────────────────────────────
   The types with their colour and bay count; create, edit, duplicate, delete (its bays fall back to the
   default), set as default; Paint puts the canvas in paint mode with that type (utils/elevPaint.js). The
   selected type is edited through its fields and drawn as a dimensioned side view (utils/elevationDraw.js —
   the same drawing the PDF prints). Every edit is one undo step; the types live in the layout itself. */

const S = {
  mono9: { fontSize: 9, fontFamily: 'var(--font-mono)' },
  label: { fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', minWidth: 0, padding: '3px 5px', fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 2, background: 'var(--surface)', color: 'var(--text)' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', padding: 0 },
}

/** One history entry: the table changed by `fn`. */
function commit(fn) {
  const st = useCanvasStore.getState(), next = editTable(st.objects, fn)
  if (next === st.objects) return
  useCanvasStore.setState({ objects: next })
  useCanvasStore.getState().commitObjectUpdate(ELEV_ID, {})
}

/** A number field written on Enter or blur (one history entry per edit, not per keystroke). */
function Num({ value, onCommit, label, min = 0, step = 1 }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (Number.isFinite(v) && v >= min && v !== value) onCommit(v); else setText(String(value)) }
  return <input aria-label={label} type="number" min={min} step={step} value={text} style={S.input}
    onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}
function Text({ value, onCommit, label }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return <input aria-label={label} value={text} style={S.input} onChange={e => setText(e.target.value)}
    onBlur={() => { if (text.trim() && text !== value) onCommit(text.trim()); else setText(value) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}

export function ElevationsPanel() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const activeTool = useCanvasStore(s => s.activeTool)
  const paintType = usePaint(s => s.typeId)
  const showColors = useElevView(s => s.showColors)
  const T = tableOf(objects)
  const [sel, setSel] = useState(null)
  const counts = useMemo(() => {
    const L = bayLedger(objects, gridSize)
    return new Map(legendCounts(objects, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays]))
  }, [objects, gridSize])
  const selected = T ? T.types.find(t => t.id === sel) || T.types.find(t => t.id === T.defaultId) || T.types[0] : null
  // frame depth is the racks' own (read-only): the depths of the racks carrying this type
  const depths = useMemo(() => (selected ? typeDepths(objects, selected.id) : []), [objects, selected])
  const svg = useMemo(() => (selected ? sideViewSVG(selected, { width: 240, frameDepthIn: depths.length === 1 ? depths[0] : null }) : ''), [selected, depths])

  if (!T) {
    return (
      <SectionHeader title="Elevations" defaultOpen={true}>
        <div style={{ padding: '10px 13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...S.mono9, color: 'var(--text3)' }}>No elevation types yet — racks placed get one from their levels.</div>
          <button type="button" style={{ ...S.icon, width: 'auto', padding: '0 8px', gap: 4 }} onClick={() => commit(t => t)}><Plus size={12} /> New type</button>
        </div>
      </SectionHeader>
    )
  }
  const setLevel = (k, patch) => commit(tb => updateType(tb, selected.id, { levels: selected.levels.map((l, i) => (i === k ? { ...l, ...patch } : l)) }))
  const addLevel = () => {
    const L = selected.levels, top = L[L.length - 1], step = L.length > 1 ? top.beamIn - L[L.length - 2].beamIn : 60
    const next = { ...top, beamIn: top.beamIn + step }
    commit(tb => updateType(tb, selected.id, { levels: [...L, next], uprightHeightIn: Math.max(selected.uprightHeightIn, next.beamIn + next.palletHeightIn + selected.clearanceIn) }))
  }
  const removeLevel = () => { if (selected.levels.length > 1) commit(tb => updateType(tb, selected.id, { levels: selected.levels.slice(0, -1) })) }

  return (
    <SectionHeader title="Elevations" defaultOpen={true}>
      <div style={{ padding: '10px 13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* the types */}
        <div role="list" aria-label="Elevation types" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {T.types.map(t => {
            const on = selected && t.id === selected.id, painting = activeTool === PAINT_TOOL && paintType === t.id
            return (
              <div key={t.id} role="listitem" data-type-id={t.id} onClick={() => setSel(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 2, cursor: 'pointer',
                background: on ? 'var(--surface2)' : 'transparent', border: `1px solid ${on ? 'var(--border)' : 'transparent'}`,
              }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color, border: '1px solid rgba(0,0,0,0.25)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {t.id === T.defaultId && <span title="Layout default" style={{ ...S.mono9, color: 'var(--text3)' }}>default</span>}
                <span style={{ ...S.mono9, color: 'var(--text2)' }}>{counts.get(t.id) || 0}</span>
                <button type="button" aria-label={`Paint ${t.name}`} aria-pressed={painting} title="Paint this type on the plan"
                  style={{ ...S.icon, ...(painting ? { background: 'var(--accent-solid)', color: 'var(--accent-fg)' } : {}) }}
                  onClick={e => { e.stopPropagation(); setSel(t.id); startPainting(useCanvasStore, t.id) }}><Paintbrush size={12} strokeWidth={1.5} absoluteStrokeWidth /></button>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...S.icon, width: 'auto', padding: '0 7px', gap: 4, fontSize: 11 }} onClick={() => commit(tb => addType(tb))}><Plus size={12} /> New</button>
          <button type="button" aria-label="Duplicate type" style={{ ...S.icon, width: 'auto', padding: '0 7px', gap: 4, fontSize: 11 }} onClick={() => commit(tb => addType(tb, { fromId: selected.id }))}><Copy size={12} /> Duplicate</button>
          <button type="button" aria-label="Set as default" disabled={selected.id === T.defaultId} style={{ ...S.icon, width: 'auto', padding: '0 7px', gap: 4, fontSize: 11, opacity: selected.id === T.defaultId ? 0.5 : 1 }} onClick={() => commit(tb => setDefault(tb, selected.id))}><Star size={12} /> Default</button>
          <button type="button" aria-label="Delete type" disabled={T.types.length <= 1} title="Delete — its bays go back to the default" style={{ ...S.icon, width: 'auto', padding: '0 7px', gap: 4, fontSize: 11, color: 'var(--red)', opacity: T.types.length <= 1 ? 0.5 : 1 }} onClick={() => { commit(tb => removeType(tb, selected.id)); setSel(null) }}><Trash2 size={12} /> Delete</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={showColors} onChange={e => setShowColors(e.target.checked)} aria-label="Show colours" /> Show colours on the plan and PDF
        </label>

        {/* the selected type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '0.5px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: 4, alignItems: 'end' }}>
            <div><div style={S.label}>Name</div><Text label="Type name" value={selected.name} onCommit={v => commit(tb => updateType(tb, selected.id, { name: v }))} /></div>
            <input aria-label="Type colour" type="color" value={selected.color} style={{ width: 34, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 2 }}
              onChange={e => commit(tb => updateType(tb, selected.id, { color: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            <div><div style={S.label}>Upright in</div><Num label="Upright height" value={selected.uprightHeightIn} onCommit={v => commit(tb => updateType(tb, selected.id, { uprightHeightIn: v }))} /></div>
            <div><div style={S.label}>Beam face in</div><Num label="Beam face height" value={beamFace(selected)} onCommit={v => commit(tb => updateType(tb, selected.id, { beamFaceIn: v }))} /></div>
            <div><div style={S.label}>Clear in</div><Num label="Clearance" value={selected.clearanceIn} onCommit={v => commit(tb => updateType(tb, selected.id, { clearanceIn: v }))} /></div>
          </div>
          <div aria-label="Frame depth" style={{ ...S.mono9, color: 'var(--text3)' }}>Frame depth {depths.length ? depths.map(d => ftIn(d)).join(', ') : '—'} (the racks' own)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 1fr', gap: 4, alignItems: 'center' }}>
            <span style={S.label}>L</span><span style={S.label}>Beam in</span><span style={S.label}>Pallet in</span><span style={S.label}>Load lb</span>
            {selected.levels.map((l, k) => (
              <Level key={k} k={k} l={l} onChange={p => setLevel(k, p)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" aria-label="Add level" style={{ ...S.icon, width: 'auto', padding: '0 7px', gap: 4, fontSize: 11 }} onClick={addLevel}><Plus size={12} /> Level</button>
            <button type="button" aria-label="Remove top level" disabled={selected.levels.length <= 1} style={{ ...S.icon, width: 'auto', padding: '0 7px', gap: 4, fontSize: 11 }} onClick={removeLevel}><Minus size={12} /> Level</button>
            <span style={{ ...S.mono9, color: 'var(--text3)', marginLeft: 'auto', alignSelf: 'center' }}>{selected.levels.length} levels · {ftIn(selected.uprightHeightIn)}</span>
          </div>
          <div aria-label="Side view" style={{ border: '0.5px solid var(--border)', borderRadius: 2, background: '#fff', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
    </SectionHeader>
  )
}

function Level({ k, l, onChange }) {
  return (
    <>
      <span style={{ ...S.mono9, color: 'var(--text2)' }}>{k + 1}</span>
      <Num label={`Level ${k + 1} beam height`} value={l.beamIn} onCommit={v => onChange({ beamIn: v })} />
      <Num label={`Level ${k + 1} pallet height`} value={l.palletHeightIn} onCommit={v => onChange({ palletHeightIn: v })} />
      <Num label={`Level ${k + 1} load`} value={l.loadLb} step={100} onCommit={v => onChange({ loadLb: v })} />
    </>
  )
}
