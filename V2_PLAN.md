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
>
> This is now **confirmed by researching how tweakers.net actually works** (live site +
> their own published material, 2026-05-31) — see **Appendix A**. Their Pricewatch is
> import/feed-driven, not scraped; their hardest problem is exactly the entity-resolution
> we flag in Theme 2 (a quarter of their million-product catalogue sits *unmatched*).

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

---

## Appendix A — How tweakers.net actually works (researched 2026-05-31)

Researched against the live site and Tweakers' own published material (their DPG Media
2022 annual report, a Tweakers engineering presentation "Import, Slice & Dice", the
Pricewatch FAQ, and live Pricewatch product pages). Marked **[observed]** where seen
directly and **[stated]** where Tweakers themselves describe it. This **confirms the V2
plan's core assumptions** and refines several details.

### Data sourcing — feed/import-driven, NOT scraping  **[stated]**
- Connected webshops supply a **product feed file** (XML/CSV/JSON). Feeds are imported
  **4× per hour** (~18 import moments/day, 100GB+/day in their 2018 numbers), so a shop's
  price change appears within ~15 minutes. This is the opposite of our per-product scrape
  loop — and the reason it scales to thousands of shops.
- Pricewatch began in **1999** as a community effort with **manual price entry**; it was
  automated to feeds over time. Confirms: you can *start* manual/scraped and migrate to
  feeds — but feeds are the end state.
- A feed-aggregator ecosystem exists (e.g. ess.nl) that, for ~€15–25/month, converts a
  shop's Magento/Shopify/WooCommerce/PrestaShop/etc. catalogue into a Tweakers-optimised
  feed with brand/EAN/spec fields extracted. **For SA this ecosystem likely doesn't
  exist**, which is why our Theme 1 must lean on Shopify `products.json` + sitemaps.
- Monetisation is **affiliate**: CPC (cost-per-click) or CPS (cost-per-sale); clickout
  links are affiliate redirects (302). **[stated]** Relevant to DealRadar monetisation —
  Takealot et al. run affiliate programs, so an affiliate clickout is a plausible SA
  revenue path alongside Ko-fi/AdSense, *if* it doesn't compromise the "neutral, real
  deal" positioning.

### Entity resolution is the moat — and it's hard even for them  **[stated + observed]**
- Import flow: download daily-update XML → identify products needing add/update → pull
  product XMLs (10 threads) → **match "unsorted" products to existing ones on EAN + SKU**
  → add matches, discard/queue the rest. **Identifier-first matching is exactly Theme 2's
  plan.**
- Live counters on the Pricewatch homepage: **857,912 sorted products vs 227,550
  *ongesorteerde* (unsorted) products** **[observed]** — i.e. **~21% of their catalogue
  is unmatched** despite a dedicated team. Takeaway for V2: treat **"unsorted" as a
  first-class state with an explicit curation queue**, not an edge case. Do not expect
  100% auto-matching.
- A **team of ~4 people** manually curates specs/identifiers feeds don't provide. A specs
  database with human curation is a real ongoing cost, not a one-off build.

### Product model has THREE layers, not two  **[observed]**
Live product pages (`/pricewatch/{id}/{slug}.html`) show a layer the V2 data model
should add: **model → edition/variant → offer**.
- A model (e.g. "HP ZBook X G1i 16\"") groups **"Uitvoeringen" (editions/variants)** —
  13 SKUs differing by config/keyboard — each with its own EAN/MPN.
- Each variant aggregates **offers** (per-shop price). Page shows "Laagste prijs €X bij
  {shop}", a full offers table (shop, star rating from shop-reviews, delivery, price,
  clickout), and tabs: Prijzen / Specificaties / Video / Redactionele publicaties
  (editorial) / Gebruikersreviews / Vraag & Aanbod (classifieds).
- **Refinement to Theme 2's schema:** consider `canonical_products` → `product_variants`
  (carry EAN/MPN here, since identifiers live at the variant level) → `products` (offers).
  Matching keys off the variant identifier, not the model.

### Price history is a daily rollup, not raw observations  **[observed]**
- The chart is served by `GET /ajax/price_chart/{product_id}/{nl|be}/` returning JSON
  rows of `[date, min_price, avg_price]` going back **years**, plus markers like "lowest
  price in 6 months".
- **Refinement to Theme 1's storage note:** they store **daily min/avg per product**, not
  every scrape. For DealRadar at catalogue scale, a **daily rollup table**
  (`price_daily(product_id, day, min, avg, close)`) alongside (or instead of) raw
  `price_history` for cold products is the right move — cheaper than partitioning 65M raw
  rows/year and matches what a price-history chart actually needs.

### Catalogue breadth & "deal" parity  **[observed]**
- ~1M+ products, ~2.5M prices, **3,000+ shops**, 243 category slugs. Notably they expanded
  **beyond tech into white goods** (fridges, dishwashers, microwaves) — a possible SA
  direction later, but orthogonal to the MVP.
- They already do DealRadar's core idea: surface **temporary price drops** ("grootste
  prijsdaling", up to −30% badges) and let users set **price alerts** below a threshold.
  Validates the deal-scoring concept; our differentiator stays the **SA-specific,
  anti-fake-markdown 90-day-median** scoring.

### Net effect on this plan
Nothing in the research contradicts the V2 plan; it **sharpens** it:
1. Keep "feeds before breadth" — confirmed as the scaling unlock.
2. Add the **variant/edition layer** to the Theme 2 data model (identifiers live there).
3. Make **"unsorted/unmatched" a first-class curation queue** (expect ~20% unmatched).
4. Store price history as a **daily min/avg rollup** for catalogue-scale products.
5. Consider **affiliate clickout** as an SA-appropriate monetisation option (separate
   decision; must not dent the neutral-deal positioning).

*Method note: the in-app WebFetch tool is blocked by tweakers.net and the browser bridge
was unavailable, so this appendix is built from search-surfaced live page content and
Tweakers' own publications rather than a first-party crawl. Figures are point-in-time
(2026-05-31) and approximate.*

---

## Appendix B — Local-LLM-assisted enrichment (Gemma on the Coolify host)

Plan for a **self-hosted Gemma** (or any local model) running on the same machine as
Coolify. The governing rule: **the LLM enriches the catalogue/matching layer as an async
batch job; it never sits in the hot path of a price scrape.** Prices are numbers —
extract them deterministically (selector / JSON-LD / regex). The LLM is for the *fuzzy,
text-heavy* work that is exactly tweakers' manual-labour layer (Appendix A): spec
extraction, normalisation, and the entity-resolution tail.

### What the LLM is for (and explicitly not for)

| Task | LLM? | Notes |
|------|------|-------|
| Read a price from a page | **No** | Deterministic selector/JSON-LD/regex. Numbers don't need a model. |
| Extract `{brand, model, mpn, ean, category, specs{}}` from messy title/description/feed | **Yes** | The core win. Unstructured → structured, JSON-constrained output. |
| Match same product across stores **with** a shared EAN/MPN/SKU | **No** | Deterministic identifier join. Cheaper and correct. |
| Match the **identifier-less remainder** | **Yes, gated** | Candidate-gen by embeddings, LLM adjudicates pairwise with a confidence score → threshold/human gate. |
| Canonical product naming / variant labelling | **Yes** | Collapse varied titles into one clean canonical name. |
| Category classification into the taxonomy | **Yes** | From title + specs. |
| Generate buying guides / scoring explainers / FAQ (S11) | **Yes** | Original content → mitigates the §16 AdSense "thin/scraped" risk at zero API cost. |
| Per-poll price extraction in the scheduler | **No** | Too slow; would starve the user-facing path. |

### The enrichment pipeline

```
ingest (Theme 1: Shopify products.json / sitemap)            → raw products
  → [LLM] extract {brand, model, mpn, ean, category, specs}  (JSON-schema-constrained)
  → [deterministic] match on EAN/MPN/SKU                     → canonical_product / variant
  → identifier-less remainder:
        [embeddings] embed normalized title (local embed model)
        → pgvector ANN  → top-K candidate products            (blocking; avoids O(N²))
        → [LLM] "same product? confidence 0–1" per candidate pair
        → high conf  → auto-link
          mid  conf  → match_suggestions  (human curation queue)
          low  conf  → leave UNSORTED
  → comparison view = offers grouped by canonical, sorted cheapest-first
```

Two models, two jobs: a small **embedding model** does cheap *candidate generation*
(blocking); **Gemma** does only the final *adjudication / extraction*. Embeddings live in
Postgres via the **`pgvector`** extension — no new datastore.

### How it slots into the existing stack

- **Serve the model with Ollama** (or llama.cpp server) as a service on the internal
  `deal-radar-net` network — `http://ollama:11434`, **internal-only like Postgres, never
  host-exposed**. If a GPU is present, pass it through; otherwise CPU works but is slower.
- Backend talks to it behind a small **`LlmClient` interface** (`extract(text, schema)`,
  `classify(text, labels)`, `matchPair(a, b)`), mirroring the pluggable
  `NotificationChannel`/`RetailerScraper` pattern — so the model is swappable and the
  scorer/scheduler never reference a concrete model.
- **New `enrichment.worker.ts`** extending the S4 scheduler/worker: pulls
  unenriched/unsorted rows in bounded batches, calls the LLM, writes structured fields +
  `match_suggestions`. Runs **off-peak with bounded concurrency** so it never contends
  with the API/DB.
- **New tables (additive migration):** `match_suggestions(product_id, canonical_id,
  confidence, model, status, created_at)` and a `product_embeddings` vector column; reuse
  the `unsorted` state from Theme 2.

### Guardrails (non-negotiable)

1. **Constrained output.** Use JSON/grammar-constrained generation (Ollama `format=json`
   or a GBNF grammar) and validate every response against a Zod schema. Never free-text
   parse a model's output.
2. **Hallucination gate.** Auto-merge **only** above a high confidence threshold AND when
   not contradicted by identifiers. Mid-confidence → human queue. A wrong merge is worse
   than leaving a product unsorted (tweakers leaves ~21% unsorted on purpose).
3. **Not in the hot path.** Enrichment is batch/async over the catalogue, decoupled from
   the price-poll loop and the user request path.
4. **Resource isolation.** Bound `LLM_MAX_CONCURRENCY`; schedule heavy runs off-peak.
   On a shared home box, full-catalogue enrichment is a **multi-hour job** — fine because
   it's async, but it must not starve Postgres or the API.
5. **Determinism where it matters.** Identifiers and prices are deterministic; the LLM
   only ever *proposes* for the ambiguous remainder.

### Model sizing — for the actual host (Ryzen 9 5950X · 128GB DDR4 · Intel Arc B570 10GB · 2TB NVMe)

The CPU/RAM are ample (16c/32t + 128GB → run Postgres, scrapers, Coolify, and batch LLM
work concurrently with no memory pressure). **The binding constraint is the GPU's 10GB
VRAM**, and the operational risk is Intel Arc tooling, not compute.

**Operator preference: run the strong (largest) Gemma variant.** The constraint is
parameter-count vs the 10GB VRAM, independent of version name. (As of Jan 2026 the family
is Gemma 3 at 1B/4B/12B/27B; a later "Gemma 4" would slot in by size.)

- **Chosen default — the strong/largest Gemma (~27B-class or larger).** At Q4 (~16GB+)
  this **exceeds the B570's 10GB VRAM**, so llama.cpp offloads the layers that fit to the
  Arc GPU and runs the remainder on the **5950X + 128GB RAM**. Expect **low single-digit
  tok/s → batch/overnight only, never interactive.** Accepted on purpose: the pipeline is
  async with a human gate, and the stronger model means **better extraction + match
  adjudication → a smaller unsorted/review queue.** That is a good trade here.
- **If the largest model fits on-GPU (≤~10GB at Q4, i.e. a ~12B):** it runs fully on the
  B570 and is much faster — a reasonable fallback if overnight runs get too long.
- **Keep a tiny embedding model regardless** (nomic-embed / bge-small, GPU or CPU): it
  does candidate generation so the strong model only adjudicates a handful of pairs, never
  O(N²). This is what makes the strong model affordable. pgvector lives in Postgres.
- **Optional two-tier (later, if needed):** small/fast model for the bulk extraction pass,
  strong model reserved for the ambiguous matching tail. Start simple — strong model for
  everything — and split only if batch windows overrun.

**Intel Arc tooling caveat (budget setup time):** Ollama has **no native Arc support**
(it targets CUDA/ROCm). On the B570, serve the model via **Intel IPEX-LLM** (their
SYCL/oneAPI llama.cpp/Ollama build) or **llama.cpp's Vulkan backend**. Both work but are
less turnkey than NVIDIA. **Keep CPU-only inference on the 5950X as the guaranteed
fallback** — for an async batch job it is entirely sufficient. Throughput will be
batch-grade either way (verify tok/s on the chosen Arc path); design for batch, never
interactive.

### Likely new named constants (Law 8)

`LLM_BASE_URL`, `LLM_MODEL`, `LLM_EMBED_MODEL`, `LLM_MAX_CONCURRENCY`,
`LLM_REQUEST_TIMEOUT_MS`, `ENRICHMENT_BATCH_SIZE`, `ENRICHMENT_CRON`,
`MATCH_AUTOLINK_MIN_CONFIDENCE`, `MATCH_REVIEW_MIN_CONFIDENCE`, `EMBED_MATCH_TOP_K`.

### Where it pays off earliest (before full V2)

1. **Scraper resilience (S2/S3-adjacent):** when a CSS selector breaks, fall back to
   "LLM, extract price + name from this raw HTML" → degrade gracefully instead of logging
   `parse_error`. **Bounded, fallback-only** (still validate the extracted price is a
   plausible number against recent history before trusting it).
2. **AdSense content (S11):** locally generate original buying guides / scoring
   explainers / category FAQs. This directly addresses the §16 approval risk ("primary
   value must not be thin/scraped content") at zero per-call cost — plausibly the single
   highest-leverage early use of the local model.

### Honest expectation-setting

The local model **replaces the human *labour*** of the catalogue/matching layer (tweakers'
~4-person curation team), not the *system*. It will not conjure tweakers' 20-year specs
database or their 3,000-shop feed network. Realistic win: it makes spec extraction and
match *suggestion* cheap and continuous, while a lightweight human gate handles the
low-confidence tail. Quality on identifier-anchored tasks is good; on open-ended
matching without identifiers it's adequate-with-review, not autonomous.
