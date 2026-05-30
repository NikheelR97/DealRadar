import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App shell', () => {
  it('renders the product heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /dealradar/i })).toBeInTheDocument();
  });

  it('does not render a Ko-fi link when KOFI_URL is unset', () => {
    render(<App />);
    expect(screen.queryByRole('link', { name: /ko-fi/i })).not.toBeInTheDocument();
  });
});
