import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from './session.js';

describe('session JWT', () => {
  it('round-trips a signed session', async () => {
    const token = await signSession(42, 'user@example.com');
    const claims = await verifySession(token);
    expect(claims).toEqual({ sub: '42', email: 'user@example.com' });
  });

  it('rejects an empty token', async () => {
    expect(await verifySession('')).toBeNull();
  });

  it('rejects a malformed/tampered token', async () => {
    expect(await verifySession('not.a.jwt')).toBeNull();
    const token = await signSession(1, 'a@b.com');
    expect(await verifySession(`${token}tamper`)).toBeNull();
  });

  it('throws on an invalid userId', async () => {
    await expect(signSession(0, 'a@b.com')).rejects.toThrow();
    await expect(signSession(-3, 'a@b.com')).rejects.toThrow();
  });

  it('throws on an empty email', async () => {
    await expect(signSession(1, '')).rejects.toThrow();
  });
});
