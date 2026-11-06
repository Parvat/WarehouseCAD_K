// REG_handCheck.test.js's browser tests, shard 6 of up to 6 (handCheck/shard.js): every test is written in
// REG_handCheck.test.js; this file only runs its share in a worker of its own. Fewer cores than 6: nothing here.
import { it } from 'vitest'
import { SHARDS } from './handCheck/shard.js'

if (5 < SHARDS) {
  globalThis.__REG_SHARD = 5
  try { await import('./REG_handCheck.test.js') } finally { delete globalThis.__REG_SHARD }
} else it.skip('REG shard 6: this machine runs ' + SHARDS + ' shard(s)', () => {})
