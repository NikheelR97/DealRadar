/**
 * Per-user routes — scoped to the caller's own tracked_items (HANDOVER §7).
 * requireLogin guards the whole router; every service call passes req.user.id.
 * Acting on an item the caller does not own returns 404 (not 403) to avoid leaking existence.
 */
import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { requireLogin } from '../middleware/auth.js';
import { scrapeLimiter } from '../middleware/rateLimit.js';
import { parseParams, parseQuery, validateBody } from '../middleware/validate.js';
import {
  addItemBody,
  historyQuery,
  idParam,
  paginationQuery,
  visibilityBody,
} from '../http/schemas.js';
import { badRequest, unauthorized } from '../http/errors.js';
import { validateProductUrl } from '../validation/url.js';
import {
  addTrackedItem,
  deleteTrackedItem,
  getMyItemHistory,
  getMyItems,
  setVisibility,
} from '../services/items.service.js';
import type { Request } from 'express';

export const meRouter = Router();
meRouter.use(requireLogin);

function userId(req: Request): number {
  if (!req.user) throw unauthorized();
  return req.user.id;
}

const URL_REJECTION_MESSAGE: Record<string, string> = {
  too_long: 'url exceeds maximum length',
  not_https: 'url must use https',
  malformed: 'url is malformed',
  host_not_allowed: 'retailer not supported',
};

meRouter.get(
  '/items',
  asyncHandler(async (req, res) => {
    const { page, limit } = parseQuery(paginationQuery, req);
    res.json(await getMyItems(userId(req), page, limit));
  }),
);

meRouter.post(
  '/items',
  scrapeLimiter,
  validateBody(addItemBody),
  asyncHandler(async (req, res) => {
    const { url, visibility } = req.body as { url: string; visibility: 'public' | 'private' };
    const validation = validateProductUrl(url);
    if (!validation.ok) throw badRequest(URL_REJECTION_MESSAGE[validation.reason] ?? 'invalid url');

    const { trackedItemId } = await addTrackedItem(userId(req), validation.value, visibility);
    res.status(202).json({ trackedItemId, status: 'accepted' });
  }),
);

meRouter.patch(
  '/items/:id',
  validateBody(visibilityBody),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(idParam, req);
    const { visibility } = req.body as { visibility: 'public' | 'private' };
    await setVisibility(userId(req), id, visibility);
    res.json({ ok: true });
  }),
);

meRouter.delete(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(idParam, req);
    await deleteTrackedItem(userId(req), id);
    res.status(204).end();
  }),
);

meRouter.get(
  '/items/:id/history',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(idParam, req);
    const { limit } = parseQuery(historyQuery, req);
    res.json(await getMyItemHistory(userId(req), id, limit));
  }),
);
