/**
 * iStore (www.istore.co.za) — Tier A, server-rendered CMS (HANDOVER §4).
 *
 * Source decision: no public API → `cheerio` over SSR HTML. The product template
 * exposes a schema.org `Product` JSON-LD block and OpenGraph price meta; the shared
 * factory reads those first, with the on-page price node as fallback.
 *
 * Robots: an internal path is disallowed, but the rewritten SEO product URL is
 * typically allowed — the runtime robots gate decides per actual URL (HANDOVER §4).
 *
 * ⚠️ Selector verification (HANDOVER §4 — LIVE product URL at S2 sign-off):
 *    - [ ] confirm JSON-LD Product block present
 *    - [ ] confirm `.product-price`/`.price` fallback and OOS marker
 *    - last-verified: NOT YET LIVE-VERIFIED (structured-data-first; see PR notes)
 */
import { makeCheerioScraper } from '../cheerioScraper.js';

export const istore = makeCheerioScraper({
  domain: 'www.istore.co.za',
  cssPriceSelectors: ['.product-price .price', '.product-info .price', '[itemprop="price"]'],
  soldOutSelectors: ['.out-of-stock', '.sold-out', '.stock-status--out'],
});
