// canvas2/fpRotate.js
// ─────────────────────────────────────────────────────────────────────────────
// Floor-plan rotation, ported from CanvasUI.jsx's FpRotateHandle — a
// building is a CONTAINER: rotating it turns the shell AND every rack
// inside as one rigid unit, about the building's own centre, racks keeping
// their relative positions. The SVG reference's own generic single-object
// rotate branch (CanvasArea's `handle === 'rotate'`, the same one canvas2
// already ports for a single rack) has NO cascade-to-children logic at all
// — it only ever writes ONE object's `rotation` field. That is a genuine,
// pre-existing gap in the SVG engine itself (verified: no `parentId`+
// rotation code exists anywhere in CanvasArea.jsx/the store), not something
// this file failed to find — see CANVAS2_BUGLOG.md's own entry for the
// investigation. What IS ported verbatim from the reference is FpRotateHandle's
// own geometry (the 56/zoom stalk, 8/zoom hit circle — distinct numbers from
// the RACK rotate handle's 70/zoom, a separate SVG component) and the
// generic rotate branch's angle math (atan2 around the object's own centre,
// 5°/45° snap). The cascade-to-children rotation itself is built fresh here,
// using the SAME rigid-rotation decomposition (orbit the pivot + spin in
// place) CANVAS2_BUGLOG's group-rotate entries (BUG 19-21) already
// established and proved correct for exactly this shape of problem.
//
// Why the floor plan's OWN `rotation` field is never touched: canvas2 draws
// a floor plan purely from `fpVerts` (FloorPlanShape applies no separate
// rotation transform — CANVAS2.md rule 4, geometry decides). Rotating a
// building bakes the turn directly into fpVerts's own absolute coordinates,
// the same way a wall drag (BUG 13) reshapes fpVerts directly rather than
// writing a transform. Setting `rotation` ON TOP of that would double-
// rotate anything that DOES read it off an fp object — SelectionOutline's
// spin(), which measures outlineBounds (already the rotated verts) and
// would then rotate THAT again. Children are different: a rack's own shape
// (RackShape) DOES paint through spin()/obj.rotation, so a child's
// `rotation` field is exactly how it visually spins in place — it has to
// be bumped by the same delta the fp's shell absorbed into its verts, or
// an axis-aligned rack orbiting a turned building would stay axis-aligned
// instead of turning with it.
// ─────────────────────────────────────────────────────────────────────────────

import { outlineBounds } from './shapes'

/** Rotate world point `p` by `angleDeg` about `pivot`. Kept as its own
 *  small copy rather than imported from groupRotate.js's identical
 *  helper — the same reasoning handleGeometry.js's own toLocal gives for
 *  not sharing its copy: this one is scoped to a fp+children cascade with
 *  an EXTERNALLY FIXED pivot, group rotate's is scoped to a selection
 *  with its own internally-recomputed one, and importing across for one
 *  six-line function would be the only reason to touch that file's export
 *  surface. */
function rotPt(p, angleDeg, pivot) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const dx = p.x - pivot.x, dy = p.y - pivot.y
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos }
}

/** The floor plan's own rotate-handle geometry — FpRotateHandle ported
 *  (56/zoom stalk, 6/zoom line gap, 8/zoom hit circle).
 *
 *  BUG 24: the first version of this anchored rx/ry to outlineBounds — the
 *  AABB of the LIVE fpVerts. That is exactly BUG 20's mistake transplanted
 *  into a new component: an axis-aligned box of ROTATING content doesn't
 *  turn as a rigid shape, it grows/shrinks/re-centres continuously as the
 *  polygon spins, so a handle anchored to its top edge visibly wobbles
 *  instead of sweeping a clean arc — the box's own centre and width both
 *  move non-uniformly with the rotation angle. Group rotate solved the
 *  same class of problem (BUG 21) by wrapping a TIGHT LOCAL shape in ONE
 *  rigid Konva rotation transform; a floor plan has no such transform to
 *  wrap in (fpRotate.js's own header — rotation is baked into fpVerts, not
 *  a field), so there is nothing to hand a Group's `rotation` prop.
 *
 *  Fixed by anchoring to two REAL points instead of a derived box: fpVerts
 *  index 0 and 1 — every floor-plan shape's own initFpVerts starts with
 *  this exact edge (its top wall, before any rotation ever happened, for
 *  fp_rect/l/l_mirror/t/u/cross alike), and it is already always fully
 *  and exactly rotated along with the rest of the polygon, needing no
 *  separate "how far has this turned" value at all — live mid-drag or on
 *  an already-rotated, freshly-selected building alike. The handle sits a
 *  constant screen distance OUTWARD along that edge's own normal, rather
 *  than "above the AABB" — rigid by construction, the same guarantee
 *  spin() gives a single object, just built from two vertices instead of
 *  a transform. */
export function computeFpRotateHandle(fp, gridSize, zoom) {
  const verts = fp.fpVerts
  if (!verts || verts.length < 2) return null
  const b = outlineBounds(fp, gridSize)
  if (!b) return null
  const pivot = { x: b.x + b.width / 2, y: b.y + b.height / 2 }

  const v0 = verts[0], v1 = verts[1]
  const mx = (v0.x + v1.x) / 2, my = (v0.y + v1.y) / 2
  const ex = v1.x - v0.x, ey = v1.y - v0.y
  const len = Math.hypot(ex, ey) || 1
  /* Outward normal: the edge direction rotated -90° (screen-space) — for
     initFpVerts's own clockwise winding this points away from the
     interior on every shape (verified against fp_rect's unrotated case:
     v0->v1 runs +X along the top wall, and (ey/len, -ex/len) comes out
     (0,-1), i.e. up and away from the building — the same direction the
     original AABB-top math put the handle in when nothing was rotated). */
  const nx = ey / len, ny = -ex / len

  const rx = mx + nx * 56 / zoom
  const ry = my + ny * 56 / zoom
  const lx = mx + nx * 6 / zoom
  const ly = my + ny * 6 / zoom
  const r = 8 / zoom
  return { rx, ry, lx, ly, nx, ny, r, pivot }
}

/** Whether a world point falls on the fp rotate handle — same r hit
 *  radius as the paint circle (CanvasUI.jsx's own FpRotateHandle has no
 *  separate, larger invisible hit target the way GroupOutline's does;
 *  matched here rather than invented). */
export function fpRotateHandleHitTest(fp, gridSize, zoom, worldX, worldY) {
  const h = computeFpRotateHandle(fp, gridSize, zoom)
  if (!h) return false
  return Math.hypot(worldX - h.rx, worldY - h.ry) <= h.r
}

/** Rotation updates for the floor plan AND every one of its current
 *  children, rigidly, about `pivot` (fixed for the whole gesture — the
 *  fp's own centre at drag-start, from computeFpRotateHandle; NOT
 *  recomputed from the children, which could drag the pivot away from
 *  the building's true centre depending on which children happen to be
 *  attached). `fpBase`/`childrenBase` are snapshots taken at drag-start
 *  (fpBase a plain object, childrenBase a Map id->object), the same
 *  "recompute from a fixed start every frame" discipline
 *  applyGroupRotation uses, for the same reason: many mousemove frames
 *  must never compound drift onto each other. Returns a Map id->partial
 *  updates for useCanvasStore's updateObject/commitObjectUpdate — this
 *  module makes no store calls itself. */
export function applyFpRotation(fpBase, childrenBase, pivot, angleDeg) {
  const updates = new Map()

  const shellVerts = fpBase.fpVerts.map(v => rotPt(v, angleDeg, pivot))
  let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity
  shellVerts.forEach(v => {
    sMinX = Math.min(sMinX, v.x); sMinY = Math.min(sMinY, v.y)
    sMaxX = Math.max(sMaxX, v.x); sMaxY = Math.max(sMaxY, v.y)
  })
  updates.set(fpBase.id, {
    fpVerts: shellVerts,
    x: sMinX, y: sMinY, width: sMaxX - sMinX, height: sMaxY - sMinY,
  })

  childrenBase.forEach(b => {
    const baseRot = b.rotation ?? 0
    const u = {}
    if (b.type === 'circle') {
      u.rotation = (baseRot + angleDeg) % 360
      const np = rotPt({ x: b.cx, y: b.cy }, angleDeg, pivot)
      u.cx = np.x; u.cy = np.y
    } else if ('x1' in b) {
      u.rotation = (baseRot + angleDeg) % 360
      const p1 = rotPt({ x: b.x1, y: b.y1 }, angleDeg, pivot)
      const p2 = rotPt({ x: b.x2, y: b.y2 }, angleDeg, pivot)
      u.x1 = p1.x; u.y1 = p1.y; u.x2 = p2.x; u.y2 = p2.y
    } else if (b.fpVerts) {
      // A nested floor plan (atypical — buildings aren't usually parented
      // to other buildings — but handled the same way as the outer shell
      // above if it ever happens): verts rotate, rotation field does not.
      const nv = b.fpVerts.map(v => rotPt(v, angleDeg, pivot))
      let nMinX = Infinity, nMinY = Infinity, nMaxX = -Infinity, nMaxY = -Infinity
      nv.forEach(v => {
        nMinX = Math.min(nMinX, v.x); nMinY = Math.min(nMinY, v.y)
        nMaxX = Math.max(nMaxX, v.x); nMaxY = Math.max(nMaxY, v.y)
      })
      u.fpVerts = nv; u.x = nMinX; u.y = nMinY; u.width = nMaxX - nMinX; u.height = nMaxY - nMinY
    } else if ('x' in b && 'width' in b) {
      u.rotation = (baseRot + angleDeg) % 360
      const np = rotPt({ x: (b.x || 0) + (b.width || 0) / 2, y: (b.y || 0) + (b.height || 0) / 2 }, angleDeg, pivot)
      u.x = np.x - (b.width || 0) / 2; u.y = np.y - (b.height || 0) / 2
    }
    updates.set(b.id, u)
  })

  return updates
}
