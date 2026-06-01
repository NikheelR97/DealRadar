/**
 * robots.txt gate (HANDOVER §11). Before any scrape the dispatcher asks whether the
 * URL's path is allowed for our crawler. Results are cached per host for
 * `ROBOTS_TXT_CACHE_TTL_MS` so we fetch each retailer's robots.txt at most a few
 * times a day. We honour the `User-agent: *` group with prefix Disallow/Allow rules
 * and longest-match-wins (the standard resolution). Crawl-delay is parsed for
 * reference but not enforced here (HANDOVER §14 — we do not pace on crawl-delay yet).
 */
import { ROBOTS_TXT_CACHE_TTL_MS, SCRAPE_CRAWL_DELAY_MAX_MS } from '../config/constants.js';

interface RobotsRules {
  disallow: string[];
  allow: string[];
  /** Advertised Crawl-delay in milliseconds, capped; 0 when unset/invalid. */
  crawlDelayMs: number;
}

interface CacheEntry {
  rules: RobotsRules;
  fetchedAt: number;
}

/** Fetches a robots.txt body. Returns '' when absent/unreachable (→ allow all). */
export type RobotsFetcher = (robotsUrl: string) => Promise<string>;

const cache = new Map<string, CacheEntry>();

/** Test seam: drop the cache so each test starts cold. */
export function clearRobotsCache(): void {
  cache.clear();
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return hash === -1 ? line : line.slice(0, hash);
}

/** Parse the `User-agent: *` group into prefix Disallow/Allow rules. */
export function parseRobots(body: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: 0 };
  let inAgentSection = false;
  let applies = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === 'user-agent') {
      if (!inAgentSection) applies = false; // a UA line after rules starts a new group
      inAgentSection = true;
      if (value === '*') applies = true;
      continue;
    }
    inAgentSection = false;
    if (!applies || value.length === 0) continue;
    if (key === 'disallow') rules.disallow.push(value);
    else if (key === 'allow') rules.allow.push(value);
    else if (key === 'crawl-delay') rules.crawlDelayMs = parseCrawlDelayMs(value);
  }
  return rules;
}

/** Parse a `Crawl-delay` value (seconds) into capped milliseconds; 0 when invalid. */
function parseCrawlDelayMs(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.round(seconds * 1_000), SCRAPE_CRAWL_DELAY_MAX_MS);
}

/** Longest matching prefix rule in `rules`, or null when none matches `path`. */
function longestMatch(path: string, patterns: readonly string[]): string | null {
  let best: string | null = null;
  for (const pattern of patterns) {
    if (!path.startsWith(pattern)) continue;
    if (best === null || pattern.length > best.length) best = pattern;
  }
  return best;
}

/** Resolve allow/disallow for a path using longest-match-wins. */
export function isPathAllowedByRules(
  path: string,
  rules: Pick<RobotsRules, 'disallow' | 'allow'>,
): boolean {
  const disallowed = longestMatch(path, rules.disallow);
  if (disallowed === null) return true;
  const allowed = longestMatch(path, rules.allow);
  return allowed !== null && allowed.length >= disallowed.length;
}

async function loadRules(host: string, origin: string, fetcher: RobotsFetcher): Promise<RobotsRules> {
  const cached = cache.get(host);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < ROBOTS_TXT_CACHE_TTL_MS) return cached.rules;
  const body = await fetcher(`${origin}/robots.txt`);
  const rules = parseRobots(body);
  cache.set(host, { rules, fetchedAt: now });
  return rules;
}

/**
 * True when `url`'s path may be fetched. A missing/unreachable robots.txt yields
 * empty rules → allowed. A malformed URL is treated as disallowed (defensive).
 */
export async function isUrlAllowed(url: string, fetcher: RobotsFetcher): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const rules = await loadRules(parsed.hostname, parsed.origin, fetcher);
  const path = parsed.pathname + parsed.search;
  return isPathAllowedByRules(path, rules);
}

/**
 * Capped per-domain `Crawl-delay` (ms) advertised in robots.txt, or 0 when none.
 * Shares the same TTL cache as `isUrlAllowed`, so reading the pacing hint costs no
 * extra fetch. A malformed URL yields 0 (no enforced delay). Consumed by the poll
 * worker to space repeated requests to the same retailer (HANDOVER §14).
 */
export async function getCrawlDelayMs(url: string, fetcher: RobotsFetcher): Promise<number> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 0;
  }
  const rules = await loadRules(parsed.hostname, parsed.origin, fetcher);
  return rules.crawlDelayMs;
}
