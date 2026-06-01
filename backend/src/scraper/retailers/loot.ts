/**
 * Loot (www.loot.co.za) — Tier B, Next.js, server-rendered (HANDOVER §4).
 *
 * Source decision: Loot's Next.js app server-renders the product page (the price is in
 * the initial HTML, not hydrated client-side), so a plain `cheerio` GET is enough — no
 * headless browser needed. The page carries a schema.org `Product` JSON-LD block and
 * OpenGraph price meta; the shared factory reads those first, with the on-page price
 * node as the documented CSS fallback.
 *
 * Robots: product URLs (`/product/...`) are allowed; the runtime robots gate decides
 * per URL.
 *
 * ⚠️ Selector verification (HANDOVER §4 — run against a LIVE product URL at S3 sign-off):
 *    - [ ] confirm SSR delivers price in initial HTML (not client-only hydration)
 *    - [ ] confirm JSON-LD Product block present
 *    - [ ] confirm `[data-testid="product-price"]` / `.product-price` fallback
 *    - [ ] confirm OOS marker copy ("Out of Stock" / unavailable)
 *    - last-verified: NOT YET LIVE-VERIFIED (structured-data-first; see PR notes)
 */
import { makeCheerioScraper } from '../cheerioScraper.js';

export const loot = makeCheerioScraper({
  domain: 'www.loot.co.za',
  cssPriceSelectors: ['[data-testid="product-price"]', '.product-price', '[itemprop="price"]'],
  soldOutSelectors: ['.out-of-stock', '[data-testid="out-of-stock"]', '.availability--out'],
});
