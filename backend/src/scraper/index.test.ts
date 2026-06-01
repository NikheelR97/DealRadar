import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scrapeProduct, getScraperForHost, REGISTRY } from './index.js';
import { ScraperError, type ScrapeDeps } from './types.js';
import { MAX_SCRAPE_RETRIES, RETAILER_ALLOWLIST } from '../config/constants.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

/** Build injectable deps; defaults to robots-allowed and a no-op delay. */
function deps(overrides: Partial<ScrapeDeps> = {}): ScrapeDeps {
  return {
    isUrlAllowed: async () => true,
    fetchHtml: async () => '<html></html>',
    delay: async () => undefined,
    ...overrides,
  };
}

const KOODOO_URL = 'https://koodoo.co.za/products/airpods-pro';

describe('getScraperForHost', () => {
  it('routes each registered domain', () => {
    expect(getScraperForHost('koodoo.co.za')?.domain).toBe('koodoo.co.za');
    expect(getScraperForHost('www.takealot.com')?.source).toBe('puppeteer');
    expect(getScraperForHost('unknown.example')).toBeUndefined();
  });

  it('every registered scraper domain is on the RETAILER_ALLOWLIST', () => {
    for (const scraper of REGISTRY) {
      expect(RETAILER_ALLOWLIST).toContain(scraper.domain);
    }
  });
});

describe('scrapeProduct', () => {
  it('extracts a price from a fetched fixture page', async () => {
    const fetchHtml = vi.fn(async () => fixture('koodoo-instock.html'));
    const result = await scrapeProduct(KOODOO_URL, deps({ fetchHtml }));
    expect(result.price).toBe(4299);
    expect(result.inStock).toBe(true);
    expect(result.source).toBe('cheerio');
    expect(fetchHtml).toHaveBeenCalledOnce();
  });

  it('throws ScraperError(unknown) for an unregistered host', async () => {
    await expect(scrapeProduct('https://shop.unregistered.example/dp/X', deps())).rejects.toMatchObject({
      type: 'unknown',
    });
  });

  it('throws ScraperError(robots_disallowed) when robots blocks the path', async () => {
    const fetchHtml = vi.fn();
    await expect(
      scrapeProduct(KOODOO_URL, deps({ isUrlAllowed: async () => false, fetchHtml })),
    ).rejects.toMatchObject({ type: 'robots_disallowed' });
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it('does NOT retry a parse_error (non-retryable)', async () => {
    const fetchHtml = vi.fn(async () => '<html><body>no price here</body></html>');
    await expect(scrapeProduct(KOODOO_URL, deps({ fetchHtml }))).rejects.toMatchObject({
      type: 'parse_error',
    });
    expect(fetchHtml).toHaveBeenCalledOnce();
  });

  it('bounds retries by MAX_SCRAPE_RETRIES on a retryable (blocked) error', async () => {
    const fetchHtml = vi.fn(async () => {
      throw new ScraperError('blocked', 'koodoo.co.za', 'status 403');
    });
    const delay = vi.fn(async () => undefined);
    await expect(scrapeProduct(KOODOO_URL, deps({ fetchHtml, delay }))).rejects.toMatchObject({
      type: 'blocked',
    });
    expect(fetchHtml).toHaveBeenCalledTimes(MAX_SCRAPE_RETRIES);
    expect(delay).toHaveBeenCalledTimes(MAX_SCRAPE_RETRIES - 1); // no delay after the last attempt
  });

  it('wraps an unexpected raw error as ScraperError(unknown) and does NOT retry it', async () => {
    const fetchHtml = vi.fn(async () => {
      throw new Error('socket hang up'); // raw throw = unexpected bug, not transient
    });
    await expect(scrapeProduct(KOODOO_URL, deps({ fetchHtml }))).rejects.toMatchObject({
      type: 'unknown',
    });
    expect(fetchHtml).toHaveBeenCalledOnce();
  });

  it('degrades a Tier C challenge page to ScraperError(blocked) through the registry', async () => {
    // A registered Tier C retailer (Makro) served a 200 anti-bot shell must NOT crash or
    // be mislabelled parse_error — it degrades to a logged `blocked` (S3 gate).
    const challenge =
      '<html><head><title>Just a moment...</title></head>' +
      '<body><div id="cf-browser-verification">Checking your browser</div></body></html>';
    const fetchHtml = vi.fn(async () => challenge);
    await expect(
      scrapeProduct('https://www.makro.co.za/p/12345', deps({ fetchHtml, delay: async () => undefined })),
    ).rejects.toMatchObject({ type: 'blocked' });
  });

  it('succeeds on a later attempt after a transient failure', async () => {
    let n = 0;
    const fetchHtml = vi.fn(async () => {
      n++;
      if (n === 1) throw new ScraperError('timeout', 'koodoo.co.za', 'slow');
      return fixture('koodoo-instock.html');
    });
    const result = await scrapeProduct(KOODOO_URL, deps({ fetchHtml }));
    expect(result.price).toBe(4299);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });
});
