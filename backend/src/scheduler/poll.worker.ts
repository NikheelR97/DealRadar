/**
 * Poll worker (HANDOVER §6, SPRINT_PLAN S4). One tick selects the products that are
 * due (active and past their per-product `poll_interval_hours`), bounded by
 * `MAX_PRODUCTS_PER_POLL_BATCH`, scrapes each, and records the outcome:
 *   • success    → append a `price_history` row (price may be NULL = out of stock,
 *                  which never overwrites a prior valid price — the table is append-only).
 *   • ScraperError → append a sanitised `scrape_errors` row.
 * In both cases `products.last_checked_at` is advanced so a permanently-blocked
 * product backs off to its normal interval instead of being retried every tick
 * (addresses the S3 retry-volume deferral). Requests to the same retailer are paced
 * by `max(jitter, robots Crawl-delay)` so we never hammer one domain in a tick.
 *
 * All I/O (scrape, robots, delay) is injected via `PollDeps`, so the tick logic is
 * unit-tested without a network, browser, or real timers. The DB layer is the
 * parameterised `query` helper (mocked in tests).
 */
import { MAX_PRODUCTS_PER_POLL_BATCH } from '../config/constants.js';
import { query } from '../db/pool.js';
import { ScraperError, type ScrapeResult } from '../scraper/types.js';

/** A product row owed a fresh check. */
interface DueProductRow {
  id: string;
  url: string;
  retailer_domain: string;
}

/** Injected I/O boundary — real adapters in `live.ts`, fakes in tests. */
export interface PollDeps {
  /** Scrape one URL; resolves a `ScrapeResult` or throws `ScraperError`. */
  scrape(url: string): Promise<ScrapeResult>;
  /** Per-domain Crawl-delay (ms) advertised in robots.txt; 0 when none. */
  crawlDelayMs(url: string): Promise<number>;
  /** Awaitable pause (injectable so tests don't really wait). */
  delay(ms: number): Promise<void>;
  /** Random pause within the configured jitter band. */
  jitterMs(): number;
}

/** Per-tick tally returned to the scheduler for logging/observability. */
export interface PollTickSummary {
  selected: number;
  succeeded: number;
  failed: number;
}

/** Products whose interval has elapsed, oldest-checked first, bounded per tick. */
async function selectDueProducts(): Promise<DueProductRow[]> {
  return query<DueProductRow>(
    `SELECT id, url, retailer_domain
       FROM products
      WHERE is_active
        AND (last_checked_at IS NULL
             OR last_checked_at < now() - make_interval(hours => poll_interval_hours))
      ORDER BY last_checked_at ASC NULLS FIRST, id ASC
      LIMIT $1`,
    [MAX_PRODUCTS_PER_POLL_BATCH],
  );
}

/**
 * Append the observation and advance `last_checked_at` (filling name/image/currency)
 * in a single data-modifying statement, so the price row and the cadence bump commit
 * atomically — a crash can never leave a recorded price without advancing the clock.
 */
async function recordSuccess(productId: string, r: ScrapeResult): Promise<void> {
  await query(
    `WITH observation AS (
       INSERT INTO price_history (product_id, price, in_stock, scrape_source)
       VALUES ($1, $2, $3, $4)
     )
     UPDATE products
        SET last_checked_at = now(),
            name = COALESCE($5, name),
            image_url = COALESCE($6, image_url),
            currency = $7
      WHERE id = $1`,
    [productId, r.price, r.inStock, r.source, r.name, r.imageUrl, r.currency],
  );
}

/**
 * Log a sanitised error and advance `last_checked_at` atomically (one statement), so a
 * blocked product still backs off to its interval even if the process dies mid-write.
 */
async function recordError(productId: string, err: ScraperError): Promise<void> {
  await query(
    `WITH logged AS (
       INSERT INTO scrape_errors (product_id, error_type, message)
       VALUES ($1, $2, $3)
     )
     UPDATE products SET last_checked_at = now() WHERE id = $1`,
    [productId, err.type, err.detail.slice(0, 1_000)],
  );
}

/** Scrape and persist one product. Never throws — failures are logged to the DB. */
async function pollOne(p: DueProductRow, deps: PollDeps): Promise<boolean> {
  try {
    const result = await deps.scrape(p.url);
    await recordSuccess(p.id, result);
    return true;
  } catch (err) {
    const scraperError =
      err instanceof ScraperError
        ? err
        : new ScraperError('unknown', p.retailer_domain, err instanceof Error ? err.message : String(err));
    await recordError(p.id, scraperError);
    return false;
  }
}

/**
 * Run one poll tick. Processes due products sequentially, pacing repeated hits on the
 * same retailer by `max(jitter, Crawl-delay)`. Returns a tally; never rejects for a
 * single product's failure (those are recorded), only for an infrastructure failure
 * (e.g. the due-products query itself).
 */
export async function runPollTick(deps: PollDeps): Promise<PollTickSummary> {
  const due = await selectDueProducts();
  const summary: PollTickSummary = { selected: due.length, succeeded: 0, failed: 0 };

  const seenDomains = new Set<string>();
  for (const p of due) {
    if (seenDomains.has(p.retailer_domain)) {
      const crawl = await deps.crawlDelayMs(p.url);
      await deps.delay(Math.max(deps.jitterMs(), crawl));
    }
    seenDomains.add(p.retailer_domain);

    const ok = await pollOne(p, deps);
    if (ok) summary.succeeded++;
    else summary.failed++;
  }

  return summary;
}
