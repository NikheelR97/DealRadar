# DealRadar — V2 Plan (Catalogue & Cross-Store Comparison)

**Status:** Forward-looking / not scheduled. Created 2026-05-31.
**Relationship to MVP:** Everything here is **post-MVP (after S11)**. The MVP
(`SPRINT_PLAN.md`, S0–S11) ships the single-product, user-submitted-URL tracker first.
Nothing in this document changes the MVP scope; it records *where we'd go next* and,
more importantly, *what it actually costs* so the decision is made with eyes open.

> **The one insight that governs this whole document:** the MVP scrapes from a single
> home IP with no proxy pool and no merchant relationships. That model is fine for
> tracking a few hundred user-submitted products. It does **not** scale to whole
> catalogues or to many-merchant comparison. The thing that unlocks V2 is **structured
> data sources (Shopify product JSON, sitemaps, and eventually real merchant/affiliate
> feeds)** — not "more scraping." Every theme below is gated on that.

---

## Theme 1 — Whole-catalogue tracking for Tier A stores

Shift from a **pull model** (user submits a URL → we track that product) to an added
**discovery model** (we enumerate a retailer's catalogue and track all of it). This is a
**new subsystem — a catalogue crawler / ingestion pipeline** — not a change to the
existing per-product scrapers.

### Per-store feasibility

| Store | Discovery mechanism | Difficulty | Notes |
|-------|--------------------|------------|-------|
| **Koodoo** (Shopify) | `/products.json?page=N` — paginated JSON with every product, variant, **price, image, and often `barcode` (GTIN)**. | **Low** | The genuine win. Effectively an unofficial bulk feed; no HTML scraping. Verify it isn't disabled (most Shopify stores leave it on). **Start here.** |
| **iStore** | `sitemap.xml` / category pages. Small catalogue (Apple reseller, hundreds of SKUs). | **Low–Med** | Small N keeps it cheap regardless of method. |
| **Wootware** (Magento 1.x) | `sitemap.xml` enumerates product URLs, but each needs an individual HTML fetch + parse (no bulk JSON). | **Medium** | Potentially 10k–50k SKUs — this is where volume bites. |

> Tier B/C stores are explicitly **out of scope** for catalogue ingestion: Evetech's
> ~10s crawl-delay and the Tier C anti-bot walls make whole-catalogue crawling
> impractical or hostile. Catalogue ingestion is a **Tier A (+ feed-bearing stores)**
> capability only.

### What it breaks in the current design (the real cost)

1. **Scheduler / throughput.** Today: `MAX_PRODUCTS_PER_POLL_BATCH = 50`, in-process
   `node-cron`, per-request jitter 1.5–4s, single home IP, no proxy pool. Polling ~30k
   products every 4h sequentially is ~25h of work in a 4h window — it does not fit.
   Requires concurrency, which from one residential IP is exactly the blocking risk the
   MVP architecture was built to avoid. **Likely needs:** a feed-first ingestion path
   (bulk JSON refresh ≠ per-product fetch), tiered poll intervals (hot vs cold
   products), and possibly a dedicated worker process separate from the API container.
2. **Database growth.** `price_history` is append-only. 30k products × ~6 obs/day ≈
   **~65M rows/year**, ~100M under the 18-month retention. Postgres handles it, but this
   moves us into **table partitioning** (e.g. monthly partitions on `checked_at`),
   index tuning, and a real retention/rollup job (daily min/max/close instead of every
   observation for cold products).
3. **robots / ToS exposure.** Whole-catalogue enumeration is far more aggressive than
   per-URL tracking. Must re-confirm robots per store and stay on the
   feed/sitemap-sanctioned paths. A home IP crawling a full catalogue gets rate-limited
   fast — another reason feed-first (Shopify JSON) is the only comfortable starting point.

### Suggested shape

- **V2-S1 — Shopify feed ingestion (Koodoo first):** `catalogue/` subsystem with a
  `CatalogueSource` interface (`listProducts() → CanonicalCandidate[]`), a Shopify
  adapter reading `/products.json`, an upsert pipeline (insert/update products, mark
  **delisted** SKUs inactive), and a separate ingest schedule. Prove the whole pipeline
  on one store before generalising.
- **V2-S2 — sitemap ingestion (Wootware, iStore)** + the scheduler/partitioning rework
  the volume forces.

---

## Theme 2 — Cross-store price comparison ("same product, many stores → cheapest")

Track the **same physical product across multiple stores** so a user sees one product
with a list of store offers and can pick the cheapest. This is the feature the user
asked for, and it is **the hard part** — it is the core of what makes a site like
tweakers.net's Pricewatch valuable, and the difficulty is **not** scraping; it is
**entity resolution** (deciding that store A's listing and store B's listing are the
same product).

### Data-model change (additive migration `V_n__canonical_products.sql`)

Today `products` is "one canonical row **per URL**." Comparison needs a layer above that:

```
canonical_products            -- the abstract product ("Samsung 990 Pro 2TB NVMe SSD")
  id, name, brand, gtin, mpn, category, image_url, created_at

products  (existing, + new col)
  ... , canonical_product_id BIGINT NULL REFERENCES canonical_products(id)
        -- a store-specific listing/offer for a canonical product
```

- An **offer** = a `products` row (store + URL) joined to its latest `price_history`.
- The **comparison view** = for one `canonical_product`, list its `products`/offers
  sorted by latest in-stock price → "cheapest store."
- `canonical_product_id` is **nullable**: un-matched listings still work exactly as the
  MVP does today (no regression). Matching only *adds* grouping.

### The matching problem (do it in this order)

1. **Identifier-first (reliable).** Match on a shared **GTIN/EAN/UPC barcode** or
   **manufacturer part number (MPN)**. Shopify variants often carry `barcode`; many
   product pages expose GTIN in schema.org markup. When two listings share a GTIN/MPN,
   grouping is deterministic and trustworthy. **This should cover the bulk of matchable
   inventory and is the only matching we should fully automate.**
2. **Fuzzy fallback (best-effort, human-gated).** When no identifier exists, fuzzy
   brand+title+spec matching produces *candidates*, never auto-merges. Surface them in a
   small **admin merge/curation UI** for one-click confirm/reject. Auto-fuzzy-merging at
   scale is how comparison sites get embarrassing "two different products shown as one"
   bugs — we won't do it unattended.
3. **Never** block the MVP flow on matching. Unmatched = still individually trackable.

### UX

- Product page / card gains an **offers table**: store, price, in-stock, deal badge,
  last-checked, outbound link — sorted cheapest-first.
- A user tracking a canonical product is alerted when **any** store's offer drops
  (reuses the existing deal scorer per offer; the canonical view shows the best).

### Why this is genuinely hard (set expectations)

- Entity resolution across heterogeneous listings (different titles, bundles, SKUs) is a
  real data-engineering problem; tweakers has 20+ years of curated catalogue + specs
  behind theirs.
- It is materially easier **with feeds** (which often carry GTIN/MPN cleanly) than with
  scraped HTML. This is the second reason V2 is feed-gated.
- Scope discipline: **identifier-based matching for Tier A feed stores is achievable;**
  a general "match anything from anywhere" engine is a different, much larger product.

---

## Explicitly NOT in V2 (the tweakers.net line we won't cross yet)

Building "a full tweakers.net" is a different project, not scope creep on this one. The
following are **out** unless the product direction and infrastructure change:

- **Hundreds of merchants via brute-force scraping.** That requires real merchant /
  affiliate **feeds** (Awin/Tradedoubler/Daisycon-style) and/or a proxy-crawl
  infrastructure — neither is in the self-hosted, single-IP model. Feeds are a
  prerequisite, not an implementation detail.
- **A curated specs database** (normalised attributes per category for spec-by-spec
  comparison) — a long-term catalogue/editorial effort.
- **Editorial + community** (news, reviews, forums) — half of tweakers' value and a
  content operation, not an engineering deliverable.

---

## Prerequisites & sequencing

1. MVP (S0–S11) shipped and stable, including the scrapers and deal scorer V2 builds on.
2. **Theme 1 before Theme 2** — you need a populated multi-store catalogue before
   cross-store matching has anything to match.
3. **Feeds before breadth** — prove the pattern on Shopify JSON (Koodoo) where price +
   GTIN come for free, then expand.
4. Scheduler/worker split + `price_history` partitioning land with Theme 1's volume, not
   retrofitted under fire later.

## Likely new named constants (Law 8 still applies)

`CATALOGUE_INGEST_CRON`, `MAX_PRODUCTS_PER_INGEST_BATCH`, `COLD_PRODUCT_POLL_INTERVAL_HOURS`,
`HOT_PRODUCT_POLL_INTERVAL_HOURS`, `PRICE_HISTORY_PARTITION_INTERVAL`,
`FUZZY_MATCH_MIN_CONFIDENCE`, `MAX_OFFERS_PER_CANONICAL_PRODUCT`.

## Open questions to resolve before committing to V2

- Does Shopify `/products.json` stay enabled on Koodoo, and does it expose `barcode`
  (GTIN) on variants? (Determines how easy identifier-matching is.)
- Actual catalogue sizes for Wootware/Koodoo (drives the scheduler/DB rework scale).
- Home hardware + home IP ceiling: at what catalogue size does ingestion stop being
  viable without a VPS/proxy? This may force a hosting decision, not just a code one.
- Legal/ToS posture for storing and **publicly displaying** whole-catalogue prices and
  cross-store comparisons per retailer (ties into the §16 AdSense policy risk).
