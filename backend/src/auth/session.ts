/**
 * Stateless JWT session (HANDOVER §11). HS256 signed with SESSION_SECRET, short TTL,
 * carried in an httpOnly/Secure/SameSite=Lax cookie. No server-side session store —
 * the signature is the source of truth. The OAuth login flow (S8) calls `signSession`
 * after a verified Google callback; everything else only verifies.
 */
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { JWT_TTL_SECONDS } from '../config/constants.js';

const secret = new TextEncoder().encode(env.SESSION_SECRET);
const ALG = 'HS256';

export interface SessionClaims {
  /** users.id */
  sub: string;
  email: string;
}

export async function signSession(userId: number, email: string): Promise<string> {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('invalid userId');
  if (!email) throw new Error('invalid email');
  return new SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SECONDS}s`)
    .sign(secret);
}

/** Verify a session token. Returns null on any failure (expired, tampered, malformed). */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== 'string' || typeof email !== 'string') return null;
    return { sub, email };
  } catch {
    return null;
  }
}
