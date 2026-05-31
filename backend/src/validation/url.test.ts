import { describe, expect, it } from 'vitest';
import { validateProductUrl } from './url.js';
import { MAX_URL_LENGTH } from '../config/constants.js';

describe('validateProductUrl', () => {
  it('accepts an https URL on the retailer allowlist', () => {
    const result = validateProductUrl('https://koodoo.co.za/products/widget');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.retailerDomain).toBe('koodoo.co.za');
  });

  it('rejects non-https URLs', () => {
    const result = validateProductUrl('http://koodoo.co.za/products/widget');
    expect(result).toEqual({ ok: false, reason: 'not_https' });
  });

  it('rejects hosts not on the allowlist', () => {
    const result = validateProductUrl('https://evil.example.com/products/widget');
    expect(result).toEqual({ ok: false, reason: 'host_not_allowed' });
  });

  it('rejects URLs exceeding MAX_URL_LENGTH', () => {
    const long = `https://koodoo.co.za/${'a'.repeat(MAX_URL_LENGTH)}`;
    const result = validateProductUrl(long);
    expect(result).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rejects malformed input', () => {
    expect(validateProductUrl('not a url')).toEqual({ ok: false, reason: 'malformed' });
    expect(validateProductUrl('')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('strips the hash fragment but preserves the query string', () => {
    const result = validateProductUrl('https://www.takealot.com/p?id=5#reviews');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toContain('?id=5');
      expect(result.value.url).not.toContain('#reviews');
    }
  });
});
