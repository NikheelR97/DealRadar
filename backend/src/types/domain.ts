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

/**
 * Deal tier (HANDOVER §5). Ordered worst→best for the in-stock tiers;
 * OUT_OF_STOCK is orthogonal (the current observation has no price).
 */
export type DealTier = 'NOT_A_DEAL' | 'MODEST' | 'GOOD' | 'EXCEPTIONAL' | 'OUT_OF_STOCK';

/**
 * Result of scoring a product's price history against its recent baseline.
 * The scorer is pure and emits semantic fields only — badge glyphs are a UI
 * concern (the frontend DealBadge maps tier → badge).
 */
export interface DealScore {
  tier: DealTier;
  /** Most recent observed price; null when the latest observation is out of stock. */
  currentPrice: number | null;
  /** Median of valid in-stock prices in the 90-day window; null when undeterminable. */
  baseline: number | null;
  /** (baseline - currentPrice) / baseline * 100, rounded to 2dp; null when no baseline. */
  discountPct: number | null;
  /** True only when the date is on/after 1 Nov AND the discount ≥ alert threshold. */
  blackFridayAlert: boolean;
  /** Human-readable explanation when a tier needs context (e.g. insufficient history). */
  note?: string;
}
