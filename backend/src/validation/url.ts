/**
 * URL validation gate (HANDOVER §11). The server is a one-way proxy: a submitted
 * URL must be https, on the retailer allowlist, and within the length cap before it
 * is ever accepted. robots.txt enforcement happens later at scrape time (S2).
 */
import { MAX_URL_LENGTH, RETAILER_ALLOWLIST } from '../config/constants.js';

const ALLOWED_HOSTS: ReadonlySet<string> = new Set(RETAILER_ALLOWLIST);

export interface ValidatedUrl {
  url: string;
  retailerDomain: string;
}

export type UrlValidation =
  | { ok: true; value: ValidatedUrl }
  | { ok: false; reason: 'too_long' | 'not_https' | 'malformed' | 'host_not_allowed' };

export function validateProductUrl(raw: string): UrlValidation {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'malformed' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (parsed.protocol !== 'https:') return { ok: false, reason: 'not_https' };

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return { ok: false, reason: 'host_not_allowed' };

  // Normalise: drop hash and trailing slash noise but keep query (some retailers need it).
  parsed.hash = '';
  return { ok: true, value: { url: parsed.toString(), retailerDomain: host } };
}
