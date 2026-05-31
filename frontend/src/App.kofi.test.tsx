import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the constant so the Footer's KOFI-set branch renders.
vi.mock('./lib/constants', () => ({ KOFI_URL: 'https://ko-fi.com/test' }));

const { App } = await import('./App');

describe('Footer with KOFI_URL set', () => {
  it('renders an outbound Ko-fi link', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: /ko-fi/i });
    expect(link).toHaveAttribute('href', 'https://ko-fi.com/test');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
