/**
 * Rate limiters (HANDOVER §7, §11). Global limiter on all routes; stricter limiters
 * on auth and scrape-triggering endpoints. Limits are named constants (Law 8).
 */
import rateLimit from 'express-rate-limit';
import {
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_GLOBAL_WINDOW_MS,
  RATE_LIMIT_SCRAPE_MAX,
  RATE_LIMIT_SCRAPE_WINDOW_MS,
} from '../config/constants.js';

const rateLimitedBody = { error: { code: 'rate_limited', message: 'too many requests' } };

export const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_GLOBAL_WINDOW_MS,
  max: RATE_LIMIT_GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedBody,
});

export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
  max: RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedBody,
});

export const scrapeLimiter = rateLimit({
  windowMs: RATE_LIMIT_SCRAPE_WINDOW_MS,
  max: RATE_LIMIT_SCRAPE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedBody,
});
