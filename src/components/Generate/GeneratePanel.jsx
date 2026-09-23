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
const sectionSt = {
  fontSize: 10.5, color: 'var(--text)', fontWeight: 700, letterSpacing: '.04em',
  paddingBottom: 4, marginTop: 2, borderBottom: '1px solid var(--border)',
}

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

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionSt}>{title}</div>
      {children}
    </div>
  )
}

// The one rack type Generate ever produces — standard selective, single
// rows against the walls and double-deep back-to-back interior pairs
// (rowBands' own STEP 1/STEP 3 shape, unchanged). That's the layout big
// warehouses actually run for max space, not a dealer choice to expose
// here; a customer who genuinely wants single rows throughout still
// builds that from the object library or edits a placed row by hand.
const RACK_TYPE = 'rack_double_row'

export function GeneratePanel() {
  const [open, setOpen]     = useState(true)
  const [lengthFt, setL]    = useState(240)
  const [widthFt, setW]     = useState(120)
  // Auto (BUG 47) is the default — generateAndPlaceBatched runs both
  // orientations and places whichever scores more pallet capacity. The
  // Horizontal/Vertical buttons are an explicit override, still exactly
  // the manual single-orientation path GeneratePanel has had since BUG 43.
  const [orientation, setOrientation] = useState('auto')
  // The forklift choice is shared state: it sets the aisle the layout is built
  // to AND the clearance the column check tests against, so the two can never
  // disagree about which truck this warehouse is for.
  const { mheKey: mhe, setMheKey } = useColumnCheck()
  const { rules, mheOptions } = useRules()
  const [aisleFt, setAisle]   = useState(() => mheOptions.reach?.aisleFt ?? 10.5)
  const [gridXFt, setGridX]   = useState(50)
  const [gridYFt, setGridY]   = useState(54)
  // BUG 64 — the gap between every wall and where racking actually starts
  // (rowBands' new wallClearFt, rowSegments' existing endClearFt — one
  // number, both axes). Default matches DEFAULT_RULES.selective's own
  // shipped default, so an untouched panel matches an untouched rules table.
  const [wallClearanceIn, setWallClear] = useState(6)
  // Whether the interior column grid's own origin sits flush on the wall
  // (Yes, a line on it) or inset one full pitch off it (No, none on it) —
  // see sizingLayout.js's columnGridObject/axisFrame (BUG 69).
  const [columnsAlongWall, setColumnsAlongWall] = useState(false)
  // Pallet loading FACE (across the beam, sizes positions per bay) and
  // DEPTH (into the frame, overhangs by design — BUG 62) — GMA default.
  const [palletWIn, setPalletW] = useState(40)
  const [palletDIn, setPalletD] = useState(48)
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
      const outcome = await generateAndPlaceBatched({
        lengthFt:         Number(lengthFt)         || 100,
        widthFt:          Number(widthFt)          || 60,
        rackType:         RACK_TYPE,
        aisleFt:          Number(aisleFt)           || 11,
        gridXFt:          Number(gridXFt)           || 0,
        gridYFt:          Number(gridYFt)           || 0,
        wallClearanceIn:  Number(wallClearanceIn)   || 0,
        columnsAlongWall,
        palletWIn:        Number(palletWIn)         || 40,
        palletDIn:        Number(palletDIn)         || 48,
        levels:     4,
        mhe,
        orientation,
      }, { onProgress: setProgress, rules })
      setResult(outcome)
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

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="BUILDING">
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label="LENGTH (ft)">
              <input style={inputSt} type="number" value={lengthFt} onChange={e => setL(e.target.value)} />
            </Field>
            <Field label="WIDTH (ft)">
              <input style={inputSt} type="number" value={widthFt} onChange={e => setW(e.target.value)} />
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

          <Field label="WALL CLEARANCE (in)">
            <input style={inputSt} type="number" min="0" value={wallClearanceIn} onChange={e => setWallClear(e.target.value)} />
          </Field>

          <div>
            <div style={labelSt}>COLUMNS ALONG WALL</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
              {[
                { key: true,  label: 'Yes' },
                { key: false, label: 'No' },
              ].map(o => (
                <button key={String(o.key)} onClick={() => setColumnsAlongWall(o.key)} style={{
                  flex: 1, padding: '6px 8px',
                  background: columnsAlongWall === o.key ? 'var(--accent)' : 'var(--surface2)',
                  color: columnsAlongWall === o.key ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: R,
                  cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                }}>{o.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.35 }}>
              {columnsAlongWall
                ? 'Column grid starts at the wall — a line sits on it.'
                : 'Column grid inset one pitch from the wall — no column on it.'}
            </div>
          </div>

          <div>
            <div style={labelSt}>ROW DIRECTION</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
              {[
                { key: 'auto',       label: 'Auto' },
                { key: 'horizontal', label: 'Horizontal' },
                { key: 'vertical',   label: 'Vertical' },
              ].map(o => (
                <button key={o.key} onClick={() => setOrientation(o.key)} style={{
                  flex: 1, padding: '6px 8px',
                  background: orientation === o.key ? 'var(--accent)' : 'var(--surface2)',
                  color: orientation === o.key ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: R,
                  cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                }}>{o.label}</button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="RACKING">
          <div>
            <div style={labelSt}>PALLET SIZE (in)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Field label="Face">
                <input style={inputSt} type="number" value={palletWIn} onChange={e => setPalletW(e.target.value)} />
              </Field>
              <Field label="Depth">
                <input style={inputSt} type="number" value={palletDIn} onChange={e => setPalletD(e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            <div style={labelSt}>FORKLIFT</div>
            <select style={inputSt} value={mhe} onChange={e => pickMhe(e.target.value)}>
              {Object.values(mheOptions).map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          <Field label="AISLE (ft)">
            <input style={inputSt} type="number" value={aisleFt} onChange={e => setAisle(e.target.value)} />
          </Field>
        </Section>

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
              {result.total.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
              pallet positions · counted from placed racks
            </div>
            {result.horizontalTotal != null && (
              <div style={{
                fontSize: 10, color: 'var(--text3)', marginTop: 6,
                paddingTop: 6, borderTop: '1px solid var(--border)',
              }}>
                Auto-picked <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{result.orientation}</strong> — {result.horizontalTotal.toLocaleString()} horizontal vs {result.verticalTotal.toLocaleString()} vertical
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
