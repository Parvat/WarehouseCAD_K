/* The THEME.md values that JavaScript draws with — Konva and the SVG strings cannot read a CSS variable. Each one has
   a CSS twin in index.css's single token block; the theme test keeps the two equal. */

/** Canvas selection and its handles: THEME blue (index.css --select-blue). */
export const SELECT_BLUE = '#1B4FD8'
/** SELECT_BLUE at an alpha, for a selection's tinted fill (the marquee, a picked bay). */
export const selectTint = (a) => `rgba(27,79,216,${a})`

/** The faces a text object can be set in — the app's own three (index.html loads them). */
export const TEXT_FONTS = ['Plus Jakarta Sans', 'Oswald', 'JetBrains Mono']
export const TEXT_FONT_DEFAULT = 'Plus Jakarta Sans'

/* Text objects saved before the type change carry a face that is no longer loaded: each draws in its successor. */
const RETIRED = { montserrat: 'Plus Jakarta Sans', inter: 'Plus Jakarta Sans', 'dm sans': 'Plus Jakarta Sans', 'dm mono': 'JetBrains Mono', 'ibm plex mono': 'JetBrains Mono', monospace: 'JetBrains Mono' }

/** The face a text object is drawn in: its own when that is one of TEXT_FONTS, a retired face's successor, else the default. */
export function textFace(name) {
  const n = String(name || '').split(',')[0].replace(/['"]/g, '').trim()
  if (TEXT_FONTS.includes(n)) return n
  return RETIRED[n.toLowerCase()] || TEXT_FONT_DEFAULT
}
