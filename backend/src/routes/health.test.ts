import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

// Health is liveness-first: it returns 200 even when the DB is unreachable,
// reporting db:false. This test runs without a Postgres instance.
describe('GET /api/health', () => {
  it('returns 200 with a status field', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.db).toBe('boolean');
  });

  it('returns 404 with a typed error for unknown routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects /api/me without a session cookie (401)', async () => {
    const res = await request(createApp()).get('/api/me/items');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });
});
