import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const queryOne = vi.fn();
vi.mock('../db/pool.js', () => ({ query: (...a: unknown[]) => query(...a), queryOne: (...a: unknown[]) => queryOne(...a) }));

const { getSettings, updateSettings } = await import('./settings.service.js');

afterEach(() => {
  vi.clearAllMocks();
});

describe('settings.service', () => {
  it('reads the pinned settings row', async () => {
    queryOne.mockResolvedValueOnce({ poll_interval_hours: 4 });
    expect(await getSettings()).toEqual({ pollIntervalHours: 4 });
  });

  it('updates and returns the new interval', async () => {
    query.mockResolvedValueOnce([{ poll_interval_hours: 8 }]);
    expect(await updateSettings(8)).toEqual({ pollIntervalHours: 8 });
  });

  it('throws if the settings row is missing on update', async () => {
    query.mockResolvedValueOnce([]);
    await expect(updateSettings(8)).rejects.toThrow(/settings row missing/);
  });
});
