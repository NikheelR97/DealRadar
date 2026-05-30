# DEALRADAR — Developer Handover Document

**Last updated:** 2026-05-30
**Project:** Black Friday DealRadar
**URL:** deal-radar.nikheelr.com (via Cloudflare Tunnel)
**Hosting:** Coolify on local machine + Cloudflare Tunnel

---

## 1. What Is This Application?

The DealRadar is a self-hosted price-tracking web application focused on the South
African Black Friday period. A user pastes a product URL from a supported retailer; the
system periodically scrapes that product's price, stores a price history, and computes a
**deal score** that tells the user whether the current price is a genuine discount relative
to the product's recent baseline (not a fake "was/now" markup).

**User journey:**

1. User opens `deal-radar.nikheelr.com` and signs in with Google.
2. User pastes a product URL into the Add Product form.
3. The server validates the URL (scheme, domain allowlist, length, robots.txt) and accepts it.
4. A background worker scrapes the price on a schedule (default every 4 hours).
5. The product appears as a card with current price, a deal badge (🟡 / 🟢 / ⭐), and stock status.
6. The user opens a price-history modal to see the trend over time.
7. During Black Friday, products dropping ≥10% after 1 November are flagged with an alert.

**Value proposition:** Cuts through inflated "Black Friday" pricing by scoring discounts
against a rolling 90-day baseline, so the user only acts on real deals.

**Ownership & visibility:** the app is **multi-tenant by ownership**. Each signed-in user
has their own tracked-items page and may set each item **public** or **private** (default
**private**). Public items appear on the unauthenticated **public site** (anonymously — no
user identity shown); private items are visible only to their owner. The underlying product
catalogue is **shared/deduplicated** — a URL is scraped once even if many users track it.
Any signed-in user manages their own items; the `ADMIN_EMAILS` allowlist governs **global
settings only**, not other users' items.

**Explicitly out of scope for MVP:** retailer checkout automation, browser-extension
capture, mobile app, social graph/following. Access is gated by **Google sign-in**
(OAuth/OIDC); Apple and Facebook sign-in are planned but deferred (see §14). The public site
(public items + AdSense) is post-MVP scope (see §16, sprint S11).

---

## 2. Architecture Overview

```
                ┌──────────────────────────────────────────────┐
   Browser ───► │ Cloudflare Edge (TLS, DDoS, Access optional)  │
                └───────────────────────┬──────────────────────┘
                                        │ Cloudflare Tunnel (cloudflared)
                                        ▼
                ┌──────────────────────────────────────────────┐
                │ Coolify host (local machine)                  │
                │                                              │
                │   frontend (nginx:80) ──► backend (3001) ──► │
                │                                  │           │
                │                                  ▼           │
                │                            postgres (5432)   │
                └──────────────────────────────────────────────┘

Scraper worker loop (inside backend container — in-process node-cron, no Redis):
  scheduler tick ──► acquire scheduler lock (Postgres) ──► poll batch (≤ MAX_PRODUCTS_PER_POLL_BATCH)
       │                       │
       │                       ▼
       │            for each product (bounded):
       │              check robots.txt cache ──► scrape (≤ MAX_SCRAPE_RETRIES)
       │                       │                        │
       │                       ▼                        ▼
       │              write price_history        on failure → scrape_errors
       └──────── running-flag guard prevents overlapping ticks
```

All inter-service traffic uses Docker Compose **service names** (`postgres`, `backend`)
on a named bridge network `deal-radar-net`. Nothing but the frontend host port is
exposed to the host; Cloudflare Tunnel terminates at `localhost:8080`.

---

## 3. Coding Standards — NASA/JPL Power of Ten

All ten laws are enforced. Examples below use real patterns from this codebase.

### Law 1 — Simple Control Flow (max nesting depth 3, prefer guard clauses)

```typescript
// BAD — nested conditional tree
function parsePrice(raw: string): number | null {
  if (raw) {
    if (raw.includes('R')) {
      if (!raw.includes('Out of Stock')) {
        return Number(raw.replace(/[^\d.]/g, ''));
      }
    }
  }
  return null;
}

// GOOD — guard clauses, linear chain
function parsePrice(raw: string): number | null {
  if (!raw) return null;
  if (raw.includes('Out of Stock')) return null;
  const digits = raw.replace(/[^\d.]/g, '');
  if (digits.length === 0) return null;
  return Number(digits);
}
```

### Law 2 — Fixed Loop Bounds

```typescript
// Every retry loop is bounded by a named constant
for (let attempt = 1; attempt <= MAX_SCRAPE_RETRIES; attempt++) {
  const result = await tryScrape(url);
  if (result.ok) return result.value;
  await delay(jitter(SCRAPE_DELAY_MIN_MS, SCRAPE_DELAY_MAX_MS));
}
throw new ScraperError('timeout', retailer, 'retries exhausted');
```

### Law 3 — No Unbounded Allocations

```typescript
// Price history API always paginated and capped
const limit = Math.min(requested ?? MAX_HISTORY_RECORDS, MAX_HISTORY_RECORDS);
const rows = await query(SELECT_HISTORY_SQL, [productId, limit]);
```

### Law 4 — Function Length ≤ 60 lines of logic

Route handlers are thin: `validate → call service → return`. Business logic lives in
service modules. React components over 60 JSX lines are split into named sub-components.

### Law 5 — Minimum Two Assertions Per Function

```typescript
function calculateDealScore(history: PriceRecord[]): DealScore {
  if (history.length === 0) throw new Error('empty history');         // assertion 1
  const current = history[0];
  if (current.price === null) return { tier: 'OUT_OF_STOCK', pct: 0 }; // assertion 2
  // ... scoring
}
```

### Law 6 — Smallest Possible Scope

Variables declared at point of use. No module-level mutable state except the explicitly
designed `robotsCache` (TTL `ROBOTS_TXT_CACHE_TTL_MS`). All secrets read only from
`env.ts` server-side.

### Law 7 — Check Every Return Value

```typescript
const res = await fetch(url, { signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS) });
if (!res.ok) throw new ScraperError('blocked', retailer, `status ${res.status}`);
const ctype = res.headers.get('content-type') ?? '';
if (!ctype.includes('text/html')) throw new ScraperError('parse_error', retailer, ctype);

const result = await pool.query(INSERT_PRICE_SQL, params);
if (result.rowCount !== 1) throw new Error('price insert affected 0 rows');
```

### Law 8 — Minimal Magic

No magic numbers anywhere. All thresholds, timeouts, intervals, limits are named
constants in `backend/src/config/constants.ts` and `frontend/src/lib/constants.ts`.
Every CSS selector carries a comment naming the retailer page and last-verified date.

### Law 9 — Reference Discipline (≤ 2 levels nested access)

```typescript
// BAD
const checkedAt = result.rows[0].price_history[0].checked_at;

// GOOD
const [row] = result.rows;
const [latest] = row.priceHistory;
const checkedAt = latest.checkedAt;
```

### Law 10 — Zero Warnings Policy

`strict: true` both frontend and backend. ESLint `@typescript-eslint/recommended` with
`--max-warnings=0`. `docker build` must complete with zero errors/warnings.
`npm run qa` is the deploy gate.

---

## 4. Retailer Scraper Reference

> ⚠️ **CRITICAL:** Exact CSS selectors remain **UNVERIFIED** until confirmed against a live
> product URL during S2/S3. The columns below (access, render mode, robots) **were live-
> verified on 2026-05-30** via `robots.txt` + no-JS HTML probes. The scraper architecture
> isolates each retailer to a single file so a broken selector degrades to a logged
> `parse_error`, never a crash; a bot-blocked fetch degrades to a logged `blocked` error.

**Tiering (decided):** retailers are grouped by how reliably they can be scraped from a
self-hosted/home IP. **MVP builds Tier A + Tier B.** Tier C ships as **best-effort plugins**
that are expected to be blocked often and must degrade gracefully — never promised as reliable.

| Retailer | Domain | Access (home IP) | Render | robots: product page | Method | Tier |
|----------|--------|------------------|--------|----------------------|--------|------|
| Koodoo | `koodoo.co.za` | ✅ open | **SSR** | ✅ allowed (Shopify) | **Cheerio** | 🟢 A |
| Wootware | `www.wootware.co.za` | ✅ open | **SSR** | ✅ allowed (Magento 1.x) | **Cheerio** | 🟢 A |
| iStore | `www.istore.co.za` | ✅ open | **SSR** | ⚠️ internal path blocked* | **Cheerio** | 🟢 A |
| Takealot | `www.takealot.com` | ✅ open | **CSR** | ✅ allowed | **Puppeteer** | 🟡 B |
| Evetech | `www.evetech.co.za` | ✅ open | product likely SSR | ⚠️ blocked* + **10s delay** | Cheerio (verify) | 🟡 B |
| Loot | `www.loot.co.za` | ✅ open | product likely SSR (Next.js) | ✅ allowed | Cheerio (verify) | 🟡 B |
| Makro | `www.makro.co.za` | ❌ **CAPTCHA** | — | ✅ allowed | best-effort | 🔴 C |
| Game | `www.game.co.za` | ❌ **CAPTCHA** | — | ✅ allowed | best-effort | 🔴 C |
| Incredible Connection | `www.incredible.co.za` | ❌ **403** | — | ⚠️ blocked* | best-effort | 🔴 C |
| HiFi Corp | `www.hificorp.co.za` | ❌ **403** | — | ⚠️ blocked* | best-effort | 🔴 C |
| Amazon SA | `www.amazon.co.za` | ❌ strong anti-bot | SSR | ✅ `/dp/` allowed | best-effort | 🔴 C |

Currency is **ZAR** for all. `*` = Magento `Disallow: /catalog/product/view/` (the internal
route); the user-facing **rewritten** SEO URL is typically allowed, and our runtime robots
gate decides per actual URL. Makro + Game share the Massmart platform (same CAPTCHA wall).

**Source-selection policy (decided):** the dispatcher prefers an **official feed/API**
for a retailer when one exists and its terms permit programmatic access. Scraping is the
fallback, used only where no feed exists **and** `robots.txt` allows the product path.
Each retailer file records, in its header, whether an official source was found and why
the chosen `source` (`'api' | 'cheerio' | 'puppeteer'`) was selected.

**Per-retailer verification checklist (done during S2/S3):**
- [ ] Confirm exact hostname(s) used in live product URLs.
- [ ] Confirm whether price is server-rendered (Cheerio OK) or JS-rendered (Puppeteer).
- [ ] Record working selectors for price, stock indicator, product name, image.
- [ ] Record the verification date in the file header comment.
- [ ] Confirm `robots.txt` does not disallow the product path.
- [ ] Document any observed anti-scraping measures.

**Out-of-stock handling:** when stock indicator shows unavailable, the scraper returns
`{ price: null, inStock: false }`. The persistence layer records a history row with
`price = NULL` and **never overwrites** the last known valid price.

---

## 5. Deal Scoring Algorithm

**Inputs:** the product's price history (most recent first), bounded to the 90-day
baseline window (`DEAL_BASELINE_DAYS`).

**Baseline:** the **median of valid (in-stock) prices over the last 90 days**, not the
all-time high and not the inflated "was" price. Using the recent baseline defeats fake
markdowns.

**Discount %** = `(baseline - currentPrice) / baseline * 100`.

| Discount %                                   | Tier          | Badge |
|----------------------------------------------|---------------|-------|
| `< DEAL_THRESHOLD_MODEST_PCT` (< 5%)         | NOT_A_DEAL    | — (no badge) |
| `5% ≤ x < 15%` (`DEAL_THRESHOLD_MODEST_PCT`) | MODEST        | 🟡 |
| `15% ≤ x < 30%` (`DEAL_THRESHOLD_GOOD_PCT`)  | GOOD          | 🟢 |
| `≥ 30%` (`DEAL_THRESHOLD_EXCEPTIONAL_PCT`)   | EXCEPTIONAL   | ⭐ |
| current price is `null`                      | OUT_OF_STOCK  | (stock pill) |

**Black Friday alert:** if the current date is on/after 1 November and the discount is
`≥ BLACK_FRIDAY_ALERT_THRESHOLD_PCT` (10%), the score carries `blackFridayAlert: true`,
which the UI surfaces and the notification service may dispatch.

**Edge cases (must be unit-tested):** empty history → throws; single record → no
baseline, returns NOT_A_DEAL with note; all out-of-stock → OUT_OF_STOCK.

---

## 6. Database Schema

Tables: `users`, `products`, `tracked_items`, `price_history`, `scrape_errors`.
PostgreSQL 16.

**Ownership model:** a `product` is **canonical per URL** — scraped once regardless of how
many people track it. A `tracked_item` is one user's tracking of one product, carrying its
own **visibility** (`public` | `private`). This deduplicates scraping and lets two users
track the same product with different visibility.

- `users`: one row per Google-authenticated user. `email` UNIQUE (lowercased). Admin status
  is **not stored** — it is derived at request time from the `ADMIN_EMAILS` allowlist
  (single source of truth). Columns: `id`, `email`, `created_at`, `last_login_at`.
- `products`: one **canonical** row per URL (unique). No owner. CHECK constraints enforce
  URL length ≤ 2048 and poll interval ∈ [2, 12]. `is_active` reflects whether any tracker
  still references it.
- `tracked_items`: `(id, user_id → users, product_id → products, visibility, added_at)`.
  `visibility` is an enum defaulting to **`'private'`**. `UNIQUE (user_id, product_id)` — a
  user tracks a product at most once. `ON DELETE CASCADE` from both parents.
- `price_history`: append-only observations keyed by **`product_id`** (shared across all
  trackers). `price` nullable (out of stock), positive when present; `scrape_source` records
  the extraction method.
- `scrape_errors`: sanitised error log keyed by `product_id` (no stack traces); typed
  `error_type`.

**Visibility rule:** a product is shown on the **public** site iff it has **at least one**
`tracked_item` with `visibility = 'public'`. Public responses are **anonymous** — they never
include `user_id`, email, or which user made it public.

**Per-user cap:** `MAX_TRACKED_PRODUCTS` is enforced **per user** over their `tracked_items`,
not globally.

**Indexes:** `(product_id, checked_at DESC)` on price_history; `(user_id)` on tracked_items;
partial index on `tracked_items (product_id) WHERE visibility = 'public'`; partial index on
active products; `(product_id, occurred_at DESC)` on scrape_errors.

**Migrations:** plain SQL files in `backend/src/db/migrations/`, applied on first Postgres
start via `/docker-entrypoint-initdb.d`. `V1__initial_schema.sql` now includes `users` and
`tracked_items`; future changes are additive (`V2__…`).

---

## 7. API Endpoints

| Method | Path | Auth | Rate limit | Body / Query | Response |
|--------|------|------|-----------|--------------|----------|
| GET | `/api/health` | none | global | — | `{ status, db }` |
| GET | `/api/auth/google` | none | 20 / 15 min | — | `302` → Google consent (sets `state`+PKCE) |
| GET | `/api/auth/google/callback` | none | 20 / 15 min | `?code&state` | `302` → app; sets JWT cookie |
| GET | `/api/auth/me` | login | global | — | `{ email, isAdmin }` |
| POST | `/api/auth/logout` | login | global | — | `204` (clears cookie) |
| **Public (no auth) — anonymous, public items only** ||||||
| GET | `/api/public/items` | none | global | `?page&limit` | `PublicItem[]` (no user identity) |
| GET | `/api/public/items/:productId/history` | none | global | `?limit≤MAX_HISTORY_RECORDS` | `PriceRecord[]` |
| **Per-user — scoped to the caller's own tracked_items** ||||||
| GET | `/api/me/items` | login | global | `?page&limit` | `TrackedItem[]` (own only) |
| POST | `/api/me/items` | login | scrape (10/min) | `{ url, visibility? }` | `202 { trackedItemId, status:'accepted' }` |
| PATCH | `/api/me/items/:id` | login (owner) | global | `{ visibility }` | `{ ok }` |
| DELETE | `/api/me/items/:id` | login (owner) | global | — | `204` (untrack) |
| GET | `/api/me/items/:id/history` | login (owner) | global | `?limit≤MAX_HISTORY_RECORDS` | `PriceRecord[]` |
| **Admin — global config only** ||||||
| GET | `/api/settings` | admin | global | — | `{ pollIntervalHours }` |
| PUT | `/api/settings` | admin | global | `{ pollIntervalHours }` | `{ ok }` |

**Behaviour notes:**
- `POST /api/me/items` adds a tracker: if a canonical `product` for the URL already exists it
  reuses it (no re-scrape scheduled if recently checked); otherwise it creates the product and
  schedules the first scrape. `visibility` defaults to **`private`**.
- Owner checks: `PATCH`/`DELETE`/`/me/items/:id/history` return `404` (not `403`) when the
  `tracked_item` is not owned by the caller — avoids leaking existence.
- `DELETE /api/me/items/:id` removes only that user's tracker. When the **last** tracker for a
  product is removed, the product is marked `is_active = false` (polling stops); price history
  is retained per `PRICE_HISTORY_RETENTION_MONTHS`.
- Public endpoints select only products with ≥1 public tracker and **never** return `user_id`,
  email, or per-user fields.

All request bodies validated with Zod (`*.schema.ts`). All responses typed. Errors in
production return `{ error: { code, message } }` only — never stack traces.

---

## 8. Docker Architecture

```
postgres (healthcheck: pg_isready)
   ▲ depends_on: service_healthy
backend  (healthcheck: GET /api/health)
   ▲ depends_on: service_healthy
frontend (healthcheck: GET :80)  ──► host port ${HOST_PORT:-8080}
```

- Multi-stage Dockerfiles; **non-root** runtime user `dealradar` (uid/gid 1001).
- All base images **pinned** (`node:20.11-alpine3.19`, `postgres:16.2-alpine3.19`,
  `nginx:1.25-alpine`) — no `:latest`.
- Named volume `postgres-data` for DB persistence; named network `deal-radar-net`.
- Secrets passed only as runtime environment variables — never baked into layers.
- Each service has a `HEALTHCHECK` so Coolify reports accurate status.

---

## 9. Environment Variables

| Variable | Req? | Description | Example |
|----------|------|-------------|---------|
| `NODE_ENV` | yes | runtime mode | `production` |
| `PORT` | no | backend port (default 3001) | `3001` |
| `POSTGRES_USER` | yes | DB user | `dealradar` |
| `POSTGRES_PASSWORD` | yes | DB password | `<strong>` |
| `POSTGRES_DB` | yes | DB name | `dealradar` |
| `DATABASE_URL` | yes | full connection string | `postgres://user:pass@postgres:5432/dealradar` |
| `SESSION_SECRET` | yes | ≥32 chars, signs the JWT auth cookie | `<random 32+>` |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client ID | `xxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret | `<secret>` |
| `APP_BASE_URL` | yes | public origin (builds OAuth redirect URI) | `https://deal-radar.nikheelr.com` |
| `ADMIN_EMAILS` | yes | comma-separated admin email allowlist | `rajmannikheel@gmail.com` |
| `HOST_PORT` | no | host port Coolify proxies | `8080` |
| `NOTIFICATION_WEBHOOK_URL` | no | webhook for alerts | (blank) |
| `RESEND_API_KEY` | no | email alerts | (blank) |
| `ALERT_EMAIL_TO` | no | alert recipient | (blank) |
| `PUPPETEER_EXECUTABLE_PATH` | no | chromium path in Docker | `/usr/bin/chromium` |
| `ENABLE_ADS` | no | enable ad slot on public landing (default `false`) | `false` |
| `ADS_CLIENT_ID` | no | AdSense publisher ID (landing surface only) | `ca-pub-xxxxxxxx` |
| `KOFI_URL` | no | public Ko-fi page link for the footer (no link if unset) | `https://ko-fi.com/yourname` |

Secrets live only in the host `.env` (git-ignored). Repo ships `.env.example` with
placeholders only.

---

## 10. All Named Constants

The authoritative list lives in `backend/src/config/constants.ts` (scraping, deal
thresholds, history caps, scheduler bounds, security, retention, HTTP timeouts) and
`frontend/src/lib/constants.ts` (poll/display caps, badge thresholds mirrored read-only).
See the project brief's "All Named Constants" section — it is reproduced verbatim into
`constants.ts` as deliverable #3. No magic numbers exist outside these files.

---

## 11. Security Model

**Core principle:** the server is a one-way proxy. The user never controls what the
scraper fetches beyond submitting a URL that must pass every gate.

- **URL validation:** must be `https://`, hostname must be on the retailer allowlist,
  length ≤ `MAX_URL_LENGTH`. Anything else → `400`.
- **robots.txt:** fetched and cached per domain (`ROBOTS_TXT_CACHE_TTL_MS`); disallowed
  paths are skipped and logged as `robots_disallowed`.
- **Authentication — Google OAuth (OIDC):** the admin PIN is removed. Access is gated by
  signing in with Google. The server runs the OAuth2/OIDC Authorization-Code flow with PKCE
  and a signed `state` parameter (CSRF defence). On a verified callback the server reads the
  user's email (`email_verified` must be `true`) and issues a **stateless JWT** (HS256,
  signed with `SESSION_SECRET`, short TTL) set as an `httpOnly`, `Secure`, `SameSite=Lax`
  cookie. No server-side session store — the JWT signature is the source of truth.
  `auth.ts` runs the flow and signs/verifies the cookie.
- **Provider plugin model:** Google is implemented now. Apple and Facebook are deferred; the
  auth layer is structured so each added provider is a single strategy file — no core change.
- **Authorisation (tiers):** any logged-in user manages **their own** `tracked_items`
  (add / set visibility / untrack). A user is an **admin** iff their verified email is in the
  `ADMIN_EMAILS` allowlist; admin gates **global settings only**, never other users' items.
- **Per-user ownership enforcement:** every `/api/me/*` query is filtered by the caller's
  `user_id` server-side (never trusts a client-supplied id). Acting on an item the caller
  does not own returns **`404`** (not `403`) to avoid leaking existence.
- **Visibility / privacy:** private items never appear in any public response. Public
  endpoints (`/api/public/*`) select only products with ≥1 public tracker and **never**
  serialise `user_id`, email, or any per-user field — public listings are anonymous. The
  visibility filter is applied in SQL, not in the client.
- **DB:** all queries parameterised — no string interpolation.
- **Errors:** production responses never include stack traces, file paths, or DB errors.
- **Rate limiting:** `express-rate-limit` globally; scrape endpoints stricter (10/min/IP).
- **Headers:** Helmet (CSP `default-src 'self'`, HSTS 1y, noSniff, frameguard deny,
  strict-origin-when-cross-origin referrer).
- **Outbound throttle:** per-domain delay jitter `SCRAPE_DELAY_MIN_MS`–`SCRAPE_DELAY_MAX_MS`.

---

## 12. Coolify Deployment

1. In Coolify, create a new **Project** → **Resource** → **Docker Compose**.
2. Point it at this repo (Git source) or paste `docker-compose.yml`.
3. Set all environment variables from §9 in the Coolify **Environment** tab (mark
   secrets as secret). Do **not** commit them.
   - **Google OAuth setup:** in Google Cloud Console create an OAuth 2.0 Client
     (type *Web application*). Authorised redirect URI:
     `https://deal-radar.nikheelr.com/api/auth/google/callback`. Copy the client ID/secret
     into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set `APP_BASE_URL` to the public
     origin, and list admin addresses in `ADMIN_EMAILS`.
4. Set the exposed port to `${HOST_PORT}` (default 8080); Coolify's proxy maps it.
5. Enable health-check monitoring — Coolify reads the per-service `HEALTHCHECK`.
6. Deploy. Confirm all three services report healthy.
7. Verify `http://localhost:8080` serves the UI and `:3001/api/health` returns OK
   on the Docker network.

Full step-by-step is duplicated in `DEPLOYMENT.md`.

---

## 13. Cloudflare Tunnel Configuration

1. Install `cloudflared` on the Coolify host.
2. `cloudflared tunnel login` (authorises against the Cloudflare account).
3. `cloudflared tunnel create deal-radar` → records `TUNNEL_ID` and credentials JSON.
4. Create `~/.cloudflared/config.yml` with an ingress rule routing
   `deal-radar.nikheelr.com` → `http://localhost:8080`, plus the required catch-all
   `http_status:404`.
5. `cloudflared tunnel route dns deal-radar deal-radar.nikheelr.com`.
6. Install as a service for auto-restart: `cloudflared service install`.
7. (Optional) Add a Cloudflare **Access** policy to restrict the admin surface.

---

## 14. Known Limitations and Future Work

- **CSS selector stability:** retailer DOMs change without notice. Selectors are
  single-file isolated and failures are logged, but breakage requires manual re-verify.
- **Anti-scraping:** Takealot/Amazon may block datacentre IPs; no proxy rotation in MVP.
- **robots.txt nuance:** we honour path disallows but do not parse crawl-delay directives.
- **Auth scope:** Google sign-in only at MVP; **Apple and Facebook are deferred** (Apple
  needs a paid Apple Developer account and a rotating signed-JWT client secret; Facebook
  needs Meta app review for the email permission). Each is a single added strategy file.
- **Multi-tenant by ownership, shared catalog:** users own `tracked_items` and set each
  public/private; the underlying product (and its scraping) is deduped/shared. Admin tier is
  by email allowlist and governs global settings only.
- **Retailer APIs:** none assumed available; scraping only. If official APIs with
  permissive terms are confirmed, prefer them.
- **Post-MVP:** Apple/Facebook login, public site + AdSense (§16), proxy pool, email/Discord
  alerts, per-product target-price alerts, CSV export, archival beyond `PRICE_HISTORY_RETENTION_MONTHS`.

---

## 15. Extensibility & Future Expansion

The system is built so the common kinds of growth — more stores, more login providers,
more alert channels, more pages — are **additive**: a new file plus a config entry, never
a rewrite of core logic. Each extension point below has one contract and one registration site.

### 15.1 Adding a retailer (the primary extension point)
1. Create `backend/src/scraper/retailers/<retailer>.ts` exporting one object that satisfies
   the `RetailerScraper` interface (`domain`, `getPrice(url)`), with the verified-selector
   header comment.
2. Add the hostname to the **single** `RETAILER_ALLOWLIST` constant.
3. Register the scraper in the dispatcher's lookup map (one line).
No other file changes. The dispatcher routes by hostname; an unknown host is rejected at
URL validation, so a half-added retailer can never be scraped by accident. Each retailer
independently chooses its `source` (`'api' | 'cheerio' | 'puppeteer'`) per the
official-feed-first policy in §4.

### 15.2 Adding a login provider (Apple, Facebook, …)
The auth layer is a strategy registry. Each provider is one file exposing
`{ id, buildAuthUrl(state), exchangeCode(code) → { email, emailVerified } }`. Google ships
first; Apple/Facebook are added by dropping in a strategy file and its client-ID/secret
env vars — `auth.ts`, the JWT cookie, and `requireLogin`/`requireAdmin` are unchanged.

### 15.3 Adding a notification channel
Notifications go through a `NotificationChannel` interface (`send(alert)`). Webhook/email
exist as optional channels gated by env; Discord/Slack/Telegram are new files registered
in a channel list. The deal scorer and scheduler never reference a specific channel.

### 15.4 Schema & API evolution
- **DB:** migrations are additive and sequential (`V2__…`, `V3__…`); never edit a shipped
  migration. New columns are nullable or defaulted so old rows stay valid.
- **API:** routes live under `/api/`; a breaking change introduces `/api/v2/` rather than
  mutating an existing contract. Zod schemas are the typed boundary on both sides.
- **Constants:** every new limit/threshold is a named constant — no magic numbers leak in
  with a new feature (Law 8 applies to future work too).

### 15.5 Frontend surfaces
Components are self-contained and composed in `App.tsx`. New pages/widgets (e.g. a public
landing page, a stats dashboard, or an **ad slot** — see §16) are added as components behind
a feature flag in `frontend/src/lib/constants.ts`, so a surface can ship dark and be enabled
without touching existing components.

---

## 16. Monetisation

> **Governing principle — never paywall.** No feature is ever locked behind payment. Every
> user gets every feature for free, always. There is **no freemium tier, no subscription, no
> "Pro," and no payment provider** in this system. Caps such as `MAX_TRACKED_PRODUCTS` and
> poll-interval bounds exist only for **abuse/cost control**, never as upsell levers.

Income is therefore **voluntary or passive only**, in two forms:

### 16.1 Ko-fi (voluntary donations) — primary
- A simple **"Support on Ko-fi ☕"** link in the footer of both the app and the public site,
  pointing at `KOFI_URL` (a public, non-secret frontend constant; see §9).
- It is an outbound link only — no embedded script, no SDK, no iframe — so it adds **zero**
  CSP, tracking, or PII surface. If `KOFI_URL` is unset, the link is simply not rendered.
- Nothing about a user's experience changes whether or not they donate.

### 16.2 Public site + AdSense (passive, post-MVP) — secondary

> **Decision:** display ads live **only** on the separate public site (sprint S11), never in
> the login-gated app. AdSense approval requires a publicly accessible, content-rich,
> crawlable site; the app is behind Google sign-in and shows scraped retailer content, so it
> cannot and must not host ads. This stays **off by default** (`ENABLE_ADS=false`).

**Architecture (two surfaces, one deployment):**
- **`/` (public site):** unauthenticated, crawlable. Renders **public tracked items**
  (product, deal badge, price history — anonymous, via `/api/public/items`) **plus** original
  content (how deal scoring works, buying guides, FAQ). Carries the AdSense slot and the
  consent/CMP banner. This is what AdSense reviews and serves against.

> ⚠️ **AdSense policy risk (must resolve before enabling):** the public site now shows
> **scraped retailer prices** alongside ads. AdSense prohibits placing ads on pages whose
> primary value is third-party/scraped content, and some retailers' terms restrict
> republishing prices. Mitigation: lead with **substantial original content** (the guides,
> scoring explainers, editorial deal commentary) so the page is not "thin"/scraped-only, link
> out to the retailer rather than mirroring the full listing, and confirm each retailer's
> terms permit showing price points publicly. If a retailer disallows it, exclude its items
> from the public surface. **This is a genuine approval/compliance risk, not a formality.**
- **`/app` (private app):** the existing login-gated React app — **strict `default-src
  'self'` CSP, no ad scripts, ever.**
- nginx routes the two; the relaxed ad CSP (`script-src`/`frame-src`/`img-src` for Google)
  applies **only** to the landing surface via a separate `Content-Security-Policy` header.

**Implementation isolation:**
- A single `AdSlot` component rendered **only** in the public landing layout.
- Gated by `ENABLE_ADS` (default `false`) + `ADS_CLIENT_ID`; ships dark until AdSense
  approval lands.
- Consent/CMP banner required for personalised ads — **POPIA** (South Africa) and **GDPR**
  if any EU traffic. The CMP lives on the landing surface only.
- No ad network script ever loads on any page that renders scraped data or session data.

**Eligibility caveat (must be met before enabling):** AdSense needs genuine original
content and traffic on the landing surface; an empty landing page will be rejected. The
content work (guides/FAQ) is part of S11, not a flip of the flag.
