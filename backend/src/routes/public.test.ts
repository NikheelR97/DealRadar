import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const items = { getPublicItems: vi.fn(), getPublicItemHistory: vi.fn() };
vi.mock('../services/items.service.js', () => items);

const { createApp } = await import('../app.js');
const app = () => createApp();
afterEach(() => vi.clearAllMocks());

describe('GET /api/public/items', () => {
  it('returns anonymous items without auth', async () => {
    items.getPublicItems.mockResolvedValueOnce([{ productId: 1, url: 'x' }]);
    const res = await request(app()).get('/api/public/items?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ productId: 1, url: 'x' }]);
    expect(items.getPublicItems).toHaveBeenCalledWith(2, 5);
    expect(JSON.stringify(res.body)).not.toContain('user_id');
  });

  it('rejects an out-of-range limit (400)', async () => {
    const res = await request(app()).get('/api/public/items?limit=9999');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/public/items/:productId/history', () => {
  it('returns history for a numeric product id', async () => {
    items.getPublicItemHistory.mockResolvedValueOnce([{ price: 5 }]);
    const res = await request(app()).get('/api/public/items/7/history?limit=10');
    expect(res.status).toBe(200);
    expect(items.getPublicItemHistory).toHaveBeenCalledWith(7, 10);
  });

  it('rejects a non-numeric product id (400)', async () => {
    const res = await request(app()).get('/api/public/items/abc/history');
    expect(res.status).toBe(400);
  });
});
