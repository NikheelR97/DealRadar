/**
 * Outbound-throttle jitter (HANDOVER §11). Shared by the scraper dispatcher's
 * inter-retry delay and the poll worker's per-domain pacing so the jitter band is
 * defined once.
 */
import { SCRAPE_DELAY_MAX_MS, SCRAPE_DELAY_MIN_MS } from '../config/constants.js';

/** Random delay (ms) within the configured `[SCRAPE_DELAY_MIN_MS, SCRAPE_DELAY_MAX_MS]` band. */
export function jitterMs(): number {
  const span = SCRAPE_DELAY_MAX_MS - SCRAPE_DELAY_MIN_MS;
  return SCRAPE_DELAY_MIN_MS + Math.floor(Math.random() * (span + 1));
}
