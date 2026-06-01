/**
 * Makro (www.makro.co.za) — Tier C, best-effort (HANDOVER §4, SPRINT_PLAN S3).
 *
 * Makro sits behind Cloudflare. From a home IP a plain GET usually returns a 403/503
 * (mapped to `blocked` by the fetcher) or a "Just a moment..." challenge page. This
 * scraper attempts the same structured-data-first extraction as Tier A, but any miss
 * degrades to a logged `blocked` error — never a crash, never promised reliable. If a
 * request does get through, the documented selectors below extract the price.
 *
 * ⚠️ Best-effort: NOT expected to succeed from a residential IP without proxy/stealth
 *    infrastructure (out of scope for the MVP). last-verified: NOT LIVE-VERIFIED.
 */
import { makeBestEffortScraper } from '../bestEffortScraper.js';

export const makro = makeBestEffortScraper({
  domain: 'www.makro.co.za',
  cssPriceSelectors: ['[data-testid="pdp-price"]', '.product-price', '[itemprop="price"]'],
  soldOutSelectors: ['.out-of-stock', '[data-testid="out-of-stock"]'],
});
