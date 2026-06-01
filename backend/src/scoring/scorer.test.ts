import { describe, expect, it } from 'vitest';
import { calculateDealScore } from './scorer.js';
import type { PriceRecord } from '../types/domain.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixed "now" outside the Black Friday window (June). */
const NOW = new Date('2026-06-15T12:00:00.000Z');
/** A "now" inside the Black Friday window (on/after 1 Nov). */
const BF_NOW = new Date('2026-11-20T12:00:00.000Z');
/** A "now" just before the Black Friday window opens. */
const PRE_BF_NOW = new Date('2026-10-20T12:00:00.000Z');

function daysAgo(n: number, base: Date = NOW): string {
  return new Date(base.getTime() - n * DAY_MS).toISOString();
}

function rec(
  price: number | null,
  checkedAt: string,
  inStock: boolean = price !== null,
): PriceRecord {
  return { price, inStock, scrapeSource: 'cheerio', checkedAt };
}

/** Build a baseline of `count` in-stock records at `price`, each a day apart. */
function baselineAt(price: number, count: number, startDayAgo = 1, base: Date = NOW): PriceRecord[] {
  return Array.from({ length: count }, (_, i) => rec(price, daysAgo(startDayAgo + i, base)));
}

/** history = [current, ...baseline] (most-recent-first). */
function history(currentPrice: number | null, baselinePrice: number, base: Date = NOW): PriceRecord[] {
  return [rec(currentPrice, daysAgo(0, base)), ...baselineAt(baselinePrice, 5, 1, base)];
}

describe('calculateDealScore', () => {
  it('throws on empty price history array', () => {
    expect(() => calculateDealScore([], NOW)).toThrow();
  });

  it('returns NOT_A_DEAL for < DEAL_THRESHOLD_MODEST_PCT drop', () => {
    // 2% drop (980 vs 1000) → below the 5% modest floor.
    const score = calculateDealScore(history(980, 1000), NOW);
    expect(score.tier).toBe('NOT_A_DEAL');
    expect(score.baseline).toBe(1000);
    expect(score.discountPct).toBeCloseTo(2, 5);
    expect(score.note).toBeUndefined();
  });

  it('returns MODEST for 5–15% drop', () => {
    expect(calculateDealScore(history(900, 1000), NOW).tier).toBe('MODEST'); // 10%
  });

  it('treats exactly 5% as MODEST (inclusive lower bound)', () => {
    expect(calculateDealScore(history(950, 1000), NOW).tier).toBe('MODEST');
  });

  it('returns GOOD for 15–30% drop', () => {
    expect(calculateDealScore(history(800, 1000), NOW).tier).toBe('GOOD'); // 20%
  });

  it('treats exactly 15% as GOOD and exactly 30% as EXCEPTIONAL', () => {
    expect(calculateDealScore(history(850, 1000), NOW).tier).toBe('GOOD'); // 15%
    expect(calculateDealScore(history(700, 1000), NOW).tier).toBe('EXCEPTIONAL'); // 30%
  });

  it('returns EXCEPTIONAL for 30%+ drop', () => {
    expect(calculateDealScore(history(600, 1000), NOW).tier).toBe('EXCEPTIONAL'); // 40%
  });

  it('uses 90-day baseline, not all-time high', () => {
    const hist: PriceRecord[] = [
      rec(900, daysAgo(0)), // current
      ...baselineAt(1000, 4, 10), // recent, in-window
      rec(2000, daysAgo(120)), // old spike, outside the 90-day window
      rec(2000, daysAgo(150)),
    ];
    const score = calculateDealScore(hist, NOW);
    expect(score.baseline).toBe(1000); // not 2000
    expect(score.tier).toBe('MODEST'); // 10% off 1000, not 55% off 2000
  });

  it('computes the median (not the mean) of the baseline window', () => {
    // baseline records: 1000,1000,800,800 → median 900; current 720 → 20% off 900.
    const hist: PriceRecord[] = [
      rec(720, daysAgo(0)),
      rec(1000, daysAgo(1)),
      rec(1000, daysAgo(2)),
      rec(800, daysAgo(3)),
      rec(800, daysAgo(4)),
    ];
    const score = calculateDealScore(hist, NOW);
    expect(score.baseline).toBe(900);
    expect(score.tier).toBe('GOOD');
  });

  it('ignores out-of-stock observations when building the baseline', () => {
    const hist: PriceRecord[] = [
      rec(900, daysAgo(0)),
      rec(null, daysAgo(1)), // OOS — excluded from baseline
      ...baselineAt(1000, 4, 2),
    ];
    const score = calculateDealScore(hist, NOW);
    expect(score.baseline).toBe(1000);
    expect(score.tier).toBe('MODEST');
  });

  it('flags Black Friday alert for 10%+ drop on/after 1 November', () => {
    const score = calculateDealScore(history(900, 1000, BF_NOW), BF_NOW); // 10%
    expect(score.tier).toBe('MODEST');
    expect(score.blackFridayAlert).toBe(true);
  });

  it('does not flag Black Friday before 1 November even at 10%+', () => {
    const score = calculateDealScore(history(900, 1000, PRE_BF_NOW), PRE_BF_NOW);
    expect(score.blackFridayAlert).toBe(false);
  });

  it('does not flag Black Friday for a sub-threshold drop during the window', () => {
    const score = calculateDealScore(history(930, 1000, BF_NOW), BF_NOW); // 7%
    expect(score.tier).toBe('MODEST');
    expect(score.blackFridayAlert).toBe(false);
  });

  it('returns OUT_OF_STOCK when the current price is null', () => {
    const hist: PriceRecord[] = [rec(null, daysAgo(0)), ...baselineAt(1000, 4, 1)];
    const score = calculateDealScore(hist, NOW);
    expect(score.tier).toBe('OUT_OF_STOCK');
    expect(score.currentPrice).toBeNull();
    expect(score.discountPct).toBeNull();
    expect(score.blackFridayAlert).toBe(false);
  });

  it('returns OUT_OF_STOCK when every observation is out of stock', () => {
    const hist: PriceRecord[] = [rec(null, daysAgo(0)), rec(null, daysAgo(1)), rec(null, daysAgo(2))];
    expect(calculateDealScore(hist, NOW).tier).toBe('OUT_OF_STOCK');
  });

  it('returns NOT_A_DEAL with a note for a single record (no baseline)', () => {
    const score = calculateDealScore([rec(1000, daysAgo(0))], NOW);
    expect(score.tier).toBe('NOT_A_DEAL');
    expect(score.baseline).toBeNull();
    expect(score.discountPct).toBeNull();
    expect(score.note).toBeTruthy();
  });

  it('returns NOT_A_DEAL with a note when the baseline window is empty', () => {
    // Only history is older than 90 days → nothing in the window to baseline against.
    const hist: PriceRecord[] = [rec(900, daysAgo(0)), rec(1000, daysAgo(100)), rec(1000, daysAgo(120))];
    const score = calculateDealScore(hist, NOW);
    expect(score.tier).toBe('NOT_A_DEAL');
    expect(score.baseline).toBeNull();
    expect(score.note).toBeTruthy();
  });

  it('treats a price increase as NOT_A_DEAL (negative discount)', () => {
    const score = calculateDealScore(history(1100, 1000), NOW);
    expect(score.tier).toBe('NOT_A_DEAL');
    expect(score.discountPct).toBeCloseTo(-10, 5);
  });
});
