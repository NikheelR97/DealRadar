# PR Review: #5 — S3: scraper layer — Tier B (Evetech/Loot) + Tier C best-effort plugins

**Reviewed**: 2026-06-01
**Author**: NikheelR97 (Nikheel Rajman)
**Branch**: s3-tier-b-c-scrapers → main
**Head**: ed987f2
**Decision**: APPROVE (with comments)

## Summary
Clean, well-isolated S3 scraper layer. Tier B reuses the existing structured-data-first
Cheerio factory; Tier C adds a dedicated best-effort factory that degrades anti-bot
misses to a logged `blocked` per the sprint gate. A small shared `extractProduct()`
refactor removes duplication without changing Tier A behaviour. No CRITICAL/HIGH issues;
full `sprint-verify` is green.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW
1. **Tier C masks genuine selector drift as `blocked`** — `bestEffortScraper.ts`: when a
   real product page renders but no JSON-LD/meta/CSS price matches, the result is
   classified `blocked` rather than `parse_error`, so a future selector drift on a Tier C
   store is indistinguishable from an anti-bot block in `scrape_errors`. This is a
   deliberate design choice (Tier C is best-effort, expected blocked) and is documented in
   the SPRINT_PLAN S3 deferral #2. No action required for the MVP; revisit only if Tier C
   reliability is ever pursued.
2. **`amazon.ts` sold-out selector `#availability .a-color-price` is broad** — `.a-color-price`
   is a price-styled span; on some layouts it could appear alongside an in-stock price and
   yield a false out-of-stock. Acceptable for a Tier C best-effort scraper that rarely gets
   through from a residential IP, and documented as NOT-LIVE-VERIFIED. Confirm against a
   live PDP if Tier C is ever hardened.
3. **`looksBlocked()` lowercases the full page HTML on every Tier C parse** —
   `bestEffortScraper.ts` allocates a full lowercased copy of the document per parse. Bounded
   by page size and only on the Tier C path, so negligible; noted only for completeness.
4. **`'access denied'` challenge marker is generic** — could in principle match unrelated
   page copy. Low risk on a price page; for a Tier C store a false `blocked` is harmless
   (logged, not crashed).

## Validation Results

| Check | Result |
|---|---|
| Type check (backend + frontend) | Pass |
| Lint (`eslint --max-warnings=0`) | Pass |
| Tests (155) | Pass |
| Coverage (99.34% L / 94.98% B / 100% F vs 85/80/85 gate) | Pass |
| Build (both workspaces) | Pass |
| Secret scan | Pass |
| Docker build + live health checks | Pass |

_All via the full `sprint-verify` run this session (exit 0, "ALL GATES PASSED")._

## Files Reviewed
- `backend/src/scraper/cheerioScraper.ts` — Modified (shared `extractProduct` refactor)
- `backend/src/scraper/bestEffortScraper.ts` — Added (Tier C factory)
- `backend/src/scraper/index.ts` — Modified (REGISTRY wiring)
- `backend/src/scraper/retailers/evetech.ts` — Added
- `backend/src/scraper/retailers/loot.ts` — Added
- `backend/src/scraper/retailers/makro.ts` — Added
- `backend/src/scraper/retailers/game-stores.ts` — Added
- `backend/src/scraper/retailers/incredible-connection.ts` — Added
- `backend/src/scraper/retailers/hificorp.ts` — Added
- `backend/src/scraper/retailers/amazon.ts` — Added
- `backend/src/scraper/index.test.ts` — Modified (unknown-host fix + Tier C dispatcher test)
- `backend/src/scraper/retailers/retailers.test.ts` — Modified (Tier B + Tier C suites)
- `backend/src/scraper/fixtures/*.html` — Added (7 fixtures)
- `SPRINT_PLAN.md` — Modified (deferral log)
