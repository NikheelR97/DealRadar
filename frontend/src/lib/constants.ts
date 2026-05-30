/**
 * Frontend constant mirror (HANDOVER §10). Read-only copy of the display-relevant
 * subset of the backend registry — badge thresholds, poll/display caps, feature flags.
 * Backend `constants.ts` remains the source of truth; these must stay in sync.
 */

// ── Deal badge thresholds (mirror of backend DEAL_THRESHOLD_*_PCT) ───────────
export const DEAL_THRESHOLD_MODEST_PCT = 5;
export const DEAL_THRESHOLD_GOOD_PCT = 15;
export const DEAL_THRESHOLD_EXCEPTIONAL_PCT = 30;

export const DEAL_BADGE = {
  MODEST: '🟡',
  GOOD: '🟢',
  EXCEPTIONAL: '⭐',
} as const;

// ── Display / pagination caps ───────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const MAX_HISTORY_RECORDS = 500;

// ── Input bounds (mirror backend MAX_URL_LENGTH) ─────────────────────────────
export const MAX_URL_LENGTH = 2_048;

// ── Feature flags (surfaces ship dark, HANDOVER §15.5) ──────────────────────
export const ENABLE_ADS = import.meta.env.VITE_ENABLE_ADS === 'true';
export const KOFI_URL = (import.meta.env.VITE_KOFI_URL as string | undefined) ?? '';

// ── API base ────────────────────────────────────────────────────────────────
export const API_BASE = '/api';
