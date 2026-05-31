import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const verifySession = vi.fn();
vi.mock('../auth/session.js', () => ({ verifySession: (...a: unknown[]) => verifySession(...a) }));

const { attachUser, requireLogin, requireAdmin } = await import('./auth.js');

const res = {} as Response;
function req(cookies: Record<string, string> = {}, user?: Request['user']): Request {
  return { cookies, user } as Request;
}

afterEach(() => vi.clearAllMocks());

describe('attachUser', () => {
  it('passes through with no cookie', async () => {
    const r = req();
    const next = vi.fn() as unknown as NextFunction;
    await attachUser(r, res, next);
    expect(r.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('ignores an invalid session token', async () => {
    verifySession.mockResolvedValueOnce(null);
    const r = req({ dr_session: 'bad' });
    await attachUser(r, res, vi.fn() as unknown as NextFunction);
    expect(r.user).toBeUndefined();
  });

  it('attaches an admin user for an allowlisted email', async () => {
    verifySession.mockResolvedValueOnce({ sub: '5', email: 'admin@example.com' });
    const r = req({ dr_session: 'ok' });
    await attachUser(r, res, vi.fn() as unknown as NextFunction);
    expect(r.user).toEqual({ id: 5, email: 'admin@example.com', isAdmin: true });
  });

  it('attaches a non-admin user for a non-allowlisted email', async () => {
    verifySession.mockResolvedValueOnce({ sub: '6', email: 'user@example.com' });
    const r = req({ dr_session: 'ok' });
    await attachUser(r, res, vi.fn() as unknown as NextFunction);
    expect(r.user?.isAdmin).toBe(false);
  });

  it('rejects a non-numeric subject claim', async () => {
    verifySession.mockResolvedValueOnce({ sub: 'abc', email: 'user@example.com' });
    const r = req({ dr_session: 'ok' });
    await attachUser(r, res, vi.fn() as unknown as NextFunction);
    expect(r.user).toBeUndefined();
  });
});

describe('requireLogin / requireAdmin', () => {
  const next = vi.fn() as unknown as NextFunction;

  it('requireLogin passes an authed user and blocks anon', () => {
    requireLogin(req({}, { id: 1, email: 'u@e.com', isAdmin: false }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(() => requireLogin(req(), res, next)).toThrow(/authentication/);
  });

  it('requireAdmin blocks anon, blocks non-admin, allows admin', () => {
    expect(() => requireAdmin(req(), res, next)).toThrow(/authentication/);
    expect(() => requireAdmin(req({}, { id: 1, email: 'u@e.com', isAdmin: false }), res, next)).toThrow(/admin only/);
    const adminNext = vi.fn() as unknown as NextFunction;
    requireAdmin(req({}, { id: 1, email: 'admin@example.com', isAdmin: true }), res, adminNext);
    expect(adminNext).toHaveBeenCalledOnce();
  });
});
