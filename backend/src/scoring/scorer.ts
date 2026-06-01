/**
 * Deal scoring (HANDOVER §5).
 *
 * Scores a product's current price against the **median of its valid in-stock
 * prices over the last 90 days** — not the all-time high and not an inflated
 * "was" price. Using the recent median baseline defeats fake Black Friday
 * markdowns.
 *
 * Pure and deterministic: `now` is injected so the Black Friday window and the
 * 90-day cutoff are testable without faking the clock.
 */

import {
  DEAL_BASELINE_DAYS,
  DEAL_THRESHOLD_MODEST_PCT,
  DEAL_THRESHOLD_GOOD_PCT,
  DEAL_THRESHOLD_EXCEPTIONAL_PCT,
  BLACK_FRIDAY_ALERT_THRESHOLD_PCT,
  BLACK_FRIDAY_START_MONTH,
  BLACK_FRIDAY_START_DAY,
  SAST_OFFSET_HOURS,
} from '../config/constants.js';
import type { DealScore, DealTier, PriceRecord } from '../types/domain.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const INSUFFICIENT_HISTORY_NOTE =
  'Not enough recent price history to establish a baseline.';

/** Median of a non-empty list. Caller guarantees `values.length > 0`. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Round to 2 decimal places for reporting (tier decisions use the raw value). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * True when `now` is on/after 1 November in SAST (the Black Friday window opens).
 *
 * Evaluated in SAST (UTC+2), not the server's local zone, so the boundary is
 * deterministic across deployments: shift the instant by the fixed offset and
 * read its UTC calendar fields. The 90-day cutoff elsewhere uses UTC epoch math,
 * which is zone-agnostic and needs no such adjustment.
 */
function isInBlackFridayWindow(now: Date): boolean {
  const sast = new Date(now.getTime() + SAST_OFFSET_HOURS * 60 * 60 * 1000);
  const month = sast.getUTCMonth() + 1; // 1-based to match the constants
  const day = sast.getUTCDate();
  return (
    month > BLACK_FRIDAY_START_MONTH ||
    (month === BLACK_FRIDAY_START_MONTH && day >= BLACK_FRIDAY_START_DAY)
  );
}

function classify(discountPct: number): DealTier {
  if (discountPct < DEAL_THRESHOLD_MODEST_PCT) return 'NOT_A_DEAL';
  if (discountPct < DEAL_THRESHOLD_GOOD_PCT) return 'MODEST';
  if (discountPct < DEAL_THRESHOLD_EXCEPTIONAL_PCT) return 'GOOD';
  return 'EXCEPTIONAL';
}

/**
 * Score `history` (most-recent-first) against its 90-day baseline.
 *
 * @param history Price observations, newest first. Must be non-empty.
 * @param now     Reference instant (defaults to the current time).
 * @throws if `history` is empty — an empty history is a caller contract violation.
 */
export function calculateDealScore(
  history: readonly PriceRecord[],
  now: Date = new Date(),
): DealScore {
  if (history.length === 0) {
    throw new Error('calculateDealScore: price history is empty');
  }

  const current = history[0]!;
  const currentPrice = current.price;

  // Current observation has no price → out of stock; nothing to score.
  if (currentPrice === null) {
    return {
      tier: 'OUT_OF_STOCK',
      currentPrice: null,
      baseline: null,
      discountPct: null,
      blackFridayAlert: false,
    };
  }

  // Baseline = valid in-stock prices within the 90-day window, excluding the
  // current observation (we compare current *against* its recent history).
  const cutoff = now.getTime() - DEAL_BASELINE_DAYS * DAY_MS;
  const baselinePrices = history
    .slice(1)
    .filter(
      // A malformed checkedAt yields NaN, and `NaN >= cutoff` is false, so the
      // record is intentionally dropped from the baseline rather than throwing.
      // Our own price_history rows are TIMESTAMPTZ, so this is a defensive guard.
      (r): r is PriceRecord & { price: number } =>
        r.price !== null && r.inStock && new Date(r.checkedAt).getTime() >= cutoff,
    )
    .map((r) => r.price);

  if (baselinePrices.length === 0) {
    return {
      tier: 'NOT_A_DEAL',
      currentPrice,
      baseline: null,
      discountPct: null,
      blackFridayAlert: false,
      note: INSUFFICIENT_HISTORY_NOTE,
    };
  }

  const baseline = median(baselinePrices);
  const discountPct = ((baseline - currentPrice) / baseline) * 100;

  return {
    tier: classify(discountPct),
    currentPrice,
    baseline: round2(baseline),
    discountPct: round2(discountPct),
    blackFridayAlert:
      isInBlackFridayWindow(now) && discountPct >= BLACK_FRIDAY_ALERT_THRESHOLD_PCT,
  };
}
