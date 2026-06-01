/**
 * Factory for Tier C (best-effort) retailer scrapers (HANDOVER §4, SPRINT_PLAN S3).
 *
 * These stores — Makro, Game, Incredible Connection, HiFi Corp, Amazon — sit behind
 * Cloudflare / PerimeterX / Amazon anti-bot. From a home IP a plain GET typically
 * either:
 *   • returns a 403/429/503 — `fetchers.httpFetchHtml` already maps those to
 *     `ScraperError('blocked')` before this parser is ever reached; or
 *   • returns HTTP 200 with a JS challenge / CAPTCHA page that carries no product
 *     markup.
 *
 * This parser handles the second case. It runs the SAME structured-data-first
 * extraction as Tier A, but when nothing usable is found it fails closed with
 * `ScraperError('blocked')` — never `parse_error` — because the cause is anti-bot
 * interruption, not a selector that drifted and could be re-verified. The dispatcher
 * logs that to `scrape_errors` and moves on; a Tier C miss is expected, never a crash
 * and never promised as reliable. No stealth/proxy infrastructure ships in the MVP.
 *
 * If a Tier C page DOES render real product structured data (occasionally a home IP
 * gets through), the happy path returns the price exactly like Tier A.
 */
import { extractProduct, type CheerioRetailerConfig } from './cheerioScraper.js';
import { ScraperError, type RetailerScraper, type ScrapeResult } from './types.js';

/**
 * Substrings that identify an anti-bot interstitial served with a 200 status. Matched
 * case-insensitively against the raw HTML. Kept deliberately specific (challenge/CAPTCHA
 * wording, not generic words) so a real product page is never misread as a block.
 */
const CHALLENGE_MARKERS: readonly string[] = [
  'just a moment', // Cloudflare "Just a moment..." interstitial
  'cf-browser-verification', // Cloudflare challenge marker
  'cf-challenge', // Cloudflare turnstile/challenge container
  'attention required', // Cloudflare 1020 / firewall block
  'checking your browser', // generic JS challenge
  'px-captcha', // PerimeterX
  '_incapsula_resource', // Imperva/Incapsula
  'pardon our interruption', // Imperva bot page
  'access denied', // Akamai / WAF 403 body
  'enter the characters you see below', // Amazon CAPTCHA
  'api-services-support@amazon', // Amazon "Robot Check" page footer
  'to discuss automated access to amazon data', // Amazon bot page copy
  'request unsuccessful. incapsula', // Incapsula failure page
];

/** True when the HTML body looks like an anti-bot challenge rather than a product page. */
export function looksBlocked(html: string): boolean {
  const haystack = html.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => haystack.includes(marker));
}

export function makeBestEffortScraper(config: CheerioRetailerConfig): RetailerScraper {
  return {
    domain: config.domain,
    source: 'cheerio',
    parse(html: string, _url: string): ScrapeResult {
      if (looksBlocked(html)) {
        throw new ScraperError('blocked', config.domain, 'anti-bot challenge/CAPTCHA page');
      }

      const extraction = extractProduct(html, config, 'cheerio');
      if (extraction.found) return extraction.result;

      // No structured data and no explicit challenge marker. On a Tier C store from a
      // home IP this is almost always a stripped anti-bot shell, not selector drift —
      // classify it `blocked` (best-effort) so it is logged, not retried as a parse bug.
      throw new ScraperError('blocked', config.domain, 'no product markup; treating as blocked (Tier C best-effort)');
    },
  };
}
