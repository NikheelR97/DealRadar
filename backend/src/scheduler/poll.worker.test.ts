import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PollDeps } from './poll.worker.js';
import type { ScrapeResult } from '../scraper/types.js';

const query = vi.fn();
vi.mock('../db/pool.js', () => ({ query: (...a: unknown[]) => query(...a) }));

const { runPollTick } = await import('./poll.worker.js');
const { ScraperError } = await import('../scraper/types.js');
const { MAX_PRODUCTS_PER_POLL_BATCH } = await import('../config/constants.js');

afterEach(() => vi.clearAllMocks());

const inStockResult: ScrapeResult = {
  price: 199.99,
  inStock: true,
  name: 'Widget',
  imageUrl: 'https://cdn.example/w.jpg',
  currency: 'ZAR',
  source: 'cheerio',
};

function makeDeps(over: Partial<PollDeps> = {}): PollDeps {
  return {
    scrape: vi.fn().mockResolvedValue(inStockResult),
    crawlDelayMs: vi.fn().mockResolvedValue(0),
    delay: vi.fn().mockResolvedValue(undefined),
    jitterMs: vi.fn().mockReturnValue(100),
    ...over,
  };
}

/** Queue the due-products result; every later query (inserts/updates) resolves []. */
function dueRows(rows: Array<{ id: string; url: string; retailer_domain: string }>): void {
  query.mockResolvedValueOnce(rows).mockResolvedValue([]);
}

/** All query() SQL texts whose body includes `needle`. */
const callsMatching = (needle: string): unknown[][] =>
  query.mock.calls.filter((c) => typeof c[0] === 'string' && (c[0] as string).includes(needle));

describe('runPollTick — selection', () => {
  it('selects due products bounded by MAX_PRODUCTS_PER_POLL_BATCH', async () => {
    dueRows([]);
    const summary = await runPollTick(makeDeps());

    expect(summary).toEqual({ selected: 0, succeeded: 0, failed: 0 });
    const [selectCall] = query.mock.calls;
    expect(selectCall?.[0]).toContain('FROM products');
    expect(selectCall?.[0]).toContain('make_interval(hours => poll_interval_hours)');
    expect(selectCall?.[1]).toEqual([MAX_PRODUCTS_PER_POLL_BATCH]);
  });
});

describe('runPollTick — success path', () => {
  it('appends a price_history row and advances last_checked_at', async () => {
    dueRows([{ id: '7', url: 'https://koodoo.co.za/p', retailer_domain: 'koodoo.co.za' }]);
    const deps = makeDeps();

    const summary = await runPollTick(deps);

    expect(summary).toEqual({ selected: 1, succeeded: 1, failed: 0 });
    expect(deps.scrape).toHaveBeenCalledWith('https://koodoo.co.za/p');

    // One atomic statement: price INSERT + last_checked_at/name/image/currency UPDATE.
    const [write] = callsMatching('INSERT INTO price_history');
    expect(write?.[0]).toContain('UPDATE products');
    expect(write?.[0]).toContain('last_checked_at = now()');
    expect(write?.[1]).toEqual(['7', 199.99, true, 'cheerio', 'Widget', 'https://cdn.example/w.jpg', 'ZAR']);

    expect(callsMatching('INSERT INTO scrape_errors')).toHaveLength(0);
  });

  it('records a null price for an out-of-stock result without erroring', async () => {
    dueRows([{ id: '9', url: 'https://koodoo.co.za/oos', retailer_domain: 'koodoo.co.za' }]);
    const oos: ScrapeResult = { ...inStockResult, price: null, inStock: false };

    const summary = await runPollTick(makeDeps({ scrape: vi.fn().mockResolvedValue(oos) }));

    expect(summary.succeeded).toBe(1);
    const [write] = callsMatching('INSERT INTO price_history');
    expect(write?.[1]).toEqual(['9', null, false, 'cheerio', 'Widget', 'https://cdn.example/w.jpg', 'ZAR']);
  });
});

describe('runPollTick — error path', () => {
  it('logs a ScraperError to scrape_errors and still advances last_checked_at', async () => {
    dueRows([{ id: '3', url: 'https://www.makro.co.za/p', retailer_domain: 'www.makro.co.za' }]);
    const err = new ScraperError('blocked', 'www.makro.co.za', 'status 403');

    const summary = await runPollTick(makeDeps({ scrape: vi.fn().mockRejectedValue(err) }));

    expect(summary).toEqual({ selected: 1, succeeded: 0, failed: 1 });
    const [se] = callsMatching('INSERT INTO scrape_errors');
    expect(se?.[1]).toEqual(['3', 'blocked', 'status 403']);
    // last_checked_at advanced so a blocked product backs off to its interval.
    expect(callsMatching('UPDATE products')).toHaveLength(1);
    expect(callsMatching('INSERT INTO price_history')).toHaveLength(0);
  });

  it('classifies a non-ScraperError throw as unknown (does not crash the tick)', async () => {
    dueRows([{ id: '4', url: 'https://www.makro.co.za/p', retailer_domain: 'www.makro.co.za' }]);

    const summary = await runPollTick(
      makeDeps({ scrape: vi.fn().mockRejectedValue(new Error('boom')) }),
    );

    expect(summary.failed).toBe(1);
    const [se] = callsMatching('INSERT INTO scrape_errors');
    expect(se?.[1]).toEqual(['4', 'unknown', 'boom']);
  });

  it('continues to later products after one fails', async () => {
    dueRows([
      { id: '1', url: 'https://koodoo.co.za/a', retailer_domain: 'koodoo.co.za' },
      { id: '2', url: 'https://www.wootware.co.za/b', retailer_domain: 'www.wootware.co.za' },
    ]);
    const scrape = vi
      .fn()
      .mockRejectedValueOnce(new ScraperError('timeout', 'koodoo.co.za', 'slow'))
      .mockResolvedValueOnce(inStockResult);

    const summary = await runPollTick(makeDeps({ scrape }));

    expect(summary).toEqual({ selected: 2, succeeded: 1, failed: 1 });
  });
});

describe('runPollTick — per-domain pacing', () => {
  it('paces repeated hits on one domain by max(jitter, crawl-delay)', async () => {
    dueRows([
      { id: '1', url: 'https://www.evetech.co.za/a', retailer_domain: 'www.evetech.co.za' },
      { id: '2', url: 'https://www.evetech.co.za/b', retailer_domain: 'www.evetech.co.za' },
    ]);
    const deps = makeDeps({
      jitterMs: vi.fn().mockReturnValue(2_000),
      crawlDelayMs: vi.fn().mockResolvedValue(10_000),
    });

    await runPollTick(deps);

    // First hit on the domain: no delay. Second: delay = max(2000, 10000).
    expect(deps.delay).toHaveBeenCalledTimes(1);
    expect(deps.delay).toHaveBeenCalledWith(10_000);
  });

  it('uses the jitter floor when no crawl-delay is advertised', async () => {
    dueRows([
      { id: '1', url: 'https://koodoo.co.za/a', retailer_domain: 'koodoo.co.za' },
      { id: '2', url: 'https://koodoo.co.za/b', retailer_domain: 'koodoo.co.za' },
    ]);
    const deps = makeDeps({
      jitterMs: vi.fn().mockReturnValue(1_500),
      crawlDelayMs: vi.fn().mockResolvedValue(0),
    });

    await runPollTick(deps);

    expect(deps.delay).toHaveBeenCalledTimes(1);
    expect(deps.delay).toHaveBeenCalledWith(1_500);
  });

  it('does not pace across distinct domains', async () => {
    dueRows([
      { id: '1', url: 'https://koodoo.co.za/a', retailer_domain: 'koodoo.co.za' },
      { id: '2', url: 'https://www.wootware.co.za/b', retailer_domain: 'www.wootware.co.za' },
    ]);
    const deps = makeDeps();

    await runPollTick(deps);

    expect(deps.delay).not.toHaveBeenCalled();
  });
});
