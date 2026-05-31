/**
 * Auth routes (HANDOVER §7). The Google OAuth2/OIDC + PKCE login flow lands in S8;
 * `/me` and `/logout` only read/clear the session cookie and work now.
 */
import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { requireLogin } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { AUTH_COOKIE_NAME } from '../config/constants.js';
import { isProduction } from '../config/env.js';
import { unauthorized } from '../http/errors.js';

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.get(
  '/me',
  requireLogin,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json({ email: req.user.email, isAdmin: req.user.isAdmin });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });
    res.status(204).end();
  }),
);
