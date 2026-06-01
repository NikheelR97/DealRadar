/**
 * Evetech (www.evetech.co.za) — Tier B, server-rendered, Cheerio (HANDOVER §4).
 *
 * Source decision: SSR storefront, no public API → `cheerio` over the product HTML.
 * Evetech emits a schema.org `Product` JSON-LD block plus OpenGraph price meta, so the
 * shared factory reads those first; the CSS fallbacks below target Evetech's on-page
 * price/stock nodes.
 *
 * Crawl-delay: Evetech's robots.txt advertises a 10s `Crawl-delay`. Per-URL fetching
 * here does NOT pace on it — outbound pacing belongs to the scheduler's per-domain
 * delay (S4). Capped at `SCRAPE_CRAWL_DELAY_MAX_MS` (12s) when honoured. See the S2
 * Deferral Log entry #3 (now retargeted to S4).
 *
 * Robots: product URLs (`/<slug>`) are allowed; the runtime robots gate decides per URL.
 *
 * ⚠️ Selector verification (HANDOVER §4 — run against a LIVE product URL at S3 sign-off;
 *    the JSON-LD/meta path needs no CSS and is preferred):
 *    - [ ] confirm JSON-LD Product block on a live product page
 *    - [ ] confirm `.price` / `[itemprop="price"]` fallback node
 *    - [ ] confirm `.out-of-stock` / `.stock-out` OOS marker
 *    - last-verified: NOT YET LIVE-VERIFIED (structured-data-first; see PR notes)
 */
import { makeCheerioScraper } from '../cheerioScraper.js';

export const evetech = makeCheerioScraper({
  domain: 'www.evetech.co.za',
  cssPriceSelectors: ['.product-price .price', '[itemprop="price"]', '.price-value'],
  soldOutSelectors: ['.out-of-stock', '.stock-out', '.product-stock--out'],
});
