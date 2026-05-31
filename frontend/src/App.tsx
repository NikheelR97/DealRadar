import { KOFI_URL } from './lib/constants';

/**
 * App shell. Real surfaces (tracked-items page, add form, history modal) land in
 * S6/S7. For S0/S1 this renders a minimal, healthy placeholder so the frontend
 * container serves a 200 and the deploy gate passes.
 */
export function App(): JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>DealRadar</h1>
      <p>Black Friday price tracking for South African retailers.</p>
      <p>The app is scaffolding. Tracked items and deal scoring arrive in later sprints.</p>
      <Footer />
    </main>
  );
}

function Footer(): JSX.Element | null {
  if (!KOFI_URL) return null;
  return (
    <footer style={{ marginTop: '2rem', fontSize: '0.9rem' }}>
      <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
        Support on Ko-fi ☕
      </a>
    </footer>
  );
}
