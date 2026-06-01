/**
 * Amazon (www.amazon.co.za) — Tier C, best-effort (HANDOVER §4, SPRINT_PLAN S3).
 *
 * Amazon aggressively rate-limits and CAPTCHAs unattended traffic. A home-IP GET
 * commonly returns Amazon's "Robot Check" / "Enter the characters you see below" page
 * (detected as a challenge) or a 503. The structured-data-first extraction is attempted
 * — Amazon PDPs do carry schema.org markup when served — but any miss degrades to a
 * logged `blocked` error. No crash, not promised reliable.
 *
 * Note: Amazon's price is frequently in `#corePriceDisplay`/`.a-price` nodes rather
 * than JSON-LD; those CSS fallbacks are documented below but rarely reached from a
 * residential IP without proxy/stealth infrastructure (out of scope for the MVP).
 *
 * ⚠️ Best-effort. last-verified: NOT LIVE-VERIFIED.
 */
import { makeBestEffortScraper } from '../bestEffortScraper.js';

export const amazon = makeBestEffortScraper({
  domain: 'www.amazon.co.za',
  cssPriceSelectors: [
    '#corePriceDisplay .a-price .a-offscreen',
    '#corePrice_feature_div .a-offscreen',
    '.a-price .a-offscreen',
  ],
  soldOutSelectors: ['#outOfStock', '#availability .a-color-price'],
});
