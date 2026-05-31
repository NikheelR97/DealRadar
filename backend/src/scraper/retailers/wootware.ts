/**
 * Wootware (www.wootware.co.za) — Tier A, Magento 1.x, server-rendered (HANDOVER §4).
 *
 * Source decision: no public API → `cheerio` over SSR HTML. Magento emits a
 * schema.org `Product` JSON-LD block and `product:price:amount` meta; the shared
 * factory reads those first. CSS fallbacks are the Magento price-box defaults.
 *
 * Robots: Magento disallows the internal `/catalog/product/view/` route, but the
 * user-facing rewritten SEO URL (e.g. `/<product-slug>.html`) is allowed — the
 * runtime robots gate decides per actual URL (HANDOVER §4 footnote).
 *
 * ⚠️ Selector verification (HANDOVER §4 — LIVE SEO product URL at S2 sign-off):
 *    - [ ] confirm `.price-box .price` / `[data-price-type="finalPrice"]`
 *    - [ ] confirm `.stock.unavailable` OOS marker
 *    - last-verified: NOT YET LIVE-VERIFIED (structured-data-first; see PR notes)
 */
import { makeCheerioScraper } from '../cheerioScraper.js';

export const wootware = makeCheerioScraper({
  domain: 'www.wootware.co.za',
  cssPriceSelectors: [
    '[data-price-type="finalPrice"] .price',
    '.price-box .price',
    '.product-info-price .price',
  ],
  soldOutSelectors: ['.stock.unavailable', '.product-info-stock-sku .unavailable'],
});
