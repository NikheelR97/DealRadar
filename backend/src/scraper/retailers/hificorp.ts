/**
 * HiFi Corp (www.hificorp.co.za) — Tier C, best-effort (HANDOVER §4, SPRINT_PLAN S3).
 *
 * HiFi Corp's storefront is anti-bot protected; a home-IP GET usually yields a 403/503
 * (mapped to `blocked` by the fetcher) or a challenge page. Structured-data-first
 * extraction is attempted; any miss degrades to a logged `blocked` error — no crash,
 * not promised reliable.
 *
 * ⚠️ Best-effort: NOT expected to succeed from a residential IP. last-verified: NOT
 *    LIVE-VERIFIED.
 */
import { makeBestEffortScraper } from '../bestEffortScraper.js';

export const hificorp = makeBestEffortScraper({
  domain: 'www.hificorp.co.za',
  cssPriceSelectors: ['[data-price-type="finalPrice"] .price', '.price-box .price', '[itemprop="price"]'],
  soldOutSelectors: ['.stock.unavailable', '.out-of-stock'],
});
