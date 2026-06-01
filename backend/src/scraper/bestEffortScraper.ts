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
 * Phrases that identify an anti-bot interstitial served with a 200 status. Each is a
 * specific challenge/CAPTCHA string (vendor wording, not a generic word like "denied")
 * so a real product page is never misread as a block. Compiled once into a single
 * case-insensitive regex — matched directly against the raw HTML so we never allocate a
 * full lowercased copy of the page per parse. Dots are the only regex-special character
 * present and are escaped inline.
 */
const CHALLENGE_PATTERN = new RegExp(
  [
    'just a moment', // Cloudflare "Just a moment..." interstitial
    'cf-browser-verification', // Cloudflare challenge marker
    'cf-challenge', // Cloudflare turnstile/challenge container
    'attention required', // Cloudflare 1020 / firewall block
    'checking your browser', // generic JS challenge
    'you have been blocked', // Cloudflare 1020 body
    'px-captcha', // PerimeterX
    'access to this page has been denied', // PerimeterX block page (specific, not bare "access denied")
    '_incapsula_resource', // Imperva/Incapsula
    'pardon our interruption', // Imperva bot page
    'request unsuccessful\\. incapsula', // Incapsula failure page
    'enter the characters you see below', // Amazon CAPTCHA
    'api-services-support@amazon', // Amazon "Robot Check" page footer
    'to discuss automated access to amazon data', // Amazon bot page copy
  ].join('|'),
  'i',
);

/** True when the HTML body looks like an anti-bot challenge rather than a product page. */
export function looksBlocked(html: string): boolean {
  return CHALLENGE_PATTERN.test(html);
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

      // No price and no explicit challenge marker. On a Tier C store from a home IP this
      // is almost always a stripped anti-bot shell, so we classify it `blocked` (per the
      // S3 contract — best-effort, logged, never retried as a parse bug). We do still
      // record WHICH it more likely is in the detail: if the page carried product markup
      // (a name/og:title resolved) the price selector may have drifted; if it carried
      // nothing, it is almost certainly an anti-bot block. The error type stays `blocked`
      // either way, but the detail lets a future reader tell selector drift apart from a
      // genuine block in `scrape_errors` (see SPRINT_PLAN S3 deferral #2).
      const detail =
        extraction.partial.name !== null
          ? 'product markup present but no price — possible selector drift (Tier C best-effort)'
          : 'no product markup — likely anti-bot block (Tier C best-effort)';
      throw new ScraperError('blocked', config.domain, detail);
    },
  };
}
