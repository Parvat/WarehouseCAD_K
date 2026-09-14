import { useState } from 'react'
import { Sparkles, X, Loader2 } from 'lucide-react'
import { generateAndPlaceBatched } from '../../generate/traceGenerate'
import { useRules } from '../../rules/useRules'
import { useColumnCheck } from '../../generate/useColumnCheck'

// Trace CAD — "Describe → Generate" Brief.
// A self-contained floating card. It only CALLS the store (via generateAndPlace);
// it never modifies store logic.

/* The CAD's own panels sit at 2px — anything rounder reads as a web card
   dropped on top of a drawing. Cards keep 4px. */
const R = 2

const labelSt = { fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.02em' }

/* Module scope, NOT inside GeneratePanel. A component declared in a render body
   is a brand-new function identity every render, so React tears down the old
   subtree and mounts a fresh one instead of updating it — which blurs the input
   after every single keystroke. Nothing here closes over state, so it has no
   reason to live in the component. */
function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={labelSt}>{label}</div>
      {children}
    </div>
  )
}

export function GeneratePanel() {
  const [open, setOpen]     = useState(true)
  const [lengthFt, setL]    = useState(240)
  const [widthFt, setW]     = useState(120)
  const [rackType, setType] = useState('rack_double_row')
  // The forklift choice is shared state: it sets the aisle the layout is built
  // to AND the clearance the column check tests against, so the two can never
  // disagree about which truck this warehouse is for.
  const { mheKey: mhe, setMheKey } = useColumnCheck()
  const { rules, mheOptions } = useRules()
  const [aisleFt, setAisle]   = useState(() => mheOptions.reach?.aisleFt ?? 10.5)
  const [speedBayFt, setBay]  = useState(60)
  const [gridXFt, setGridX]   = useState(50)
  const [gridYFt, setGridY]   = useState(54)
  const [dockDoors, setDoors] = useState(3)
  const [result, setResult]   = useState(null)

  /* Generating is a real wait on a big building — thousands of bay rects and a
     history snapshot per object. Without a flag the click just looks dead. */
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress]     = useState(0)

  const pickMhe = (key) => {
    setMheKey(key)
    setAisle(mheOptions[key].aisleFt)  // forklift choice drives the aisle → layout
  }

  const run = async () => {
    if (generating) return
    setGenerating(true)
    setProgress(0)
    try {
      const total = await generateAndPlaceBatched({
        lengthFt:   Number(lengthFt)   || 100,
        widthFt:    Number(widthFt)    || 60,
        rackType,
        aisleFt:    Number(aisleFt)    || 11,
        speedBayFt: Number(speedBayFt) || 0,
        gridXFt:    Number(gridXFt)    || 0,
        gridYFt:    Number(gridYFt)    || 0,
        dockDoors:  Number(dockDoors)  || 0,
        levels:     4,
        mhe,
      }, { onProgress: setProgress, rules })
      setResult(total)
    } finally {
      setGenerating(false)
    }
  }

  const box = {
    position: 'fixed', right: 296, top: 60, zIndex: 40, width: 236,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: R, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    fontFamily: 'var(--font-ui)', color: 'var(--text)',
  }
  const inputSt = {
    width: '100%', minWidth: 0, padding: '6px 8px', marginTop: 3,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: R, color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: 12,
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', right: 296, top: 60, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        background: 'var(--accent)', color: '#fff', border: 'none',
        borderRadius: R, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        fontFamily: 'var(--font-ui)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <Sparkles size={14} /> Generate
      </button>
    )
  }

  return (
    <div style={box}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Describe the building</span>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
          display: 'flex', padding: 0,
        }}><X size={14} /></button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="LENGTH (ft)">
            <input style={inputSt} type="number" value={lengthFt} onChange={e => setL(e.target.value)} />
          </Field>
          <Field label="WIDTH (ft)">
            <input style={inputSt} type="number" value={widthFt} onChange={e => setW(e.target.value)} />
          </Field>
        </div>

        <div>
          <div style={labelSt}>RACK TYPE</div>
          <select style={inputSt} value={rackType} onChange={e => setType(e.target.value)}>
            <option value="rack_row">Selective (single row)</option>
            <option value="rack_double_row">Double-deep (back-to-back)</option>
          </select>
        </div>

        <div>
          <div style={labelSt}>FORKLIFT</div>
          <select style={inputSt} value={mhe} onChange={e => pickMhe(e.target.value)}>
            {Object.values(mheOptions).map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="AISLE (ft)">
            <input style={inputSt} type="number" value={aisleFt} onChange={e => setAisle(e.target.value)} />
          </Field>
          <Field label="SPEED BAY (ft)">
            <input style={inputSt} type="number" value={speedBayFt} onChange={e => setBay(e.target.value)} />
          </Field>
        </div>

        <div>
          <div style={labelSt}>COLUMN GRID (ft)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input style={inputSt} type="number" value={gridXFt} onChange={e => setGridX(e.target.value)} />
            <span style={{ ...labelSt, marginTop: 3, flexShrink: 0 }}>×</span>
            <input style={inputSt} type="number" value={gridYFt} onChange={e => setGridY(e.target.value)} />
          </div>
        </div>

        <div>
          <div style={labelSt}>DOCK DOORS</div>
          <input style={inputSt} type="number" min="0" value={dockDoors} onChange={e => setDoors(e.target.value)} />
        </div>

        <button onClick={run} disabled={generating} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '9px', marginTop: 2,
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: R,
          cursor: generating ? 'progress' : 'pointer',
          opacity: generating ? 0.75 : 1,
          fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-ui)',
        }}>
          {generating
            ? <><Loader2 size={14} className="animate-spin" /> Generating… {Math.round(progress * 100)}%</>
            : <><Sparkles size={14} /> Generate layout</>}
        </button>

        {result != null && !generating && (
          <div style={{
            padding: '8px 10px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 4,
          }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--accent)' }}>
              {result.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
              pallet positions · counted from placed racks
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
