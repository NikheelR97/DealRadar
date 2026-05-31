import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import {
  parsePrice,
  availabilityToInStock,
  readMetaContent,
  readJsonLdProduct,
} from './extract.js';

describe('parsePrice', () => {
  it('parses ZAR with space thousands separators', () => {
    expect(parsePrice('R 12 999.00')).toBe(12999);
  });

  it('parses ZAR with comma thousands separators', () => {
    expect(parsePrice('R12,999.99')).toBe(12999.99);
  });

  it('parses a bare number', () => {
    expect(parsePrice('4299')).toBe(4299);
  });

  it('returns null for non-strings, empty, and zero/negative', () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice('   ')).toBeNull();
    expect(parsePrice('R nothing')).toBeNull();
    expect(parsePrice('0')).toBeNull();
  });
});

describe('availabilityToInStock', () => {
  it('maps schema.org availability values', () => {
    expect(availabilityToInStock('https://schema.org/InStock')).toBe(true);
    expect(availabilityToInStock('OutOfStock')).toBe(false);
    expect(availabilityToInStock('https://schema.org/SoldOut')).toBe(false);
    expect(availabilityToInStock('Discontinued')).toBe(false);
  });

  it('returns null when availability is absent', () => {
    expect(availabilityToInStock('')).toBeNull();
    expect(availabilityToInStock(undefined)).toBeNull();
  });
});

describe('readMetaContent', () => {
  it('returns the first non-empty content', () => {
    const $ = cheerio.load('<meta property="og:title" content="Hello" />');
    expect(readMetaContent($, ['meta[property="og:title"]'])).toBe('Hello');
  });

  it('returns null when no selector matches', () => {
    const $ = cheerio.load('<head></head>');
    expect(readMetaContent($, ['meta[property="og:title"]'])).toBeNull();
  });
});

describe('readJsonLdProduct', () => {
  const wrap = (json: string): cheerio.CheerioAPI =>
    cheerio.load(`<script type="application/ld+json">${json}</script>`);

  it('reads price/availability/name/image from a Product node', () => {
    const $ = wrap(
      JSON.stringify({
        '@type': 'Product',
        name: 'Widget',
        image: 'https://x/i.jpg',
        offers: { price: '199.00', priceCurrency: 'ZAR', availability: 'InStock' },
      }),
    );
    const result = readJsonLdProduct($);
    expect(result).toEqual({
      price: 199,
      inStock: true,
      name: 'Widget',
      imageUrl: 'https://x/i.jpg',
      currency: 'ZAR',
    });
  });

  it('finds a Product inside an @graph array', () => {
    const $ = wrap(
      JSON.stringify({
        '@graph': [{ '@type': 'WebPage' }, { '@type': 'Product', offers: { price: '50' } }],
      }),
    );
    expect(readJsonLdProduct($)?.price).toBe(50);
  });

  it('reads the first offer when offers is an array', () => {
    const $ = wrap(
      JSON.stringify({ '@type': ['Product'], offers: [{ lowPrice: '75', availability: 'InStock' }] }),
    );
    expect(readJsonLdProduct($)?.price).toBe(75);
  });

  it('skips malformed JSON blocks without throwing', () => {
    const $ = cheerio.load(
      '<script type="application/ld+json">{ not json }</script>' +
        '<script type="application/ld+json">{"@type":"Product","offers":{"price":"9"}}</script>',
    );
    expect(readJsonLdProduct($)?.price).toBe(9);
  });

  it('returns null when there is no Product block', () => {
    expect(readJsonLdProduct(cheerio.load('<head></head>'))).toBeNull();
    const $org = wrap(JSON.stringify({ '@type': 'Organization', name: 'Acme' }));
    expect(readJsonLdProduct($org)).toBeNull();
  });
});
