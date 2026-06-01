/**
 * Incredible Connection (www.incredible.co.za) — Tier C, best-effort (HANDOVER §4,
 * SPRINT_PLAN S3).
 *
 * Incredible Connection's storefront is anti-bot protected; a home-IP GET usually
 * yields a 403/503 (mapped to `blocked` by the fetcher) or a challenge page. The
 * structured-data-first extraction is attempted, but any miss degrades to a logged
 * `blocked` error — no crash, not promised reliable.
 *
 * ⚠️ Best-effort: NOT expected to succeed from a residential IP. last-verified: NOT
 *    LIVE-VERIFIED.
 */
import { makeBestEffortScraper } from '../bestEffortScraper.js';

export const incredibleConnection = makeBestEffortScraper({
  domain: 'www.incredible.co.za',
  cssPriceSelectors: ['[data-testid="pdp-price"]', '.price', '[itemprop="price"]'],
  soldOutSelectors: ['.out-of-stock', '.stock-status--out'],
});
