import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRobots,
  isPathAllowedByRules,
  isUrlAllowed,
  getCrawlDelayMs,
  clearRobotsCache,
} from './robots.js';
import { SCRAPE_CRAWL_DELAY_MAX_MS } from '../config/constants.js';

describe('parseRobots', () => {
  it('collects Disallow paths for the * group only', () => {
    const rules = parseRobots(
      [
        'User-agent: Googlebot',
        'Disallow: /secret-google',
        '',
        'User-agent: *',
        'Disallow: /catalog/product/view/',
        'Allow: /catalog/category/',
        'Crawl-delay: 10',
      ].join('\n'),
    );
    expect(rules.disallow).toEqual(['/catalog/product/view/']);
    expect(rules.allow).toEqual(['/catalog/category/']);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobots('# comment\nUser-agent: *\nDisallow: /admin # trailing');
    expect(rules.disallow).toEqual(['/admin']);
  });

  it('treats an empty Disallow as allow-all (no rule recorded)', () => {
    const rules = parseRobots('User-agent: *\nDisallow:');
    expect(rules.disallow).toEqual([]);
  });

  it('parses Crawl-delay (seconds) into capped milliseconds for the * group', () => {
    const rules = parseRobots('User-agent: *\nCrawl-delay: 10');
    expect(rules.crawlDelayMs).toBe(10_000);
  });

  it('caps an excessive Crawl-delay at SCRAPE_CRAWL_DELAY_MAX_MS', () => {
    const rules = parseRobots('User-agent: *\nCrawl-delay: 600');
    expect(rules.crawlDelayMs).toBe(SCRAPE_CRAWL_DELAY_MAX_MS);
  });

  it('ignores a non-numeric or non-positive Crawl-delay (0 = no delay)', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: soon').crawlDelayMs).toBe(0);
    expect(parseRobots('User-agent: *\nCrawl-delay: 0').crawlDelayMs).toBe(0);
    expect(parseRobots('User-agent: *\nDisallow: /x').crawlDelayMs).toBe(0);
  });

  it('does not record Crawl-delay from a non-matching UA group', () => {
    const rules = parseRobots('User-agent: Googlebot\nCrawl-delay: 10');
    expect(rules.crawlDelayMs).toBe(0);
  });
});

describe('getCrawlDelayMs', () => {
  beforeEach(() => clearRobotsCache());

  it('returns the capped advertised delay, served from the shared cache', async () => {
    let calls = 0;
    const fetcher = async (): Promise<string> => {
      calls++;
      return 'User-agent: *\nCrawl-delay: 10';
    };
    expect(await getCrawlDelayMs('https://eve.example/p1', fetcher)).toBe(10_000);
    // Second lookup on the same host is served from cache (no extra fetch).
    expect(await getCrawlDelayMs('https://eve.example/p2', fetcher)).toBe(10_000);
    expect(calls).toBe(1);
  });

  it('returns 0 when robots.txt advertises no Crawl-delay', async () => {
    const fetcher = async (): Promise<string> => 'User-agent: *\nDisallow: /x';
    expect(await getCrawlDelayMs('https://shop.example/p', fetcher)).toBe(0);
  });

  it('returns 0 for a malformed URL', async () => {
    const fetcher = async (): Promise<string> => 'User-agent: *\nCrawl-delay: 10';
    expect(await getCrawlDelayMs('not a url', fetcher)).toBe(0);
  });
});

describe('isPathAllowedByRules', () => {
  it('allows paths not under any Disallow prefix', () => {
    const rules = { disallow: ['/catalog/product/view/'], allow: [] };
    expect(isPathAllowedByRules('/apple-airpods-pro.html', rules)).toBe(true);
  });

  it('disallows paths under a Disallow prefix', () => {
    const rules = { disallow: ['/catalog/product/view/'], allow: [] };
    expect(isPathAllowedByRules('/catalog/product/view/id/42', rules)).toBe(false);
  });

  it('honours a more-specific Allow over a Disallow (longest match wins)', () => {
    const rules = { disallow: ['/products/'], allow: ['/products/public/'] };
    expect(isPathAllowedByRules('/products/public/widget', rules)).toBe(true);
    expect(isPathAllowedByRules('/products/private/widget', rules)).toBe(false);
  });
});

describe('isUrlAllowed (with cache)', () => {
  beforeEach(() => clearRobotsCache());

  it('fetches robots.txt once per host within the TTL', async () => {
    let calls = 0;
    const fetcher = async (): Promise<string> => {
      calls++;
      return 'User-agent: *\nDisallow: /internal/';
    };
    const allowed = await isUrlAllowed('https://shop.example/widget', fetcher);
    const allowedAgain = await isUrlAllowed('https://shop.example/another', fetcher);
    expect(allowed).toBe(true);
    expect(allowedAgain).toBe(true);
    expect(calls).toBe(1); // second call served from cache
  });

  it('disallows a path blocked by robots.txt', async () => {
    const fetcher = async (): Promise<string> => 'User-agent: *\nDisallow: /internal/';
    expect(await isUrlAllowed('https://shop.example/internal/x', fetcher)).toBe(false);
  });

  it('allows everything when robots.txt is empty/unreachable', async () => {
    const fetcher = async (): Promise<string> => '';
    expect(await isUrlAllowed('https://shop.example/anything', fetcher)).toBe(true);
  });

  it('treats a malformed URL as disallowed (fail closed)', async () => {
    const fetcher = async (): Promise<string> => '';
    expect(await isUrlAllowed('not a url', fetcher)).toBe(false);
  });
});
