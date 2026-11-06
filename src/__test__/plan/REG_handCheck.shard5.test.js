// REG_handCheck.test.js's browser tests, shard 5 of up to 6 (handCheck/shard.js): every test is written in
// REG_handCheck.test.js; this file only runs its share in a worker of its own. Fewer cores than 5: nothing here.
import { it } from 'vitest'
import { SHARDS } from './handCheck/shard.js'

if (4 < SHARDS) {
  globalThis.__REG_SHARD = 4
  try { await import('./REG_handCheck.test.js') } finally { delete globalThis.__REG_SHARD }
} else it.skip('REG shard 5: this machine runs ' + SHARDS + ' shard(s)', () => {})
