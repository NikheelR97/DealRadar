import { describe, expect, it } from 'vitest';
import { isAdminEmail, isTest, isProduction } from './env.js';

// Test env (setup.ts) sets NODE_ENV=test and ADMIN_EMAILS=admin@example.com.
describe('env helpers', () => {
  it('reports the test environment', () => {
    expect(isTest).toBe(true);
    expect(isProduction).toBe(false);
  });

  it('recognises allowlisted admin emails case-insensitively', () => {
    expect(isAdminEmail('admin@example.com')).toBe(true);
    expect(isAdminEmail('ADMIN@example.com')).toBe(true);
    expect(isAdminEmail('  admin@example.com ')).toBe(true);
  });

  it('rejects non-allowlisted and empty emails', () => {
    expect(isAdminEmail('someone@else.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(undefined as unknown as string)).toBe(false);
  });
});
