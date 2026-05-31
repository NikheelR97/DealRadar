/**
 * Zod request schemas — the typed boundary for all inputs (HANDOVER §7).
 * Bounds come from named constants (Law 8); caps defend against unbounded work (Law 3).
 */
import { z } from 'zod';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_HISTORY_RECORDS,
  MAX_PAGE_LIMIT,
  MAX_POLL_INTERVAL_HOURS,
  MAX_URL_LENGTH,
  MIN_POLL_INTERVAL_HOURS,
} from '../config/constants.js';

const positiveIntFromQuery = z.coerce.number().int().positive();

export const paginationQuery = z.object({
  page: positiveIntFromQuery.default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY_RECORDS).default(MAX_HISTORY_RECORDS),
});
export type HistoryQuery = z.infer<typeof historyQuery>;

export const idParam = z.object({ id: positiveIntFromQuery });
export const productIdParam = z.object({ productId: positiveIntFromQuery });

export const visibilityEnum = z.enum(['public', 'private']);

export const addItemBody = z.object({
  url: z.string().min(1).max(MAX_URL_LENGTH),
  visibility: visibilityEnum.default('private'),
});
export type AddItemBody = z.infer<typeof addItemBody>;

export const visibilityBody = z.object({ visibility: visibilityEnum });
export type VisibilityBody = z.infer<typeof visibilityBody>;

export const settingsBody = z.object({
  pollIntervalHours: z.coerce
    .number()
    .int()
    .min(MIN_POLL_INTERVAL_HOURS)
    .max(MAX_POLL_INTERVAL_HOURS),
});
export type SettingsBody = z.infer<typeof settingsBody>;
