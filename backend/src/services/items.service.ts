/**
 * Tracked-items data access (HANDOVER §6, §7). Every query is parameterised and
 * every /me/* query is filtered by the caller's user_id server-side. Public queries
 * select only products with ≥1 public tracker and never select user identity.
 */
import { query, queryOne } from '../db/pool.js';
import { MAX_PAGE_LIMIT, MAX_TRACKED_PRODUCTS } from '../config/constants.js';
import { AppError, notFound } from '../http/errors.js';
import type { PriceRecord, PublicItem, TrackedItem, Visibility } from '../types/domain.js';
import type { ValidatedUrl } from '../validation/url.js';

interface ItemRow {
  product_id: string;
  url: string;
  retailer_domain: string;
  name: string | null;
  image_url: string | null;
  currency: string;
  latest_price: string | null;
  in_stock: boolean | null;
  last_checked_at: Date | null;
}

interface TrackedRow extends ItemRow {
  tracked_item_id: string;
  visibility: Visibility;
  added_at: Date;
}

interface HistoryRow {
  price: string | null;
  in_stock: boolean;
  scrape_source: PriceRecord['scrapeSource'];
  checked_at: Date;
}

const toNum = (v: string | null): number | null => (v === null ? null : Number(v));
const clampLimit = (n: number): number => Math.min(Math.max(1, n), MAX_PAGE_LIMIT);

function mapPublic(r: ItemRow): PublicItem {
  return {
    productId: Number(r.product_id),
    url: r.url,
    retailerDomain: r.retailer_domain,
    name: r.name,
    imageUrl: r.image_url,
    currency: r.currency,
    latestPrice: toNum(r.latest_price),
    inStock: r.in_stock ?? false,
    lastCheckedAt: r.last_checked_at ? r.last_checked_at.toISOString() : null,
  };
}

function mapTracked(r: TrackedRow): TrackedItem {
  return {
    ...mapPublic(r),
    trackedItemId: Number(r.tracked_item_id),
    visibility: r.visibility,
    addedAt: r.added_at.toISOString(),
  };
}

function mapHistory(r: HistoryRow): PriceRecord {
  return {
    price: toNum(r.price),
    inStock: r.in_stock,
    scrapeSource: r.scrape_source,
    checkedAt: r.checked_at.toISOString(),
  };
}

const LATEST_PRICE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT ph.price, ph.in_stock
    FROM price_history ph
    WHERE ph.product_id = p.id
    ORDER BY ph.checked_at DESC
    LIMIT 1
  ) lp ON TRUE`;

// ── Public (anonymous) ───────────────────────────────────────────────────────
export async function getPublicItems(page: number, limit: number): Promise<PublicItem[]> {
  const safeLimit = clampLimit(limit);
  const offset = Math.max(0, page - 1) * safeLimit;
  const rows = await query<ItemRow>(
    `SELECT p.id AS product_id, p.url, p.retailer_domain, p.name, p.image_url, p.currency,
            lp.price AS latest_price, lp.in_stock, p.last_checked_at
     FROM products p
     JOIN LATERAL (
       SELECT 1 FROM tracked_items ti
       WHERE ti.product_id = p.id AND ti.visibility = 'public' LIMIT 1
     ) pub ON TRUE
     ${LATEST_PRICE_LATERAL}
     ORDER BY p.last_checked_at DESC NULLS LAST, p.id DESC
     LIMIT $1 OFFSET $2`,
    [safeLimit, offset],
  );
  return rows.map(mapPublic);
}

export async function getPublicItemHistory(
  productId: number,
  limit: number,
): Promise<PriceRecord[]> {
  const rows = await query<HistoryRow>(
    `SELECT ph.price, ph.in_stock, ph.scrape_source, ph.checked_at
     FROM price_history ph
     WHERE ph.product_id = $1
       AND EXISTS (
         SELECT 1 FROM tracked_items ti
         WHERE ti.product_id = $1 AND ti.visibility = 'public'
       )
     ORDER BY ph.checked_at DESC
     LIMIT $2`,
    [productId, clampLimit(limit)],
  );
  return rows.map(mapHistory);
}

// ── Per-user (owner-scoped) ──────────────────────────────────────────────────
export async function getMyItems(
  userId: number,
  page: number,
  limit: number,
): Promise<TrackedItem[]> {
  const safeLimit = clampLimit(limit);
  const offset = Math.max(0, page - 1) * safeLimit;
  const rows = await query<TrackedRow>(
    `SELECT ti.id AS tracked_item_id, ti.visibility, ti.added_at,
            p.id AS product_id, p.url, p.retailer_domain, p.name, p.image_url, p.currency,
            lp.price AS latest_price, lp.in_stock, p.last_checked_at
     FROM tracked_items ti
     JOIN products p ON p.id = ti.product_id
     ${LATEST_PRICE_LATERAL}
     WHERE ti.user_id = $1
     ORDER BY ti.added_at DESC, ti.id DESC
     LIMIT $2 OFFSET $3`,
    [userId, safeLimit, offset],
  );
  return rows.map(mapTracked);
}

/** Add a tracker. Reuses the canonical product if it exists; enforces the per-user cap. */
export async function addTrackedItem(
  userId: number,
  validated: ValidatedUrl,
  visibility: Visibility,
): Promise<{ trackedItemId: number; created: boolean }> {
  const countRow = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM tracked_items WHERE user_id = $1',
    [userId],
  );
  if (Number(countRow.n) >= MAX_TRACKED_PRODUCTS) {
    throw new AppError('conflict', `tracked-item limit (${MAX_TRACKED_PRODUCTS}) reached`);
  }

  const product = await queryOne<{ id: string }>(
    `INSERT INTO products (url, retailer_domain) VALUES ($1, $2)
     ON CONFLICT (url) DO UPDATE SET is_active = TRUE
     RETURNING id`,
    [validated.url, validated.retailerDomain],
  );
  const productId = Number(product.id);

  const inserted = await query<{ id: string }>(
    `INSERT INTO tracked_items (user_id, product_id, visibility) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING id`,
    [userId, productId, visibility],
  );
  if (inserted.length === 1 && inserted[0]) {
    return { trackedItemId: Number(inserted[0].id), created: true };
  }

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM tracked_items WHERE user_id = $1 AND product_id = $2',
    [userId, productId],
  );
  return { trackedItemId: Number(existing.id), created: false };
}

export async function setVisibility(
  userId: number,
  trackedItemId: number,
  visibility: Visibility,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `UPDATE tracked_items SET visibility = $3
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [trackedItemId, userId, visibility],
  );
  if (rows.length !== 1) throw notFound('tracked item not found');
}

/** Untrack. When the last tracker for a product is removed, the product is deactivated. */
export async function deleteTrackedItem(userId: number, trackedItemId: number): Promise<void> {
  const deleted = await query<{ product_id: string }>(
    `DELETE FROM tracked_items WHERE id = $1 AND user_id = $2 RETURNING product_id`,
    [trackedItemId, userId],
  );
  if (deleted.length !== 1 || !deleted[0]) throw notFound('tracked item not found');
  const productId = Number(deleted[0].product_id);

  const remaining = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM tracked_items WHERE product_id = $1',
    [productId],
  );
  if (Number(remaining.n) === 0) {
    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [productId]);
  }
}

export async function getMyItemHistory(
  userId: number,
  trackedItemId: number,
  limit: number,
): Promise<PriceRecord[]> {
  const owned = await query<{ product_id: string }>(
    'SELECT product_id FROM tracked_items WHERE id = $1 AND user_id = $2',
    [trackedItemId, userId],
  );
  if (owned.length !== 1 || !owned[0]) throw notFound('tracked item not found');

  const rows = await query<HistoryRow>(
    `SELECT ph.price, ph.in_stock, ph.scrape_source, ph.checked_at
     FROM price_history ph
     WHERE ph.product_id = $1
     ORDER BY ph.checked_at DESC
     LIMIT $2`,
    [Number(owned[0].product_id), clampLimit(limit)],
  );
  return rows.map(mapHistory);
}
