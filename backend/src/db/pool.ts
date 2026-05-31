/**
 * Postgres connection pool (HANDOVER §2). Single shared `Pool`; every query is
 * parameterised (Law: no string interpolation). `query` checks the driver result
 * (Law 7) and returns typed rows.
 */
import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/** Run a parameterised query and return rows typed as T. */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows;
}

/** Run a parameterised query expecting exactly one row; throws otherwise. */
export async function queryOne<T extends pg.QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T> {
  const rows = await query<T>(text, params);
  if (rows.length !== 1) throw new Error(`expected exactly 1 row, got ${rows.length}`);
  const [row] = rows;
  if (row === undefined) throw new Error('row unexpectedly undefined');
  return row;
}

/** Liveness probe for the health endpoint. */
export async function pingDb(): Promise<boolean> {
  const rows = await query<{ ok: number }>('SELECT 1 AS ok');
  return rows.length === 1 && rows[0]?.ok === 1;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
