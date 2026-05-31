/**
 * Authentication / authorisation middleware (HANDOVER §11).
 *
 * - `attachUser`   — best-effort: verifies the cookie and populates req.user if valid.
 * - `requireLogin` — 401 unless a valid session cookie is present.
 * - `requireAdmin` — 403 unless the logged-in email is on the ADMIN_EMAILS allowlist.
 *
 * Admin status is derived from the allowlist at request time, never stored.
 */
import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME } from '../config/constants.js';
import { isAdminEmail } from '../config/env.js';
import { forbidden, unauthorized } from '../http/errors.js';
import { verifySession } from '../auth/session.js';

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE_NAME];
  if (!token) return next();
  const claims = await verifySession(token);
  if (!claims) return next();
  const id = Number(claims.sub);
  if (!Number.isInteger(id) || id <= 0) return next();
  req.user = { id, email: claims.email, isAdmin: isAdminEmail(claims.email) };
  return next();
}

export function requireLogin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  if (!req.user.isAdmin) throw forbidden('admin only');
  next();
}
