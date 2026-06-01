import { KOFI_URL } from './lib/constants';

/**
 * App shell + claymorphism demo. The real surfaces (tracked-items page, add form,
 * history modal) land in S6/S7; this renders sample ProductCard / DealBadge /
 * AddProductForm / SkeletonCard primitives so the clay design language is locked in
 * before those components are built. All styling lives in `styles/clay.css` (pure
 * CSS, CSP-safe). The heading and Ko-fi footer behaviour are unchanged.
 */

type DealTier = 'exceptional' | 'good' | 'modest' | 'none' | 'oos';

interface DemoProduct {
  name: string;
  retailer: string;
  price: string;
  was?: string;
  tier: DealTier;
  badge: string;
  thumb: string;
}

const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    name: 'Sony WH-1000XM5 Wireless Headphones',
    retailer: 'wootware.co.za',
    price: 'R5 499',
    was: 'R7 999',
    tier: 'exceptional',
    badge: '↓ 31% · Exceptional',
    thumb: '🎧',
  },
  {
    name: 'Apple iPad Air 11" (M2, 128GB)',
    retailer: 'istore.co.za',
    price: 'R12 999',
    was: 'R14 999',
    tier: 'good',
    badge: '↓ 13% · Good deal',
    thumb: '📱',
  },
  {
    name: 'Logitech MX Master 3S',
    retailer: 'evetech.co.za',
    price: 'R1 749',
    tier: 'oos',
    badge: 'Out of stock',
    thumb: '🖱️',
  },
];

function DealBadge({ tier, label }: { tier: DealTier; label: string }): JSX.Element {
  return <span className={`clay-badge clay-badge--${tier}`}>{label}</span>;
}

function ProductCard({ product }: { product: DemoProduct }): JSX.Element {
  return (
    <article className="clay-card clay-card--interactive">
      <div className="clay-thumb" aria-hidden="true">
        {product.thumb}
      </div>
      <h3 className="clay-product-name">{product.name}</h3>
      <p className="clay-retailer">{product.retailer}</p>
      <div className="clay-price-row">
        <span className="clay-price">{product.price}</span>
        {product.was ? <span className="clay-price-was">{product.was}</span> : null}
      </div>
      <DealBadge tier={product.tier} label={product.badge} />
    </article>
  );
}

function SkeletonCard(): JSX.Element {
  return (
    <article className="clay-card" aria-hidden="true">
      <div className="clay-thumb clay-skeleton" style={{ marginBottom: '1rem' }} />
      <div className="clay-skeleton" style={{ height: '1rem', width: '85%', marginBottom: '0.6rem' }} />
      <div className="clay-skeleton" style={{ height: '1rem', width: '55%', marginBottom: '1.1rem' }} />
      <div className="clay-skeleton" style={{ height: '1.6rem', width: '40%' }} />
    </article>
  );
}

export function App(): JSX.Element {
  return (
    <main className="clay-app">
      <header className="clay-hero">
        <h1>DealRadar</h1>
        <p>
          Black Friday price tracking for South African retailers. Below is a preview of the
          claymorphism design language the tracked-items UI will use.
        </p>
        <form
          className="clay-field"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <input
            className="clay-input"
            type="url"
            placeholder="Paste a product URL to track…"
            aria-label="Product URL to track"
          />
          <button className="clay-button" type="submit">
            Track price
          </button>
        </form>
      </header>

      <h2 className="clay-section-title">Tracked items</h2>
      <section className="clay-grid">
        {DEMO_PRODUCTS.map((product) => (
          <ProductCard key={product.name} product={product} />
        ))}
      </section>

      <h2 className="clay-section-title">Loading state</h2>
      <section className="clay-grid">
        <SkeletonCard />
        <SkeletonCard />
      </section>

      <Footer />
    </main>
  );
}

function Footer(): JSX.Element | null {
  if (!KOFI_URL) return null;
  return (
    <footer className="clay-footer">
      <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
        Support on Ko-fi ☕
      </a>
    </footer>
  );
}
