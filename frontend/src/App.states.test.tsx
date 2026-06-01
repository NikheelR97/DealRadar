import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';

// The mocked price check resolves on a timer; drive it deterministically.
describe('watchlist state coverage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  function track(url: string): void {
    fireEvent.change(screen.getByLabelText(/product url to track/i), { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: /track price/i }));
  }

  it('rejects an invalid URL with an inline alert and adds no row', () => {
    render(<App />);
    const before = screen.getAllByRole('button', { name: /stop tracking/i }).length;
    track('not a url');
    expect(screen.getByRole('alert')).toHaveTextContent(/doesn't look like a link/i);
    expect(screen.getAllByRole('button', { name: /stop tracking/i })).toHaveLength(before);
  });

  it('optimistically adds a loading row, then resolves it to a priced row', () => {
    render(<App />);
    track('https://www.wootware.co.za/test-headphones');
    expect(screen.getByText(/checking price/i)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));

    expect(screen.queryByText(/checking price/i)).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText(/test headphones/i)).toBeInTheDocument();
  });

  it('blocks a duplicate URL once it is already tracked', () => {
    render(<App />);
    track('https://www.takealot.com/some-product/PLID42');
    track('https://www.takealot.com/some-product/PLID42');
    expect(screen.getByRole('alert')).toHaveTextContent(/already tracking/i);
  });

  it('shows the teaching empty state after every row is removed', () => {
    render(<App />);
    let [first] = screen.queryAllByRole('button', { name: /stop tracking/i });
    while (first) {
      fireEvent.click(first);
      [first] = screen.queryAllByRole('button', { name: /stop tracking/i });
    }
    // The empty state teaches by showing a worked example and a CTA back to the input.
    expect(screen.getByRole('button', { name: /paste a product url/i })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /example of a tracked deal/i })).toBeInTheDocument();
  });
});
