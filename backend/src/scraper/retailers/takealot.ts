/**
 * Takealot (www.takealot.com) — Tier B, client-side rendered (HANDOVER §4).
 *
 * Source decision: the PDP is a React app — price is NOT in the initial HTML, so a
 * plain GET returns an empty shell. We render with headless Chromium (`puppeteer`
 * source) and parse the hydrated DOM here. Takealot's SSR shell still ships a
 * schema.org `Product` JSON-LD block in many cases, so we read that first and fall
 * back to the buybox price node (`[data-ref="buybox-actions"] .currency`).
 *
 * Robots: `/<slug>/PLID...` product pages are allowed (HANDOVER §4).
 *
 * ⚠️ Selector verification (HANDOVER §4 — LIVE rendered PDP at S2/S3 sign-off):
 *    - [ ] confirm buybox price node `data-ref`/`.currency` class
 *    - [ ] confirm out-of-stock copy ("currently out of stock"/"Notify Me")
 *    - last-verified: NOT YET LIVE-VERIFIED (structured-data-first; see PR notes)
 */
import * as cheerio from 'cheerio';
import { ScraperError, type RetailerScraper, type ScrapeResult } from '../types.js';
import { parsePrice, readJsonLdProduct, readMetaContent } from '../extract.js';

const DOMAIN = 'www.takealot.com';

/** Buybox price node, ordered most → least preferred (data-ref is the stablest). */
const PRICE_SELECTORS = [
  '[data-ref="buybox-actions"] .currency',
  '.buybox-actions .currency.plus',
  '.pdp-module_price_ .currency',
] as const;

const OOS_SELECTORS = ['[data-ref="stock-availability-status"] .out-of-stock', '.add-to-cart-button.disabled'] as const;

export const takealot: RetailerScraper = {
  domain: DOMAIN,
  source: 'puppeteer',
  parse(html: string, _url: string): ScrapeResult {
    const $ = cheerio.load(html);
    const jsonLd = readJsonLdProduct($);
    const name = jsonLd?.name ?? readMetaContent($, ['meta[property="og:title"]']);
    const imageUrl = jsonLd?.imageUrl ?? readMetaContent($, ['meta[property="og:image"]']);
    const base = { name, imageUrl, currency: jsonLd?.currency ?? 'ZAR', source: 'puppeteer' as const };

    const oosByText = /currently out of stock|notify me when/i.test($('body').text());
    const oosByCss = OOS_SELECTORS.some((sel) => $(sel).length > 0);
    if (jsonLd?.inStock === false || oosByCss || oosByText) {
      return { ...base, price: null, inStock: false };
    }

    const price = jsonLd?.price ?? buyboxPrice($);
    if (price !== null) return { ...base, price, inStock: true };
    throw new ScraperError('parse_error', DOMAIN, 'no price in rendered JSON-LD or buybox');
  },
};

function buyboxPrice($: cheerio.CheerioAPI): number | null {
  for (const selector of PRICE_SELECTORS) {
    const price = parsePrice($(selector).first().text());
    if (price !== null) return price;
  }
  return null;
}
