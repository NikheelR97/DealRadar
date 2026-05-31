/**
 * Shared domain types. These are the typed boundary of the API (HANDOVER §7).
 * Public-facing shapes deliberately omit user identity.
 */

export type Visibility = 'public' | 'private';
export type ScrapeSource = 'api' | 'cheerio' | 'puppeteer';
export type ScrapeErrorType =
  | 'blocked'
  | 'parse_error'
  | 'timeout'
  | 'robots_disallowed'
  | 'network_error'
  | 'unknown';

/** A single price observation, returned to both public and owner history endpoints. */
export interface PriceRecord {
  price: number | null;
  inStock: boolean;
  scrapeSource: ScrapeSource;
  checkedAt: string; // ISO 8601
}

/** Anonymous public listing — NEVER carries user_id, email, or per-user fields. */
export interface PublicItem {
  productId: number;
  url: string;
  retailerDomain: string;
  name: string | null;
  imageUrl: string | null;
  currency: string;
  latestPrice: number | null;
  inStock: boolean;
  lastCheckedAt: string | null;
}

/** A caller's own tracked item — includes their visibility setting. */
export interface TrackedItem extends PublicItem {
  trackedItemId: number;
  visibility: Visibility;
  addedAt: string;
}

export interface AuthedUser {
  id: number;
  email: string;
  isAdmin: boolean;
}
