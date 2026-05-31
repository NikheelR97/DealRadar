/**
 * Programmatic migration runner for dev/test (Docker production applies the same
 * SQL via /docker-entrypoint-initdb.d). Applies any V*.sql not yet recorded in
 * schema_migrations, in filename order, each in its own transaction-bounded file.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const MAX_MIGRATIONS = 1000; // Law 2 — bounded loop.

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const res = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map((r) => r.filename));
}

async function listMigrationFiles(): Promise<string[]> {
  try {
    return await readdir(MIGRATIONS_DIR);
  } catch (err) {
    // In the Docker image the .sql files are not emitted into dist/ — Postgres
    // applies them via /docker-entrypoint-initdb.d. Absent dir → nothing to do.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function runMigrations(): Promise<string[]> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();
  const entries = await listMigrationFiles();
  const pending = entries
    .filter((f) => f.endsWith('.sql') && !applied.has(f))
    .sort()
    .slice(0, MAX_MIGRATIONS);

  const run: string[] = [];
  for (const filename of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    run.push(filename);
  }
  return run;
}
