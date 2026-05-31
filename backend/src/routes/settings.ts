/**
 * Admin routes — global config only (HANDOVER §7). requireAdmin gates both verbs.
 */
import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { settingsBody } from '../http/schemas.js';
import { getSettings, updateSettings } from '../services/settings.service.js';

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

settingsRouter.put(
  '/',
  validateBody(settingsBody),
  asyncHandler(async (req, res) => {
    const { pollIntervalHours } = req.body as { pollIntervalHours: number };
    await updateSettings(pollIntervalHours);
    res.json({ ok: true });
  }),
);
