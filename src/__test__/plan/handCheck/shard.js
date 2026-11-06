// The hand check in parallel: REG_handCheck.test.js's browser tests are dealt round-robin over SHARDS test files
// (REG_handCheck.test.js itself is shard 0; REG_handCheck.shardN.test.js import it as shard N-1), so Vitest runs them
// in that many workers at once — one per CPU core, at most 6. Each shard launches one Chromium and reuses its page.
import os from 'node:os'

export const MAX_SHARDS = 6
export const SHARDS = Math.max(1, Math.min(MAX_SHARDS, os.cpus().length))

/** This file's shard: what the importing shard file set (it clears it right after), else 0 — the main file run alone. */
export function shardOf() {
  const n = globalThis.__REG_SHARD
  return Number.isInteger(n) ? n : 0
}

/** A dealer for one file: owns() is true for every SHARDS-th test registered, starting at this file's shard. */
export function dealer(shard = shardOf()) {
  let k = 0
  return { shard, owns: () => (k++ % SHARDS) === shard }
}
