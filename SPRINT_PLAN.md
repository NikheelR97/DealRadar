# DEALRADAR — Sprint Plan

> Methodology: 1-week sprints. The `sprint-verify` gate must pass before any sprint is
> marked complete. `docker compose build` must succeed at the end of every sprint.
> Features are NOT marked complete until tests prove they work.

---

## Sprint Calendar

| Sprint | Week | Theme | Gate |
|--------|------|-------|------|
| S0 | W1 | Setup + Document Approval + Docker scaffold | `docker compose up` healthy |
| S1 | W2 | Database schema + backend API skeleton | All endpoints return typed responses |
| S2 | W3 | Scrapers — Tier A (Koodoo, Wootware, iStore) + Takealot | Prices extracted, selectors documented |
| S3 | W4 | Scrapers — Tier B (Evetech, Loot) + Tier C best-effort plugins | Tier B extracts; Tier C degrades to logged `blocked` |
| S4 | W5 | Scheduler (in-process node-cron) + poll worker | Products polled on interval |
| S5 | W6 | Deal scoring algorithm + badge logic | Unit tests for all scoring tiers pass |
| S6 | W7 | Frontend: product cards + add form | E2E: add product, see card |
| S7 | W8 | Frontend: price history chart modal | Chart renders with real data |
| S8 | W9 | Google OAuth login + admin allowlist + settings + notifications | Login works; admin-gated writes; rate limited |
| S9 | W10 | QA gate + security audit + hardening | `sprint-verify` passes, no secrets in builds |
| S10 | W11 | Coolify deployment + Cloudflare Tunnel | Live at deal-radar.nikheelr.com |
| S11 | W12 | (Post-MVP) Public landing surface + AdSense slot | Public `/` content live; ad slot dark behind `ENABLE_ADS` |

---

## Sprint Goals & Deliverables

### S0 — Setup & Scaffold
- Approve `HANDOVER.md` and `SPRINT_PLAN.md`.
- Monorepo workspace (`frontend`, `backend`), shared tsconfig base, ESLint, Prettier.
- `constants.ts`, `env.ts`, `.env.example`.
- Skeleton Dockerfiles + `docker-compose.yml` that boots empty services healthy.
- **Gate:** `docker compose up` → all three services healthy.

### S1 — Database + API skeleton
- `V1__initial_schema.sql` incl. `users`, `products`, `tracked_items` (with `visibility`),
  `price_history`, `scrape_errors`; pg `Pool` client, migration auto-apply on first boot.
- Express app: Helmet, rate-limit, Zod validation middleware, `/api/health`.
- Typed routes wired: `/api/public/*` (anonymous), `/api/me/*` (per-user, owner-scoped),
  `/api/settings` (admin) — returning real DB data (no scraping yet).
- **Gate:** every endpoint returns a typed, Zod-validated response; owner-scoping enforced;
  public routes never leak `user_id`; health checks DB.

### S2 — Scrapers: Tier A (reliable) + Takealot
- `types.ts`, `robots.ts` (fetch + TTL cache), dispatcher `index.ts`.
- **Tier A (Cheerio, SSR-verified):** `koodoo.ts`, `wootware.ts`, `istore.ts` with verified
  selectors + last-verified date comments. iStore: target the rewritten SEO URL (robots gate).
- **Takealot (Puppeteer, CSR):** `takealot.ts`.
- MSW fixtures captured from real pages for offline tests.
- **Gate:** prices extracted from fixtures; selectors documented; robots respected per-URL.

### S3 — Scrapers: Tier B + Tier C (best-effort)
- **Tier B (verify SSR on product URL → Cheerio):** `evetech.ts` (honour 10s crawl-delay),
  `loot.ts` (Next.js). Confirm product-page render before finalising the method.
- **Tier C (best-effort, expected to be blocked):** `makro.ts`, `game-stores.ts`,
  `incredible-connection.ts`, `hificorp.ts`, `amazon.ts`. These hit CAPTCHA/403/anti-bot from
  a home IP; they MUST degrade to a logged `blocked` error in `scrape_errors` — never crash,
  never promised as reliable. No stealth/proxy infrastructure in MVP.
- Out-of-stock path returns `price: null` without overwriting last valid price.
- **Gate:** Tier B extracts real prices; Tier C fails gracefully to `scrape_errors`; no crashes.

### S4 — Scheduler + worker
- In-process `node-cron` tick + `poll.worker.ts`; a Postgres `scheduler_lock` row (or
  `pg_advisory_lock`) is the running-flag guard preventing overlapping ticks. No Redis.
- Batch bounded by `MAX_PRODUCTS_PER_POLL_BATCH`; per-domain delay jitter.
- **Gate:** products polled on their interval; no overlapping ticks observed.

### S5 — Deal scoring
- `scorer.ts`: 90-day median baseline, tier thresholds, Black Friday alert.
- Full unit-test matrix (below).
- **Gate:** all scoring-tier tests pass; coverage thresholds met.

### S6 — Frontend: My Tracked Items page + add form
- API client (`api.ts`), `useTrackedItems` hook, `ProductCard`, `AddProductForm`,
  `DealBadge`, `SkeletonCard`, and a per-item **public/private visibility toggle**
  (default private) calling `PATCH /api/me/items/:id`.
- Footer **"Support on Ko-fi ☕"** outbound link (rendered only when `KOFI_URL` is set);
  no embedded script/SDK. Never gates any feature.
- **Gate:** Playwright E2E — sign in, add an item (lands private), toggle to public,
  see the card reflect state; another user cannot see it on their page.

### S7 — Frontend: price history modal
- `usePriceHistory` hook, `PriceHistoryModal` with chart (Recharts).
- **Gate:** chart renders from real paginated history data.

### S8 — Google OAuth login + admin allowlist + settings + notifications
- `auth.ts`: Google OAuth2/OIDC Authorization-Code + PKCE flow, signed `state` (CSRF),
  `email_verified` check, stateless JWT in an `httpOnly`/`Secure`/`SameSite=Lax` cookie.
- `ADMIN_EMAILS` allowlist drives the admin tier; middleware `requireLogin` / `requireAdmin`.
- Provider plugin structure so Apple/Facebook are later one-file adds.
- Settings routes; optional webhook/email notification on Black Friday alert.
- **Gate:** Google login works; read routes need login; write routes need admin;
  auth endpoints rate-limited; settings persist.

### S9 — QA gate + security audit
- `check-no-secrets-in-build.js`, full security test suite, hardening pass.
- **Gate:** `sprint-verify` passes; no secrets found in `dist/`.

### S10 — Deployment
- Coolify compose deploy; Cloudflare Tunnel ingress; DNS; service install.
- **Gate:** live and healthy at `deal-radar.nikheelr.com`.

### S11 — Public site + AdSense (post-MVP)
- Public, crawlable `/`: renders **anonymous public items** (`/api/public/items`) plus
  original content (scoring explainer, buying guides, FAQ); no login; nginx serves it with a
  relaxed ad-only CSP separate from the private `/app`.
- `AdSlot` component + consent/CMP banner (POPIA/GDPR), gated by `ENABLE_ADS` (default off)
  and `ADS_CLIENT_ID`. Ships dark; enabled only after AdSense approval **and** resolving the
  scraped-content-vs-ads policy risk (§16): substantial original content, link-out not mirror,
  per-retailer terms check.
- Private app keeps strict `default-src 'self'` CSP — no ad scripts on any authenticated page.
- **Gate:** public site renders public items anonymously (no `user_id` leak) with real
  original content; ad slot stays dark until approved; no ad/CMP script loads on `/app`.

---

## Sprint Verification Gate

```bash
#!/bin/bash
# scripts/sprint-verify.sh  — run from repo root
set -e
npx tsc --noEmit -p backend/tsconfig.json   || { echo "FAIL: Backend TS"; exit 1; }
npx tsc --noEmit -p frontend/tsconfig.json  || { echo "FAIL: Frontend TS"; exit 1; }
npm run lint --workspaces                   || { echo "FAIL: ESLint"; exit 1; }
npm run test --workspaces                   || { echo "FAIL: Tests"; exit 1; }
npm run test:coverage --workspaces          || { echo "FAIL: Coverage"; exit 1; }
npm run build --workspaces                  || { echo "FAIL: Build"; exit 1; }
docker compose build                        || { echo "FAIL: Docker build"; exit 1; }
docker compose up -d
sleep 15
wget -qO- http://localhost:8080             || { echo "FAIL: Frontend health"; docker compose down; exit 1; }
wget -qO- http://localhost:3001/api/health  || { echo "FAIL: Backend health"; docker compose down; exit 1; }
docker compose down
echo "=== ALL GATES PASSED ==="
```

---

## Required Tests Per Sprint

### S5 — Deal Scoring (critical correctness)

```typescript
describe('calculateDealScore', () => {
  it('throws on empty price history array', () => { /* */ });
  it('returns NOT_A_DEAL for < DEAL_THRESHOLD_MODEST_PCT drop', () => { /* */ });
  it('returns MODEST for 5–15% drop', () => { /* */ });
  it('returns GOOD for 15–30% drop', () => { /* */ });
  it('returns EXCEPTIONAL for 30%+ drop', () => { /* */ });
  it('uses 90-day baseline, not all-time high', () => { /* */ });
  it('flags Black Friday alert for 10%+ drop after November 1', () => { /* */ });
  it('returns OUT_OF_STOCK when current price is null', () => { /* */ });
});
```

### S2/S3 — Scraper correctness

```typescript
describe('retailer scrapers', () => {
  it('extracts price from a known fixture page', () => { /* */ });
  it('returns price:null on out-of-stock without throwing', () => { /* */ });
  it('throws ScraperError(parse_error) on missing selector', () => { /* */ });
  it('throws ScraperError(robots_disallowed) when path disallowed', () => { /* */ });
  it('bounds retries by MAX_SCRAPE_RETRIES', () => { /* */ });
});
```

### S9 — Security (critical)

```typescript
describe('Security', () => {
  it('rejects URLs not matching retailer allowlist', () => { /* */ });
  it('rejects URLs exceeding MAX_URL_LENGTH', () => { /* */ });
  it('rejects non-https URLs', () => { /* */ });
  it('rejects mutating routes without a valid JWT cookie', () => { /* */ });
  it('returns 404 when acting on a tracked_item the caller does not own', () => { /* */ });
  it('never returns private items in /api/public responses', () => { /* */ });
  it('never serialises user_id/email in /api/public responses', () => { /* */ });
  it('defaults new tracked_items to private visibility', () => { /* */ });
  it('enforces MAX_TRACKED_PRODUCTS per user, not globally', () => { /* */ });
  it('rejects admin routes for a logged-in non-allowlisted email', () => { /* */ });
  it('rejects an OAuth callback with a mismatched state (CSRF)', () => { /* */ });
  it('rejects a callback when email_verified is false', () => { /* */ });
  it('rate limits the OAuth endpoints', () => { /* */ });
  it('never returns stack traces in production error responses', () => { /* */ });
  it('uses parameterised queries — no SQL injection surface', () => { /* */ });
  it('does not expose DATABASE_URL or client secrets in any API response', () => { /* */ });
  it('skips scraping when robots.txt disallows the path', () => { /* */ });
});
```

---

## Testing Framework

- **Vitest** — unit: deal scorer, URL validator, price parser, robots cache.
- **Supertest** — API route integration.
- **React Testing Library** — `ProductCard`, `DealBadge`, `PriceHistoryModal`.
- **Playwright** — E2E: add product, view card, open history modal.
- **MSW** — mock all outbound scraping in tests; never hit real retailer pages in CI.

### Coverage Thresholds

```typescript
// vitest.config.ts
coverage: {
  thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 }
}
```

---

## `package.json` QA Scripts

```json
{
  "scripts": {
    "dev":           "concurrently \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "lint":          "eslint . --max-warnings=0",
    "type-check":    "tsc --noEmit",
    "test":          "vitest run",
    "test:watch":    "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e":      "playwright test",
    "test:security": "node scripts/check-no-secrets-in-build.js",
    "qa":            "npm run type-check && npm run lint && npm run test && npm run build",
    "sprint-verify": "bash scripts/sprint-verify.sh",
    "docker:build":  "docker compose build",
    "docker:up":     "docker compose up -d",
    "docker:logs":   "docker compose logs -f",
    "docker:down":   "docker compose down"
  }
}
```

`scripts/check-no-secrets-in-build.js` scans every file in `frontend/dist/` and
`backend/dist/` for patterns matching known secret env var formats. Exits `1` on any
match. Blocks deployment.

---

## Deferral Policy (standing rule)

**Whenever we defer anything** — a review finding, a known limitation, a "good
idea but not now," a workaround, a TODO that outlives the PR — it MUST be logged in
the Deferral Log below **in the same change that creates the deferral**. Nothing is
deferred silently. Each entry records three things:

- **Finding** — what is being deferred, specifically enough to act on later.
- **Why deferred** — the reason it is safe/correct to leave for now.
- **Revisit at** — the concrete trigger to come back: a named sprint (e.g. **S9**),
  or an explicit condition when no sprint owns it (e.g. "if row counts exceed 10^13").

If a deferral has no plausible revisit trigger, it is not a deferral — either do it
now or decide explicitly not to do it. Group entries by the sprint that raised them.

## Deferral Log

### S0/S1 (Santa-Loop Round 2 Findings — 2026-05-31)

The santa-loop dual-review passed on round 2. The following were raised as
non-blocking suggestions and **explicitly deferred** to named future sprints.
Revisit them when the corresponding sprint opens.

| # | Finding | Why deferred | Revisit at |
|---|---------|--------------|------------|
| 1 | **Frontend nginx runs as root** (image default). HANDOVER §8 only claims a non-root runtime for the app container; nginx master-as-root is standard, but tightening it is good practice. | Not a stated S0/S1 requirement; fixing requires a custom nginx Dockerfile layer. Scope it with the full security hardening pass. | **S9** |
| 2 | **BIGINT primary keys mapped via `Number()` in `items.service.ts`**. JS numbers are exact up to 2^53 (~9 quadrillion), safe for any realistic row count, but silent precision loss is possible at extreme scale. | Not a current risk; row counts for a self-hosted MVP will never approach 2^53. String serialisation of IDs would require an API change and client updates. | Only if row counts ever exceed ~10^13, or if a BIGINT id is ever passed to a JSON consumer that doesn't handle 64-bit integers (e.g. mobile SDK). No scheduled sprint — log it when relevant. |
| 3 | **Two defensively-unreachable branches in `me.ts`**: the `!req.user` guard after `requireLogin` (line ~33, cannot fire because `requireLogin` already throws) and the `?? 'invalid url'` fallback (line ~59, all `UrlValidation` reasons are covered). Both count as uncovered branches in the coverage report but are harmless. | Removing them tightens the code but adds zero safety value. The coverage tool sees them as branches; they don't affect the 85/80 gate. | **S9** — tidy during the hardening/refactor pass. |
| 4 | **`getPublicItemHistory` returns `200 []` (not `404`) when the product has no public tracker**. This is an intentional anonymity choice — the public API never reveals whether a product exists but is private. | Both reviewers accepted this as correct behaviour. Documenting intent here so a future reader doesn't mistake it for a missing guard. | No change needed; **document the intent in a code comment** when touching the service in S6/S7. |
| 5 | **`ENABLE_ADS`, `ADS_CLIENT_ID`, and `KOFI_URL` are not modelled in `env.ts`** — they are read as raw `import.meta.env` strings in the frontend. `env.ts` is the single validated source of truth for backend env only; these are frontend-only and post-MVP. | S11 scope. Adding them to `env.ts` prematurely would expand the backend's env surface for variables it never reads. | **S11** — when implementing the public AdSense surface, add `ENABLE_ADS`/`ADS_CLIENT_ID` to a validated frontend env schema. |

### S2 (Scrapers — Tier A + Takealot — 2026-06-01)

| # | Finding | Why deferred | Revisit at |
|---|---------|--------------|------------|
| 1 | **Retailer CSS selectors are not live-verified against production pages.** Each scraper parses structured data first (schema.org `Product` JSON-LD + OpenGraph price meta) with documented CSS fallbacks; every retailer file carries a `NOT YET LIVE-VERIFIED` header + the HANDOVER §4 verification checklist. | No reliable way to capture and confirm live retailer HTML in the build environment; the structured-data-first strategy minimises selector dependence and degrades to a logged `parse_error` rather than crashing. | **Before production polling (end of S2/S3 sign-off, or S4 when the worker goes live):** open each retailer on a real product URL, confirm the JSON-LD/meta path resolves, and fill in the `last-verified` date + fallback selectors. |
| 2 | **Takealot Puppeteer launch is not exercised end-to-end** — unit tests parse a rendered-shell fixture; the real headless-Chromium fetch (`fetchers.ts`) is coverage-excluded as an I/O boundary. The backend image was built and Chromium 124 confirmed at `/usr/bin/chromium-browser`, but an actual live render was not run. | Launching real Chromium against takealot.com from CI is unreliable (anti-bot, network) and out of scope for the fixture-based S2 gate. | **S4** — when the poll worker runs, verify a real Takealot render extracts a price (or degrades to a logged `blocked`); add an integration smoke test. |
| 3 | **robots.txt `crawl-delay` is parsed but not enforced** (HANDOVER §14). Evetech advertises a 10s crawl-delay (Tier B). | Per-domain pacing belongs with the scheduler/outbound-throttle work, not the per-URL allow gate. | **S3/S4** — honour `crawl-delay` (cap at `SCRAPE_CRAWL_DELAY_MAX_MS`) in the per-domain delay logic when Evetech/Loot land. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Retailer selector drift | High | Medium | Single-file isolation; parse_error logging; verify-before-deploy |
| Anti-bot blocking (Takealot/Amazon) | Medium | High | Delay jitter; retry cap; degrade to logged error, no crash |
| robots.txt disallows scraping | Medium | High | Skip + log; document gap; reconsider retailer if fully blocked |
| Chromium in Alpine Docker | Medium | Medium | Pin chromium pkg; `PUPPETEER_EXECUTABLE_PATH`; documented `--no-sandbox` |
| Cloudflare Tunnel instability | Low | Medium | `cloudflared service install` auto-restart |

---

## Definition of Done (per feature)

1. Code complies with all ten governing laws (self-review passed).
2. TypeScript compiles `strict`, zero ESLint warnings.
3. Unit/integration/E2E tests written and passing; coverage thresholds met.
4. `docker compose build` succeeds; service healthy.
5. No secrets in committed files or build output.
6. Relevant docs (`HANDOVER.md` / `DEPLOYMENT.md`) updated.
