/**
 * Per-retailer parse tests against captured fixtures (HANDOVER §4 gate: prices
 * extracted from fixtures; out-of-stock → price null without throwing; a missing
 * price selector → ScraperError('parse_error')). Tier A retailers share the Cheerio
 * factory, so one table-driven suite covers Koodoo/Wootware/iStore; Takealot (CSR)
 * is tested separately for its buybox path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ScraperError, type RetailerScraper } from '../types.js';
import { koodoo } from './koodoo.js';
import { wootware } from './wootware.js';
import { istore } from './istore.js';
import { takealot } from './takealot.js';
import { evetech } from './evetech.js';
import { loot } from './loot.js';
import { makro } from './makro.js';
import { game } from './game-stores.js';
import { incredibleConnection } from './incredible-connection.js';
import { hificorp } from './hificorp.js';
import { amazon } from './amazon.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');

const URL_FOR = 'https://example.test/product';

describe.each([
  { name: 'koodoo', scraper: koodoo, inStockFile: 'koodoo-instock.html', expected: 4299, oosFile: 'koodoo-oos.html' },
  { name: 'wootware', scraper: wootware, inStockFile: 'wootware-instock.html', expected: 13499, oosFile: 'wootware-oos.html' },
  { name: 'istore', scraper: istore, inStockFile: 'istore-instock.html', expected: 27999, oosFile: 'istore-instock.html' },
])('Tier A — $name', ({ scraper, inStockFile, expected, oosFile, name }) => {
  it('extracts the price from a known fixture page', () => {
    const result = scraper.parse(fixture(inStockFile), URL_FOR);
    expect(result.price).toBe(expected);
    expect(result.inStock).toBe(true);
    expect(result.currency).toBe('ZAR');
    expect(result.source).toBe('cheerio');
  });

  it('captures the product name from the fixture', () => {
    expect(scraper.parse(fixture(inStockFile), URL_FOR).name).toBeTruthy();
  });

  // koodoo/wootware have a real OOS fixture; istore reuses its in-stock file (skip OOS assert).
  if (name !== 'istore') {
    it('returns price:null on out-of-stock without throwing', () => {
      const result = scraper.parse(fixture(oosFile), URL_FOR);
      expect(result.price).toBeNull();
      expect(result.inStock).toBe(false);
    });
  }

  it('throws ScraperError(parse_error) when no price selector matches', () => {
    const empty = '<html><head><title>x</title></head><body><p>No price.</p></body></html>';
    expect(() => scraper.parse(empty, URL_FOR)).toThrow(ScraperError);
    try {
      scraper.parse(empty, URL_FOR);
    } catch (err) {
      expect((err as ScraperError).type).toBe('parse_error');
    }
  });
});

describe.each([
  { name: 'evetech', scraper: evetech, inStockFile: 'evetech-instock.html', expected: 18999, oosFile: 'evetech-oos.html' },
  { name: 'loot', scraper: loot, inStockFile: 'loot-instock.html', expected: 349, oosFile: 'loot-oos.html' },
])('Tier B — $name (SSR / Cheerio)', ({ scraper, inStockFile, expected, oosFile }) => {
  it('extracts the price from a known fixture page', () => {
    const result = scraper.parse(fixture(inStockFile), URL_FOR);
    expect(result.price).toBe(expected);
    expect(result.inStock).toBe(true);
    expect(result.currency).toBe('ZAR');
    expect(result.source).toBe('cheerio');
  });

  it('captures the product name from the fixture', () => {
    expect(scraper.parse(fixture(inStockFile), URL_FOR).name).toBeTruthy();
  });

  it('returns price:null on out-of-stock without throwing', () => {
    const result = scraper.parse(fixture(oosFile), URL_FOR);
    expect(result.price).toBeNull();
    expect(result.inStock).toBe(false);
  });

  it('throws ScraperError(parse_error) when no price selector matches', () => {
    const empty = '<html><head><title>x</title></head><body><p>No price.</p></body></html>';
    try {
      scraper.parse(empty, URL_FOR);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScraperError);
      expect((err as ScraperError).type).toBe('parse_error');
    }
  });
});

describe('Tier C — best-effort scrapers degrade to blocked, never crash', () => {
  const tierC: { name: string; scraper: RetailerScraper; domain: string }[] = [
    { name: 'makro', scraper: makro, domain: 'www.makro.co.za' },
    { name: 'game', scraper: game, domain: 'www.game.co.za' },
    { name: 'incredible', scraper: incredibleConnection, domain: 'www.incredible.co.za' },
    { name: 'hificorp', scraper: hificorp, domain: 'www.hificorp.co.za' },
    { name: 'amazon', scraper: amazon, domain: 'www.amazon.co.za' },
  ];

  it('every Tier C scraper is a plain-HTTP (cheerio) source on its expected domain', () => {
    for (const { scraper, domain } of tierC) {
      expect(scraper.source).toBe('cheerio');
      expect(scraper.domain).toBe(domain);
    }
  });

  it.each(tierC)('$name throws ScraperError(blocked) on a page with no product markup', ({ scraper }) => {
    const stripped = '<html><head><title>x</title></head><body><div id="app"></div></body></html>';
    try {
      scraper.parse(stripped, URL_FOR);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScraperError);
      expect((err as ScraperError).type).toBe('blocked');
    }
  });

  it('detects a Cloudflare "Just a moment..." challenge as blocked (makro fixture)', () => {
    try {
      makro.parse(fixture('makro-blocked.html'), URL_FOR);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ScraperError).type).toBe('blocked');
      expect((err as ScraperError).detail).toContain('challenge');
    }
  });

  it('detects an Amazon "Robot Check" CAPTCHA page as blocked (amazon fixture)', () => {
    expect(() => amazon.parse(fixture('amazon-robotcheck.html'), URL_FOR)).toThrow(ScraperError);
    try {
      amazon.parse(fixture('amazon-robotcheck.html'), URL_FOR);
    } catch (err) {
      expect((err as ScraperError).type).toBe('blocked');
    }
  });

  it('still extracts a real price when a Tier C request gets through (game fixture)', () => {
    const result = game.parse(fixture('game-instock.html'), URL_FOR);
    expect(result.price).toBe(11999);
    expect(result.inStock).toBe(true);
    expect(result.source).toBe('cheerio');
  });

  it('returns price:null (not blocked) on an explicit out-of-stock signal', () => {
    // A genuine OOS product page must be reported as out of stock, not misclassified as
    // an anti-bot block — the explicit availability signal is trusted.
    const html =
      '<html><head><script type="application/ld+json">' +
      '{"@type":"Product","name":"Soundbar","offers":{"price":"2999","availability":"OutOfStock"}}' +
      '</script></head><body><p data-testid="out-of-stock">Out of stock</p></body></html>';
    const result = makro.parse(html, URL_FOR);
    expect(result.price).toBeNull();
    expect(result.inStock).toBe(false);
  });
});

describe('Tier A — extraction precedence (cheerio factory)', () => {
  it('lets a CSS sold-out marker override a stale in-stock JSON-LD price', () => {
    // JSON-LD still advertises an in-stock price, but the DOM is marked sold out —
    // the explicit out-of-stock signal must win so we never record a phantom price.
    const html =
      '<html><head><script type="application/ld+json">' +
      '{"@type":"Product","name":"AirPods","offers":{"price":"4299","availability":"InStock"}}' +
      '</script></head><body>' +
      '<span class="price--sold-out"><span class="money" data-product-price>R 4 299.00</span></span>' +
      '</body></html>';
    const result = koodoo.parse(html, URL_FOR);
    expect(result.price).toBeNull();
    expect(result.inStock).toBe(false);
  });

  it('resolves the price from product:price:amount meta when JSON-LD and CSS are absent', () => {
    // No JSON-LD, no on-page price node — only the OpenGraph price meta carries it.
    const html =
      '<html><head>' +
      '<meta property="og:title" content="Meta Widget" />' +
      '<meta property="product:price:amount" content="1599.00" />' +
      '</head><body><h1>Meta Widget</h1></body></html>';
    const result = koodoo.parse(html, URL_FOR);
    expect(result.price).toBe(1599);
    expect(result.inStock).toBe(true);
    expect(result.name).toBe('Meta Widget');
  });
});

describe('Tier A — istore out-of-stock marker', () => {
  it('returns price:null when an .out-of-stock marker is present', () => {
    const html =
      '<html><body><div class="product-info"><div class="product-price">' +
      '<span class="price">R 27 999.00</span></div>' +
      '<div class="out-of-stock">Sold out</div></div></body></html>';
    const result = istore.parse(html, URL_FOR);
    expect(result.price).toBeNull();
    expect(result.inStock).toBe(false);
  });
});

describe('Takealot (CSR / Puppeteer source)', () => {
  it('declares the puppeteer source', () => {
    expect(takealot.source).toBe('puppeteer');
    expect(takealot.domain).toBe('www.takealot.com');
  });

  it('extracts the buybox price from a rendered fixture', () => {
    const result = takealot.parse(fixture('takealot-instock.html'), URL_FOR);
    expect(result.price).toBe(9499);
    expect(result.inStock).toBe(true);
    expect(result.name).toContain('Samsung');
    expect(result.source).toBe('puppeteer');
  });

  it('reads price from JSON-LD when present', () => {
    const html =
      '<html><head><script type="application/ld+json">' +
      '{"@type":"Product","name":"TV","offers":{"price":"1234","availability":"InStock"}}' +
      '</script></head><body></body></html>';
    expect(takealot.parse(html, URL_FOR).price).toBe(1234);
  });

  it('returns price:null when out of stock (copy + disabled cart)', () => {
    const result = takealot.parse(fixture('takealot-oos.html'), URL_FOR);
    expect(result.price).toBeNull();
    expect(result.inStock).toBe(false);
  });

  it('throws ScraperError(parse_error) on a hydrated page with no price', () => {
    const html = '<html><body><div class="pdp"><h1>Empty</h1></div></body></html>';
    try {
      takealot.parse(html, URL_FOR);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScraperError);
      expect((err as ScraperError).type).toBe('parse_error');
    }
  });
});
