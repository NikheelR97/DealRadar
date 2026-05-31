/**
 * Network / browser I/O adapters — the untestable edge of the scraper (excluded
 * from coverage in vitest.config, like `db/pool` and `index`). Everything that
 * touches the outside world lives here so the dispatcher and parsers stay pure and
 * fully unit-tested. Two transports:
 *   • `httpFetchHtml`  — plain HTTPS GET for SSR pages (Tier A Cheerio retailers).
 *   • `renderHtml`     — headless Chromium via puppeteer-core for CSR (Takealot).
 * `robotsFetcher` retrieves robots.txt, returning '' on any failure (→ allow all).
 */
import {
  DEFAULT_CHROMIUM_PATH,
  PUPPETEER_PRICE_WAIT_MS,
  SCRAPE_TIMEOUT_MS,
  SCRAPER_USER_AGENT,
} from '../config/constants.js';
import { env } from '../config/env.js';
import { ScraperError, type RetailerScraper, type ScrapeDeps } from './types.js';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/** Plain HTTPS GET. Maps transport failures onto retryable `ScraperError`s. */
export async function httpFetchHtml(url: string): Promise<string> {
  const retailer = hostOf(url);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      headers: { 'user-agent': SCRAPER_USER_AGENT, accept: 'text/html' },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'TimeoutError';
    throw new ScraperError(aborted ? 'timeout' : 'network_error', retailer, String(err));
  }
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    throw new ScraperError('blocked', retailer, `status ${res.status}`);
  }
  if (!res.ok) throw new ScraperError('network_error', retailer, `status ${res.status}`);
  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('text/html')) throw new ScraperError('parse_error', retailer, ctype);
  return res.text();
}

/**
 * Render a CSR page with headless Chromium and return the hydrated HTML. Uses
 * puppeteer-core against the system Chromium (`PUPPETEER_EXECUTABLE_PATH`), with
 * `--no-sandbox` for the container (HANDOVER risk register). Lazy-imported so the
 * heavy module never loads for Cheerio-only paths.
 */
export async function renderHtml(url: string): Promise<string> {
  const retailer = hostOf(url);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: env.PUPPETEER_EXECUTABLE_PATH ?? DEFAULT_CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(SCRAPER_USER_AGENT);
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: SCRAPE_TIMEOUT_MS,
    });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429 || status === 503) {
      throw new ScraperError('blocked', retailer, `status ${status}`);
    }
    await page.waitForSelector('[data-ref="buybox-actions"], .pdp', {
      timeout: PUPPETEER_PRICE_WAIT_MS,
    }).catch(() => undefined); // best-effort hydrate wait; parse still validates
    return await page.content();
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw new ScraperError('timeout', retailer, String(err));
  } finally {
    await browser.close();
  }
}

/** Retrieve robots.txt; any failure yields '' so the gate defaults to allow-all. */
export async function robotsFetcher(robotsUrl: string): Promise<string> {
  try {
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      headers: { 'user-agent': SCRAPER_USER_AGENT },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/** Production wiring of the injected `ScrapeDeps` used by the dispatcher. */
export const liveDeps: ScrapeDeps = {
  isUrlAllowed: (url) => import('./robots.js').then((m) => m.isUrlAllowed(url, robotsFetcher)),
  fetchHtml: (url, source: RetailerScraper['source']) =>
    source === 'puppeteer' ? renderHtml(url) : httpFetchHtml(url),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
