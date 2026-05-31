import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const settings = { getSettings: vi.fn(), updateSettings: vi.fn() };
vi.mock('../services/settings.service.js', () => settings);

const { createApp } = await import('../app.js');
const { signSession } = await import('../auth/session.js');

let adminCookie: string;
let userCookie: string;
beforeAll(async () => {
  adminCookie = `dr_session=${await signSession(1, 'admin@example.com')}`;
  userCookie = `dr_session=${await signSession(2, 'user@example.com')}`;
});
afterEach(() => vi.clearAllMocks());
const app = () => createApp();

describe('/api/settings authorisation', () => {
  it('401 without a cookie', async () => {
    expect((await request(app()).get('/api/settings')).status).toBe(401);
  });

  it('403 for a logged-in non-admin', async () => {
    const res = await request(app()).get('/api/settings').set('Cookie', userCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });
});

describe('/api/settings admin access', () => {
  it('GET returns current settings', async () => {
    settings.getSettings.mockResolvedValueOnce({ pollIntervalHours: 4 });
    const res = await request(app()).get('/api/settings').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pollIntervalHours: 4 });
  });

  it('PUT updates with a valid interval', async () => {
    settings.updateSettings.mockResolvedValueOnce({ pollIntervalHours: 6 });
    const res = await request(app()).put('/api/settings').set('Cookie', adminCookie).send({ pollIntervalHours: 6 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(settings.updateSettings).toHaveBeenCalledWith(6);
  });

  it('PUT rejects an out-of-range interval (400)', async () => {
    const res = await request(app()).put('/api/settings').set('Cookie', adminCookie).send({ pollIntervalHours: 99 });
    expect(res.status).toBe(400);
    expect(settings.updateSettings).not.toHaveBeenCalled();
  });
});
