/**
 * GET /api/health — process liveness.
 * GET /api/ready — readiness; returns 503 when Postgres is unavailable.
 */
import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { pingDb } from '../db/pool.js';

export const healthRouter = Router();

async function dbReady(): Promise<boolean> {
  try {
    return await pingDb();
  } catch {
    return false;
  }
}

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const db = await dbReady();
    res.json({ status: 'ok', db });
  }),
);

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const db = await dbReady();
    const status = db ? 'ready' : 'not_ready';
    res.status(db ? 200 : 503).json({ status, db });
  }),
);
