import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock only KOFI_URL so the Footer's KOFI-set branch renders; keep the real
// threshold constants the watchlist derives its deal tiers from.
vi.mock('./lib/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/constants')>()),
  KOFI_URL: 'https://ko-fi.com/test',
}));

const { App } = await import('./App');

describe('Footer with KOFI_URL set', () => {
  it('renders an outbound Ko-fi link', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: /ko-fi/i });
    expect(link).toHaveAttribute('href', 'https://ko-fi.com/test');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
