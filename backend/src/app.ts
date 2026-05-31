/**
 * Express app assembly (HANDOVER §11). Security headers (Helmet, strict CSP),
 * global rate limiting, cookie parsing, JSON body cap, then routers, then the
 * 404 + central error handler. Exported separately from `index.ts` so Supertest
 * can mount it without binding a port.
 */
import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { HTTP_BODY_LIMIT } from './config/constants.js';
import { attachUser } from './middleware/auth.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { meRouter } from './routes/me.js';
import { settingsRouter } from './routes/settings.js';

export function createApp(): Express {
  const app = express();

  // Behind Cloudflare Tunnel + nginx — trust the proxy chain for correct client IPs.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(express.json({ limit: HTTP_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(globalLimiter);
  app.use(attachUser);

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/me', meRouter);
  app.use('/api/settings', settingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
