// deep.js — (r2-double-deep) a double-deep rack: a beam rack (a single row, `rack_row`, or a back-to-back pair,
// `rack_double_row`) whose every bay holds `deep` pallets one behind the other on each face — `deep` frame lines, `deepGapIn`
// apart (the deep spacing, 6″ by default), each with its own beams and frames. A pair is two of them back to back across
// its flue (2 deep each side: 4 deep). Placed by hand only (the Racking library's Double-deep Rack); Fill and Generate
// never make one. The rest of the beam machinery (bays, levels, elevations, the bay ledger, BOM, Tally) reads it as the
// beam rack it is, times `deep` where a count is per frame line.
export const DEEP_DEFAULT = 2
export const DEEP_GAP_IN = 6
/** Pallets one behind the other on each face (1: an ordinary selective rack). */
export const deepOf = (r) => (Number(r?.deep) >= 2 ? Math.min(6, Math.floor(Number(r.deep))) : 1)
export const isDeep = (r) => deepOf(r) > 1
/** The deep spacing (inches) between one frame line and the next. */
export const deepGapOf = (r) => (Number.isFinite(Number(r?.deepGapIn)) && Number(r.deepGapIn) >= 0 ? Number(r.deepGapIn) : DEEP_GAP_IN)
/** One face's depth across (inches): `deep` frames and the spacings between them. */
export const faceDepthIn = (r, depthIn = r?.depthIn ?? 42) => deepOf(r) * depthIn + (deepOf(r) - 1) * deepGapOf(r)
/** The rack's whole depth across (inches): one face, or a pair's two and its flue. */
export const acrossIn = (r, depthIn = r?.depthIn ?? 42, type = r?.type) => (type === 'rack_double_row' ? 2 * faceDepthIn(r, depthIn) + (r?.flueSpaceIn ?? 9) : faceDepthIn(r, depthIn))
/** Deep-reach trucks reach a second pallet back; every other truck reaches one (Check warns on a double-deep rack). */
export const reachesDeep = (mhe) => /deep/i.test(String(mhe || ''))
