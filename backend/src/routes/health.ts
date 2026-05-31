/**
 * GET /api/health — liveness + DB connectivity (HANDOVER §7).
 * Always 200 for liveness; `db` reflects whether the pool can reach Postgres.
 */
import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { pingDb } from '../db/pool.js';

export const healthRouter = Router();

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let db = false;
    try {
      db = await pingDb();
    } catch {
      db = false;
    }
    res.json({ status: 'ok', db });
  }),
);
