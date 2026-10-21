import { TEXT_FONTS, textFace } from '../../theme/tokens'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { SectionHeader } from '../shared/SectionHeader'
import { Disclosure } from '../shared/Disclosure'
import {
  Trash2, BringToFront, SendToBack, ChevronUp, ChevronDown, Lock, Unlock,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { pxToFtIn } from '../../utils/canvas'
import { AisleLabelSize } from './panels/AisleLabelSize'
import { RackingAreaPanel, ZonePanel } from './panels/RackingAreaPanel'
import { RackRowPanel, MultiBayPanel, CantileverPanel, ColumnGridPanel, DriveInPanel, DriveThroughPanel, PushbackPanel } from '../RightPanel/Rackrowpanel'
import { getLayoutCapacity } from '../../utils/capacity'
import { useColumnCheck } from '../../generate/useColumnCheck'
import { usableCapacity } from '../../generate/usableCapacity'
import { useBayLedger } from './useBayLedger'
import { PALETTE_COLORS } from '../../constants'
import { Field, Fold } from '../shared/Fold'
import { ElevationLine } from '../Elevations/ElevationLine'
import { isBeamRack } from '../../utils/elevations'
import { setRackDepths } from '../../utils/rackDepthAction'
import { Note } from '../shared/Note'

/* A text object's face: one of the app's three (theme/tokens.js TEXT_FONTS, loaded by index.html). Nothing else —
   an unloaded family silently renders as a system fallback. A face saved before the type change shows (and draws)
   as its successor. */

/* ─── Shared Styles ────────────────────────────────────────────────────────── */

/* Words in PJS, figures in mono (t-num). Inputs are the shared 32px box (index.css .t-input); a field row is a fixed
   label column with the input filling the rest (.t-row). The panel is 320 wide, 16 in from each edge. */
const S = {
  label:  { fontSize:12, fontFamily:'var(--font-ui)', fontWeight:500, color:'var(--steel)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  word:   { fontSize:12, fontFamily:'var(--font-ui)' },
  num:    { fontSize:12, fontFamily:'var(--font-mono)' },
  input: {
    /* minWidth:0 is load-bearing. A flex child floors at its min-content width,
       and a number input's min-content is its full default box (~145px) — so
       two of these side by side blew straight through the panel. */
    flex:1, minWidth:0, width:'100%',
  },
}
const ICON = { size:16, strokeWidth:1.5, absoluteStrokeWidth:true }

/* a toggle switch: radius 2, 32×18, pine when on */
function Toggle({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!!on} aria-label={label}
      style={{ position:'relative', width:32, height:18, borderRadius:2, flexShrink:0, cursor:'pointer', border:'none', padding:0,
        background: on ? 'var(--pine)' : 'var(--line-2)', transition:'background 0.2s' }}>
      <span style={{ position:'absolute', top:3, left: on ? 17 : 3, width:12, height:12, borderRadius:1, background:'var(--paper)', transition:'left 0.2s' }} />
    </button>
  )
}

/* ─── Field Components ─────────────────────────────────────────────────────── */

function NumField({ label, value, onChange, onCommit, unit = '' }) {
  return (
    <label className="t-row">
      <span style={S.label}>{label}</span>
      <span className="t-field">
      <input
        type="number" step="1"
        defaultValue={Math.round(value ?? 0)}
        key={Math.round(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={(e) => { onCommit && onCommit(Number(e.target.value)) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onCommit && onCommit(Number(e.target.value)); e.target.blur() } }}
        className="t-input" style={S.input}
      />
      {unit && <span className="t-unit">{unit}</span>}
      </span>
    </label>
  )
}

function DimReadout({ label, px, gridSize = 40 }) {
  return (
    <div className="t-row">
      <span style={S.label}>{label}</span>
      <span style={{ display:'flex', gap:8, alignItems:'baseline', minWidth:0 }}>
        <span style={{...S.num, fontSize:13, color:'var(--ink)'}}>{pxToFtIn(px, gridSize)}</span>
        <span style={{...S.num, fontSize:11, color:'var(--steel)'}}>({Math.round(px)}px)</span>
      </span>
    </div>
  )
}

/* ─── Capacity Hero ────────────────────────────────────────────────────────── */

/* the bars are pine (A7): a count, not a category colour */
const RACK_TYPE_META = {
  rack_row:           { name: 'Selective' },
  rack_double_row:    { name: 'Double Deep' },
  rack_drive_in:      { name: 'Drive-In' },
  rack_drive_through: { name: 'Drive-Through' },
  rack_pushback:      { name: 'Pushback' },
  rack_pallet_flow:   { name: 'Pallet Flow' },
}

function CapacityHero({ objects }) {
  /* beam racks through the bay ledger (utils/bayLedger.js): an overlapped bay counted once */
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const ledger = useBayLedger(objects, gridSize)
  const layoutCap = getLayoutCapacity(objects, undefined, ledger)
  /* Usable = gross minus what Column Check says is lost (in-rack columns and
     blocked pick zones, each position once) — read off the SAME check result
     the Column Check panel shows, so the two totals always agree. */
  const { result } = useColumnCheck()
  const { usable } = usableCapacity(objects, { check: result, ledger, gridSize, elevations: useCanvasStore.getState().elevations })
  if (layoutCap.total === 0) return null

  const entries = Object.entries(layoutCap.breakdown)
  const maxCount = Math.max(...entries.map(([, c]) => c))
  const rackCount = objects.filter(o => RACK_TYPE_META[o.type]).length

  return (
    <div style={{ margin:'0 16px 16px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* ── Total — hero card ────────────────────────────────────── */}
      <div style={{
        borderRadius:4, padding:'12px 12px',
        background:'var(--paper)',
        border:'1px solid var(--line)',
      }}>
        <span className="t-cap" style={{ display:'block', marginBottom:8 }}>
          Total pallet positions
        </span>

        <div style={{ display:'flex', alignItems:'baseline', flexWrap:'wrap', columnGap:8, rowGap:4 }}>
          <span className="t-num" style={{
            fontSize:26, fontWeight:600,
            color:'var(--ink)', lineHeight:1,
          }}>
            {layoutCap.total.toLocaleString()}
          </span>
          <span style={{ fontSize:12, color:'var(--steel)', fontWeight:500 }}>positions</span>
          {/* "· M usable" wraps as one unit on a narrow panel, never split */}
          <span style={{ display:'inline-flex', alignItems:'baseline', gap:4, whiteSpace:'nowrap' }}>
            <span style={{ fontSize:12, color:'var(--steel)' }}>·</span>
            <span data-testid="capacity-usable" className="t-num" style={{
              fontSize:18, fontWeight:600,
              color:'var(--ink)', lineHeight:1,
            }}>
              {usable.toLocaleString()}
            </span>
            <span style={{ fontSize:12, color:'var(--steel)', fontWeight:500 }}>usable</span>
          </span>
        </div>
        {layoutCap.uncountedBays > 0 && (
          <Note level="warning" data-testid="capacity-overlap" title="A bay more than half covered by another rack's bay is counted once — Check layout lists the overlaps"
            style={{ marginTop:8 }}>
            <span><span className="t-num">{layoutCap.uncountedBays}</span> overlapping bay{layoutCap.uncountedBays === 1 ? '' : 's'} not counted</span>
          </Note>
        )}

        <div style={{
          marginTop:12, display:'flex', gap:16,
          paddingTop:12, borderTop:'1px solid var(--line)',
        }}>
          <div>
            <div style={{ fontSize:11, color:'var(--steel)', marginBottom:4 }}>Racks</div>
            <div className="t-num" style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{rackCount}</div>
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--steel)', marginBottom:4 }}>Types</div>
            <div className="t-num" style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{entries.length}</div>
          </div>
        </div>
      </div>

      {/* ── Breakdown card ───────────────────────────────────────── */}
      <div style={{
        borderRadius:4, overflow:'hidden',
        border:'1px solid var(--line)',
        background:'var(--paper)',
      }}>
        <div style={{
          padding:'8px 12px', borderBottom:'1px solid var(--line)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'var(--bg2)',
        }}>
          <span className="t-cap">
            By type
          </span>
          <span style={{ fontSize:11, color:'var(--steel)' }}>positions</span>
        </div>

        {entries.map(([type, count], i) => {
          const meta = RACK_TYPE_META[type] || { name: type }
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0

          return (
            <div key={type} style={{
              padding:'8px 12px',
              borderBottom: i < entries.length - 1 ? '1px solid var(--line)' : 'none',
              display:'flex', flexDirection:'column', gap:4,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:'var(--ink-2)', fontFamily:'var(--font-ui)' }}>{meta.name}</span>
                <span className="t-num" style={{ fontSize:12, color:'var(--ink)', fontWeight:600 }}>
                  {count.toLocaleString()}
                </span>
              </div>
              <div style={{ height:4, borderRadius:2, background:'var(--bg2)', overflow:'hidden' }}>
                <div style={{
                  height:'100%', borderRadius:2, background:'var(--pine)',
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
  const { commitObjectUpdate } = useCanvasStore(useShallow(s => ({ commitObjectUpdate: s.commitObjectUpdate })))
  const direction = obj.direction || 'both'
  const label     = obj.label || ''



  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <label className="t-row">
        <span style={S.label}>Name</span>
        <input type="text" defaultValue={label} key={`label-${obj.id}`}
          placeholder="e.g. Main Aisle"
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => commitObjectUpdate(obj.id, { label: e.target.value })}
          className="t-input t-words" style={S.input}/>
      </label>
      <div className="t-row">
        <span style={S.label}>Traffic</span>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:4 }}>
        {[
          { val:'up',   label:'↑' },
          { val:'down', label:'↓' },
          { val:'both', label:'↕' },
          { val:'none', label:'—' },
        ].map(({ val, label: lbl }) => (
          <button key={val} type="button" onClick={() => commitObjectUpdate(obj.id, { direction: val })} aria-pressed={direction === val}
            className="t-btn t-btn--secondary" style={{ padding:0 }}>{lbl}</button>
        ))}
        </div>
      </div>
      <AisleLabelSize ids={[obj.id]} />
    </div>
  )
}


/* The selected racks' elevation (read-only: set in the Elevations tab), and their frame depth together (each about its own centre, ONE undo step; overlaps
   show as warnings; the Row group replays it). For a selection of several racks or bays, and a group. */
function SelectionRacks({ selected }) {
  const racks = selected.filter(isBeamRack)
  const anyBays = useCanvasStore(s => (s.activeBaySelection || []).length > 0)
  if (!racks.length && !anyBays) return null
  const depths = [...new Set(racks.map(r => r.depthIn ?? 42))]
  // the one depth change (utils/rackDepthAction.js): a wall row keeps its wall face, a pair its flue
  const setDepth = (v) => { setRackDepths(useCanvasStore, racks.map(r => r.id), v) }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
      <ElevationLine />
      {racks.length > 0 && (
        <Fold title="Rack" defaultOpen={false} aria="Rack">
          <Field label="Frame depth" aria="Rack depth" value={depths.length === 1 ? depths[0] : ''} title={`The ${racks.length} selected rack${racks.length === 1 ? '' : 's'} — a wall row keeps its wall clearance and grows away from the wall; others about their centre`} onCommit={setDepth} />
          {depths.length > 1 && <span style={{ ...S.word, color:'var(--steel)' }}>Mixed: <span className="t-num">{depths.map(d => d + '"').join(', ')}</span></span>}
        </Fold>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PANEL                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function PropertiesPanel() {
  const { selectedIds, objects, groups, updateObject, commitObjectUpdate, deleteSelected, gridSize,
          bringForward, sendBackward, bringToFront, sendToBack, toggleLockSelected, createAisle,
        } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, objects: s.objects, groups: s.groups, updateObject: s.updateObject, commitObjectUpdate: s.commitObjectUpdate, deleteSelected: s.deleteSelected, gridSize: s.gridSize, bringForward: s.bringForward, sendBackward: s.sendBackward, bringToFront: s.bringToFront, sendToBack: s.sendToBack, toggleLockSelected: s.toggleLockSelected, createAisle: s.createAisle })))
  const selected = objects.filter(o => selectedIds.includes(o.id))

  /* ── Nothing selected → layout overview ──────────────────────────────────── */
  if (!selected.length) {
    return (
      <>
      <SectionHeader title="Properties" defaultOpen={true}>
        <div style={{
          padding:'0 16px 16px', ...S.word, color:'var(--steel)',
          display:'flex', flexDirection:'column', gap:4,
        }}>
          <span style={{ color:'var(--ink-2)', fontWeight:600, fontSize:13 }}>No object selected</span>
          <span style={{ lineHeight:1.5 }}>Draw or click a shape to edit properties.</span>
        </div>
        <CapacityHero objects={objects} />
      </SectionHeader>
      </>
    )
  }

  /* ── Group selected ──────────────────────────────────────────────────────── */
  const selSet = new Set(selectedIds)
  const activeGroup = (groups || []).find(g => g.ids.some(id => selSet.has(id)))
  if (activeGroup) {
    return (
      <SectionHeader title="Properties" defaultOpen={true}>
        <div style={{ padding:'0 16px 16px', ...S.word, color:'var(--steel)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <span style={{ color:'var(--ink)', fontWeight:600, fontSize:13 }}>Group · {activeGroup.ids.length} objects</span>
          </div>
          <p style={{ margin:0, lineHeight:1.5 }}>Use the Arrange panel to edit group properties, rotate, or remove members.</p>
          {/* Bays picked on grouped racks get the same multi-bay box. */}
          <div style={{ marginTop:8 }}><MultiBayPanel /></div>
          <SelectionRacks selected={selected} />
          <button type="button" onClick={deleteSelected} className="t-btn t-btn--danger" style={{ marginTop:12 }}>
            <Trash2 {...ICON} /> Delete group
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
        <div style={{ padding:'0 16px 16px' }}>
          <p style={{ ...S.word, margin:0, color:'var(--steel)' }}><span className="t-num">{selected.length}</span> objects selected.</p>
          {/* Bays picked across several racks (a bay marquee / Shift+click
              puts every rack they belong to in selectedIds) — the same
              multi-bay box a single rack shows. */}
          <div style={{ marginTop:8 }}><MultiBayPanel /></div>
          <SelectionRacks selected={selected} />
          {/* aisles among the selection: their own label size */}
          {selected.some(o => o.type === 'aisle') && (
            <div style={{ marginTop:8 }}><AisleLabelSize ids={selected.filter(o => o.type === 'aisle').map(o => o.id)} /></div>
          )}
          {twoRacks && (
            <button type="button"
              onClick={() => createAisle(selected[0].id, selected[1].id)}
              className="t-btn t-btn--secondary t-btn--block" style={{ marginTop:8 }}>
              + Create Aisle Label
            </button>
          )}
          <button type="button" onClick={deleteSelected} className="t-btn t-btn--danger" style={{ marginTop:12 }}>
            <Trash2 {...ICON} /> Delete all
          </button>
        </div>
      </SectionHeader>
    )
  }

  /* ── Single object ───────────────────────────────────────────────────────── */
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
    <SectionHeader title="Properties" defaultOpen={true}>
      <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:12, minWidth:0 }}>

        {/* ── Object header ───────────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
            <span className="t-cap" style={{
              padding:'0 8px', height:24, display:'inline-flex', alignItems:'center',
              background:'var(--bg2)', borderRadius:2, color:'var(--ink-2)',
              border:'1px solid var(--line)',
            }}>
              {obj.type?.replace(/_/g,' ') || 'shape'}
            </span>
            {bayLabel && (
              <span style={{
                ...S.word, padding:'0 8px', height:24, display:'inline-flex', alignItems:'center',
                background:'var(--pine)', borderRadius:2,
                color:'var(--paper)', fontWeight:600,
              }}>
                {bayLabel}
              </span>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:0, marginRight:-8 }}>
            {[
              { action: toggleLockSelected, title: obj.locked ? 'Unlock (Ctrl+L)' : 'Lock', icon: obj.locked ? <Lock {...ICON}/> : <Unlock {...ICON}/>, on: !!obj.locked },
              { action: sendToBack,    title: 'Send to back',    icon: <SendToBack {...ICON}/> },
              { action: sendBackward,  title: 'Send backward',   icon: <ChevronDown {...ICON}/> },
              { action: bringForward,  title: 'Bring forward',   icon: <ChevronUp {...ICON}/> },
              { action: bringToFront,  title: 'Bring to front',  icon: <BringToFront {...ICON}/> },
            ].map((btn, i) => (
              <button key={i} type="button" onClick={btn.action} title={btn.title} className={'t-icon' + (btn.on ? ' is-on' : '')}>
                {btn.icon}
              </button>
            ))}
            <div style={{ width:1, height:16, background:'var(--line)', margin:'0 4px' }}/>
            <button type="button" onClick={deleteSelected} title="Delete (Del)" className="t-icon t-icon--danger">
              <Trash2 {...ICON} />
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

        {/* ── Racking area and zones (generate/rackingArea.js) ─────── */}
        {obj.type === 'racking_area' && <RackingAreaPanel obj={obj} />}
        {typeof obj.type === 'string' && obj.type.startsWith('zone_') && <ZonePanel obj={obj} />}

        {/* ── Row edits: apply to every section of this building ─── */}

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
              <label className="t-row">
                <span style={S.label}>Width</span>
                <span className="t-field">
                  <input type="number" min={1} max={9999} step={1} aria-label="Width (ft)"
                    defaultValue={Math.round(obj.width / gridSize * 10) / 10}
                    key={`w-${obj.id}-${Math.round(obj.width)}`}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) up('width', v * gridSize) }}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('width', v * gridSize) }}
                    onKeyDown={e => { if (e.key==='Enter') { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('width', v * gridSize); e.target.blur() } }}
                    className="t-input" style={S.input}
                  />
                  <span className="t-unit">ft</span>
                </span>
              </label>
              <label className="t-row">
                <span style={S.label}>Length</span>
                <span className="t-field">
                  <input type="number" min={1} max={9999} step={1} aria-label="Length (ft)"
                    defaultValue={Math.round(obj.height / gridSize * 10) / 10}
                    key={`h-${obj.id}-${Math.round(obj.height)}`}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) up('height', v * gridSize) }}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('height', v * gridSize) }}
                    onKeyDown={e => { if (e.key==='Enter') { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) commit('height', v * gridSize); e.target.blur() } }}
                    className="t-input" style={S.input}
                  />
                  <span className="t-unit">ft</span>
                </span>
              </label>
              <NumField label="Rot" value={obj.rotation||0} onChange={v => up('rotation',v)} onCommit={v => commit('rotation',v)} unit="°" />
              <label className="t-row">
                <span style={S.label}>Label</span>
                <input type="text" defaultValue={obj.label||''} key={obj.id}
                  onChange={e => up('label', e.target.value)}
                  placeholder="Floor label…"
                  className="t-input t-words" style={S.input}
                />
              </label>
              <label className="t-row">
                <span style={S.label}>Label size</span>
                <span className="t-field">
                <input type="number" min={1} max={80} step={1}
                  defaultValue={Math.round((obj.labelFontSize ?? Math.round(Math.min(obj.width, obj.height) * 0.10)) / gridSize)}
                  key={`fs-${obj.id}-${Math.round((obj.labelFontSize ?? 0) / gridSize)}`}
                  onChange={e => up('labelFontSize', Math.max(1, Number(e.target.value)) * gridSize)}
                  className="t-input" style={S.input}
                />
                <span className="t-unit">ft</span>
                </span>
              </label>

              {/* Wall thickness */}
              <div style={{ paddingTop:12, borderTop:'1px solid var(--line)', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span className="t-cap">Wall thickness</span>
                  <span className="t-num" style={{ fontSize:13, color:'var(--ink)' }}>{(wallT*12).toFixed(0)}"</span>
                </div>
                <input type="range" min={0.25} max={2} step={0.25} value={wallT}
                  onChange={e => setWall(Number(e.target.value))}
                  style={{ accentColor:'var(--pine)', height:4, width:'100%' }} />
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:8 }}>
                  {[0.25,0.5,0.75,1].map(v => (
                    <button key={v} type="button" onClick={() => setWall(v)} aria-pressed={wallT===v}
                      className="t-btn t-btn--secondary t-num" style={{ padding:0, fontFamily:'var(--font-mono)', fontWeight:500 }}>
                      {v*12}"
                    </button>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  <span style={{ ...S.word, color:'var(--ink-2)' }}>Show clear interior dim</span>
                  <Toggle on={obj.showWallLabel} label="Show clear interior dim" onClick={() => up('showWallLabel', !(obj.showWallLabel ?? false))} />
                </div>
              </div>

              <div style={{ ...S.word, color:'var(--steel)', paddingTop:12, borderTop:'1px solid var(--line)' }}>
                Area: <span className="t-num" style={{ color:'var(--ink)' }}>{Math.round(wFt * hFt).toLocaleString()} sq ft</span>
                <span className="t-num" style={{ marginLeft:8 }}>({(wFt*hFt/43560).toFixed(3)} ac)</span>
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
              <span style={{ ...S.label }}>Bend</span>
              <span style={{ ...S.num, color:'var(--ink)' }}>{(obj.bend??0.35).toFixed(2)}</span>
            </div>
            <input type="range" min="-0.8" max="0.8" step="0.05"
              value={obj.bend??0.35} onChange={e => up('bend',Number(e.target.value))}
              style={{ accentColor:'var(--pine)', height:4, width:'100%' }} />
          </>)}
        </>)}

        {/* ── Dimension label override ─────────────────────────────── */}
        {obj.type === 'annot_dimension' && (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <span style={S.label}>Label override</span>
            <input type="text"
              placeholder="auto"
              defaultValue={obj.customLabel || ''}
              key={obj.id}
              onFocus={e => e.target.select()}
              onChange={e => up('customLabel', e.target.value || undefined)}
              onBlur={e => commit('customLabel', e.target.value || undefined)}
              onKeyDown={e => { if (e.key==='Enter') e.target.blur() }}
              className="t-input" style={{...S.input, flex:'none'}}
            />
            <span style={{ ...S.word, color:'var(--steel)' }}>
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
          <label className="t-row">
            <span style={S.label}>Font</span>
            <select value={textFace(obj.fontFamily)}
              onChange={e => commit('fontFamily', e.target.value)}
              className="t-input t-words" style={{ ...S.input, cursor:'pointer' }}>
              {TEXT_FONTS.map(f => <option key={f} value={f} style={{ fontFamily:f }}>{f}</option>)}
            </select>
          </label>

          <NumField label="Size" value={obj.fontSize||14} onChange={v => up('fontSize',v)} onCommit={v => commit('fontSize',v)} />

          <div className="t-row">
            <span style={S.label}>Style</span>
            <div style={{ display:'flex', gap:4, minWidth:0 }}>
              {[['bold',Bold,'Bold'],['italic',Italic,'Italic'],
                ['underline',Underline,'Underline'],['strike',Strikethrough,'Strikethrough']].map(([k,Icon,title]) => {
                const on = !!obj[k]
                return (
                  <button key={k} aria-pressed={on} title={title} onClick={() => commit(k, !on)}
                    className="t-btn t-btn--secondary" style={{ width:32, padding:0 }}>
                    <Icon {...ICON}/>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="t-row">
            <span style={S.label}>Align</span>
            <div style={{ display:'flex', gap:4, minWidth:0 }}>
              {[['left',AlignLeft],['center',AlignCenter],['right',AlignRight]].map(([a,Icon]) => {
                const on = (obj.align || 'left') === a
                return (
                  <button key={a} aria-pressed={on} title={`Align ${a}`} onClick={() => commit('align', a)}
                    className="t-btn t-btn--secondary" style={{ width:32, padding:0 }}>
                    <Icon {...ICON}/>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="t-row">
            <span style={S.label}>Color</span>
            <div style={{ display:'flex', gap:4, minWidth:0, flexWrap:'wrap', alignItems:'center' }}>
              {PALETTE_COLORS.slice(16, 24).map(c => (
                <button key={c} title={c} onClick={() => commit('fill', c)}
                  style={{ width:18, height:18, borderRadius:2, cursor:'pointer', background:c,
                    border:`2px solid ${obj.fill === c ? 'var(--ink)' : 'transparent'}` }}/>
              ))}
              {/* writes obj.fill directly via this panel's own commit — deliberately
                  NOT through ColorPanel/applyFillToSelected's global-opacity-baking
                  path, so text has exactly one fill mechanism, not two competing ones */}
              <input type="color" title="Custom text color"
                value={/^#[0-9a-f]{6}$/i.test(obj.fill) ? obj.fill : '#171A18'}
                onChange={e => commit('fill', e.target.value)}
                style={{ width:24, height:20, padding:0, border:'1px solid var(--line)',
                  borderRadius:2, background:'transparent', cursor:'pointer' }}/>
            </div>
          </div>

          <div className="t-row">
            <span style={S.label}>Spacing</span>
            <div style={{ display:'flex', gap:8, minWidth:0 }}>
              <input type="number" min="0.8" max="3" step="0.05" title="Line height"
                value={obj.lineHeight ?? 1.25}
                onChange={e => up('lineHeight', Number(e.target.value))}
                onBlur={e => commit('lineHeight', Number(e.target.value))}
                className="t-input" style={{ ...S.input, flex:1 }}/>
              <input type="number" min="-2" max="20" step="0.5" title="Letter spacing"
                value={obj.letterSpacing ?? 0}
                onChange={e => up('letterSpacing', Number(e.target.value))}
                onBlur={e => commit('letterSpacing', Number(e.target.value))}
                className="t-input" style={{ ...S.input, flex:1 }}/>
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
        <div style={{ display:'grid', gridTemplateColumns:'96px minmax(0,1fr) 40px', alignItems:'center', columnGap:8 }}>
          <span style={S.label}>Stroke</span>
          <input type="range" min="0.5" max="12" step="0.5"
            value={obj.strokeWidth||1.5} onChange={e => up('strokeWidth',Number(e.target.value))}
            onMouseUp={e => commit('strokeWidth', Number(e.target.value))}
            style={{ width:'100%', minWidth:0, accentColor:'var(--pine)', height:4 }} />
          <span style={{...S.num, color:'var(--steel)', textAlign:'right'}}>{obj.strokeWidth||1.5}</span>
        </div>

        {/* ── Opacity ──────────────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'96px minmax(0,1fr) 40px', alignItems:'center', columnGap:8 }}>
          <span style={S.label}>Opacity</span>
          <input type="range" min="0" max="1" step="0.05"
            value={obj.opacity??1} onChange={e => up('opacity',Number(e.target.value))}
            onMouseUp={e => commit('opacity', Number(e.target.value))}
            style={{ width:'100%', minWidth:0, accentColor:'var(--pine)', height:4 }} />
          <span style={{...S.num, color:'var(--steel)', textAlign:'right'}}>{Math.round((obj.opacity??1)*100)}%</span>
        </div>

        {/* ── No fill toggle ───────────────────────────────────────── */}
        {obj.type !== 'line' && obj.type !== 'arc' && obj.type !== 'text' && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'8px 0', borderTop:'1px solid var(--line)',
          }}>
            <span style={{ ...S.word, color:'var(--ink)' }}>No fill</span>
            <Toggle on={obj.noFill} label="No fill" onClick={() => commit('noFill', !obj.noFill)} />
          </div>
        )}

        {/* ── Layer selector ───────────────────────────────────────── */}
        <div className="t-row">
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
  const { layers } = useCanvasStore(useShallow(s => ({ layers: s.layers })))
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="t-input t-words" style={{ width:'100%', minWidth:0, fontSize:12 }}>
      {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  )
}