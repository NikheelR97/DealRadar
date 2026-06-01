import {
  DEAL_THRESHOLD_EXCEPTIONAL_PCT,
  DEAL_THRESHOLD_GOOD_PCT,
  DEAL_THRESHOLD_MODEST_PCT,
  KOFI_URL,
} from './lib/constants';

/**
 * App shell - DealRadar watchlist (SKILL-driven redesign, pass 2).
 *
 * Design read: a price-watch product UI for daily deal-hunters. Dark Linear-
 * utilitarian language, a single acid-lime accent reserved for the drop figures,
 * system-mono tabular numerals, hairline structure (no card chrome spam). The page
 * earns its hierarchy from three moments: a metric strip, a featured best-drop, and
 * the dense watchlist. Dials VARIANCE 4 / MOTION 4 / DENSITY 6. Off-black base
 * (never pure #000), one faint vignette, no decorative dots, no em-dashes (SKILL 9.G).
 *
 * Display is DERIVED, not hardcoded: percent, rands-saved and deal tier all compute
 * from price numbers against the shared DEAL_THRESHOLD_* constants, so a label can
 * never drift from its data. Styling lives in `styles/theme.css` (self-hosted fonts,
 * CSP-safe). Heading text and Ko-fi footer behaviour unchanged.
 */

type Tier = 'exceptional' | 'good' | 'modest' | 'flat' | 'dead';

interface TrackedProduct {
  name: string;
  retailer: string;
  now: number;
  was?: number;
  inStock: boolean;
}

/** Single source of truth for the demo watchlist. Prices in ZAR. */
const WATCHLIST: readonly TrackedProduct[] = [
  { name: 'Sony WH-1000XM5 Wireless Headphones', retailer: 'Wootware', now: 5499, was: 7999, inStock: true },
  { name: 'Samsung 49" Odyssey OLED G9', retailer: 'Evetech', now: 22499, was: 29999, inStock: true },
  { name: 'Apple iPad Air 11" (M2, 128GB)', retailer: 'iStore', now: 11499, was: 12999, inStock: true },
  { name: 'Logitech MX Master 3S', retailer: 'Evetech', now: 1749, was: 1749, inStock: false },
];

// ── Derived display helpers ──────────────────────────────────────────────────

/** ZAR with non-breaking thin thousands separators, e.g. 5499 -> "R5 499". */
function rand(value: number): string {
  return 'R' + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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

function view(product: TrackedProduct): DealView {
  if (!product.inStock) return { product, pct: 0, saved: 0, tier: 'dead' };
  const was = product.was ?? product.now;
  const saved = Math.max(0, was - product.now);
  const pct = was > 0 ? Math.round((saved / was) * 100) : 0;
  const tier: Tier =
    pct >= DEAL_THRESHOLD_EXCEPTIONAL_PCT ? 'exceptional'
    : pct >= DEAL_THRESHOLD_GOOD_PCT ? 'good'
    : pct >= DEAL_THRESHOLD_MODEST_PCT ? 'modest'
    : 'flat';
  return { product, pct, saved, tier };
}

// ── Sections ─────────────────────────────────────────────────────────────────

function RadarMark(): JSX.Element {
  // Simple geometric brand mark (concentric radar sweep). One motivated, reduced-
  // motion-safe ping ring: the product "scans" retailers for drops.
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
          <span className="featured__now">{rand(product.now)}</span>
          {product.was ? <span className="featured__was">{rand(product.was)}</span> : null}
        </div>
      </div>
      <div className="featured__signal">
        <span className="featured__pct">{`↓ ${pct}%`}</span>
        <span className="featured__saved">{`${rand(saved)} off`}</span>
        <span className={`tag tag--${deal.tier}`}>{TIER_LABEL[deal.tier]}</span>
      </div>
    </section>
  );
}

function BoardRow({ deal, index }: { deal: DealView; index: number }): JSX.Element {
  const { product, pct, saved, tier } = deal;
  const live = tier !== 'dead';
  return (
    <tr style={{ '--i': index } as React.CSSProperties}>
      <td data-label="Product">
        <div className="cell-name">{product.name}</div>
        <div className="cell-retailer">{product.retailer}</div>
      </td>
      <td className="num" data-label="Price">
        <span className="cell-now">{rand(product.now)}</span>
        {product.was && product.was > product.now ? (
          <span className="cell-was">{rand(product.was)}</span>
        ) : null}
      </td>
      <td className="num" data-label="Drop">
        {live && pct > 0 ? (
          <>
            <span className="delta">{`↓ ${pct}%`}</span>
            <span className="delta-saved">{`${rand(saved)} off`}</span>
          </>
        ) : (
          <span className="delta delta--none">{live ? 'No drop' : '-'}</span>
        )}
      </td>
      <td data-label="Status">
        <span className={`tag tag--${tier}`}>{TIER_LABEL[tier]}</span>
      </td>
    </tr>
  );
}

export function App(): JSX.Element {
  const deals = WATCHLIST.map(view);
  const live = deals.filter((d) => d.tier !== 'dead');
  const dropped = live.filter((d) => d.pct > 0);
  // Two distinct highlights: the metric strip shows the biggest rand saving, the
  // featured panel shows the steepest percentage drop (the best deal by quality).
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
          <form className="addbar" onSubmit={(e) => e.preventDefault()}>
            <label className="visually-hidden" htmlFor="track-url">
              Product URL to track
            </label>
            <input
              id="track-url"
              className="addbar__input"
              type="url"
              placeholder="Paste a product URL to track"
            />
            <button className="addbar__btn" type="submit">
              Track price
            </button>
          </form>
        </section>

        <section className="metrics" aria-label="Watchlist summary">
          <Metric label="Tracked" value={String(WATCHLIST.length)} />
          <Metric label="Live drops" value={String(dropped.length)} accent />
          <Metric label="Biggest saving" value={biggest ? rand(biggest.saved) : '-'} accent />
          <Metric label="Average drop" value={avgDrop ? `${avgDrop}%` : '-'} />
        </section>

        {topDrop ? <FeaturedDeal deal={topDrop} /> : null}

        <div className="board-head">
          <h2>Watchlist</h2>
          <span className="board-head__stat">
            <b>{WATCHLIST.length}</b> tracked / <b>{dropped.length}</b> dropped
          </span>
        </div>

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
            {deals.map((deal, i) => (
              <BoardRow key={deal.product.name} deal={deal} index={i} />
            ))}
          </tbody>
        </table>

        <Footer />
      </main>
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
