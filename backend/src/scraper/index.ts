/**
 * Scraper dispatcher (HANDOVER §4, §15.1). Routes a URL to its retailer scraper by
 * hostname, enforces the robots.txt gate, fetches HTML via the source-appropriate
 * transport, and bounds retries by `MAX_SCRAPE_RETRIES` (Law 2). All I/O is injected
 * via `ScrapeDeps` so this module is fully unit-testable without a network or browser.
 * An unknown host can never reach here in production (URL validation rejects it first),
 * but we still fail closed with a typed error.
 */
import { MAX_SCRAPE_RETRIES } from '../config/constants.js';
import { jitterMs } from './jitter.js';
import { liveDeps } from './fetchers.js';
import { ScraperError, type RetailerScraper, type ScrapeDeps, type ScrapeResult } from './types.js';
import { koodoo } from './retailers/koodoo.js';
import { wootware } from './retailers/wootware.js';
import { istore } from './retailers/istore.js';
import { takealot } from './retailers/takealot.js';
import { evetech } from './retailers/evetech.js';
import { loot } from './retailers/loot.js';
import { makro } from './retailers/makro.js';
import { game } from './retailers/game-stores.js';
import { incredibleConnection } from './retailers/incredible-connection.js';
import { hificorp } from './retailers/hificorp.js';
import { amazon } from './retailers/amazon.js';

/**
 * Single registration site — add a retailer here and to RETAILER_ALLOWLIST (HANDOVER §15.1).
 *   • Tier A (reliable, Cheerio): koodoo, wootware, istore
 *   • Tier B (reliable, Cheerio):  evetech, loot   • CSR (Puppeteer): takealot
 *   • Tier C (best-effort, degrade to `blocked`): makro, game, incredibleConnection,
 *     hificorp, amazon
 */
const REGISTRY: readonly RetailerScraper[] = [
  koodoo,
  wootware,
  istore,
  takealot,
  evetech,
  loot,
  makro,
  game,
  incredibleConnection,
  hificorp,
  amazon,
];

const BY_DOMAIN: ReadonlyMap<string, RetailerScraper> = new Map(
  REGISTRY.map((scraper) => [scraper.domain, scraper]),
);

export function getScraperForHost(host: string): RetailerScraper | undefined {
  return BY_DOMAIN.get(host.toLowerCase());
}

/**
 * Scrape one product URL. Throws `ScraperError` with a typed `error_type` the caller
 * persists to `scrape_errors`; never throws an untyped/raw error to the worker.
 */
export async function scrapeProduct(url: string, deps: ScrapeDeps = liveDeps): Promise<ScrapeResult> {
  const host = hostnameOf(url);
  const scraper = getScraperForHost(host);
  if (!scraper) throw new ScraperError('unknown', host, 'no scraper registered for host');

  const allowed = await deps.isUrlAllowed(url);
  if (!allowed) throw new ScraperError('robots_disallowed', scraper.domain, 'path disallowed by robots.txt');

  let lastError: ScraperError = new ScraperError('unknown', scraper.domain, 'no attempt made');
  for (let attempt = 1; attempt <= MAX_SCRAPE_RETRIES; attempt++) {
    try {
      const html = await deps.fetchHtml(url, scraper.source);
      return scraper.parse(html, url);
    } catch (err) {
      lastError = asScraperError(err, scraper.domain);
      if (!lastError.retryable) throw lastError; // parse_error / robots_disallowed: don't retry
      if (attempt < MAX_SCRAPE_RETRIES) await deps.delay(jitterMs());
    }
  }
  throw lastError;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function asScraperError(err: unknown, retailer: string): ScraperError {
  if (err instanceof ScraperError) return err;
  // A raw (non-ScraperError) throw is unexpected — parse()/fetchHtml only ever throw
  // ScraperError. Classify it 'unknown' (non-retryable) so a real bug surfaces fast
  // instead of being retried MAX times and mislabeled as a transient network error.
  return new ScraperError('unknown', retailer, err instanceof Error ? err.message : String(err));
}

export { REGISTRY };
