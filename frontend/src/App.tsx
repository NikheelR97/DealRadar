import { KOFI_URL } from './lib/constants';

/**
 * App shell - "Deal board" watchlist (SKILL-driven redesign). A dense, scannable
 * table surface for deal-hunters who re-scan many items daily; the emerald Drop
 * column is the one signal the watchlist exists to show. Styling lives in
 * `styles/theme.css` (self-hosted fonts, CSP-safe). Heading text and Ko-fi footer
 * behaviour unchanged. No em-dashes in any visible string (SKILL 9.G).
 */

type Status = 'live' | 'dead';

interface TrackedProduct {
  name: string;
  retailer: string;
  now: string;
  was?: string;
  delta: string; // emerald Drop column - the focal signal
  status: Status;
  statusLabel: string;
}

const WATCHLIST: readonly TrackedProduct[] = [
  {
    name: 'Sony WH-1000XM5 Wireless Headphones',
    retailer: 'Wootware',
    now: 'R5 499',
    was: 'R7 999',
    delta: '↓ 31%',
    status: 'live',
    statusLabel: 'Exceptional',
  },
  {
    name: 'Apple iPad Air 11" (M2, 128GB)',
    retailer: 'iStore',
    now: 'R12 999',
    was: 'R14 999',
    delta: '↓ 13%',
    status: 'live',
    statusLabel: 'Good deal',
  },
  {
    name: 'Samsung 49" Odyssey OLED G9',
    retailer: 'Evetech',
    now: 'R28 499',
    was: 'R29 999',
    delta: '↓ 5%',
    status: 'live',
    statusLabel: 'Modest',
  },
  {
    name: 'Logitech MX Master 3S',
    retailer: 'Evetech',
    now: 'R1 749',
    delta: 'OOS',
    status: 'dead',
    statusLabel: 'Out of stock',
  },
];

function BoardRow({ product, index }: { product: TrackedProduct; index: number }): JSX.Element {
  const live = product.status === 'live';
  return (
    <tr style={{ '--i': index } as React.CSSProperties}>
      <td data-label="Product">
        <div className="cell-name">{product.name}</div>
        <div className="cell-retailer">{product.retailer}</div>
      </td>
      <td className="num" data-label="Price">
        <span className="cell-now">{product.now}</span>
        {product.was ? <span className="cell-was">{product.was}</span> : null}
      </td>
      <td className="num" data-label="Drop">
        <span className={`delta${live ? '' : ' delta--none'}`}>{product.delta}</span>
      </td>
      <td data-label="Status">
        <span className={`tag ${live ? 'tag--live' : 'tag--dead'}`}>{product.statusLabel}</span>
      </td>
    </tr>
  );
}

export function App(): JSX.Element {
  const dropped = WATCHLIST.filter((p) => p.status === 'live').length;
  return (
    <>
      <header className="topbar">
        <h1 className="wordmark">DealRadar</h1>
        <span className="topbar__meta">Black Friday price watch</span>
      </header>

      <main className="page">
        <p className="intro">
          Track South African retailer prices and catch the drop the moment it lands.
        </p>
        <form
          className="addbar"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label className="visually-hidden" htmlFor="track-url">
            Product URL to track
          </label>
          <input
            id="track-url"
            className="addbar__input"
            type="url"
            placeholder="Paste a product URL to track…"
          />
          <button className="addbar__btn" type="submit">
            Track price
          </button>
        </form>

        <div className="board-head">
          <h2>Watchlist</h2>
          <span className="board-head__stat">
            <b>{WATCHLIST.length}</b> tracked / <b>{dropped}</b> dropped
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
            {WATCHLIST.map((product, i) => (
              <BoardRow key={product.name} product={product} index={i} />
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
        Support on Ko-fi ☕
      </a>
    </footer>
  );
}
