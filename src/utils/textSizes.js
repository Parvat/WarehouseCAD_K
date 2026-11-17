// utils/textSizes.js — the CAD text model (CLAUDE.md Critical Rule 8, labels-cad round; STUDIO.md, Canvas text): every
// canvas label has a REAL-WORLD text height in drawing units and scales with the drawing exactly like geometry. No
// screen floor, no hiding, no growing, no ranges, no leaders added on zoom — the plan looks the same at every zoom, only
// bigger or smaller. A label is laid out ONCE at its real size (so nothing overlaps); its position is fixed in drawing
// units.
//
// One text height per label type (inches), the project's own (saved with it — utils/saveLoad.js `textSizes`); an object
// may carry its own (`labelSizeIn`, inches — the Text size field in its card). The View card sets the type's height
// (studio/StudioFrame.jsx, with Reset). The PDF draws the same heights at its print scale.
//
// The layouts were written in "label px" (a design font of N label px — the aisle labels' 10, the clearances' 9.5 …):
// `textLz(type)` is the scale that makes the type's design font come out exactly its real height:
//   one label px = 1 / lz world px, and fs (world) = designFs / lz = height.

import { create } from 'zustand'

/** The label types: key → { name (the View card's), inches (the default text height), fs (the layout's design font, label px) }. */
export const TEXT_TYPES = {
  aisle:     { name: 'Aisle widths', inches: 18, fs: 10 },
  row:       { name: 'Row numbers', inches: 18, fs: 10 },
  doorValue: { name: 'Door chain', inches: 12, fs: 10 },
  doorBadge: { name: 'Door numbers', inches: 12, fs: 8 },
  column:    { name: 'Column chain and bubbles', inches: 18, fs: 10.5 },
  building:  { name: 'Building size', inches: 24, fs: 12 },
  names:     { name: 'Zone and section names', inches: 24, fs: 11 },
  clearance: { name: 'Clearances', inches: 9, fs: 9.5 },
}
export const TEXT_TYPE_KEYS = Object.keys(TEXT_TYPES)
export const MIN_TEXT_IN = 1, MAX_TEXT_IN = 240

/** The project's text heights: { [type]: inches } — only the ones changed from the default. */
export const useTextSizes = create((set) => ({
  sizes: {},
  setSize: (type, inches) => set(s => {
    if (!TEXT_TYPES[type]) return s
    const sizes = { ...s.sizes }
    if (inches == null || !(inches > 0) || inches === TEXT_TYPES[type].inches) delete sizes[type]
    else sizes[type] = Math.min(MAX_TEXT_IN, Math.max(MIN_TEXT_IN, Math.round(inches * 100) / 100))
    return { sizes }
  }),
  resetAll: () => set({ sizes: {} }),
}))

/** Replace the project's text heights (a layout opened: its own, or none). */
export function loadTextSizes(sizes) {
  const ok = {}
  if (sizes && typeof sizes === 'object') for (const k of TEXT_TYPE_KEYS) if (sizes[k] > 0) ok[k] = sizes[k]
  useTextSizes.setState({ sizes: ok })
}
export const getTextSizes = () => useTextSizes.getState().sizes

/** A type's text height in inches: the object's own (`own`, inches), else the project's, else the default. */
export function textInches(type, own = null, sizes = getTextSizes()) {
  if (own > 0) return own
  const v = sizes && sizes[type]
  return v > 0 ? v : (TEXT_TYPES[type] || TEXT_TYPES.aisle).inches
}
/** A type's text height in world px. */
export const textHeight = (type, gridSize = 40, own = null, sizes) => (textInches(type, own, sizes) / 12) * gridSize
/** The label scale for a type's layout: its design font (or `designFs`) comes out at its real height. */
export function textLz(type, gridSize = 40, own = null, sizes, designFs) {
  const fs = designFs ?? (TEXT_TYPES[type] || TEXT_TYPES.aisle).fs
  return fs / textHeight(type, gridSize, own, sizes)
}
