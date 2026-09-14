// ─── Snap ───────────────────────────────────────────────────────────────────
import { layoutText } from './textLayout'
// snapUnit: 'ft' | 'in' | 'half-in'

// ─── Annotation geometry classes ─────────────────────────────────────────────
// LINE class: stored as x1/y1/x2/y2 — identical geometry to 'line' type
// RECT class: stored as x/y/width/height — identical geometry to 'rect' type
export const ANNOT_LINE_TYPES = new Set([
  'annot_dimension','annot_arrow_line','annot_double_arrow','annot_curve_arrow',
  'annot_draw_line','annot_solid_line','annot_dotted_line','annot_dashed_line','annot_dashdot_line',
])
export const ANNOT_RECT_TYPES = new Set([
  'annot_label','annot_label_box','annot_label_circle','annot_auto_number',
  'annot_callout','annot_cloud','annot_north_arrow','annot_scale_bar',
])

export function snapToGrid(value, gridSize, snapUnit = 'ft') {
  const unit = snapUnit === 'in' ? gridSize / 12 : snapUnit === 'half-in' ? gridSize / 24 : gridSize
  return Math.round(value / unit) * unit
}

// ─── New generic shape paths ─────────────────────────────────────────────────
export function trianglePath(x, y, w, h) {
  return `M ${x+w/2} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`
}
export function diamondPath(x, y, w, h) {
  return `M ${x+w/2} ${y} L ${x+w} ${y+h/2} L ${x+w/2} ${y+h} L ${x} ${y+h/2} Z`
}
export function starPath(x, y, w, h) {
  const cx=x+w/2, cy=y+h/2, outerR=Math.min(w,h)/2, innerR=outerR*0.42
  const pts=[]
  for(let i=0;i<10;i++){const r=i%2===0?outerR:innerR,a=(i*36-90)*Math.PI/180;pts.push(`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`)}
  return `M ${pts.join(' L ')} Z`
}
export function crossPath(x, y, w, h,
    lxt=0.325, rxt=0.675, tyr=0.325, byr=0.675,
    lxb=null,  rxb=null,  tyl=null,  byl=null) {
  // 8 independent inner corner positions (all as ratios of w or h)
  // lxt/rxt = left/right column X at top;  lxb/rxb = left/right column X at bottom
  // tyr/byr = top/bottom row Y at right;   tyl/byl = top/bottom row Y at left
  // Defaults: symmetric (all sides equal)
  if (lxb===null) lxb=lxt; if (rxb===null) rxb=rxt
  if (tyl===null) tyl=tyr; if (byl===null) byl=byr
  const cl_t=x+w*lxt, cr_t=x+w*rxt, cl_b=x+w*lxb, cr_b=x+w*rxb
  const ct_r=y+h*tyr,  cb_r=y+h*byr,  ct_l=y+h*tyl,  cb_l=y+h*byl
  return `M ${cl_t} ${y} L ${cr_t} ${y} L ${cr_t} ${ct_r} L ${x+w} ${ct_r} L ${x+w} ${cb_r} L ${cr_b} ${cb_r} L ${cr_b} ${y+h} L ${cl_b} ${y+h} L ${cl_b} ${cb_l} L ${x} ${cb_l} L ${x} ${ct_l} L ${cl_t} ${ct_l} Z`
}
export function arrowPath(x, y, w, h, t=0.45, head=0.38) {
  const sh=h*t,oy=(h-sh)/2,hx=x+w*(1-head)
  return `M ${x} ${y+oy} L ${hx} ${y+oy} L ${hx} ${y} L ${x+w} ${y+h/2} L ${hx} ${y+h} L ${hx} ${y+oy+sh} L ${x} ${y+oy+sh} Z`
}

// ─── Dimensions → human-readable string ─────────────────────────────────────
export function pxToFtIn(pixels, gridSize = 40) {
  const totalInches = (pixels / gridSize) * 12
  const ft    = Math.floor(Math.abs(totalInches) / 12)
  const inch  = Math.round(Math.abs(totalInches) % 12)
  if (inch === 12) return `${ft + 1}'`
  if (inch === 0)  return `${ft}'`
  return `${ft}' ${inch}"`
}

export function pxToUnit(pixels, unit, gridSize = 40) {
  const feet = pixels / gridSize
  switch (unit) {
    case 'meters':  return (feet * 0.3048).toFixed(2) + ' m'
    case 'cm':      return (feet * 30.48).toFixed(1)  + ' cm'
    case 'mm':      return (feet * 304.8).toFixed(0)  + ' mm'
    case 'inches':  return pxToFtIn(pixels, gridSize)
    default:        return pxToFtIn(pixels, gridSize)
  }
}

// ─── Arc SVG path ────────────────────────────────────────────────────────────
export function arcPath(x1, y1, x2, y2, bend = 0.35) {
  const mx  = (x1 + x2) / 2
  const my  = (y1 + y2) / 2
  const dx  = x2 - x1
  const dy  = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx  = -dy / len
  const ny  =  dx / len
  return `M ${x1} ${y1} Q ${mx + nx * len * bend} ${my + ny * len * bend} ${x2} ${y2}`
}

// ─── Shape paths ─────────────────────────────────────────────────────────────
export function lShapePath(x, y, w, h, stemW = 0.3, stemH = 0.3) {
  const tw = w * Math.max(0.1, Math.min(0.9, stemW))
  const th = h * Math.max(0.1, Math.min(0.9, stemH))
  return `M ${x} ${y} L ${x+tw} ${y} L ${x+tw} ${y+h-th} L ${x+w} ${y+h-th} L ${x+w} ${y+h} L ${x} ${y+h} Z`
}

export function lMirrorPath(x, y, w, h, stemW = 0.3, stemH = 0.3) {
  const tw = w * Math.max(0.1, Math.min(0.9, stemW))
  const th = h * Math.max(0.1, Math.min(0.9, stemH))
  return `M ${x+w} ${y} L ${x+w-tw} ${y} L ${x+w-tw} ${y+h-th} L ${x} ${y+h-th} L ${x} ${y+h} L ${x+w} ${y+h} Z`
}


// ─── Init vertices for any fp shape at placement time ────────────────────────
export function initFpVerts(type, x, y, w, h, params = {}) {
  switch (type) {
    case 'fp_rect':
      return [{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}]
    case 'fp_l': {
      const sw = w*(params.fpStemW??0.3), sh = h*(params.fpStemH??0.3)
      return [{x:x,y:y},{x:x+sw,y:y},{x:x+sw,y:y+h-sh},{x:x+w,y:y+h-sh},{x:x+w,y:y+h},{x:x,y:y+h}]
    }
    case 'fp_l_mirror': {
      const sw = w*(params.fpStemW??0.3), sh = h*(params.fpStemH??0.3)
      return [{x:x+w,y:y},{x:x+w-sw,y:y},{x:x+w-sw,y:y+h-sh},{x:x,y:y+h-sh},{x:x,y:y+h},{x:x+w,y:y+h}]
    }
    case 'fp_t': {
      const bh = h*(params.fpBarH??0.3)
      const sl = x+w*(params.fpTStemL??0.325), sr = x+w*(params.fpTStemR??0.675)
      return [{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+bh},{x:sr,y:y+bh},{x:sr,y:y+h},{x:sl,y:y+h},{x:sl,y:y+bh},{x:x,y:y+bh}]
    }
    case 'fp_u': {
      const tw = w*(params.fpUWallT??0.28), oh = h*(params.fpUOpenH??0.62)
      return [{x:x,y:y},{x:x+tw,y:y},{x:x+tw,y:y+oh},{x:x+w-tw,y:y+oh},{x:x+w-tw,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}]
    }
    case 'fp_cross': {
      const pw = w*((1-(params.fpCrossT??0.35))/2), ph = h*((1-(params.fpCrossT??0.35))/2)
      return [
        {x:x+pw,y:y},{x:x+w-pw,y:y},{x:x+w-pw,y:y+ph},{x:x+w,y:y+ph},
        {x:x+w,y:y+h-ph},{x:x+w-pw,y:y+h-ph},{x:x+w-pw,y:y+h},{x:x+pw,y:y+h},
        {x:x+pw,y:y+h-ph},{x:x,y:y+h-ph},{x:x,y:y+ph},{x:x+pw,y:y+ph},
      ]
    }
    default: return [{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}]
  }
}

// ─── Get polygon vertices for any fp shape (for corner marks, etc.) ──────────
export function getFpVertices(obj, dx = 0, dy = 0) {
  // If shape has been edited with vertex system, use stored verts
  if (obj.fpVerts) return obj.fpVerts.map(v => ({x: v.x + dx, y: v.y + dy}))
  const bx = (obj.x || 0) + dx, by = (obj.y || 0) + dy
  const w = obj.width, h = obj.height
  const sw = obj.fpStemW ?? 0.3, sh = obj.fpStemH ?? 0.3
  const tw = w * sw, th = h * sh

  switch (obj.type) {
    case 'fp_rect':
      return [{x:bx,y:by},{x:bx+w,y:by},{x:bx+w,y:by+h},{x:bx,y:by+h}]
    case 'fp_l':
      return [{x:bx,y:by},{x:bx+tw,y:by},{x:bx+tw,y:by+h-th},{x:bx+w,y:by+h-th},{x:bx+w,y:by+h},{x:bx,y:by+h}]
    case 'fp_l_mirror': {
      const rtw = w * sw
      return [{x:bx+w,y:by},{x:bx+w-rtw,y:by},{x:bx+w-rtw,y:by+h-th},{x:bx,y:by+h-th},{x:bx,y:by+h},{x:bx+w,y:by+h}]
    }
    case 'fp_t': {
      // Legacy ratio-based fallback
      const sl_  = obj.fpTStemL ?? ((1-(obj.fpTStemW??0.35))/2)
      const sr_  = obj.fpTStemR ?? (1-(1-(obj.fpTStemW??0.35))/2)
      const barHL = Math.max(0, obj.fpTBarHL ?? obj.fpBarH ?? 0.3)
      const barHR = Math.max(0, obj.fpTBarHR ?? obj.fpBarH ?? 0.3)
      const stemH = Math.min(1, obj.fpTStemH ?? 1.0)
      const sl = bx + w * sl_, sr = bx + w * sr_
      const bhl = h * barHL, bhr = h * barHR, sh = h * stemH
      return [{x:bx,y:by},{x:bx+w,y:by},{x:bx+w,y:by+bhr},{x:sr,y:by+bhr},{x:sr,y:by+sh},{x:sl,y:by+sh},{x:sl,y:by+bhl},{x:bx,y:by+bhl}]
    }

    case 'fp_u': {
      const wallT = obj.fpUWallT ?? 0.28, openH = obj.fpUOpenH ?? 0.62
      const armTop = obj.fpUArmTop ?? 0
      const ut = w * wallT, oh = h * openH
      const at = h * Math.max(0, Math.min(0.99, armTop))
      if (at <= 0) {
        return [{x:bx,y:by},{x:bx+ut,y:by},{x:bx+ut,y:by+oh},{x:bx+w-ut,y:by+oh},{x:bx+w-ut,y:by},{x:bx+w,y:by},{x:bx+w,y:by+h},{x:bx,y:by+h}]
      } else {
        // Inverted-U: stem above arms
        return [{x:bx+ut,y:by},{x:bx+w-ut,y:by},{x:bx+w-ut,y:by+at},{x:bx+w,y:by+at},{x:bx+w,y:by+h},{x:bx,y:by+h},{x:bx,y:by+at},{x:bx+ut,y:by+at}]
      }
    }
    case 'fp_cross': {
      // Fall back chain: 8-corner → 4-corner → symmetric fpCrossT
      const cw = obj.fpCrossW ?? obj.fpCrossT ?? 0.35
      const ch = obj.fpCrossH ?? obj.fpCrossT ?? 0.35
      const dfLX = (1-cw)/2,  dfRX = 1-dfLX
      const dfTY = (1-ch)/2,  dfBY = 1-dfTY
      const lxt = obj.fpCrossLXT ?? obj.fpCrossLX ?? dfLX
      const rxt = obj.fpCrossRXT ?? obj.fpCrossRX ?? dfRX
      const lxb = obj.fpCrossLXB ?? obj.fpCrossLX ?? dfLX
      const rxb = obj.fpCrossRXB ?? obj.fpCrossRX ?? dfRX
      const tyr = obj.fpCrossTYR ?? obj.fpCrossTopY ?? dfTY
      const byr = obj.fpCrossBYR ?? obj.fpCrossBotY ?? dfBY
      const tyl = obj.fpCrossTYL ?? obj.fpCrossTopY ?? dfTY
      const byl = obj.fpCrossBYL ?? obj.fpCrossBotY ?? dfBY
      const cl_t=bx+w*lxt, cr_t=bx+w*rxt, cl_b=bx+w*lxb, cr_b=bx+w*rxb
      const ct_r=by+h*tyr,  cb_r=by+h*byr,  ct_l=by+h*tyl,  cb_l=by+h*byl
      return [
        {x:cl_t,y:by},{x:cr_t,y:by},
        {x:cr_t,y:ct_r},{x:bx+w,y:ct_r},
        {x:bx+w,y:cb_r},{x:cr_b,y:cb_r},
        {x:cr_b,y:by+h},{x:cl_b,y:by+h},
        {x:cl_b,y:cb_l},{x:bx,y:cb_l},
        {x:bx,y:ct_l},{x:cl_t,y:ct_l},
      ]
    }
    default: return [{x:bx,y:by},{x:bx+w,y:by},{x:bx+w,y:by+h},{x:bx,y:by+h}]
  }
}


export function tShapePath(x, y, w, h, barHL = 0.3, stemL = 0.325, stemR = 0.675, barHR = null, stemH = 1.0) {
  // barHL/barHR: ratio of h. Can exceed stemH — bar extends below stem bottom (asymmetric shape).
  // stemH: ratio of h where stem bottom sits (default 1.0 = bottom of bbox).
  if (barHR === null) barHR = barHL
  const bhl  = h * Math.max(0, barHL)   // no upper clamp — bar can go below stem
  const bhr  = h * Math.max(0, barHR)
  const sh   = h * Math.max(0.01, Math.min(1, stemH))  // stem bottom, clamped to bbox
  const sl_  = Math.max(0, Math.min(stemL, stemR - 0.01))
  const sr_  = Math.max(sl_ + 0.01, Math.min(1, stemR))
  const sl   = x + w * sl_, sr = x + w * sr_
  // Vertices go: top-left → top-right → right-bar-bottom → right-stem-inner →
  //              stem-bottom-right → stem-bottom-left → left-stem-inner → left-bar-bottom → close
  return `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+bhr} L ${sr} ${y+bhr} L ${sr} ${y+sh} L ${sl} ${y+sh} L ${sl} ${y+bhl} L ${x} ${y+bhl} Z`
}

export function uShapePath(x, y, w, h, wallT = 0.28, openH = 0.62, armTop = 0) {
  // armTop > 0: opening/stem extends above arm tops (inverted-U / stem-up shape)
  // armTop = 0: normal U opening goes down from top (default)
  const tw = w * Math.max(0.05, Math.min(0.48, wallT))
  const at = h * Math.max(0, Math.min(0.99, armTop))   // arm tops absolute from bbox top
  if (at <= 0) {
    // Normal U: opening goes downward from top
    const oh = h * Math.max(0.01, Math.min(0.99, openH))
    return `M ${x} ${y} L ${x+tw} ${y} L ${x+tw} ${y+oh} L ${x+w-tw} ${y+oh} L ${x+w-tw} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`
  } else {
    // Inverted-U: stem goes above arm tops
    // Stem top = bbox top (y), arm tops at y+at, arm bottoms at y+h
    return `M ${x+tw} ${y} L ${x+w-tw} ${y} L ${x+w-tw} ${y+at} L ${x+w} ${y+at} L ${x+w} ${y+h} L ${x} ${y+h} L ${x} ${y+at} L ${x+tw} ${y+at} Z`
  }
}

// ─── Bounding box ────────────────────────────────────────────────────────────
/**
 * Does an object's bounding box overlap the visible world rectangle?
 *
 * Pure AABB overlap, in world px. `view` is { x0, y0, x1, y1 } — see
 * CanvasObjects, which builds it from pan/zoom and the container size.
 *
 * Used to skip drawing what cannot be seen: SVG has no scene graph, so every
 * off-screen <rect> is still a live DOM node the browser lays out and
 * hit-tests on every frame. On a generated warehouse that is the difference
 * between a few hundred shapes and tens of thousands.
 */
export function objectInView(obj, view) {
  const b = getObjectBounds(obj)
  return b.x <= view.x1 && b.x + b.width >= view.x0 &&
         b.y <= view.y1 && b.y + b.height >= view.y0
}

export function getObjectBounds(obj) {
  // LINE geometry class (x1/y1/x2/y2) — line, arc, and all ANNOT_LINE_TYPES
  if (obj.type === 'line' || obj.type === 'arc' || ANNOT_LINE_TYPES.has(obj.type)) {
    return { x: Math.min(obj.x1,obj.x2), y: Math.min(obj.y1,obj.y2),
             width: Math.abs(obj.x2-obj.x1)||10, height: Math.abs(obj.y2-obj.y1)||10 }
  }
  // CIRCLE geometry class
  if (obj.type === 'circle') {
    return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, width: obj.rx*2, height: obj.ry*2 }
  }
  // TEXT
  if (obj.type === 'text') {
    /* Measured from the wrapped lines rather than a fixed 200, so the
       selection frame hugs the text and the E/W handles land on its edges. */
    const L = layoutText(obj)
    const w = Math.max(L.width, 8)
    const h = Math.max(L.height, (obj.fontSize || 14) + 6)
    /* obj.x is the SVG text-anchor point, not the box's left edge — mirror
       ShapeGeometry's textAnchor math exactly, or the frame sits correctly
       only for align:'left' and drifts right of the true glyphs for
       center/right, never moving when alignment changes since it isn't
       part of this calculation otherwise. */
    const x = obj.align === 'center' ? obj.x - w / 2
            : obj.align === 'right'  ? obj.x - w
            : obj.x
    return { x, y: obj.y - (obj.fontSize || 14), width: w, height: h }
  }
  // Scale bar: label renders below the bbox but hitbox handles it — stored bounds = bar only
  if (obj.type === 'annot_scale_bar') {
    return { x: obj.x||0, y: obj.y||0, width: obj.width||120, height: obj.height||20 }
  }
  // POINTS geometry class — a freehand stroke carries an array, not a bbox
  if (obj.type === 'freehand' && obj.points?.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of obj.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return { x: minX, y: minY, width: Math.max(maxX-minX, 1), height: Math.max(maxY-minY, 1) }
  }
  // RECT geometry class — rect, all fp shapes, drawing shapes, ANNOT_RECT_TYPES
  return { x: obj.x||0, y: obj.y||0, width: obj.width||0, height: obj.height||0 }
}

// ─── Hit test ────────────────────────────────────────────────────────────────
export function objectContains(obj, wx, wy, zoom = 1) {
  // All distances in world px — divide by zoom so they represent constant screen px
  const P   = 8  / zoom   // bbox padding: ~8 screen px
  const HIT = 10 / zoom   // line hit radius: ~10 screen px
  // LINE geometry class — segment distance test
  if (obj.type === 'line' || obj.type === 'arc' || ANNOT_LINE_TYPES.has(obj.type)) {
    // Curve arrow — sample points along the actual quadratic bezier
    if (obj.type === 'annot_curve_arrow') {
      const x1 = obj.x1||0, y1 = obj.y1||0, x2 = obj.x2||0, y2 = obj.y2||0
      const bend = obj.bend ?? 0.35
      const mx = (x1+x2)/2, my = (y1+y2)/2
      const cpx = mx - (y2-y1)*bend, cpy = my + (x2-x1)*bend
      // Sample 20 points along Q bezier, check min distance
      for (let i = 0; i <= 20; i++) {
        const t = i / 20
        const bx = (1-t)*(1-t)*x1 + 2*(1-t)*t*cpx + t*t*x2
        const by = (1-t)*(1-t)*y1 + 2*(1-t)*t*cpy + t*t*y2
        if (Math.hypot(wx-bx, wy-by) < HIT) return true
      }
      return false
    }
    // Dimension: clickable area is the OFFSET dim line, not the base x1/y1→x2/y2 segment
    if (obj.type === 'annot_dimension') {
      const dx = (obj.x2||0)-(obj.x1||0), dy = (obj.y2||0)-(obj.y1||0)
      const len = Math.hypot(dx,dy)||1
      const nx = -dy/len, ny = dx/len
      const off = 28 / zoom
      const hitBase = distToSegment({x:wx,y:wy},{x:obj.x1,y:obj.y1},{x:obj.x2,y:obj.y2}) < HIT
      const hitDim  = distToSegment(
        {x:wx,y:wy},
        {x:(obj.x1||0)+nx*off, y:(obj.y1||0)+ny*off},
        {x:(obj.x2||0)+nx*off, y:(obj.y2||0)+ny*off}
      ) < HIT
      return hitBase || hitDim
    }
    return distToSegment({x:wx,y:wy},{x:obj.x1,y:obj.y1},{x:obj.x2,y:obj.y2}) < HIT
  }
  // POINTS — hit when the cursor is within HITW of any segment of the stroke
  if (obj.type === 'freehand') {
    const pts = obj.points || []
    if (pts.length < 2) return false
    const HITW = Math.max((obj.strokeWidth || 2) / 2, 8 / zoom)
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment({x:wx,y:wy}, pts[i-1], pts[i]) < HITW) return true
    }
    return false
  }
  // CIRCLE
  if (obj.type === 'circle') {
    return ((wx-obj.cx)**2/(obj.rx+P)**2) + ((wy-obj.cy)**2/(obj.ry+P)**2) <= 1
  }
  // Everything else — bbox test with rotation support
  const b = getObjectBounds(obj)
  const rot = obj.rotation || 0
  if (rot === 0) {
    return wx >= b.x-P && wx <= b.x+b.width+P && wy >= b.y-P && wy <= b.y+b.height+P
  }
  // Counter-rotate click point into object local space
  const cx = b.x + b.width/2, cy = b.y + b.height/2
  const rad = -(rot * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const ldx = wx - cx, ldy = wy - cy
  const lx = cx + ldx*cos - ldy*sin
  const ly = cy + ldx*sin + ldy*cos
  return lx >= b.x-P && lx <= b.x+b.width+P && ly >= b.y-P && ly <= b.y+b.height+P
}

export function distToSegment(p, a, b) {
  const dx = b.x-a.x, dy = b.y-a.y
  const len2 = dx*dx+dy*dy
  if (len2===0) return Math.hypot(p.x-a.x, p.y-a.y)
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/len2))
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy))
}

// ─── 8-handle resize ────────────────────────────────────────────────────────
// handles: tl tc tr ml mr bl bc br
export const HANDLES = ['tl','tc','tr','ml','mr','bl','bc','br']

export function getHandlePositions(bounds, pad=6) {
  const {x,y,width,height} = bounds
  const l=x-pad, r=x+width+pad, cx=(l+r)/2
  const t=y-pad, b=y+height+pad, cy=(t+b)/2
  return {
    tl:{x:l,y:t}, tc:{x:cx,y:t}, tr:{x:r,y:t},
    ml:{x:l,y:cy},               mr:{x:r,y:cy},
    bl:{x:l,y:b}, bc:{x:cx,y:b}, br:{x:r,y:b},
  }
}

export function applyResize(obj, handle, dx, dy, snapFn, shiftKey = false) {
  const MIN = 8

  // LANE-BASED RACKS — snap to whole lanes/deep (drive-in, drive-through, pushback)
  // CANTILEVER RACK — add/remove towers on ml/mr drag using last/first arm length
  if (obj.type === 'rack_cantilever') {
    const TSPACE_IN  = 48  // fixed 4ft spacing between towers
    const GS         = 40
    const tSpacePx   = (TSPACE_IN / 12) * GS
    const towers     = obj.towers || [36, 36]
    const lastArm    = towers[towers.length - 1]
    const firstArm   = towers[0]
    const curW       = (towers.length - 1) * tSpacePx

    if (handle === 'mr' || handle === 'tr' || handle === 'br') {
      const add = Math.round(dx / tSpacePx)
      if (add > 0) {
        const updated = [...towers, ...Array(add).fill(lastArm)]
        const newW = (updated.length - 1) * tSpacePx
        return { towers: updated, width: newW, height: obj.height }
      } else if (add < 0 && towers.length + add >= 2) {
        const updated = towers.slice(0, towers.length + add)
        const newW = (updated.length - 1) * tSpacePx
        return { towers: updated, width: newW, height: obj.height }
      }
      return {}
    }
    if (handle === 'ml' || handle === 'tl' || handle === 'bl') {
      const add = Math.round(-dx / tSpacePx)
      if (add > 0) {
        const updated = [...Array(add).fill(firstArm), ...towers]
        const newW = (updated.length - 1) * tSpacePx
        return { towers: updated, width: newW, height: obj.height, x: obj.x - (newW - curW) }
      } else if (add < 0 && towers.length + add >= 2) {
        const updated = towers.slice(-add)
        const newW = (updated.length - 1) * tSpacePx
        return { towers: updated, width: newW, height: obj.height, x: obj.x + (curW - newW) }
      }
      return {}
    }
    return {}
  }

  // BEAM-BASED RACKS — add/remove bays on ml/mr drag using last/first beam size
  if (obj.type === 'rack_row' || obj.type === 'rack_double_row') {
    const upIn      = obj.uprightWidth || 3
    const GS        = 40
    const upW       = (upIn/12)*GS
    const beams     = obj.beams || [96]
    const lastBeam  = beams[beams.length - 1]
    const firstBeam = beams[0]
    const lastPx    = (lastBeam/12)*GS
    const firstPx   = (firstBeam/12)*GS
    const curW      = upW*(beams.length+1) + beams.reduce((s,b)=>s+(b/12)*GS, 0)

    if (handle === 'mr' || handle === 'tr' || handle === 'br') {
      const add = Math.round(dx / (lastPx + upW))
      if (add > 0) {
        const updated = [...beams, ...Array(add).fill(lastBeam)]
        const newW = upW*(updated.length+1) + updated.reduce((s,b)=>s+(b/12)*GS, 0)
        return { beams: updated, width: newW, height: obj.height }
      } else if (add < 0 && beams.length + add >= 1) {
        const updated = beams.slice(0, beams.length + add)
        const newW = upW*(updated.length+1) + updated.reduce((s,b)=>s+(b/12)*GS, 0)
        return { beams: updated, width: newW, height: obj.height }
      }
      return {}
    }
    if (handle === 'ml' || handle === 'tl' || handle === 'bl') {
      const add = Math.round(-dx / (firstPx + upW))
      if (add > 0) {
        const updated = [...Array(add).fill(firstBeam), ...beams]
        const newW = upW*(updated.length+1) + updated.reduce((s,b)=>s+(b/12)*GS, 0)
        return { beams: updated, width: newW, height: obj.height, x: obj.x - (newW - curW) }
      } else if (add < 0 && beams.length + add >= 1) {
        const updated = beams.slice(-add)
        const newW = upW*(updated.length+1) + updated.reduce((s,b)=>s+(b/12)*GS, 0)
        return { beams: updated, width: newW, height: obj.height, x: obj.x + (curW - newW) }
      }
      return {}
    }
    return {}
  }

  if (obj.type === 'rack_drive_in' || obj.type === 'rack_drive_through' || obj.type === 'rack_pushback' || obj.type === 'rack_pallet_flow') {
    const upIn    = obj.uprightWidth || 4
    const GS      = 40
    const upW     = (upIn/12)*GS
    const ledgePx = (2/12)*GS
    const clearPx = (1/12)*GS
    const palletWPx = ((obj.palletWIn||40)/12)*GS
    const palletDPx = ((obj.palletDIn||48)/12)*GS
    const laneWPx   = ledgePx*2 + clearPx*2 + palletWPx

    let lanes = obj.lanes || 2
    let deep  = obj.palletDeep || 5
    // Derive current dims from formula — never trust obj.width/height (can drift)
    const curW = (lanes+1)*upW + lanes*laneWPx
    const curH = deep * palletDPx

    // dx/dy already counter-rotated by CanvasArea for rotated objects
    if (handle === 'mr' || handle === 'br' || handle === 'tr') {
      lanes = Math.max(1, Math.round((Math.max(curW + dx, upW*2 + laneWPx) - upW) / (laneWPx + upW)))
    }
    if (handle === 'ml' || handle === 'bl' || handle === 'tl') {
      lanes = Math.max(1, Math.round((Math.max(curW - dx, upW*2 + laneWPx) - upW) / (laneWPx + upW)))
    }
    if (handle === 'bc' || handle === 'br' || handle === 'bl' || handle === 'tl' || handle === 'tr') {
      deep = Math.max(1, Math.round(Math.max(curH + dy, palletDPx) / palletDPx))
    }
    const newW = (lanes+1)*upW + lanes*laneWPx
    const newH = deep * palletDPx
    // Non-rotated left handle: anchor right edge by shifting x
    const objRot = obj.rotation || 0
    const xOffset = (objRot === 0 && (handle === 'ml' || handle === 'bl' || handle === 'tl')) ? (curW - newW) : 0
    return { lanes, palletDeep: deep, width: newW, height: newH, x: obj.x + xOffset }
  }

  // LINE geometry class — left handles move start, right handles move end
  if (obj.type === 'line' || obj.type === 'arc' || ANNOT_LINE_TYPES.has(obj.type)) {
    if (handle==='tl'||handle==='ml'||handle==='bl') {
      let nx = snapFn(obj.x1+dx), ny = snapFn(obj.y1+dy)
      if (shiftKey) {
        // Shift: lock to H or V relative to the fixed end (x2/y2)
        const adx = Math.abs(nx - obj.x2), ady = Math.abs(ny - obj.y2)
        if (adx >= ady) ny = obj.y2; else nx = obj.x2
      }
      return { x1: nx, y1: ny }
    }
    if (handle==='tr'||handle==='mr'||handle==='br') {
      let nx = snapFn(obj.x2+dx), ny = snapFn(obj.y2+dy)
      if (shiftKey) {
        const adx = Math.abs(nx - obj.x1), ady = Math.abs(ny - obj.y1)
        if (adx >= ady) ny = obj.y1; else nx = obj.x1
      }
      return { x2: nx, y2: ny }
    }
    return {}
  }
  // CIRCLE
  if (obj.type === 'circle') {
    let {cx, cy, rx, ry} = obj
    if (handle.includes('l')) { const nx = snapFn(cx-rx+dx); rx = Math.max(4, cx-nx) }
    if (handle.includes('r')) { rx = Math.max(4, snapFn(rx+dx)) }
    if (handle.includes('t')) { const ny = snapFn(cy-ry+dy); ry = Math.max(4, cy-ny) }
    if (handle.includes('b')) { ry = Math.max(4, snapFn(ry+dy)) }
    return { cx, cy, rx, ry }
  }
  // RECT geometry class — rect, fp shapes, drawing shapes, ANNOT_RECT_TYPES
  let {x, y, width, height} = obj
  const MINR = ANNOT_RECT_TYPES.has(obj.type) ? 20 : MIN
  if (handle.includes('l')) { const nx=snapFn(x+dx); const nw=width-(nx-x); if(nw>MINR){x=nx;width=nw} }
  if (handle.includes('r')) { width = Math.max(MINR, snapFn(width+dx)) }
  if (handle.includes('t')) { const ny=snapFn(y+dy); const nh=height-(ny-y); if(nh>MINR){y=ny;height=nh} }
  if (handle.includes('b')) { height = Math.max(MINR, snapFn(height+dy)) }
  return { x, y, width, height }
}

// ─── Floor plan wall segments ────────────────────────────────────────────────
// Returns array of { index, a, b, lenPx, lenFt, label } for every wall of a fp shape

// ─── Per-wall drag axis override ─────────────────────────────────────────────
// Returns 'x' (drag horizontally), 'y' (drag vertically), or null (use geometry)
// Some short walls have non-obvious drag directions (e.g. T-shape side bars)
export function getWallDragAxis(objType, wallIndex) {
  // Returns 'x', 'y', or null (use geometry). Only needed where geometry is misleading.
  switch (objType) {
    case 'fp_t':
      // For fp_t, axis is always: horizontal walls → Y, vertical walls → X
      // Walls 0,2,4,6 are horizontal; 1,3,5,7 are vertical
      if ([0, 2, 4, 6].includes(wallIndex)) return 'y'
      return 'x'
    case 'fp_cross':
      if (wallIndex === 0 || wallIndex === 6) return 'y'
      if (wallIndex === 3 || wallIndex === 9) return 'x'
      if ([1,5,7,11].includes(wallIndex)) return 'x'
      if ([2,4,8,10].includes(wallIndex)) return 'y'
      return null
    default:
      return null
  }
}

export function getFpWallSegments(obj, gridSize = 40) {
  const verts = getFpVertices(obj)
  const n = verts.length
  const w = obj.width, h = obj.height

  // Per-shape wall labels
  const LABELS = {
    fp_rect:    ['Width','Height','Width','Height'],
    fp_l:       ['Arm top','Inner V','Inner H','Arm side','Width','Height'],
    fp_l_mirror:['Arm top','Inner V','Inner H','Arm side','Width','Height'],
    fp_t:       ['Width','Right Bar H','Right Step','Right Stem','Stem W','Left Stem','Left Step','Left Bar H'],
    fp_u:       ['Wall T','Inner H','Opening','Inner H','Wall T','Height','Width','Height'],
    fp_cross:   ['Arm W','Step','Step','Arm H','Step','Step','Arm W','Step','Step','Arm H','Step','Step'],
  }
  const labels = LABELS[obj.type] || []

  return verts.map((v, i) => {
    const next = verts[(i + 1) % n]
    const lenPx = Math.hypot(next.x - v.x, next.y - v.y)
    return {
      index: i,
      a: { x: v.x, y: v.y },
      b: { x: next.x, y: next.y },
      lenPx,
      lenFt: lenPx / gridSize,
      label: labels[i] || `Wall ${i + 1}`,
    }
  })
}

// ─── Apply a new ft length to a specific wall, returns partial object update ─
export function applyFpWallLength(obj, wallIndex, newLenFt, gridSize) {
  // Vertex-based: move the wall to achieve the desired length.
  // Works for ALL fp shapes since they all use fpVerts now.
  const newPx = newLenFt * gridSize
  const MIN   = gridSize  // 1 ft minimum

  // Get current vertices
  const verts = (obj.fpVerts ? obj.fpVerts : getFpVertices(obj)).map(v => ({...v}))
  const n = verts.length
  const ai = wallIndex % n
  const bi = (wallIndex + 1) % n
  const a = verts[ai], b = verts[bi]

  const isHoriz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const curLen  = Math.hypot(b.x - a.x, b.y - a.y)
  if (curLen < 1) return {}

  const targetLen = Math.max(MIN, newPx)
  const delta = targetLen - curLen

  // Move only the far endpoint(s) of the wall — wall stays anchored at its start.
  // For horizontal walls: move b.x (and the vertex after b that shares it)
  // For vertical walls: move b.y (and the vertex after b that shares it)
  // We move BOTH endpoints equally by half the delta to keep shape centered.
  if (isHoriz) {
    // wall goes left→right: extend/shrink from both ends symmetrically
    const halfD = delta / 2
    const dir   = b.x > a.x ? 1 : -1
    verts[ai].x -= dir * halfD
    verts[bi].x += dir * halfD
  } else {
    // wall goes top→bottom: extend/shrink from both ends
    const halfD = delta / 2
    const dir   = b.y > a.y ? 1 : -1
    verts[ai].y -= dir * halfD
    verts[bi].y += dir * halfD
  }

  const xs = verts.map(v => v.x), ys = verts.map(v => v.y)
  const nx = Math.min(...xs), ny = Math.min(...ys)
  return { fpVerts: verts, x: nx, y: ny, width: Math.max(...xs)-nx, height: Math.max(...ys)-ny }
}


// ─── Apply drag-position to a wall, returns partial object update ──────────
export function applyFpWallDrag(obj, wallIndex, pos) {
  // Universal vertex-based wall drag for ALL fp shapes.
  // Rule: move both endpoints of the dragged wall along their axis (H→Y, V→X).
  // Neighboring walls stretch automatically because they share those vertices.
  const FP_VERTEX_TYPES = new Set(['fp_rect','fp_l','fp_l_mirror','fp_t','fp_u','fp_cross'])
  if (!FP_VERTEX_TYPES.has(obj.type)) return {}

  // Get current vertices (init from legacy params if first drag on old shape)
  const verts = (obj.fpVerts ? obj.fpVerts : getFpVertices(obj)).map(v => ({...v}))
  const n = verts.length
  const ai = wallIndex % n
  const bi = (wallIndex + 1) % n
  const a = verts[ai], b = verts[bi]

  // Determine axis from wall orientation
  const isHoriz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  if (isHoriz) {
    verts[ai].y = pos.y
    verts[bi].y = pos.y
  } else {
    verts[ai].x = pos.x
    verts[bi].x = pos.x
  }

  // Recompute bounding box from new vertices
  const xs = verts.map(v => v.x), ys = verts.map(v => v.y)
  const nx = Math.min(...xs), ny = Math.min(...ys)
  return { fpVerts: verts, x: nx, y: ny, width: Math.max(...xs) - nx, height: Math.max(...ys) - ny }
}

// ─── Inset a rectilinear polygon by wt pixels inward ─────────────────────────
// Works correctly for convex AND concave corners (L, T, U, cross shapes).
// Uses edge inward-normal bisector method — each vertex moves exactly wt inward
// along both its connected edge directions.
export function insetPolygon(verts, wt) {
  const n = verts.length
  if (n < 3) return verts

  // Compute signed area to determine winding direction
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += verts[i].x * verts[j].y - verts[j].x * verts[i].y
  }
  // sign: -1 for CW in screen coords (y-down), +1 for CCW
  // We want inward normals, so flip based on winding
  const sign = area >= 0 ? -1 : 1

  return verts.map((v, i) => {
    const prev = verts[(i - 1 + n) % n]
    const next = verts[(i + 1) % n]

    // Incoming and outgoing edge vectors
    const e1x = v.x - prev.x, e1y = v.y - prev.y
    const e2x = next.x - v.x, e2y = next.y - v.y
    const len1 = Math.hypot(e1x, e1y) || 1
    const len2 = Math.hypot(e2x, e2y) || 1

    // Inward unit normal of each edge (perpendicular, pointing inside polygon)
    const n1x = sign * e1y / len1,  n1y = -sign * e1x / len1
    const n2x = sign * e2y / len2,  n2y = -sign * e2x / len2

    // Vertex offset = wt × sum of the two inward normals
    // For a 90° rectilinear corner this gives exactly (±wt, ±wt) — one axis per edge
    return {
      x: v.x + wt * (n1x + n2x),
      y: v.y + wt * (n1y + n2y),
    }
  })
}

// ── Effective drag delta for an object ───────────────────────────────────────
// Returns {dx, dy} accounting for:
//   1. Object itself is selected and being dragged
//   2. Object's parent FP is selected and being dragged
//   3. Zero otherwise
// Use this wherever an object's live position is needed during drag.
export function getEffectiveDelta(obj, objects, selectedIds, moveDelta) {
  if (!moveDelta) return { dx: 0, dy: 0 }
  if (selectedIds.includes(obj.id)) return moveDelta
  if (obj.parentId && selectedIds.includes(obj.parentId)) return moveDelta
  return { dx: 0, dy: 0 }
}