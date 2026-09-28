import { create } from 'zustand'
import { DEFAULT_LABEL_SIZE, LABEL_SIZES } from '../render/labelSize'

/* ── Label view preferences ───────────────────────────────────────────────────
   - labelSize: 'small' | 'medium' | 'large' (render/labelSize.js), default
     medium — every label and mark on the drawing, and the PDF export.
   - showColumnLabels: the column clearance arrows and their distances, on by
     default. Off never hides the red "under travel" marks, the red aisle
     shading, the X marks or the upright flags.
   View preferences: remembered in localStorage, never the canvas store (so
   not in the document or its history). A plain zustand store so the PDF
   export can read the same values the canvas draws with. */
const KEY_SIZE = 'trace.canvas2.labelSize'
const KEY_COLUMN_LABELS = 'trace.canvas2.columnLabels'
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export const useLabelPrefs = create((set) => ({
  labelSize: LABEL_SIZES[read(KEY_SIZE)] ? read(KEY_SIZE) : DEFAULT_LABEL_SIZE,
  showColumnLabels: read(KEY_COLUMN_LABELS) !== '0',
  setLabelSize: (size) => { if (!LABEL_SIZES[size]) return; write(KEY_SIZE, size); set({ labelSize: size }) },
  setShowColumnLabels: (on) => { write(KEY_COLUMN_LABELS, on ? '1' : '0'); set({ showColumnLabels: !!on }) },
}))
