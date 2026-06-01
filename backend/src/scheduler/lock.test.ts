import { afterEach, describe, expect, it, vi } from 'vitest';

const connect = vi.fn();
vi.mock('../db/pool.js', () => ({ pool: { connect: (...a: unknown[]) => connect(...a) } }));

const { withSchedulerLock } = await import('./lock.js');
const { SCHEDULER_ADVISORY_LOCK_KEY } = await import('../config/constants.js');

afterEach(() => vi.clearAllMocks());

/** A fake checked-out client whose first query resolves the given lock result. */
function fakeClient(locked: boolean) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ locked }] }) // pg_try_advisory_lock
    .mockResolvedValue({ rows: [] }); // pg_advisory_unlock
  const release = vi.fn();
  connect.mockResolvedValueOnce({ query, release });
  return { query, release };
}

describe('withSchedulerLock', () => {
  it('runs fn and reports the result when the lock is acquired', async () => {
    const { query, release } = fakeClient(true);
    const fn = vi.fn().mockResolvedValue('done');

    const outcome = await withSchedulerLock(fn);

    expect(outcome).toEqual({ skipped: false, result: 'done' });
    expect(fn).toHaveBeenCalledOnce();
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT pg_try_advisory_lock($1) AS locked', [
      SCHEDULER_ADVISORY_LOCK_KEY,
    ]);
    expect(query).toHaveBeenNthCalledWith(2, 'SELECT pg_advisory_unlock($1)', [
      SCHEDULER_ADVISORY_LOCK_KEY,
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('skips fn and releases the client when the lock is held elsewhere', async () => {
    const { query, release } = fakeClient(false);
    const fn = vi.fn();

    const outcome = await withSchedulerLock(fn);

    expect(outcome).toEqual({ skipped: true });
    expect(fn).not.toHaveBeenCalled();
    // Only the try-lock query ran; no unlock when the lock was never held.
    expect(query).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases the lock and the client even when fn throws', async () => {
    const { query, release } = fakeClient(true);
    const boom = new Error('tick blew up');

    await expect(withSchedulerLock(() => Promise.reject(boom))).rejects.toThrow('tick blew up');

    expect(query).toHaveBeenNthCalledWith(2, 'SELECT pg_advisory_unlock($1)', [
      SCHEDULER_ADVISORY_LOCK_KEY,
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('treats a missing lock row as not acquired (fail closed)', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    connect.mockResolvedValueOnce({ query, release });

    const outcome = await withSchedulerLock(vi.fn());

    expect(outcome).toEqual({ skipped: true });
    expect(release).toHaveBeenCalledOnce();
  });
});
