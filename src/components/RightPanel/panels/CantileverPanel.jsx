import { useCanvasStore } from '../../../store/useCanvasStore'
import { getObjectBounds } from '../../../utils/canvas'

// ── Cantilever Properties Panel ───────────────────────────────────────────────
const CANT_ARM_LENGTHS = [36, 48, 52, 60, 72]
const TOWER_WIDTHS     = [8, 10]
const TSPACE_IN        = 48

export function CantileverPanel({ obj }) {
  const { updateObject, commitObjectUpdate, gridSize } = useCanvasStore()

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
    commitObjectUpdate(obj.id, { towers: newTowers, width: newW })
  }

  const removeTower = () => {
    if (towers.length <= 2) return
    const newTowers = towers.slice(0, -1)
    const newW = ((newTowers.length - 1) * TSPACE_IN / 12) * gridSize
    commitObjectUpdate(obj.id, { towers: newTowers, width: newW, activeTowerIdx: null })
  }

  const changeTowerArm = (tIdx, newArmIn) => {
    // All arms must be the same length -- fill entire array
    const newTowers = Array(towers.length).fill(newArmIn)
    const newH = calcH(newTowers, doubleSided)
    commitObjectUpdate(obj.id, { towers: newTowers, height: newH })
  }

  const toggleSide = (val) => {
    const newH = calcH(towers, val)
    commitObjectUpdate(obj.id, { doubleSided: val, height: newH })
  }

  const label = (s) => (
    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', minWidth: 48 }}>{s}</span>
  )

  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Status */}
      <div style={{ padding: '6px 8px', borderRadius: 5, background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text3)' }}>Total length</span>
          <span style={{ color: 'var(--text)', fontWeight: 700 }}>{fmtIn(totalIn)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: 'var(--text3)' }}>Towers</span>
          <span style={{ color: 'var(--text)' }}>{towers.length}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: 'var(--text3)' }}>Type</span>
          <span style={{ color: 'var(--text)' }}>{doubleSided ? 'Double-sided' : 'Single-sided'}</span>
        </div>
      </div>

      {/* Tower list */}
      <div>
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Towers ({towers.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {towers.map((armIn, i) => {
            const isActive = activeTower === i
            return (
              <div key={i} onClick={() => updateObject(obj.id, { activeTowerIdx: isActive ? null : i })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                  background: isActive ? 'var(--accent-solid)' : 'var(--surface2)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-fg)' : 'var(--text3)', minWidth: 20 }}>T{i+1}</span>
                <span style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-fg)' : 'var(--text)' }}>{fmtIn(armIn)} arm</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-fg)' : 'var(--text3)' }}>{armIn}"</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active tower arm selector */}
      {activeTower !== null && (
        <div style={{ padding: '6px 8px', borderRadius: 5, background: 'var(--surface2)', border: '1px solid var(--accent)' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            All arms -- select length
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CANT_ARM_LENGTHS.map(a => (
              <button key={a} onClick={() => changeTowerArm(activeTower, a)}
                style={{
                  flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer',
                  fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  background: towers[activeTower] === a ? 'var(--accent-solid)' : 'var(--surface3)',
                  border: `1px solid ${towers[activeTower] === a ? 'var(--accent)' : 'var(--border)'}`,
                  color: towers[activeTower] === a ? 'var(--accent-fg)' : 'var(--text2)',
                }}>
                {a}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add / Remove tower */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={addTower} style={{ flex: 1, padding: '5px 0', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--green-dim)', border: '1px solid var(--green-bdr)', color: 'var(--green)' }}>
          + Tower
        </button>
        <button onClick={removeTower} disabled={towers.length <= 2}
          style={{ padding: '5px 10px', borderRadius: 4, cursor: towers.length > 2 ? 'pointer' : 'not-allowed', fontSize: 9, fontFamily: 'var(--font-mono)', background: 'transparent', border: '1px solid var(--border)', color: towers.length > 2 ? 'var(--red)' : 'var(--text3)' }}>
          - Tower
        </button>
      </div>

      {/* Single / Double sided */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label('Sides')}
        {[false, true].map(v => (
          <button key={String(v)} onClick={() => toggleSide(v)}
            style={{ flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-mono)', background: doubleSided === v ? 'var(--accent-solid)' : 'var(--surface3)', border: `1px solid ${doubleSided === v ? 'var(--accent)' : 'var(--border)'}`, color: doubleSided === v ? 'var(--accent-fg)' : 'var(--text2)' }}>
            {v ? 'Double' : 'Single'}
          </button>
        ))}
      </div>

      {/* Tower width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label('Tower')}
        {TOWER_WIDTHS.map(t => (
          <button key={t} onClick={() => commitObjectUpdate(obj.id, { towerWidthIn: t })}
            style={{ flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-mono)', background: towerWidthIn === t ? 'var(--accent-solid)' : 'var(--surface3)', border: `1px solid ${towerWidthIn === t ? 'var(--accent)' : 'var(--border)'}`, color: towerWidthIn === t ? 'var(--accent-fg)' : 'var(--text2)' }}>
            {t}"
          </button>
        ))}
      </div>

    </div>
  )
}

