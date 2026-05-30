/**
 * Validated environment access (HANDOVER §9, Law 6).
 *
 * All secrets are read here exactly once at startup and frozen. No other module
 * touches `process.env`. A missing/invalid required variable fails fast with a
 * clear message rather than surfacing as a confusing runtime error later.
 */
import { z } from 'zod';
import { DEFAULT_BACKEND_PORT, SESSION_SECRET_MIN_LENGTH } from './constants.js';

const csvEmails = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(DEFAULT_BACKEND_PORT),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SESSION_SECRET: z
    .string()
    .min(SESSION_SECRET_MIN_LENGTH, `SESSION_SECRET must be ≥ ${SESSION_SECRET_MIN_LENGTH} chars`),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  APP_BASE_URL: z.string().url().default('http://localhost:8080'),
  ADMIN_EMAILS: csvEmails,

  NOTIFICATION_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return Object.freeze(parsed.data);
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Admin status is derived at request time from the allowlist — never stored (HANDOVER §6). */
export function isAdminEmail(email: string): boolean {
  if (typeof email !== 'string' || email.length === 0) return false;
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
