import { afterEach, describe, expect, it, vi } from 'vitest';

const mQuery = vi.fn();
const mEnd = vi.fn();
vi.mock('pg', () => ({
  default: { Pool: vi.fn(() => ({ query: mQuery, end: mEnd })) },
}));

const { query, queryOne, pingDb, closePool } = await import('./pool.js');

afterEach(() => vi.clearAllMocks());

describe('pool helpers', () => {
  it('query returns the driver rows', async () => {
    mQuery.mockResolvedValueOnce({ rows: [{ a: 1 }, { a: 2 }] });
    expect(await query('SELECT 1')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('queryOne returns the single row', async () => {
    mQuery.mockResolvedValueOnce({ rows: [{ a: 1 }] });
    expect(await queryOne('SELECT 1')).toEqual({ a: 1 });
  });

  it('queryOne throws when row count is not exactly one', async () => {
    mQuery.mockResolvedValueOnce({ rows: [] });
    await expect(queryOne('SELECT 1')).rejects.toThrow(/expected exactly 1 row/);
  });

  it('pingDb is true only for a single {ok:1} row', async () => {
    mQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    expect(await pingDb()).toBe(true);
    mQuery.mockResolvedValueOnce({ rows: [{ ok: 0 }] });
    expect(await pingDb()).toBe(false);
  });

  it('closePool ends the pool', async () => {
    mEnd.mockResolvedValueOnce(undefined);
    await closePool();
    expect(mEnd).toHaveBeenCalledOnce();
  });
});
