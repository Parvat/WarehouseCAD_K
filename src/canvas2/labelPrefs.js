import { create } from 'zustand'
import { DEFAULT_LABEL_SIZE, LABEL_SIZES } from '../render/labelSize'

/* ── Label view preferences ───────────────────────────────────────────────────
   - labelSize: 'small' | 'medium' | 'large' | 'xlarge' (render/labelSize.js),
     default medium — every label and mark on the drawing.
   - pdfLabelSize: the PDF's own label size — 'auto' (default: the size that
     prints the smallest label at least 2.5 mm tall on the sheet), 'screen'
     (the drawing's Label size), or a Label size key.
   - showColumnLabels: the column clearance arrows and their distances, on by
     default. Off never hides the red "under travel" marks, the red aisle
     shading, the X marks or the upright flags.
   View preferences: remembered in localStorage, never the canvas store (so
   not in the document or its history). A plain zustand store so the PDF
   export can read the same values the canvas draws with. A single aisle's own
   label size is document data (the aisle's labelSizeIn), not a preference. */
const KEY_SIZE = 'trace.canvas2.labelSize'
const KEY_PDF_SIZE = 'trace.canvas2.pdfLabelSize'
const KEY_COLUMN_LABELS = 'trace.canvas2.columnLabels'
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }
export const PDF_LABEL_SIZES = ['auto', 'screen', ...Object.keys(LABEL_SIZES)]

export const useLabelPrefs = create((set) => ({
  labelSize: LABEL_SIZES[read(KEY_SIZE)] ? read(KEY_SIZE) : DEFAULT_LABEL_SIZE,
  pdfLabelSize: PDF_LABEL_SIZES.includes(read(KEY_PDF_SIZE)) ? read(KEY_PDF_SIZE) : 'auto',
  showColumnLabels: read(KEY_COLUMN_LABELS) !== '0',
  setLabelSize: (size) => { if (!LABEL_SIZES[size]) return; write(KEY_SIZE, size); set({ labelSize: size }) },
  setPdfLabelSize: (size) => { if (!PDF_LABEL_SIZES.includes(size)) return; write(KEY_PDF_SIZE, size); set({ pdfLabelSize: size }) },
  setShowColumnLabels: (on) => { write(KEY_COLUMN_LABELS, on ? '1' : '0'); set({ showColumnLabels: !!on }) },
}))
