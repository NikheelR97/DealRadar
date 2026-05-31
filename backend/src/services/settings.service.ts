/**
 * Global settings (admin-managed, HANDOVER §7). Single pinned row (id = 1).
 */
import { query, queryOne } from '../db/pool.js';

export interface AppSettings {
  pollIntervalHours: number;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await queryOne<{ poll_interval_hours: number }>(
    'SELECT poll_interval_hours FROM settings WHERE id = 1',
  );
  return { pollIntervalHours: row.poll_interval_hours };
}

export async function updateSettings(pollIntervalHours: number): Promise<AppSettings> {
  const rows = await query<{ poll_interval_hours: number }>(
    `UPDATE settings SET poll_interval_hours = $1, updated_at = now()
     WHERE id = 1 RETURNING poll_interval_hours`,
    [pollIntervalHours],
  );
  if (rows.length !== 1 || !rows[0]) throw new Error('settings row missing');
  return { pollIntervalHours: rows[0].poll_interval_hours };
}
