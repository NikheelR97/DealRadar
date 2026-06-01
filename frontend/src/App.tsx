import { useEffect, useRef, useState } from 'react';
import {
  DEAL_THRESHOLD_EXCEPTIONAL_PCT,
  DEAL_THRESHOLD_GOOD_PCT,
  DEAL_THRESHOLD_MODEST_PCT,
  KOFI_URL,
  MAX_URL_LENGTH,
} from './lib/constants';

/**
 * App shell - DealRadar watchlist (SKILL-driven redesign, pass 3: hardened states).
 *
 * Design read: a price-watch product UI for daily deal-hunters. Dark Linear-
 * utilitarian language, a single acid-lime accent reserved for the drop figures,
 * system-mono tabular numerals, hairline structure (no card chrome spam). The page
 * earns its hierarchy from three moments: a metric strip, a featured best-drop, and
 * the dense watchlist. Off-black base (never pure #000), one faint vignette.
 *
 * Display is DERIVED, not hardcoded: percent, rands-saved and deal tier all compute
 * from price numbers against the shared DEAL_THRESHOLD_* constants, so a label can
 * never drift from its data.
 *
 * State coverage (this pass): every row carries a lifecycle status so the board is
 * honest about what it knows. `ready` rows show a priced deal; `loading` rows show a
 * skeleton while a (mocked) price check runs; `failed` rows keep the last-known price
 * greyed with a relative "checked" time and a Retry. Adding a URL validates input,
 * appends an optimistic loading row, and announces the result through a polite live
 * region. Removing the last row reveals an empty state that teaches the next action.
 * Backend is not wired here: checks are simulated with timers (HANDOVER: frontend-only).
 */

type Tier = 'exceptional' | 'good' | 'modest' | 'flat' | 'dead';
type RowStatus = 'ready' | 'loading' | 'failed';

interface TrackedProduct {
  id: string;
  name: string;
  retailer: string;
  /** Last-known price. Present once a check has ever succeeded; absent while a brand-new add is still loading. */
  now?: number;
  /** Retailer's claimed former price ("was"). Shown struck-through as context, never the basis of the score. */
  was?: number;
  /** Rolling 90-day median: the baseline the deal is actually scored against (PRODUCT.md). */
  median?: number;
  inStock: boolean;
  status: RowStatus;
  /** Epoch ms of the last completed check (success or failure). Drives the relative "checked" label. */
  checkedAt?: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Single source of truth for the demo watchlist. Prices in ZAR. */
const SEED: readonly TrackedProduct[] = [
  { id: 'sony-xm5', name: 'Sony WH-1000XM5 Wireless Headphones', retailer: 'Wootware', now: 5499, was: 7999, median: 7999, inStock: true, status: 'ready', checkedAt: Date.now() - 8 * MINUTE },
  // Retailer's "was" (R29 999) is inflated above the real 90-day median (R25 999): the screaming
  // "25% off" is only ~13% against the baseline, so it scores Modest. This is the fake-catch.
  { id: 'odyssey-g9', name: 'Samsung 49" Odyssey OLED G9', retailer: 'Evetech', now: 22499, was: 29999, median: 25999, inStock: true, status: 'ready', checkedAt: Date.now() - 14 * MINUTE },
  { id: 'ipad-air-m2', name: 'Apple iPad Air 11" (M2, 128GB)', retailer: 'iStore', now: 11499, was: 12999, median: 12499, inStock: true, status: 'ready', checkedAt: Date.now() - 31 * MINUTE },
  // A check that could not reach the retailer: last-known price stays, but we don't vouch for it.
  { id: 'lg-c4-48', name: 'LG OLED48C4 48" evo Smart TV', retailer: 'Takealot', now: 17999, was: 21999, median: 20999, inStock: true, status: 'failed', checkedAt: Date.now() - 2 * DAY },
  { id: 'mx-master-3s', name: 'Logitech MX Master 3S', retailer: 'Evetech', now: 1749, was: 1749, median: 1799, inStock: false, status: 'ready', checkedAt: Date.now() - 19 * MINUTE },
];

// ── Derived display helpers ──────────────────────────────────────────────────

/** ZAR with non-breaking thin thousands separators, e.g. 5499 -> "R5 499". */
function rand(value: number): string {
  return 'R' + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Short, plain-language relative time, e.g. "8 min ago", "2 days ago". */
function ago(epoch: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - epoch);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const h = Math.round(diff / HOUR);
    return `${h} hr${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.round(diff / DAY);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

const TIER_LABEL: Record<Tier, string> = {
  exceptional: 'Exceptional',
  good: 'Good deal',
  modest: 'Modest',
  flat: 'No drop',
  dead: 'Out of stock',
};

interface DealView {
  product: TrackedProduct;
  pct: number; // whole-percent drop, 0 when flat/OOS
  saved: number; // rands off, 0 when flat/OOS
  tier: Tier;
}

/** Compute the priced view of a ready, in-stock product. Callers gate on status. */
function view(product: TrackedProduct): DealView {
  if (!product.inStock) return { product, pct: 0, saved: 0, tier: 'dead' };
  const now = product.now ?? 0;
  // The drop is measured against the 90-day median (the price the product normally sits at),
  // never the retailer's "was". That is what makes the percentage evidence rather than marketing.
  const baseline = product.median ?? product.was ?? now;
  const saved = Math.max(0, baseline - now);
  const pct = baseline > 0 ? Math.round((saved / baseline) * 100) : 0;
  const tier: Tier =
    pct >= DEAL_THRESHOLD_EXCEPTIONAL_PCT ? 'exceptional'
    : pct >= DEAL_THRESHOLD_GOOD_PCT ? 'good'
    : pct >= DEAL_THRESHOLD_MODEST_PCT ? 'modest'
    : 'flat';
  return { product, pct, saved, tier };
}

// ── Mocked price check (stands in for the backend until it's wired) ────────────

const KNOWN_RETAILERS: ReadonlyArray<readonly [string, string]> = [
  ['takealot', 'Takealot'],
  ['wootware', 'Wootware'],
  ['evetech', 'Evetech'],
  ['istore', 'iStore'],
  ['loot', 'Loot'],
  ['incredible', 'Incredible Connection'],
  ['makro', 'Makro'],
];

function retailerFromHost(host: string): string {
  const h = host.replace(/^www\./, '').toLowerCase();
  const match = KNOWN_RETAILERS.find(([key]) => h.includes(key));
  if (match) return match[1];
  const root = h.split('.')[0] ?? h;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function nameFromUrl(url: URL): string {
  const seg = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const pretty = decodeURIComponent(seg)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!pretty) return 'Tracked product';
  const titled = pretty.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled.length > 64 ? `${titled.slice(0, 61)}...` : titled;
}

/** A believable fresh quote with a realistic spread of drop tiers, scored against a median. */
function freshQuote(): { now: number; was: number; median: number } {
  const median = (5 + Math.floor(Math.random() * 246)) * 100; // normal price, R500..R25500
  const r = Math.random();
  const pct =
    r < 0.45 ? Math.floor(Math.random() * 5) // flat 0-4
    : r < 0.75 ? 5 + Math.floor(Math.random() * 10) // 5-14
    : r < 0.92 ? 15 + Math.floor(Math.random() * 15) // 15-29
    : 30 + Math.floor(Math.random() * 20); // 30-49
  const now = Math.round(median * (1 - pct / 100));
  // Retailer's "was" sits a little above the median, the way inflated markdowns usually do.
  const was = Math.round(median * (1.05 + Math.random() * 0.2));
  return { now, was, median };
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Sections ─────────────────────────────────────────────────────────────────

function RadarMark(): JSX.Element {
  // Geometric brand mark (concentric radar sweep). The ping ring is reduced-motion safe.
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      </svg>
      <span className="mark__ping" />
    </span>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <span className={`metric__value${accent ? ' metric__value--accent' : ''}`}>{value}</span>
    </div>
  );
}

function FeaturedDeal({ deal }: { deal: DealView }): JSX.Element {
  const { product, pct, saved } = deal;
  return (
    <section className="featured" aria-label="Top drop right now">
      <div className="featured__lead">
        <span className="featured__retailer">{product.retailer}</span>
        <h3 className="featured__name">{product.name}</h3>
        <div className="featured__prices">
          <span className="featured__now">{rand(product.now ?? 0)}</span>
          {product.was ? <span className="featured__was">{rand(product.was)}</span> : null}
        </div>
        <p className="featured__baseline">{`${pct}% below the 90-day median`}</p>
      </div>
      <div className="featured__signal">
        <span className="featured__pct">{`↓ ${pct}%`}</span>
        <span className="featured__saved">{`${rand(saved)} below median`}</span>
        <span className={`tag tag--${deal.tier}`}>{TIER_LABEL[deal.tier]}</span>
      </div>
    </section>
  );
}

/** Skeleton placeholder shown while a (mocked) price check runs for a freshly added row. */
function LoadingRow({ product, onRemove }: { product: TrackedProduct; onRemove: (id: string) => void }): JSX.Element {
  return (
    <tr className="row--loading" aria-busy="true">
      <td data-label="Product">
        <div className="cell-name">{product.name}</div>
        <div className="cell-retailer">{product.retailer}</div>
      </td>
      <td className="num" data-label="Price">
        <span className="skel skel--price" />
      </td>
      <td className="num" data-label="Drop">
        <span className="skel skel--drop" />
        <span className="row-status">Checking price</span>
      </td>
      <td data-label="Status">
        <div className="cell-actions">
          <span className="tag tag--checking">Checking</span>
          <RemoveButton id={product.id} name={product.name} onRemove={onRemove} />
        </div>
      </td>
    </tr>
  );
}

/** A row whose last check could not reach the retailer: last-known price, but unverified. */
function FailedRow({
  product,
  nowMs,
  onRetry,
  onRemove,
}: {
  product: TrackedProduct;
  nowMs: number;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}): JSX.Element {
  const hasPrice = typeof product.now === 'number';
  return (
    <tr className="row--failed">
      <td data-label="Product">
        <div className="cell-name">{product.name}</div>
        <div className="cell-retailer">{product.retailer}</div>
      </td>
      <td className="num" data-label="Price">
        {hasPrice ? (
          <>
            <span className="cell-now cell-now--stale">{rand(product.now as number)}</span>
            <span className="cell-meta">last known</span>
          </>
        ) : (
          <span className="delta delta--none">{'—'}</span>
        )}
      </td>
      <td className="num" data-label="Drop">
        <span className="delta delta--none">Check failed</span>
        {product.checkedAt ? <span className="cell-meta">checked {ago(product.checkedAt, nowMs)}</span> : null}
      </td>
      <td data-label="Status">
        <div className="cell-actions">
          <button type="button" className="row-retry" onClick={() => onRetry(product.id)}>
            Retry check
          </button>
          <RemoveButton id={product.id} name={product.name} onRemove={onRemove} />
        </div>
      </td>
    </tr>
  );
}

function ReadyRow({
  deal,
  nowMs,
  onRemove,
}: {
  deal: DealView;
  nowMs: number;
  onRemove: (id: string) => void;
}): JSX.Element {
  const { product, pct, saved, tier } = deal;
  const live = tier !== 'dead';
  return (
    <tr>
      <td data-label="Product">
        <div className="cell-name">{product.name}</div>
        <div className="cell-retailer">{product.retailer}</div>
      </td>
      <td className="num" data-label="Price">
        <span className="cell-now">{rand(product.now ?? 0)}</span>
        {product.was && product.was > (product.now ?? 0) ? (
          <span className="cell-was">{rand(product.was)}</span>
        ) : null}
      </td>
      <td className="num" data-label="Drop">
        {live && pct > 0 ? (
          <>
            <span className="delta">{`↓ ${pct}%`}</span>
            <span className="delta-saved">{`${rand(saved)} below median`}</span>
          </>
        ) : (
          <span className="delta delta--none">{live ? 'No drop' : '—'}</span>
        )}
      </td>
      <td data-label="Status">
        <div className="cell-status">
          <div className="cell-actions">
            <span className={`tag tag--${tier}`}>{TIER_LABEL[tier]}</span>
            <RemoveButton id={product.id} name={product.name} onRemove={onRemove} />
          </div>
          {product.checkedAt ? <span className="cell-meta">checked {ago(product.checkedAt, nowMs)}</span> : null}
        </div>
      </td>
    </tr>
  );
}

function RemoveButton({
  id,
  name,
  onRemove,
}: {
  id: string;
  name: string;
  onRemove: (id: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="row-remove"
      onClick={() => onRemove(id)}
      aria-label={`Stop tracking ${name}`}
      title="Stop tracking"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * First-run / cleared state. Teaches by showing: a worked example of a scored deal
 * (clearly marked "Example") makes the aha moment visible before the user commits a
 * URL, and the 90-day-median line + fake-markdown note answer the sceptical shopper
 * head-on. The CTA focuses the real input above rather than duplicating the form.
 */
function EmptyState({ onAddFocus }: { onAddFocus: () => void }): JSX.Element {
  return (
    <section className="onboard" aria-label="Get started">
      <div className="onboard__intro">
        <RadarMark />
        <h3 className="onboard__title">Track your first price</h3>
        <p className="onboard__lead">
          Paste a product link from a supported SA retailer (Takealot, Wootware, Evetech, iStore,
          Loot). DealRadar scores every price against its 90-day median, so you can tell a real
          discount from a bigger "was".
        </p>
        <button type="button" className="onboard__cta" onClick={onAddFocus}>
          Paste a product URL
        </button>
      </div>

      <figure className="onboard__demo" aria-label="Example of a tracked deal">
        <figcaption className="onboard__demo-cap">
          <span className="onboard__demo-tag">Example</span>
          What a tracked deal looks like
        </figcaption>
        <div className="onboard__deal">
          <div className="onboard__deal-lead">
            <span className="featured__retailer">Wootware</span>
            <p className="onboard__deal-name">Sony WH-1000XM5 Wireless Headphones</p>
            <div className="featured__prices">
              <span className="featured__now">{rand(5499)}</span>
              <span className="featured__was">{rand(7999)}</span>
            </div>
            <p className="onboard__deal-baseline">31% below its 90-day median</p>
          </div>
          <div className="featured__signal">
            <span className="featured__pct">↓ 31%</span>
            <span className="featured__saved">{`${rand(2500)} off`}</span>
            <span className="tag tag--exceptional">Exceptional</span>
          </div>
        </div>
        <p className="onboard__note">
          When a &ldquo;30% off&rdquo; is really flat against the median, DealRadar labels it{' '}
          <b>No drop</b>, so the fake markdowns do not waste your time.
        </p>
      </figure>
    </section>
  );
}

const VALIDATION = {
  empty: 'Paste a product URL to track.',
  tooLong: `That URL is too long (max ${MAX_URL_LENGTH.toLocaleString('en-ZA')} characters).`,
  invalid: "That doesn't look like a link. Copy the product URL from the retailer's page.",
  duplicate: "You're already tracking this product.",
} as const;

/** Validate a pasted URL. Returns a normalized href, or a message to show the user. */
function validateUrl(raw: string, existing: ReadonlySet<string>): { href: string } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: VALIDATION.empty };
  if (value.length > MAX_URL_LENGTH) return { error: VALIDATION.tooLong };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: VALIDATION.invalid };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: VALIDATION.invalid };
  const href = url.href;
  if (existing.has(href)) return { error: VALIDATION.duplicate };
  return { href };
}

export function App(): JSX.Element {
  const [products, setProducts] = useState<TrackedProduct[]>(() => SEED.map((p) => ({ ...p })));
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [announce, setAnnounce] = useState('');
  // Live clock so relative "checked" labels stay honest without a manual refresh.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const inputRef = useRef<HTMLInputElement>(null);

  // Track tracked-URL set for duplicate detection (only rows that came from a real add carry a url-id).
  const trackedHrefs = useRef<Set<string>>(new Set());
  // Pending mock-check timers, cleared on unmount to avoid setState-after-unmount.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), MINUTE);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  /** Schedule a mocked price check that resolves a row to `ready` (or stays failed on retry miss). */
  function scheduleCheck(id: string, label: string): void {
    const t = setTimeout(() => {
      timers.current.delete(t);
      const quote = freshQuote();
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, ...quote, inStock: true, status: 'ready', checkedAt: Date.now() }
            : p,
        ),
      );
      const v = view({ id, name: label, retailer: '', inStock: true, status: 'ready', ...quote });
      setAnnounce(
        v.pct > 0
          ? `${label} priced at ${rand(quote.now)}, ${v.pct}% below its 90-day median. Marked ${TIER_LABEL[v.tier]}.`
          : `${label} priced at ${rand(quote.now)}. No drop against its 90-day median.`,
      );
    }, 1400);
    timers.current.add(t);
  }

  function handleAdd(event: React.FormEvent): void {
    event.preventDefault();
    const result = validateUrl(draft, trackedHrefs.current);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    const url = new URL(result.href);
    const retailer = retailerFromHost(url.host);
    const name = nameFromUrl(url);
    const id = newId();
    trackedHrefs.current.add(result.href);
    setProducts((prev) => [
      { id, name, retailer, inStock: true, status: 'loading', checkedAt: undefined },
      ...prev,
    ]);
    setDraft('');
    setFormError('');
    setAnnounce(`Tracking ${name} from ${retailer}. Checking the current price.`);
    scheduleCheck(id, name);
  }

  function handleRetry(id: string): void {
    const target = products.find((p) => p.id === id);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'loading' } : p)));
    setAnnounce(`Re-checking ${target?.name ?? 'product'}.`);
    scheduleCheck(id, target?.name ?? 'Product');
  }

  function handleRemove(id: string): void {
    const target = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setAnnounce(`Stopped tracking ${target?.name ?? 'product'}.`);
  }

  // Metrics and the featured deal trust only ready, in-stock rows; loading/failed prices are unverified.
  const readyDeals = products.filter((p) => p.status === 'ready').map(view);
  const dropped = readyDeals.filter((d) => d.tier !== 'dead' && d.pct > 0);
  const biggest = dropped.reduce<DealView | null>(
    (best, d) => (best === null || d.saved > best.saved ? d : best),
    null,
  );
  const topDrop = dropped.reduce<DealView | null>(
    (best, d) => (best === null || d.pct > best.pct ? d : best),
    null,
  );
  const avgDrop = dropped.length
    ? Math.round(dropped.reduce((sum, d) => sum + d.pct, 0) / dropped.length)
    : 0;
  const isEmpty = products.length === 0;
  // Most recent completed check across the watchlist, for the global freshness line.
  const lastChecked = products.reduce<number | null>(
    (latest, p) => (p.checkedAt && (latest === null || p.checkedAt > latest) ? p.checkedAt : latest),
    null,
  );

  return (
    <>
      <header className="topbar">
        <h1 className="wordmark">
          <RadarMark />
          DealRadar
        </h1>
        <span className="topbar__meta">Black Friday price watch</span>
      </header>

      <main className="page">
        <section className="hero">
          <h2 className="hero__title">Catch the drop the moment it lands.</h2>
          <p className="hero__sub">
            Track South African retailer prices and get the saving the second it appears.
          </p>
          <form className="addbar" onSubmit={handleAdd} noValidate>
            <label className="visually-hidden" htmlFor="track-url">
              Product URL to track
            </label>
            <input
              ref={inputRef}
              id="track-url"
              className="addbar__input"
              type="url"
              inputMode="url"
              maxLength={MAX_URL_LENGTH}
              placeholder="Paste a product URL to track"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (formError) setFormError('');
              }}
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'track-url-error' : undefined}
            />
            <button className="addbar__btn" type="submit">
              Track price
            </button>
            {formError ? (
              <p className="addbar__error" id="track-url-error" role="alert">
                {formError}
              </p>
            ) : null}
          </form>
        </section>

        {!isEmpty ? (
          <>
            <section className="metrics" aria-label="Watchlist summary">
              <Metric label="Tracked" value={String(products.length)} />
              <Metric label="Live drops" value={String(dropped.length)} accent />
              <Metric label="Biggest saving" value={biggest ? rand(biggest.saved) : '—'} accent />
              <Metric label="Average drop" value={avgDrop ? `${avgDrop}%` : '—'} />
            </section>

            {topDrop ? <FeaturedDeal deal={topDrop} /> : null}
          </>
        ) : null}

        <div className="board-head">
          <h2>Watchlist</h2>
          <span className="board-head__stat">
            <b>{products.length}</b> tracked / <b>{dropped.length}</b> dropped
          </span>
        </div>

        {!isEmpty ? (
          <p className="board-sync">
            {lastChecked ? `Prices last checked ${ago(lastChecked, nowMs)}` : 'Checking prices'}, scored
            against each product&rsquo;s 90-day median, not the retailer&rsquo;s &ldquo;was&rdquo;.
          </p>
        ) : null}

        {isEmpty ? (
          <EmptyState onAddFocus={() => inputRef.current?.focus()} />
        ) : (
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="num">
                  Price
                </th>
                <th scope="col" className="num">
                  Drop
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                if (product.status === 'loading') {
                  return <LoadingRow key={product.id} product={product} onRemove={handleRemove} />;
                }
                if (product.status === 'failed') {
                  return (
                    <FailedRow
                      key={product.id}
                      product={product}
                      nowMs={nowMs}
                      onRetry={handleRetry}
                      onRemove={handleRemove}
                    />
                  );
                }
                return (
                  <ReadyRow key={product.id} deal={view(product)} nowMs={nowMs} onRemove={handleRemove} />
                );
              })}
            </tbody>
          </table>
        )}

        <Footer />
      </main>

      <div className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </div>
    </>
  );
}

function Footer(): JSX.Element | null {
  if (!KOFI_URL) return null;
  return (
    <footer className="foot">
      <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
        Support on Ko-fi
      </a>
    </footer>
  );
}
