import { useEffect, useMemo, useState } from 'react'
import { Paintbrush, Copy, Trash2, Plus, Star, PanelBottomOpen } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { addType, updateType, removeType, setDefault, legendCounts, typeById, typeIdAt, sprinklerClearance } from '../../utils/elevations'
import { useElevView, setShowColors } from '../../utils/elevationDraw'
import { elevationLayout, toSVG, lengthsByType } from '../../utils/elevationDrawing'
import { startPainting, usePaint, PAINT_TOOL } from '../../utils/elevPaint'
import { useElevEditor, setPane, commitTable } from '../../utils/elevEditor'
import { bayLedger } from '../../utils/bayLedger'

/* ── Elevations — the layout's rack elevation types (ELEVATIONS_PLAN.md, v2 §B) ─────────────────────────────
   The list only: each type's colour (click the swatch to change it), name (double-click to rename), bay count,
   the default; New, Duplicate, Default, Delete (its bays fall back to the default); Paint arms paint mode; Show
   colours; a small read-only preview of the selected type. Editing happens in the elevation editor docked under the
   canvas (components/Elevations/ElevationPane.jsx) — Edit opens it. Every change is one undo step. */

const S = {
  mono9: { fontSize: 9, fontFamily: 'var(--font-mono)' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 22, padding: '0 7px', fontSize: 11, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', padding: 0 },
}
const store = useCanvasStore

function Name({ t }) {
  const [edit, setEdit] = useState(false), [text, setText] = useState(t.name)
  useEffect(() => setText(t.name), [t.name])
  if (!edit) return <span onDoubleClick={() => setEdit(true)} title="Double-click to rename" style={{ flex: 1, minWidth: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
  const done = () => { setEdit(false); if (text.trim() && text.trim() !== t.name) commitTable(store, tb => updateType(tb, t.id, { name: text.trim() })) }
  return <input autoFocus aria-label="Type name" value={text} onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setText(t.name); setEdit(false) } }}
    style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 2 }} />
}

function SprinklerClearance({ value }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (Number.isFinite(v) && v >= 0 && v !== value) commitTable(store, tb => ({ ...tb, sprinklerClearanceIn: v })); else setText(String(value)) }
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }} title="The top of the top load must stay at least this far under the building's sprinkler heads">
      Sprinkler clearance
      <input aria-label="Sprinkler clearance" type="number" min={0} value={text} onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ width: 48, padding: '1px 4px', fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 2 }} />
      <span style={{ ...S.mono9, color: 'var(--text3)' }}>in</span>
    </label>
  )
}

export function ElevationsPanel() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const T = useCanvasStore(s => s.elevations)
  const activeTool = useCanvasStore(s => s.activeTool)
  const paintType = usePaint(s => s.typeId)
  const showColors = useElevView(s => s.showColors)
  const { typeId, beamIn, open } = useElevEditor()
  const counts = useMemo(() => {
    const L = bayLedger(objects, gridSize, T)
    return new Map(legendCounts(objects, T, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays]))
  }, [objects, gridSize, T])
  const selected = T ? typeById(T, typeId) || typeById(T, T.defaultId) || T.types[0] : null
  const preview = useMemo(() => {
    if (!selected) return ''
    const used = lengthsByType(objects, T, typeIdAt).get(selected.id) || []
    const e = used.find(u => u.beamIn === beamIn) || used[0]
    return toSVG(elevationLayout(selected, e ? e.beamIn : 96, { w: 240, h: 130 }, { compact: true, depthIn: e?.depthIn ?? 42, pair: !!e?.pair, flueIn: e?.flueIn ?? 9, palletWIn: e?.palletWIn ?? 40, bg: 'var(--surface)' }))
  }, [selected, objects, T, beamIn])

  if (!T) {
    return (
      <SectionHeader title="Elevations" defaultOpen={true}>
        <div style={{ padding: '10px 13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...S.mono9, color: 'var(--text3)' }}>No elevation types yet — racks placed get one from their levels.</div>
          <button type="button" style={S.btn} onClick={() => commitTable(store, t => t)}><Plus size={12} /> New type</button>
        </div>
      </SectionHeader>
    )
  }
  return (
    <SectionHeader title="Elevations" defaultOpen={true}>
      <div style={{ padding: '10px 13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="list" aria-label="Elevation types" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {T.types.map(t => {
            const on = selected && t.id === selected.id, painting = activeTool === PAINT_TOOL && paintType === t.id
            return (
              <div key={t.id} role="listitem" data-type-id={t.id} onClick={() => setPane({ typeId: t.id, beamIn: null, sel: null })} style={{
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
                <span style={{ ...S.mono9, color: 'var(--text2)' }}>{counts.get(t.id) || 0}</span>
                <button type="button" aria-label={`Paint ${t.name}`} aria-pressed={painting} title="Paint this type on the plan"
                  style={{ ...S.icon, ...(painting ? { background: 'var(--accent-solid)', color: 'var(--accent-fg)' } : {}) }}
                  onClick={e => { e.stopPropagation(); setPane({ typeId: t.id }); startPainting(store, t.id) }}><Paintbrush size={12} strokeWidth={1.5} absoluteStrokeWidth /></button>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" style={S.btn} onClick={() => commitTable(store, tb => addType(tb))}><Plus size={12} /> New</button>
          <button type="button" aria-label="Duplicate type" style={S.btn} onClick={() => commitTable(store, tb => addType(tb, { fromId: selected.id }))}><Copy size={12} /> Duplicate</button>
          <button type="button" aria-label="Set as default" disabled={selected.id === T.defaultId} style={{ ...S.btn, opacity: selected.id === T.defaultId ? 0.5 : 1 }} onClick={() => commitTable(store, tb => setDefault(tb, selected.id))}><Star size={12} /> Default</button>
          <button type="button" aria-label="Delete type" disabled={T.types.length <= 1} title="Delete — its bays go back to the default" style={{ ...S.btn, color: 'var(--red)', opacity: T.types.length <= 1 ? 0.5 : 1 }} onClick={() => { commitTable(store, tb => removeType(tb, selected.id)); setPane({ typeId: null }) }}><Trash2 size={12} /> Delete</button>
        </div>
        {/* the clearance the top load keeps under the sprinkler heads (Check layout, the drawing) — the layout's setting */}
        <SprinklerClearance value={sprinklerClearance(T)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={showColors} onChange={e => setShowColors(e.target.checked)} aria-label="Show colours" /> Show colours on the plan and PDF
        </label>
        <div aria-label="Elevation preview" title={`${selected.name} — edit in the elevation editor`} onClick={() => setPane({ open: true, typeId: selected.id })}
          style={{ border: '0.5px solid var(--border)', borderRadius: 2, background: 'var(--surface)', lineHeight: 0, cursor: 'pointer' }} dangerouslySetInnerHTML={{ __html: preview }} />
        <button type="button" style={{ ...S.btn, alignSelf: 'flex-start' }} aria-pressed={open} onClick={() => setPane({ open: !open, typeId: selected.id })}>
          <PanelBottomOpen size={12} /> {open ? 'Close editor' : 'Edit elevation'}
        </button>
      </div>
    </SectionHeader>
  )
}
