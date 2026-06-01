import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TickDeps } from './scheduler.js';
import type { PollTickSummary } from './poll.worker.js';

const schedule = vi.fn();
vi.mock('node-cron', () => ({ schedule: (...a: unknown[]) => schedule(...a) }));

const { createTickRunner, startScheduler } = await import('./scheduler.js');
const { SCHEDULER_CRON } = await import('../config/constants.js');

const summary: PollTickSummary = { selected: 2, succeeded: 2, failed: 0 };

/** A TickDeps whose lock simply runs the supplied fn (acquired). */
function passthroughDeps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    withLock: async (fn) => ({ skipped: false, result: await fn() }),
    runPollTick: vi.fn().mockResolvedValue(summary),
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('createTickRunner', () => {
  it('runs one poll tick under the advisory lock', async () => {
    const deps = passthroughDeps();
    await createTickRunner(deps)();
    expect(deps.runPollTick).toHaveBeenCalledOnce();
  });

  it('skips the tick (does not poll) when the lock is held elsewhere', async () => {
    const runPollTick = vi.fn().mockResolvedValue(summary);
    const deps: TickDeps = {
      withLock: vi.fn().mockResolvedValue({ skipped: true }),
      runPollTick,
    };
    await createTickRunner(deps)();
    expect(runPollTick).not.toHaveBeenCalled();
  });

  it('does not overlap itself: a second fire while one is in flight is skipped', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const runPollTick = vi.fn(() => gate.then(() => summary));
    const tick = createTickRunner(passthroughDeps({ runPollTick }));

    const first = tick(); // begins; runPollTick is pending on the gate
    await tick(); // re-entrancy guard → returns without a second poll
    expect(runPollTick).toHaveBeenCalledOnce();

    release();
    await first;
    expect(runPollTick).toHaveBeenCalledOnce();
  });

  it('swallows a tick failure so the cron task keeps running', async () => {
    const deps: TickDeps = {
      withLock: vi.fn().mockRejectedValue(new Error('db down')),
      runPollTick: vi.fn(),
    };
    await expect(createTickRunner(deps)()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('runs again after a previous tick finished (guard resets)', async () => {
    const deps = passthroughDeps();
    const tick = createTickRunner(deps);
    await tick();
    await tick();
    expect(deps.runPollTick).toHaveBeenCalledTimes(2);
  });
});

describe('startScheduler', () => {
  it('schedules on SCHEDULER_CRON and stop() halts the task', () => {
    const stop = vi.fn();
    schedule.mockReturnValue({ stop });

    const handle = startScheduler(passthroughDeps());

    expect(schedule).toHaveBeenCalledWith(SCHEDULER_CRON, expect.any(Function));
    handle.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('wires the cron callback to run a tick', async () => {
    let cronCb: () => void = () => undefined;
    schedule.mockImplementation((_expr: string, cb: () => void) => {
      cronCb = cb;
      return { stop: vi.fn() };
    });
    const deps = passthroughDeps();

    startScheduler(deps);
    cronCb(); // simulate a cron fire
    await Promise.resolve(); // let the fire-and-forget tick settle

    expect(deps.runPollTick).toHaveBeenCalledOnce();
  });
});
