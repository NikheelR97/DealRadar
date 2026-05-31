import { afterEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const readdir = vi.fn();
const readFile = vi.fn();

vi.mock('./pool.js', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));
vi.mock('node:fs/promises', () => ({
  readdir: (...a: unknown[]) => readdir(...a),
  readFile: (...a: unknown[]) => readFile(...a),
}));

const { runMigrations } = await import('./migrate.js');

function setApplied(filenames: string[]): void {
  poolQuery.mockImplementation((text: string) => {
    if (text.includes('SELECT filename')) return Promise.resolve({ rows: filenames.map((f) => ({ filename: f })) });
    return Promise.resolve({ rows: [] });
  });
}

afterEach(() => {
  vi.clearAllMocks();
  readFile.mockReset();
});

describe('runMigrations', () => {
  it('applies only pending .sql files in order and records them', async () => {
    setApplied(['V1__a.sql']);
    readdir.mockResolvedValueOnce(['V2__b.sql', 'V1__a.sql', 'notes.md']);
    readFile.mockResolvedValue('CREATE TABLE t;');

    const applied = await runMigrations();

    expect(applied).toEqual(['V2__b.sql']);
    expect(poolQuery).toHaveBeenCalledWith('CREATE TABLE t;');
    expect(poolQuery).toHaveBeenCalledWith('INSERT INTO schema_migrations (filename) VALUES ($1)', ['V2__b.sql']);
  });

  it('returns [] when the migrations directory is absent (Docker dist)', async () => {
    setApplied([]);
    readdir.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    expect(await runMigrations()).toEqual([]);
  });

  it('rethrows non-ENOENT readdir errors', async () => {
    setApplied([]);
    readdir.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'EACCES' }));
    await expect(runMigrations()).rejects.toThrow(/boom/);
  });
});
