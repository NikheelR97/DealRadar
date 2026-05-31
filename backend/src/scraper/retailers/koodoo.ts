/**
 * Koodoo (koodoo.co.za) — Tier A, Shopify storefront, server-rendered (HANDOVER §4).
 *
 * Source decision: no public product API on the Shopify theme → `cheerio` over SSR
 * HTML. Shopify reliably emits a schema.org `Product` JSON-LD block and OpenGraph
 * price meta, so the shared factory reads those first; the CSS selectors below are
 * the Shopify-default fallbacks (`.money`, `[data-product-price]`).
 *
 * Robots: `/products/...` allowed (Shopify default robots.txt).
 *
 * ⚠️ Selector verification (HANDOVER §4 — run against a LIVE /products/ URL at S2
 *    sign-off; the JSON-LD/meta path needs no CSS and is preferred):
 *    - [ ] confirm JSON-LD Product block on a live product page
 *    - [ ] confirm `.price--sold-out` / `.product-form__sold-out` OOS markers
 *    - last-verified: NOT YET LIVE-VERIFIED (structured-data-first; see PR notes)
 */
import { makeCheerioScraper } from '../cheerioScraper.js';

export const koodoo = makeCheerioScraper({
  domain: 'koodoo.co.za',
  cssPriceSelectors: ['[data-product-price]', '.price__current .money', '.price .money'],
  soldOutSelectors: ['.price--sold-out', '.product-form__sold-out'],
});
