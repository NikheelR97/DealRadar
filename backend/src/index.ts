/**
 * Server entry point. Runs pending migrations (idempotent), then starts the HTTP
 * server. The scheduler/poll worker (S4) is wired in here later.
 */
import { createApp } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pool.js';

async function main(): Promise<void> {
  const applied = await runMigrations();
  if (applied.length > 0) console.log(`[migrate] applied: ${applied.join(', ')}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[dealradar] backend listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[dealradar] ${signal} received, shutting down`);
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
