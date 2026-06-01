/**
 * Server entry point. Runs pending migrations (idempotent), starts the HTTP server,
 * then starts the in-process poll scheduler (S4).
 */
import { createApp } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pool.js';
import { startLiveScheduler } from './scheduler/live.js';

async function main(): Promise<void> {
  const applied = await runMigrations();
  if (applied.length > 0) console.log(`[migrate] applied: ${applied.join(', ')}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[dealradar] backend listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const scheduler = startLiveScheduler();
  console.log(`[dealradar] poll scheduler started (${env.NODE_ENV})`);

  const shutdown = (signal: string): void => {
    console.log(`[dealradar] ${signal} received, shutting down`);
    scheduler.stop();
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[dealradar] fatal startup error:', err);
  process.exit(1);
});
