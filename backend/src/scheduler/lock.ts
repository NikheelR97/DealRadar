/**
 * Cross-instance run guard for the poll tick (HANDOVER §6 — no Redis). Uses a
 * Postgres session-level advisory lock: `pg_try_advisory_lock` is non-blocking, so a
 * tick that cannot get the lock (another instance is mid-tick) is skipped rather than
 * queued. The lock is held on a dedicated checked-out client and released in `finally`;
 * if the process crashes mid-tick, Postgres frees the session lock automatically, so
 * there is no stale-lock row to clean up.
 */
import { SCHEDULER_ADVISORY_LOCK_KEY } from '../config/constants.js';
import { pool } from '../db/pool.js';

export interface LockOutcome<T> {
  /** True when another holder owns the lock and `fn` was not run. */
  skipped: boolean;
  result?: T;
}

/**
 * Run `fn` while holding the scheduler advisory lock. Returns `{ skipped: true }`
 * without running `fn` when the lock is already held elsewhere. The lock and the
 * checked-out client are always released, even if `fn` throws.
 */
export async function withSchedulerLock<T>(fn: () => Promise<T>): Promise<LockOutcome<T>> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [SCHEDULER_ADVISORY_LOCK_KEY],
    );
    if (res.rows[0]?.locked !== true) return { skipped: true };
    try {
      const result = await fn();
      return { skipped: false, result };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
