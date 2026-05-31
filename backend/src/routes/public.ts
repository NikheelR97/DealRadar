/**
 * Public (no auth) routes — anonymous, public items only (HANDOVER §7).
 * Responses never include user_id, email, or any per-user field.
 */
import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { parseParams, parseQuery } from '../middleware/validate.js';
import { historyQuery, paginationQuery, productIdParam } from '../http/schemas.js';
import { getPublicItems, getPublicItemHistory } from '../services/items.service.js';

export const publicRouter = Router();

publicRouter.get(
  '/items',
  asyncHandler(async (req, res) => {
    const { page, limit } = parseQuery(paginationQuery, req);
    const items = await getPublicItems(page, limit);
    res.json(items);
  }),
);

publicRouter.get(
  '/items/:productId/history',
  asyncHandler(async (req, res) => {
    const { productId } = parseParams(productIdParam, req);
    const { limit } = parseQuery(historyQuery, req);
    const history = await getPublicItemHistory(productId, limit);
    res.json(history);
  }),
);
