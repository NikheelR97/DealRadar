/**
 * Game (www.game.co.za) — Tier C, best-effort (HANDOVER §4, SPRINT_PLAN S3).
 *
 * Game runs on the same Massmart/Cloudflare-fronted platform family as Makro and is
 * similarly anti-bot protected. A home-IP GET typically returns a 403/503 (mapped to
 * `blocked` by the fetcher) or a JS challenge page. Structured-data-first extraction is
 * attempted; any miss degrades to a logged `blocked` error — no crash, not promised
 * reliable.
 *
 * ⚠️ Best-effort: NOT expected to succeed from a residential IP. last-verified: NOT
 *    LIVE-VERIFIED.
 */
import { makeBestEffortScraper } from '../bestEffortScraper.js';

export const game = makeBestEffortScraper({
  domain: 'www.game.co.za',
  cssPriceSelectors: ['[data-testid="pdp-price"]', '.product-price', '[itemprop="price"]'],
  soldOutSelectors: ['.out-of-stock', '[data-testid="out-of-stock"]'],
});
