// fitInset.js — the canvas's free area for Fit (STUDIO.md §1): what the chrome covers of the canvas, read from the islands
// as they are on screen — the left rail (its right edge), the right card (its left edge: nothing of the building goes
// under it, however tall the card is) and the Tally drawer (studio/tally.js — the room above it). An island that is not
// shown (Tally's Focus hides the rail and the card) covers nothing. Fit then centres the plan in what is left, with its
// usual margin (canvas2/viewport.js fitView).
import { tallyInset } from './tally'

/** { left, right, bottom } px of `container` (the canvas) the chrome covers. */
export function fitInset(container) {
  const out = { left: 0, right: 0, bottom: tallyInset().bottom || 0 }
  if (!container || typeof document === 'undefined') return out
  const c = container.getBoundingClientRect()
  const rail = document.querySelector('[data-island="rail"]')?.getBoundingClientRect()
  const card = document.querySelector('[data-island="right-card"]')?.getBoundingClientRect()
  if (rail && rail.width > 0) out.left = Math.max(0, rail.right - c.left)
  if (card && card.width > 0) out.right = Math.max(0, c.right - card.left)
  return out
}
