/**
 * In-process scheduler (SPRINT_PLAN S4). A node-cron task fires on `SCHEDULER_CRON`
 * (every 15 min); each fire runs one poll tick under two guards:
 *   1. an in-process re-entrancy flag, so a long tick never overlaps itself within
 *      this process (cheap, no DB round-trip);
 *   2. the Postgres advisory lock (`withSchedulerLock`), so two backend instances
 *      never poll simultaneously.
 * A tick that loses either guard is skipped and logged, never queued. Tick failures
 * are caught and logged so one bad tick never kills the cron task.
 */
import { schedule, type ScheduledTask } from 'node-cron';
import { SCHEDULER_CRON } from '../config/constants.js';
import type { LockOutcome } from './lock.js';
import type { PollTickSummary } from './poll.worker.js';

/** Injected boundary — composed with real lock + worker in `live.ts`, faked in tests. */
export interface TickDeps {
  withLock<T>(fn: () => Promise<T>): Promise<LockOutcome<T>>;
  runPollTick(): Promise<PollTickSummary>;
}

export interface SchedulerHandle {
  stop(): void;
}

/**
 * Build the per-fire tick function. Returns a no-arg async runner that enforces the
 * in-process re-entrancy guard, acquires the advisory lock, runs one tick, and logs
 * the outcome. Exported (separately from `startScheduler`) so it is unit-testable
 * without real cron timing.
 */
export function createTickRunner(deps: TickDeps): () => Promise<void> {
  let running = false;
  return async function tick(): Promise<void> {
    if (running) {
      console.warn('[scheduler] previous tick still running; skipping');
      return;
    }
    running = true;
    try {
      const outcome = await deps.withLock(() => deps.runPollTick());
      if (outcome.skipped) {
        console.log('[scheduler] another instance holds the lock; tick skipped');
      } else if (outcome.result) {
        const { selected, succeeded, failed } = outcome.result;
        console.log(`[scheduler] tick done: ${selected} due, ${succeeded} ok, ${failed} failed`);
      }
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    } finally {
      running = false;
    }
  };
}

/** Start the cron schedule. Returns a handle whose `stop()` halts the task. */
export function startScheduler(deps: TickDeps): SchedulerHandle {
  const run = createTickRunner(deps);
  const task: ScheduledTask = schedule(SCHEDULER_CRON, () => {
    void run();
  });
  return { stop: () => task.stop() };
}
