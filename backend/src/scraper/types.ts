/**
 * Scraper layer contracts (HANDOVER §4, §15.1). Each retailer is isolated to a
 * single file exporting one `RetailerScraper`. The `parse(html, url)` step is a
 * PURE function — no network, no browser — so it is exhaustively unit-tested
 * against captured fixtures. All network/Chromium I/O lives behind the injected
 * `ScrapeDeps`, keeping the dispatcher testable without hitting a real page.
 */
import type { ScrapeErrorType, ScrapeSource } from '../types/domain.js';

/** Result of parsing a product page. `price === null` means out of stock. */
export interface ScrapeResult {
  price: number | null;
  inStock: boolean;
  name: string | null;
  imageUrl: string | null;
  currency: string;
  source: ScrapeSource;
}

/**
 * Typed scraper failure. The dispatcher maps `type` straight onto the
 * `scrape_errors.error_type` enum; `detail` is sanitised (never a stack trace).
 * `retryable` decides whether the bounded retry loop attempts again.
 */
export class ScraperError extends Error {
  readonly type: ScrapeErrorType;
  readonly retailer: string;
  readonly detail: string;

  constructor(type: ScrapeErrorType, retailer: string, detail: string) {
    super(`[${retailer}] ${type}: ${detail}`);
    this.name = 'ScraperError';
    this.type = type;
    this.retailer = retailer;
    this.detail = detail.slice(0, 500);
  }

  /** Transient transport failures are retried; parse/robots failures are not. */
  get retryable(): boolean {
    return this.type === 'blocked' || this.type === 'timeout' || this.type === 'network_error';
  }
}

/**
 * One retailer's price extractor. `domain` is the exact hostname (matches
 * `RETAILER_ALLOWLIST`); `source` selects the fetcher (`cheerio` = plain HTTP,
 * `puppeteer` = headless render). `parse` turns fetched HTML into a `ScrapeResult`
 * or throws `ScraperError('parse_error')`.
 */
export interface RetailerScraper {
  readonly domain: string;
  readonly source: Extract<ScrapeSource, 'cheerio' | 'puppeteer'>;
  parse(html: string, url: string): ScrapeResult;
}

/** Injected I/O boundary — real adapters in `fetchers.ts`, fakes in tests. */
export interface ScrapeDeps {
  /** Resolves false when robots.txt disallows the URL's path. */
  isUrlAllowed(url: string): Promise<boolean>;
  /** Fetches page HTML for the given source; throws `ScraperError` on transport failure. */
  fetchHtml(url: string, source: RetailerScraper['source']): Promise<string>;
  /** Awaitable delay between bounded retries (injectable so tests don't really wait). */
  delay(ms: number): Promise<void>;
}
