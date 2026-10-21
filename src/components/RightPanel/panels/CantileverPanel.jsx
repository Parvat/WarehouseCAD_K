import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { withAnchoredPosition } from '../../../utils/bayAnchor'
import { getObjectBounds } from '../../../utils/canvas'

// ── Cantilever Properties Panel ───────────────────────────────────────────────
const CANT_ARM_LENGTHS = [36, 48, 52, 60, 72]
const TOWER_WIDTHS     = [8, 10]
const TSPACE_IN        = 48

export function CantileverPanel({ obj }) {
  const { updateObject, commitObjectUpdate, gridSize } = useCanvasStore(useShallow(s => ({ updateObject: s.updateObject, commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize })))

  const towers      = obj.towers      || [36, 36, 36, 36, 36]
  const doubleSided = obj.doubleSided ?? true
  const towerWidthIn= obj.towerWidthIn || 10
  const spineDepthIn= obj.spineDepthIn || 4
  const activeTower = obj.activeTowerIdx ?? null

  const fmtIn = (i) => {
    const ft = Math.floor(i / 12), inc = i % 12
    return inc === 0 ? `${ft}'` : `${ft}' ${inc}"`
  }

  const totalIn  = (towers.length - 1) * TSPACE_IN
  const depthIn  = doubleSided ? towers[activeTower ?? 0] * 2 + spineDepthIn : towers[activeTower ?? 0] + spineDepthIn

  const calcH = (ts, dual) => {
    const maxArm = Math.max(...ts)
    return ((dual ? maxArm * 2 + spineDepthIn : maxArm + spineDepthIn) / 12) * gridSize
  }

  const addTower = () => {
    const newTowers = [...towers, towers[towers.length - 1] || 36]
    const newW = ((newTowers.length - 1) * TSPACE_IN / 12) * gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { towers: newTowers, width: newW }))
  }

  const removeTower = () => {
    if (towers.length <= 2) return
    const newTowers = towers.slice(0, -1)
    const newW = ((newTowers.length - 1) * TSPACE_IN / 12) * gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { towers: newTowers, width: newW, activeTowerIdx: null }))
  }

  const changeTowerArm = (tIdx, newArmIn) => {
    // All arms must be the same length -- fill entire array
    const newTowers = Array(towers.length).fill(newArmIn)
    const newH = calcH(newTowers, doubleSided)
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { towers: newTowers, height: newH }))
  }

  const toggleSide = (val) => {
    const newH = calcH(towers, val)
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { doubleSided: val, height: newH }))
  }

  /* Words PJS (labels steel 12), figures mono (.t-num). Option buttons are 32px secondaries, the picked one pine
     (.is-on); "+ Tower" secondary, "- Tower" danger, disabled by the attribute alone. Status is a white card. */
  const label = (s) => (
    <span className="t-label" style={{ width: 56, flexShrink: 0 }}>{s}</span>
  )
  const opt = (active) => 't-btn t-btn--secondary' + (active ? ' is-on' : '')
  const numBtn = { flex: 1, minWidth: 0, padding: 0, fontFamily: 'var(--font-mono)', fontWeight: 400 }
  const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }
  const statLbl = { fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--steel)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

      {/* Status */}
      <div style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--paper)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={statRow}>
          <span style={statLbl}>Total length</span>
          <span className="t-num" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{fmtIn(totalIn)}</span>
        </div>
        <div style={statRow}>
          <span style={statLbl}>Towers</span>
          <span className="t-num" style={{ fontSize: 13, color: 'var(--ink)' }}>{towers.length}</span>
        </div>
        <div style={statRow}>
          <span style={statLbl}>Type</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)' }}>{doubleSided ? 'Double-sided' : 'Single-sided'}</span>
        </div>
      </div>

      {/* Tower list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="t-cap">
          Towers ({towers.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {towers.map((armIn, i) => {
            const isActive = activeTower === i
            return (
              <div key={i} onClick={() => updateObject(obj.id, { activeTowerIdx: isActive ? null : i })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                  height: 32, padding: '0 8px', borderRadius: 2, cursor: 'pointer',
                  background: isActive ? 'var(--pine)' : 'var(--paper)',
                  border: `1px solid ${isActive ? 'var(--pine)' : 'var(--line)'}`,
                }}>
                <span className="t-num" style={{ fontSize: 12, color: isActive ? 'var(--paper)' : 'var(--steel)', width: 24, flexShrink: 0 }}>T{i+1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'var(--font-ui)', color: isActive ? 'var(--paper)' : 'var(--ink)' }}><span className="t-num">{fmtIn(armIn)}</span> arm</span>
                <span className="t-num" style={{ fontSize: 12, color: isActive ? 'var(--paper)' : 'var(--steel)' }}>{armIn}"</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active tower arm selector */}
      {activeTower !== null && (
        <div style={{ padding: 12, borderRadius: 4, background: 'var(--paper)', border: '1px solid var(--pine)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="t-cap" style={{ color: 'var(--pine)' }}>
            All arms -- select length
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CANT_ARM_LENGTHS.map(a => (
              <button key={a} onClick={() => changeTowerArm(activeTower, a)}
                className={opt(towers[activeTower] === a)} style={numBtn}>
                {a}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add / Remove tower */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={addTower} className="t-btn t-btn--secondary" style={{ flex: 1 }}>
          + Tower
        </button>
        <button onClick={removeTower} disabled={towers.length <= 2} className="t-btn t-btn--danger">
          - Tower
        </button>
      </div>

      {/* Single / Double sided */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {label('Sides')}
        {[false, true].map(v => (
          <button key={String(v)} onClick={() => toggleSide(v)}
            className={opt(doubleSided === v)} style={{ flex: 1, minWidth: 0 }}>
            {v ? 'Double' : 'Single'}
          </button>
        ))}
      </div>

      {/* Tower width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {label('Tower')}
        {TOWER_WIDTHS.map(t => (
          <button key={t} onClick={() => commitObjectUpdate(obj.id, { towerWidthIn: t })}
            className={opt(towerWidthIn === t)} style={numBtn}>
            {t}"
          </button>
        ))}
      </div>

    </div>
  )
}

