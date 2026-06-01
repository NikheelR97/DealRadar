/**
 * Composition root for the scheduler's real I/O (SPRINT_PLAN S4). Wires the pure tick
 * logic to the live scraper dispatcher, the cached robots Crawl-delay lookup, the
 * advisory lock, and real timers. Excluded from coverage like `scraper/fetchers.ts`:
 * it is the untestable edge that touches the network, robots cache, and the clock.
 */
import { robotsFetcher } from '../scraper/fetchers.js';
import { scrapeProduct } from '../scraper/index.js';
import { jitterMs } from '../scraper/jitter.js';
import { getCrawlDelayMs } from '../scraper/robots.js';
import { withSchedulerLock } from './lock.js';
import { runPollTick, type PollDeps } from './poll.worker.js';
import { startScheduler, type SchedulerHandle, type TickDeps } from './scheduler.js';

const livePollDeps: PollDeps = {
  scrape: (url) => scrapeProduct(url),
  crawlDelayMs: (url) => getCrawlDelayMs(url, robotsFetcher),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  jitterMs,
};

const liveTickDeps: TickDeps = {
  withLock: withSchedulerLock,
  runPollTick: () => runPollTick(livePollDeps),
};

/** Start the live scheduler wired to the real scraper, robots cache, and DB lock. */
export function startLiveScheduler(): SchedulerHandle {
  return startScheduler(liveTickDeps);
}
