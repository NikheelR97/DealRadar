import { defineConfig } from 'vitest/config';

// Coverage thresholds per SPRINT_PLAN. Service/scorer logic must stay well-tested.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/index.ts',
        'src/types/**',
        'src/test/**',
        // I/O boundary adapters (real fetch + headless Chromium) — exercised in
        // integration/live runs, not unit-testable without a network or browser.
        'src/scraper/fetchers.ts',
        // Scheduler composition root: wires real scraper/robots/lock/timers. Same
        // untestable-edge rationale as fetchers.ts; the pure tick logic is tested.
        'src/scheduler/live.ts',
      ],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
