import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { signSession } from '../auth/session.js';

const app = () => createApp();

let adminCookie: string;
beforeAll(async () => {
  adminCookie = `dr_session=${await signSession(1, 'admin@example.com')}`;
});

describe('GET /api/auth/me', () => {
  it('401 without a cookie', async () => {
    expect((await request(app()).get('/api/auth/me')).status).toBe(401);
  });

  it('returns email + isAdmin for an authed admin', async () => {
    const res = await request(app()).get('/api/auth/me').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'admin@example.com', isAdmin: true });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie and returns 204', async () => {
    const res = await request(app()).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'] ?? '')).toMatch(/dr_session=;/);
  });
});
