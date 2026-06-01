# PR Review: #6 — S4: scheduler + poll worker (node-cron tick, advisory lock, per-domain pacing)

**Reviewed**: 2026-06-01
**Author**: NikheelR97 (Nikheel Rajman)
**Branch**: s4-scheduler-worker → main
**Decision**: APPROVE with comments

## Summary
Clean, well-isolated implementation of the S4 scheduler. I/O is pushed to an injected
boundary (`PollDeps`/`TickDeps`) and a coverage-excluded composition root (`live.ts`),
keeping the tick/lock/worker logic pure and exhaustively unit-tested. Overlap is guarded
twice (in-process flag + Postgres advisory lock), the worker degrades gracefully on
scrape failures, and a long-standing deferral (robots `Crawl-delay`) is properly closed.
No correctness, security, or type-safety defects found. Findings are all LOW.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

1. **Non-atomic two-step writes in the worker** — `poll.worker.ts:recordSuccess`/`recordError`
   issue two separate `query()` calls (the `price_history`/`scrape_errors` INSERT, then the
   `products` UPDATE). They are not wrapped in a transaction, so a crash/connection drop
   between them records the observation without advancing `last_checked_at`, causing the
   product to be re-polled on the next tick. No data loss (history is append-only), and the
   blast radius is one extra scrape, so this is acceptable for the MVP — but a single
   `BEGIN/COMMIT` (or a `WITH ... INSERT ... ` CTE) would make each product's outcome atomic.

2. **A long tick holds one pool connection for its full duration** — `lock.ts` keeps the
   advisory-lock client checked out (`pool.connect()`) until the tick completes. With
   `pool.max = 10` and a single in-process tick this is fine, but worth a comment so a future
   reader doesn't size a batch/crawl-delay combination that starves the request path.

3. **`jitterMs` is duplicated** — the same jitter helper exists privately in
   `scraper/index.ts` and again in `scheduler/live.ts`. Minor; consider extracting a shared
   `jitterMs(min, max)` util if a third caller appears.

### Notes (not defects)
- A tick can exceed the 15-min cadence when many same-domain items carry a large
  `Crawl-delay` (Evetech 10s). The re-entrancy guard + advisory lock correctly skip the
  overlapping fire, and this is already logged as S4 deferral #3 with a revisit trigger.
- Self-review caveat: author and reviewer are the same person; posted as a COMMENT review
  (GitHub blocks self-approval).

## Validation Results

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`, backend + frontend) | Pass |
| Lint (`eslint . --max-warnings=0`) | Pass |
| Tests (`vitest run`, 184 incl. 24 new) | Pass |
| Coverage (scheduler 100%, robots 100% lines; gate 85/80) | Pass |
| Build (`tsc -p`) + secret scan | Pass |
| Docker build + stack health (`/api/ready` → ready, scheduler started) | Pass |

## Files Reviewed
- `backend/src/scheduler/lock.ts` — Added
- `backend/src/scheduler/lock.test.ts` — Added
- `backend/src/scheduler/poll.worker.ts` — Added
- `backend/src/scheduler/poll.worker.test.ts` — Added
- `backend/src/scheduler/scheduler.ts` — Added
- `backend/src/scheduler/scheduler.test.ts` — Added
- `backend/src/scheduler/live.ts` — Added
- `backend/src/scraper/robots.ts` — Modified
- `backend/src/scraper/robots.test.ts` — Modified
- `backend/src/config/constants.ts` — Modified
- `backend/src/index.ts` — Modified
- `backend/vitest.config.ts` — Modified
- `backend/package.json` — Modified
- `package-lock.json` — Modified
- `SPRINT_PLAN.md` — Modified
