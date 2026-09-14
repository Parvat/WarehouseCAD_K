/* ── Forklift — the template for Trace's custom warehouse icons ──────────────
   Domain glyphs lucide does not ship. Everything else in the app is lucide, so
   these have to be indistinguishable from it at a glance or the toolbar reads
   as two mismatched sets.

   The contract, copied from lucide's own SVG attributes:
     • 24×24 viewBox, no width/height baked in
     • fill none, stroke currentColor — colour comes from CSS, never the glyph
     • strokeWidth 1.7, round caps and joins
     • same props API: <Forklift size={20} strokeWidth={2} className="..." />

   `absoluteStrokeWidth` matches lucide's flag: with it, the rendered line stays
   the same weight as the icon is scaled, which is what CLAUDE.md asks for
   across the icon set.

   Build new icons by copying this file and replacing only the <g> contents.
   Keep them minimal — a glyph that reads at 16px, not an illustration. */
export function Forklift({
  size = 24,
  strokeWidth = 1.7,
  absoluteStrokeWidth = false,
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      {...props}
    >
      {/* cab + counterweight */}
      <path d="M4 15V7a1 1 0 0 1 1-1h5l2 5v4" />
      {/* mast */}
      <path d="M16 4v11" />
      {/* forks */}
      <path d="M16 12h4" />
      <path d="M16 8h3" />
      {/* wheels */}
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="14" cy="17.5" r="2.5" />
      {/* chassis between the wheels */}
      <path d="M9 17.5h2.5" />
    </svg>
  )
}

export default Forklift
