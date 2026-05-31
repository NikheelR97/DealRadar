import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const items = {
  getMyItems: vi.fn(),
  addTrackedItem: vi.fn(),
  setVisibility: vi.fn(),
  deleteTrackedItem: vi.fn(),
  getMyItemHistory: vi.fn(),
};
vi.mock('../services/items.service.js', () => items);

const { createApp } = await import('../app.js');
const { signSession } = await import('../auth/session.js');
const { notFound } = await import('../http/errors.js');

let cookie: string;
beforeAll(async () => {
  cookie = `dr_session=${await signSession(1, 'user@example.com')}`;
});
afterEach(() => vi.clearAllMocks());

const app = () => createApp();

describe('/api/me/items auth', () => {
  it('401 without a session cookie', async () => {
    const res = await request(app()).get('/api/me/items');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me/items', () => {
  it('returns the caller’s items', async () => {
    items.getMyItems.mockResolvedValueOnce([{ trackedItemId: 1 }]);
    const res = await request(app()).get('/api/me/items').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ trackedItemId: 1 }]);
    expect(items.getMyItems).toHaveBeenCalledWith(1, 1, 20);
  });
});

describe('POST /api/me/items', () => {
  it('accepts a valid allowlisted URL (202)', async () => {
    items.addTrackedItem.mockResolvedValueOnce({ trackedItemId: 9, created: true });
    const res = await request(app())
      .post('/api/me/items')
      .set('Cookie', cookie)
      .send({ url: 'https://koodoo.co.za/p' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ trackedItemId: 9, status: 'accepted' });
    expect(items.addTrackedItem).toHaveBeenCalledWith(1, expect.objectContaining({ retailerDomain: 'koodoo.co.za' }), 'private');
  });

  it('rejects a non-allowlisted URL (400) without calling the service', async () => {
    const res = await request(app())
      .post('/api/me/items')
      .set('Cookie', cookie)
      .send({ url: 'https://evil.example.com/p' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not supported/);
    expect(items.addTrackedItem).not.toHaveBeenCalled();
  });

  it('rejects a missing url body (400 validation)', async () => {
    const res = await request(app()).post('/api/me/items').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('PATCH /api/me/items/:id', () => {
  it('sets visibility', async () => {
    items.setVisibility.mockResolvedValueOnce(undefined);
    const res = await request(app()).patch('/api/me/items/3').set('Cookie', cookie).send({ visibility: 'public' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects an invalid visibility value (400)', async () => {
    const res = await request(app()).patch('/api/me/items/3').set('Cookie', cookie).send({ visibility: 'secret' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/me/items/:id', () => {
  it('returns 204 on success', async () => {
    items.deleteTrackedItem.mockResolvedValueOnce(undefined);
    const res = await request(app()).delete('/api/me/items/3').set('Cookie', cookie);
    expect(res.status).toBe(204);
  });

  it('maps a not-owned item to 404 (not 403)', async () => {
    items.deleteTrackedItem.mockRejectedValueOnce(notFound('tracked item not found'));
    const res = await request(app()).delete('/api/me/items/999').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('GET /api/me/items/:id/history', () => {
  it('returns history for an owned item', async () => {
    items.getMyItemHistory.mockResolvedValueOnce([{ price: 1 }]);
    const res = await request(app()).get('/api/me/items/3/history').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ price: 1 }]);
  });
});
