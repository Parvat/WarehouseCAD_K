import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { Disclosure } from '../shared/Disclosure'
import {
  Trash2, BringToFront, SendToBack, ChevronUp, ChevronDown, Lock, Unlock,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { pxToFtIn } from '../../utils/canvas'
import { RackRowPanel, MultiBayPanel, CantileverPanel, ColumnGridPanel, DriveInPanel, DriveThroughPanel, PushbackPanel } from '../RightPanel/Rackrowpanel'
import { getLayoutCapacity } from '../../utils/capacity'
import { useColumnCheck } from '../../generate/useColumnCheck'
import { usableCapacity } from '../../generate/usableCapacity'
import { PALETTE_COLORS } from '../../constants'

/* The app's locked type system. Montserrat and JetBrains Mono are loaded by
   index.html; Inter was added alongside them. `monospace` is the generic
   fallback. Nothing else — an unloaded family silently renders as a system
   fallback, which is how every label once ended up in the wrong face. */
const TEXT_FONTS = ['Montserrat', 'Inter', 'JetBrains Mono', 'monospace']

/* ─── Shared Styles ────────────────────────────────────────────────────────── */

const S = {
  label:  { fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text3)', width:36, flexShrink:0 },
  mono9:  { fontSize:9,  fontFamily:'var(--font-mono)' },
  mono10: { fontSize:10, fontFamily:'var(--font-mono)' },
  mono11: { fontSize:11, fontFamily:'var(--font-mono)' },
  input: {
    /* minWidth:0 is load-bearing. A flex child floors at its min-content width,
       and a number input's min-content is its full default box (~145px) — so
       two of these side by side (the floor-plan W/H row) blew straight through
       the 272px panel and the second field was clipped off the edge. */
    flex:1, minWidth:0, borderRadius:6, padding:'5px 8px',
    background:'var(--surface2)', border:'1px solid var(--border)',
    fontSize:11, color:'var(--text)', fontFamily:'var(--font-mono)', outline:'none',
    transition:'border-color 0.15s',
  },
}

/* ─── Field Components ─────────────────────────────────────────────────────── */

function NumField({ label, value, onChange, onCommit, unit = '' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={S.label}>{label}</span>
      <input
        type="number" step="1"
        defaultValue={Math.round(value ?? 0)}
        key={Math.round(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={(e) => { e.target.style.borderColor='var(--border)'; onCommit && onCommit(Number(e.target.value)) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onCommit && onCommit(Number(e.target.value)); e.target.blur() } }}
        onFocus={e => e.target.style.borderColor='var(--accent)'}
        style={S.input}
      />
      {unit && <span style={{...S.mono10, color:'var(--text3)'}}>{unit}</span>}
    </div>
  )
}

function DimReadout({ label, px, gridSize = 40 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={S.label}>{label}</span>
      <span style={{...S.mono11, color:'var(--accent)'}}>{pxToFtIn(px, gridSize)}</span>
      <span style={{...S.mono9, color:'var(--text3)', opacity:0.5}}>({Math.round(px)}px)</span>
    </div>
  )
}

/* ─── Capacity Hero ────────────────────────────────────────────────────────── */

const RACK_TYPE_META = {
  rack_row:           { name: 'Selective',      color: '#818cf8' },
  rack_double_row:    { name: 'Double Deep',    color: '#a78bfa' },
  rack_drive_in:      { name: 'Drive-In',       color: '#34d399' },
  rack_drive_through: { name: 'Drive-Through',  color: '#2dd4bf' },
  rack_pushback:      { name: 'Pushback',       color: '#fbbf24' },
  rack_pallet_flow:   { name: 'Pallet Flow',    color: '#f472b6' },
}

function CapacityHero({ objects }) {
  const layoutCap = getLayoutCapacity(objects)
  /* Usable = gross minus what Column Check says is lost (in-rack columns and
     blocked pick zones, each position once) — read off the SAME check result
     the Column Check panel shows, so the two totals always agree. */
  const { result } = useColumnCheck()
  const { usable } = usableCapacity(objects, { check: result })
  if (layoutCap.total === 0) return null

  const entries = Object.entries(layoutCap.breakdown)
  const maxCount = Math.max(...entries.map(([, c]) => c))
  const rackCount = objects.filter(o => RACK_TYPE_META[o.type]).length

  return (
    <div style={{ margin:'0 10px 10px', display:'flex', flexDirection:'column', gap:6 }}>

      {/* ── Total — hero card ────────────────────────────────────── */}
      <div style={{
        borderRadius:8, padding:'14px 12px 12px',
        background:'var(--surface2)',
        border:'1px solid var(--border)',
      }}>
        <span style={{
          fontSize:9, fontWeight:600, color:'var(--text3)',
          textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:6,
        }}>
          Total pallet positions
        </span>

        <div style={{ display:'flex', alignItems:'baseline', flexWrap:'wrap', columnGap:6, rowGap:4 }}>
          <span style={{
            fontSize:32, fontWeight:800, fontFamily:'var(--font-mono)',
            color:'var(--text)', letterSpacing:'-0.03em', lineHeight:1,
          }}>
            {layoutCap.total.toLocaleString()}
          </span>
          <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500 }}>positions</span>
          {/* "· M usable" wraps as one unit on a narrow panel, never split */}
          <span style={{ display:'inline-flex', alignItems:'baseline', gap:5, whiteSpace:'nowrap' }}>
            <span style={{ fontSize:11, color:'var(--text3)' }}>·</span>
            <span data-testid="capacity-usable" style={{
              fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)',
              color:'var(--text)', letterSpacing:'-0.02em', lineHeight:1,
            }}>
              {usable.toLocaleString()}
            </span>
            <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500 }}>usable</span>
          </span>
        </div>

        <div style={{
          marginTop:10, display:'flex', gap:16,
          paddingTop:10, borderTop:'1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>Racks</div>
            <div style={{ fontSize:11, color:'var(--text)', fontWeight:600, fontFamily:'var(--font-mono)' }}>{rackCount}</div>
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>Types</div>
            <div style={{ fontSize:11, color:'var(--text)', fontWeight:600, fontFamily:'var(--font-mono)' }}>{entries.length}</div>
          </div>
        </div>
      </div>

      {/* ── Breakdown card ───────────────────────────────────────── */}
      <div style={{
        borderRadius:8, overflow:'hidden',
        border:'1px solid var(--border)',
        background:'var(--surface2)',
      }}>
        <div style={{
          padding:'6px 10px', borderBottom:'1px solid var(--border)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'var(--surface3)',
        }}>
          <span style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>
            By type
          </span>
          <span style={{ fontSize:9, color:'var(--text3)' }}>positions</span>
        </div>

        {entries.map(([type, count], i) => {
          const meta = RACK_TYPE_META[type] || { name: type, color: '#888' }
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0

          return (
            <div key={type} style={{
              padding:'7px 10px',
              borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none',
              display:'flex', flexDirection:'column', gap:4,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:6, height:6, borderRadius:2, background:meta.color, flexShrink:0 }}/>
                  <span style={{ fontSize:11, color:'var(--text2)', fontFamily:'var(--font-mono)' }}>{meta.name}</span>
                </div>
                <span style={{ fontSize:11, color:'var(--text)', fontWeight:700, fontFamily:'var(--font-mono)' }}>
                  {count.toLocaleString()}
                </span>
              </div>
              <div style={{ height:3, borderRadius:2, background:'var(--surface3)', overflow:'hidden' }}>
                <div style={{
                  height:'100%', borderRadius:2, background:meta.color,
                  width:`${pct}%`, transition:'width 0.3s ease',
                }}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Aisle Panel ──────────────────────────────────────────────────────────── */

function AislePanel({ obj }) {
  const { commitObjectUpdate } = useCanvasStore()
  const direction = obj.direction || 'both'
  const label     = obj.label || ''

  const btnStyle = (active) => ({
    padding:'4px 10px', borderRadius:5, cursor:'pointer',
    ...S.mono9,
    background: active ? 'var(--accent-solid)' : 'var(--surface3)',
    border: `1px solid ${active ? 'var(--accent-bdr)' : 'var(--border)'}`,
    color: active ? 'var(--accent-fg)' : 'var(--text3)',
    transition:'all 0.15s',
  })

  return (
    <div style={{ padding:8, display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ ...S.mono9, color:'var(--text3)', minWidth:50 }}>Name</span>
        <input type="text" defaultValue={label} key={`label-${obj.id}`}
          placeholder="e.g. Main Aisle"
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => commitObjectUpdate(obj.id, { label: e.target.value })}
          style={{
            flex:1, padding:'3px 6px', borderRadius:5, ...S.mono11,
            background:'var(--surface3)', border:'1px solid var(--border)',
            color:'var(--text)', outline:'none',
          }}/>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ ...S.mono9, color:'var(--text3)', minWidth:50 }}>Traffic</span>
        {[
          { val:'up',   label:'↑' },
          { val:'down', label:'↓' },
          { val:'both', label:'↕' },
          { val:'none', label:'—' },
        ].map(({ val, label: lbl }) => (
          <button key={val} onClick={() => commitObjectUpdate(obj.id, { direction: val })}
            style={btnStyle(direction === val)}>{lbl}</button>
        ))}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PANEL                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function PropertiesPanel() {
  const { selectedIds, objects, groups, updateObject, commitObjectUpdate, deleteSelected, gridSize,
          bringForward, sendBackward, bringToFront, sendToBack, toggleLockSelected, createAisle,
          showAisles, toggleAisles } = useCanvasStore()
  const selected = objects.filter(o => selectedIds.includes(o.id))

  /* ── Nothing selected → layout overview ──────────────────────────────────── */
  if (!selected.length) {
    return (
      <SectionHeader title="Properties" defaultOpen={true}>
        <div style={{
          padding:'14px 12px', ...S.mono10, color:'var(--text3)',
          display:'flex', flexDirection:'column', gap:4,
        }}>
          <span style={{ color:'var(--text2)', fontWeight:500 }}>No object selected</span>
          <span style={{ opacity:0.5, fontSize:9 }}>Draw or click a shape to edit properties.</span>
        </div>
        <CapacityHero objects={objects} />
      </SectionHeader>
    )
  }

  /* ── Group selected ──────────────────────────────────────────────────────── */
  const selSet = new Set(selectedIds)
  const activeGroup = (groups || []).find(g => g.ids.some(id => selSet.has(id)))
  if (activeGroup) {
    return (
      <SectionHeader title="Properties" defaultOpen={true}>
        <div style={{ padding:12, ...S.mono10, color:'var(--text3)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--purple)' }} />
            <span style={{ color:'var(--purple)' }}>Group · {activeGroup.ids.length} objects</span>
          </div>
          <p style={{ opacity:0.6 }}>Use the Arrange panel to edit group properties, rotate, or remove members.</p>
          <button onClick={deleteSelected} style={{
            marginTop:10, display:'flex', alignItems:'center', gap:5,
            background:'none', border:'none', cursor:'pointer',
            color:'var(--red)', ...S.mono10,
          }}>
            <Trash2 size={11} /> Delete group
          </button>
        </div>
      </SectionHeader>
    )
  }

  /* ── Multi-select ────────────────────────────────────────────────────────── */
  const multi = selected.length > 1
  if (multi) {
    const RACK_TYPES = new Set(['rack_row','rack_double_row','rack_cantilever','rack_pushback','rack_pallet_flow'])
    const twoRacks = selected.length === 2 && selected.every(o => RACK_TYPES.has(o.type))
    return (
      <SectionHeader title={`Properties (${selected.length})`} defaultOpen={true}>
        <div style={{ padding:12 }}>
          <p style={{ ...S.mono10, color:'var(--text3)' }}>{selected.length} objects selected.</p>
          {twoRacks && (
            <button
              onClick={() => createAisle(selected[0].id, selected[1].id)}
              style={{
                marginTop:8, width:'100%', padding:'7px 0', borderRadius:5,
                ...S.mono9, fontWeight:600, cursor:'pointer',
                background:'var(--accent-dim)', border:'1px solid var(--accent-bdr)', color:'var(--accent)',
                transition:'all 0.15s',
              }}>
              + Create Aisle Label
            </button>
          )}
          <button onClick={deleteSelected} style={{
            marginTop:8, display:'flex', alignItems:'center', gap:5,
            background:'none', border:'none', cursor:'pointer',
            color:'var(--red)', ...S.mono10,
          }}>
            <Trash2 size={11} /> Delete all
          </button>
        </div>
      </SectionHeader>
    )
  }

  /* ── Single object ───────────────────────────────────────────────────────── */
  const hasAisles = objects.some(o => o.type === 'aisle')
  const obj = selected[0]
  const up     = (k, v) => updateObject(obj.id, { [k]: v })
  const commit = (k, v) => commitObjectUpdate(obj.id, { [k]: v })

  // Bay / tower selection pill
  const bayLabel = obj.activeBayIdx != null
    ? `Bay ${obj.activeBayIdx + 1}`
    : obj.activeTowerIdx != null
      ? `Tower ${obj.activeTowerIdx + 1}`
      : null

  return (
    <>
    {hasAisles && (
      <div style={{ padding:'4px 8px', borderBottom:'1px solid var(--border)' }}>
        <button onClick={toggleAisles} style={{
          width:'100%', padding:'6px 0', borderRadius:5, cursor:'pointer',
          ...S.mono9, fontWeight:600,
          background: showAisles ? 'var(--accent-solid)' : 'var(--surface2)',
          border: `1px solid ${showAisles ? 'var(--accent-bdr)' : 'var(--border)'}`,
          color: showAisles ? 'var(--accent-fg)' : 'var(--text3)',
          transition:'all 0.15s',
        }}>
          {showAisles ? '● Aisle labels visible' : '○ Aisle labels hidden'}
        </button>
      </div>
    )}
    <SectionHeader title="Properties" defaultOpen={true}>
      <div style={{ padding:'12px 13px 14px', display:'flex', flexDirection:'column', gap:11 }}>

        {/* ── Object header ───────────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{
              ...S.mono9, padding:'3px 8px',
              background:'var(--surface3)', borderRadius:4,
              color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em',
              border:'1px solid var(--border)',
            }}>
              {obj.type?.replace(/_/g,' ') || 'shape'}
            </span>
            {bayLabel && (
              <span style={{
                ...S.mono9, padding:'3px 8px',
                background:'var(--accent-dim)', borderRadius:4,
                color:'var(--accent)', fontWeight:600,
                border:'1px solid var(--accent-bdr)',
              }}>
                {bayLabel}
              </span>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:2 }}>
            {[
              { action: toggleLockSelected, title: obj.locked ? 'Unlock (Ctrl+L)' : 'Lock', icon: obj.locked ? <Lock size={11}/> : <Unlock size={11}/>, activeColor: obj.locked ? 'var(--accent)' : null },
              { action: sendToBack,    title: 'Send to back',    icon: <SendToBack size={11}/> },
              { action: sendBackward,  title: 'Send backward',   icon: <ChevronDown size={11}/> },
              { action: bringForward,  title: 'Bring forward',   icon: <ChevronUp size={11}/> },
              { action: bringToFront,  title: 'Bring to front',  icon: <BringToFront size={11}/> },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} title={btn.title}
                style={{
                  background:'none', border:'none', cursor:'pointer',
                  color: btn.activeColor || 'var(--text3)', padding:3,
                  borderRadius:3, transition:'color 0.15s',
                }}
                onMouseEnter={e => { if (!btn.activeColor) e.currentTarget.style.color='var(--text)' }}
                onMouseLeave={e => { if (!btn.activeColor) e.currentTarget.style.color='var(--text3)' }}>
                {btn.icon}
              </button>
            ))}
            <div style={{ width:1, height:14, background:'var(--border)', margin:'0 2px' }}/>
            <button onClick={deleteSelected} title="Delete (Del)"
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', padding:3, borderRadius:3 }}
              onMouseEnter={e => e.currentTarget.style.color='var(--red)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}>
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* ── Type-specific panels ─────────────────────────────────── */}
        <MultiBayPanel />
        {obj.type === 'rack_cantilever' && <CantileverPanel obj={obj} />}
        {obj.type === 'column_grid' && <ColumnGridPanel obj={obj} />}
        {obj.type === 'rack_drive_in' && <DriveInPanel obj={obj} />}
        {obj.type === 'rack_drive_through' && <DriveThroughPanel obj={obj} />}
        {obj.type === 'rack_pushback' && <PushbackPanel obj={obj} />}
        {['rack_row','rack_double_row'].includes(obj.type) && <RackRowPanel obj={obj} />}
        {obj.type === 'rack_pallet_flow' && <DriveThroughPanel obj={obj} />}

        {/* ── Aisle panel ──────────────────────────────────────────── */}
        {obj.type === 'aisle' && <AislePanel obj={obj} />}

        {/* ── Floor Plan shapes ────────────────────────────────────── */}
        {obj.type?.startsWith('fp_') && (() => {
          const wFt = obj.width  / gridSize
          const hFt = obj.height / gridSize
          const wallT = obj.wallThicknessFt ?? 0.5
          const setWall = (v) => {
            const wallPx = Math.max(2, v * gridSize * 0.5)
            updateObject(obj.id, { wallThicknessFt: v, strokeWidth: wallPx })
          }
          return (
            <>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={S.label}>W</span>
                  <input type="number" min={1} max={9999} step={1}
                    defaultValue={Math.round(obj.width / gridSize * 10) / 10}
                    key={`w-${obj.id}-${Math.round(obj.width)}`}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) up('width', v * gridSize) }}
                    onBlur={e => { e.target.style.borderColor='var(--border)'; const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('width', v * gridSize) }}
                    onKeyDown={e => { if (e.key==='Enter') { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('width', v * gridSize); e.target.blur() } }}
                    onFocus={e => e.target.style.borderColor='var(--accent)'}
                    style={S.input}
                  />
                  <span style={{...S.mono10, color:'var(--text3)'}}>ft</span>
                </div>
                <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={S.label}>H</span>
                  <input type="number" min={1} max={9999} step={1}
                    defaultValue={Math.round(obj.height / gridSize * 10) / 10}
                    key={`h-${obj.id}-${Math.round(obj.height)}`}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) up('height', v * gridSize) }}
                    onBlur={e => { e.target.style.borderColor='var(--border)'; const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('height', v * gridSize) }}
                    onKeyDown={e => { if (e.key==='Enter') { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('height', v * gridSize); e.target.blur() } }}
                    onFocus={e => e.target.style.borderColor='var(--accent)'}
                    style={S.input}
                  />
                  <span style={{...S.mono10, color:'var(--text3)'}}>ft</span>
                </div>
              </div>
              <NumField label="Rot" value={obj.rotation||0} onChange={v => up('rotation',v)} onCommit={v => commit('rotation',v)} unit="°" />

              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={S.label}>Label</span>
                <input type="text" defaultValue={obj.label||''} key={obj.id}
                  onChange={e => up('label', e.target.value)}
                  placeholder="Floor label…"
                  onFocus={e => e.target.style.borderColor='var(--accent)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'}
                  style={{...S.input, fontFamily:'var(--font-mono)'}}
                />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={S.label}>Size</span>
                <input type="number" min={1} max={80} step={1}
                  defaultValue={Math.round((obj.labelFontSize ?? Math.round(Math.min(obj.width, obj.height) * 0.10)) / gridSize)}
                  key={`fs-${obj.id}-${Math.round((obj.labelFontSize ?? 0) / gridSize)}`}
                  onChange={e => up('labelFontSize', Math.max(1, Number(e.target.value)) * gridSize)}
                  onFocus={e => e.target.style.borderColor='var(--accent)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'}
                  style={{...S.input, width:60, flex:'none'}}
                />
                <span style={{...S.mono10, color:'var(--text3)'}}>ft</span>
              </div>

              {/* Wall thickness */}
              <div style={{ paddingTop:8, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ ...S.mono9, color:'var(--blue)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Wall Thickness</span>
                  <span style={{ ...S.mono11, color:'var(--text)' }}>{(wallT*12).toFixed(0)}"</span>
                </div>
                <input type="range" min={0.25} max={2} step={0.25} value={wallT}
                  onChange={e => setWall(Number(e.target.value))}
                  style={{ accentColor:'var(--blue)', height:4, width:'100%' }} />
                <div style={{ display:'flex', gap:4 }}>
                  {[0.25,0.5,0.75,1].map(v => (
                    <button key={v} onClick={() => setWall(v)}
                      style={{
                        flex:1, ...S.mono9, padding:'4px 0', borderRadius:5,
                        border: wallT===v ? '1px solid var(--blue)' : '1px solid var(--border)',
                        background: wallT===v ? 'var(--blue-dim)' : 'transparent',
                        color: wallT===v ? 'var(--blue)' : 'var(--text3)', cursor:'pointer',
                        transition:'all 0.15s',
                      }}>
                      {v*12}"
                    </button>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:2 }}>
                  <span style={{ ...S.mono9, color:'var(--text3)' }}>Show clear interior dim</span>
                  <button onClick={() => up('showWallLabel', !(obj.showWallLabel ?? false))}
                    style={{
                      position:'relative', width:32, height:16, borderRadius:8, flexShrink:0,
                      transition:'all 0.2s', cursor:'pointer', border:'none',
                      background: obj.showWallLabel ? 'var(--blue)' : 'var(--border2)',
                    }}>
                    <div style={{
                      position:'absolute', top:2, width:12, height:12, borderRadius:6,
                      background:'white', boxShadow:'0 1px 2px rgba(0,0,0,0.2)',
                      transition:'all 0.2s',
                      left: obj.showWallLabel ? 17 : 2,
                    }} />
                  </button>
                </div>
              </div>

              <div style={{ ...S.mono10, color:'var(--text3)', paddingTop:4, borderTop:'1px solid var(--border)' }}>
                Area: <span style={{ color:'var(--text)' }}>{Math.round(wFt * hFt).toLocaleString()} sq ft</span>
                <span style={{ marginLeft:8, opacity:0.5 }}>({(wFt*hFt/43560).toFixed(3)} ac)</span>
              </div>
            </>
          )
        })()}

        {/* ── Generic shapes ───────────────────────────────────────── */}
        {['rect','l_shape','t_shape','u_shape'].includes(obj.type) && (<>
          <NumField label="W px"  value={obj.width}    onChange={v => up('width',v)}    onCommit={v => commit('width',v)} />
          <NumField label="H px"  value={obj.height}   onChange={v => up('height',v)}   onCommit={v => commit('height',v)} />
          <DimReadout label="W"   px={obj.width}       gridSize={gridSize} />
          <DimReadout label="H"   px={obj.height}      gridSize={gridSize} />
          <NumField label="Rot"   value={obj.rotation||0} onChange={v => up('rotation',v)} onCommit={v => commit('rotation',v)} unit="°" />
        </>)}

        {/* ── Circle ───────────────────────────────────────────────── */}
        {obj.type==='circle' && (<>
          <NumField label="CX"    value={obj.cx}  onChange={v => up('cx',v)} onCommit={v => commit('cx',v)} />
          <NumField label="CY"    value={obj.cy}  onChange={v => up('cy',v)} onCommit={v => commit('cy',v)} />
          <NumField label="RX"    value={obj.rx}  onChange={v => up('rx',v)} onCommit={v => commit('rx',v)} />
          <NumField label="RY"    value={obj.ry}  onChange={v => up('ry',v)} onCommit={v => commit('ry',v)} />
          <DimReadout label="Ø W" px={obj.rx*2}   gridSize={gridSize} />
          <DimReadout label="Ø H" px={obj.ry*2}   gridSize={gridSize} />
        </>)}

        {/* ── Line / Arc ───────────────────────────────────────────── */}
        {(obj.type==='line'||obj.type==='arc') && (<>
          <DimReadout label="Len" px={Math.hypot(obj.x2-obj.x1, obj.y2-obj.y1)} gridSize={gridSize} />
          {obj.type==='arc' && (<>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ ...S.mono10, color:'var(--text3)' }}>Bend</span>
              <span style={{ ...S.mono10, color:'var(--text)' }}>{(obj.bend??0.35).toFixed(2)}</span>
            </div>
            <input type="range" min="-0.8" max="0.8" step="0.05"
              value={obj.bend??0.35} onChange={e => up('bend',Number(e.target.value))}
              style={{ accentColor:'var(--accent)', height:4, width:'100%' }} />
          </>)}
        </>)}

        {/* ── Dimension label override ─────────────────────────────── */}
        {obj.type === 'annot_dimension' && (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <span style={{ ...S.mono10, color:'var(--text3)' }}>Label override</span>
            <input type="text"
              placeholder="auto"
              defaultValue={obj.customLabel || ''}
              key={obj.id}
              onFocus={e => e.target.select()}
              onChange={e => up('customLabel', e.target.value || undefined)}
              onBlur={e => commit('customLabel', e.target.value || undefined)}
              onKeyDown={e => { if (e.key==='Enter') e.target.blur() }}
              style={{...S.input, flex:'none'}}
            />
            <span style={{ ...S.mono9, color:'var(--text3)', opacity:0.6 }}>
              Leave empty to show auto-measured value
            </span>
          </div>
        )}

        {/* ── Text ─────────────────────────────────────────────────────
           Consolidated from the old floating text-options popover, which
           proved fragile to gate correctly across several passes — this
           panel is already selection-driven by construction, so there is
           no separate "when to show" state to get wrong. Content itself is
           edited only via the inline canvas double-click editor now; a
           second, live-writing-on-every-keystroke content field here was
           redundant with that and has been removed. */}
        {obj.type==='text' && (<>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={S.label}>Font</span>
            <select value={obj.fontFamily || 'Montserrat'}
              onChange={e => commit('fontFamily', e.target.value)}
              style={{ ...S.input, flex:1, cursor:'pointer' }}>
              {TEXT_FONTS.map(f => <option key={f} value={f} style={{ fontFamily:f }}>{f}</option>)}
            </select>
          </div>

          <NumField label="Size" value={obj.fontSize||14} onChange={v => up('fontSize',v)} onCommit={v => commit('fontSize',v)} />

          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={S.label}>Style</span>
            <div style={{ display:'flex', gap:4, flex:1 }}>
              {[['bold',Bold,'Bold'],['italic',Italic,'Italic'],
                ['underline',Underline,'Underline'],['strike',Strikethrough,'Strikethrough']].map(([k,Icon,title]) => {
                const on = !!obj[k]
                return (
                  <button key={k} aria-pressed={on} title={title} onClick={() => commit(k, !on)}
                    style={{
                      width:26, height:24, borderRadius:5, cursor:'pointer', display:'flex',
                      alignItems:'center', justifyContent:'center',
                      background: on ? 'var(--accent)' : 'var(--surface2)',
                      color:      on ? 'white'          : 'var(--text2)',
                      border:`1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    <Icon size={13} strokeWidth={2.2}/>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={S.label}>Align</span>
            <div style={{ display:'flex', gap:4, flex:1 }}>
              {[['left',AlignLeft],['center',AlignCenter],['right',AlignRight]].map(([a,Icon]) => {
                const on = (obj.align || 'left') === a
                return (
                  <button key={a} aria-pressed={on} title={`Align ${a}`} onClick={() => commit('align', a)}
                    style={{
                      width:26, height:24, borderRadius:5, cursor:'pointer', display:'flex',
                      alignItems:'center', justifyContent:'center',
                      background: on ? 'var(--accent)' : 'var(--surface2)',
                      color:      on ? 'white'          : 'var(--text2)',
                      border:`1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    <Icon size={13} strokeWidth={2.2}/>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={S.label}>Color</span>
            <div style={{ display:'flex', gap:4, flex:1, flexWrap:'wrap', alignItems:'center' }}>
              {PALETTE_COLORS.slice(16, 24).map(c => (
                <button key={c} title={c} onClick={() => commit('fill', c)}
                  style={{ width:18, height:18, borderRadius:4, cursor:'pointer', background:c,
                    border:`1.5px solid ${obj.fill === c ? 'var(--text)' : 'transparent'}` }}/>
              ))}
              {/* writes obj.fill directly via this panel's own commit — deliberately
                  NOT through ColorPanel/applyFillToSelected's global-opacity-baking
                  path, so text has exactly one fill mechanism, not two competing ones */}
              <input type="color" title="Custom text color"
                value={/^#[0-9a-f]{6}$/i.test(obj.fill) ? obj.fill : '#0B101D'}
                onChange={e => commit('fill', e.target.value)}
                style={{ width:22, height:20, padding:0, border:'1px solid var(--border)',
                  borderRadius:4, background:'transparent', cursor:'pointer' }}/>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={S.label}>Spacing</span>
            <div style={{ display:'flex', gap:6, flex:1 }}>
              <input type="number" min="0.8" max="3" step="0.05" title="Line height"
                value={obj.lineHeight ?? 1.25}
                onChange={e => up('lineHeight', Number(e.target.value))}
                onBlur={e => commit('lineHeight', Number(e.target.value))}
                style={{ ...S.input, flex:1 }}/>
              <input type="number" min="-2" max="20" step="0.5" title="Letter spacing"
                value={obj.letterSpacing ?? 0}
                onChange={e => up('letterSpacing', Number(e.target.value))}
                onBlur={e => commit('letterSpacing', Number(e.target.value))}
                style={{ ...S.input, flex:1 }}/>
            </div>
          </div>
        </>)}

        {/* ── Appearance ───────────────────────────────────────────────
           Stroke weight, opacity, fill mode and layer are per-object trim —
           reached occasionally, but they were sitting at the same visual
           weight as the warehouse controls that are the point of the panel.
           Folded away so bays / levels / beams read first. */}
        <Disclosure title="Appearance">

        {/* ── Stroke width ─────────────────────────────────────────── */}
        {/* "S.W" / "Opac" were abbreviated to survive a cramped row. Now that
            the group is folded away it can afford whole words. */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{...S.label, width:46}}>Stroke</span>
          <input type="range" min="0.5" max="12" step="0.5"
            value={obj.strokeWidth||1.5} onChange={e => up('strokeWidth',Number(e.target.value))}
            onMouseUp={e => commit('strokeWidth', Number(e.target.value))}
            style={{ flex:1, accentColor:'var(--accent)', height:4 }} />
          <span style={{...S.mono10, color:'var(--text3)', width:20, textAlign:'right'}}>{obj.strokeWidth||1.5}</span>
        </div>

        {/* ── Opacity ──────────────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{...S.label, width:46}}>Opacity</span>
          <input type="range" min="0" max="1" step="0.05"
            value={obj.opacity??1} onChange={e => up('opacity',Number(e.target.value))}
            onMouseUp={e => commit('opacity', Number(e.target.value))}
            style={{ flex:1, accentColor:'var(--accent)', height:4 }} />
          <span style={{...S.mono10, color:'var(--text3)', width:28, textAlign:'right'}}>{Math.round((obj.opacity??1)*100)}%</span>
        </div>

        {/* ── No fill toggle ───────────────────────────────────────── */}
        {obj.type !== 'line' && obj.type !== 'arc' && obj.type !== 'text' && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'6px 0', borderTop:'1px solid var(--border)',
          }}>
            <span style={{ ...S.mono10, color:'var(--text)' }}>No fill</span>
            <button
              onClick={() => commit('noFill', !obj.noFill)}
              style={{
                position:'relative', width:36, height:20, borderRadius:10, flexShrink:0,
                transition:'all 0.2s', cursor:'pointer', border:'none',
                background: obj.noFill ? 'var(--accent)' : 'var(--border2)',
              }}>
              <div style={{
                position:'absolute', top:2, width:16, height:16, borderRadius:8,
                background:'white', boxShadow:'0 1px 2px rgba(0,0,0,0.2)',
                transition:'all 0.2s',
                left: obj.noFill ? 18 : 2,
              }} />
            </button>
          </div>
        )}

        {/* ── Layer selector ───────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={S.label}>Layer</span>
          <LayerSelect value={obj.layerId} onChange={v => commit('layerId',v)} />
        </div>

        </Disclosure>

      </div>
    </SectionHeader>
    </>
  )
}

/* ─── Layer Select ─────────────────────────────────────────────────────────── */

function LayerSelect({ value, onChange }) {
  const { layers } = useCanvasStore()
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        flex:1, borderRadius:5, padding:'4px 8px',
        background:'var(--surface2)', border:'1px solid var(--border)',
        fontSize:11, color:'var(--text)', fontFamily:'var(--font-mono)', outline:'none',
      }}>
      {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  )
}