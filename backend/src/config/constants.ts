/**
 * Authoritative named-constant registry (HANDOVER §10, Law 8).
 *
 * No magic numbers exist anywhere else in the backend. Every threshold, timeout,
 * interval, limit, and bound is declared here with `as const`. The frontend mirrors
 * the display-relevant subset read-only in `frontend/src/lib/constants.ts`.
 */

// ── Scraping ────────────────────────────────────────────────────────────────
export const MAX_SCRAPE_RETRIES = 3;
export const SCRAPE_TIMEOUT_MS = 15_000;
export const SCRAPE_DELAY_MIN_MS = 1_500;
export const SCRAPE_DELAY_MAX_MS = 4_000;
/** Some retailers (Evetech) advertise a long crawl-delay; honoured per-domain. */
export const SCRAPE_CRAWL_DELAY_MAX_MS = 12_000;
export const ROBOTS_TXT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000; // 6 hours

// ── URL validation / security ───────────────────────────────────────────────
export const MAX_URL_LENGTH = 2_048;

/**
 * Single source of truth for which hostnames may ever be scraped (HANDOVER §15.1).
 * An unknown host is rejected at URL validation, so a half-added retailer can
 * never be scraped by accident.
 */
export const RETAILER_ALLOWLIST = [
  'koodoo.co.za',
  'www.wootware.co.za',
  'www.istore.co.za',
  'www.takealot.com',
  'www.evetech.co.za',
  'www.loot.co.za',
  'www.makro.co.za',
  'www.game.co.za',
  'www.incredible.co.za',
  'www.hificorp.co.za',
  'www.amazon.co.za',
] as const;

// ── Deal scoring (HANDOVER §5) ──────────────────────────────────────────────
export const DEAL_BASELINE_DAYS = 90;
export const DEAL_THRESHOLD_MODEST_PCT = 5;
export const DEAL_THRESHOLD_GOOD_PCT = 15;
export const DEAL_THRESHOLD_EXCEPTIONAL_PCT = 30;
export const BLACK_FRIDAY_ALERT_THRESHOLD_PCT = 10;
/** Black Friday window opens 1 November (month is 1-based here for clarity). */
export const BLACK_FRIDAY_START_MONTH = 11;
export const BLACK_FRIDAY_START_DAY = 1;

// ── History / pagination caps (Law 3 — no unbounded allocations) ────────────
export const MAX_HISTORY_RECORDS = 500;
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const PRICE_HISTORY_RETENTION_MONTHS = 18;

// ── Scheduler bounds (HANDOVER §6 CHECK constraints) ────────────────────────
export const MIN_POLL_INTERVAL_HOURS = 2;
export const MAX_POLL_INTERVAL_HOURS = 12;
export const DEFAULT_POLL_INTERVAL_HOURS = 4;
export const MAX_PRODUCTS_PER_POLL_BATCH = 50;
/** node-cron expression for the scheduler tick (every 15 minutes). */
export const SCHEDULER_CRON = '*/15 * * * *';

// ── Per-user limits ─────────────────────────────────────────────────────────
export const MAX_TRACKED_PRODUCTS = 100;

// ── Auth / session ──────────────────────────────────────────────────────────
export const SESSION_SECRET_MIN_LENGTH = 32;
export const JWT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const AUTH_COOKIE_NAME = 'dr_session';
export const OAUTH_STATE_COOKIE_NAME = 'dr_oauth_state';
export const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10 minutes

// ── Rate limiting (HANDOVER §7) ─────────────────────────────────────────────
export const RATE_LIMIT_GLOBAL_WINDOW_MS = 15 * 60 * 1_000;
export const RATE_LIMIT_GLOBAL_MAX = 300;
export const RATE_LIMIT_AUTH_WINDOW_MS = 15 * 60 * 1_000;
export const RATE_LIMIT_AUTH_MAX = 20;
export const RATE_LIMIT_SCRAPE_WINDOW_MS = 60 * 1_000;
export const RATE_LIMIT_SCRAPE_MAX = 10;

// ── HTTP server ─────────────────────────────────────────────────────────────
export const DEFAULT_BACKEND_PORT = 3001;
export const HTTP_BODY_LIMIT = '16kb';
