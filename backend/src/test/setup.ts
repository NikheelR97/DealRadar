/**
 * Test environment bootstrap. Sets the required env vars before any module that
 * imports `config/env.ts` is evaluated, so unit/integration tests run without a
 * real `.env`. The DATABASE_URL points at a host that will simply fail to connect —
 * tests that need data use a real test DB (S9); skeleton tests tolerate no DB.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://test:test@127.0.0.1:5432/dealradar_test';
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'test-session-secret-at-least-32-characters-long';
process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS ?? 'admin@example.com';
process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:8080';
