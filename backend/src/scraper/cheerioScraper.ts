/**
 * Factory for Tier A (SSR / Cheerio) retailer scrapers. All three Tier A stores
 * (Koodoo/Shopify, Wootware/Magento, iStore) expose a schema.org `Product` JSON-LD
 * block and OpenGraph price meta, so the extraction strategy is identical; only the
 * CSS fallback selectors and out-of-stock markers differ per platform. Each retailer
 * file supplies just that config plus its verification header, keeping selector
 * drift isolated to one small object (HANDOVER §15.1).
 *
 * Precedence (most stable → most fragile):
 *   1. explicit out-of-stock signal (JSON-LD availability OR CSS marker) → price null
 *   2. price from JSON-LD offers → meta price → CSS price node
 *   3. nothing usable → ScraperError('parse_error')
 */
import * as cheerio from 'cheerio';
import { ScraperError, type RetailerScraper, type ScrapeResult } from './types.js';
import { parsePrice, readJsonLdProduct, readMetaContent } from './extract.js';

export interface CheerioRetailerConfig {
  domain: string;
  /** On-page price nodes, ordered most → least preferred. Each documented per retailer. */
  cssPriceSelectors: readonly string[];
  /** CSS markers proving the product is sold out (presence ⇒ out of stock). */
  soldOutSelectors: readonly string[];
}

const META_PRICE_SELECTORS = [
  'meta[property="product:price:amount"]',
  'meta[property="og:price:amount"]',
] as const;

export function makeCheerioScraper(config: CheerioRetailerConfig): RetailerScraper {
  return {
    domain: config.domain,
    source: 'cheerio',
    parse(html: string, _url: string): ScrapeResult {
      const $ = cheerio.load(html);
      const jsonLd = readJsonLdProduct($);
      const name = jsonLd?.name ?? readMetaContent($, ['meta[property="og:title"]']);
      const imageUrl = jsonLd?.imageUrl ?? readMetaContent($, ['meta[property="og:image"]']);
      const currency = jsonLd?.currency ?? 'ZAR';
      const base = { name, imageUrl, currency, source: 'cheerio' as const };

      // 1) Explicit out-of-stock wins over any stale price still in the markup.
      const cssSoldOut = config.soldOutSelectors.some((sel) => $(sel).length > 0);
      if (jsonLd?.inStock === false || cssSoldOut) {
        return { ...base, price: null, inStock: false };
      }

      // 2) Price: JSON-LD → meta → CSS node.
      const price = jsonLd?.price ?? metaPrice($) ?? cssPrice($, config.cssPriceSelectors);
      if (price !== null) return { ...base, price, inStock: true };

      throw new ScraperError('parse_error', config.domain, 'no price in JSON-LD, meta, or DOM');
    },
  };
}

function metaPrice($: cheerio.CheerioAPI): number | null {
  return parsePrice(readMetaContent($, META_PRICE_SELECTORS));
}

function cssPrice($: cheerio.CheerioAPI, selectors: readonly string[]): number | null {
  for (const selector of selectors) {
    const price = parsePrice($(selector).first().text());
    if (price !== null) return price;
  }
  return null;
}
