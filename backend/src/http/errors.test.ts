import { describe, expect, it } from 'vitest';
import { AppError, badRequest, forbidden, notFound, unauthorized } from './errors.js';

describe('AppError', () => {
  it('maps codes to HTTP statuses', () => {
    expect(new AppError('not_found', 'x').status).toBe(404);
    expect(new AppError('validation_error', 'x').status).toBe(400);
    expect(new AppError('unauthorized', 'x').status).toBe(401);
    expect(new AppError('forbidden', 'x').status).toBe(403);
    expect(new AppError('conflict', 'x').status).toBe(409);
    expect(new AppError('rate_limited', 'x').status).toBe(429);
    expect(new AppError('internal_error', 'x').status).toBe(500);
  });

  it('carries optional details only when provided', () => {
    expect(new AppError('bad_request', 'x').details).toBeUndefined();
    expect(new AppError('validation_error', 'x', [{ a: 1 }]).details).toEqual([{ a: 1 }]);
  });

  it('exposes helper constructors with default messages', () => {
    expect(notFound().code).toBe('not_found');
    expect(unauthorized().code).toBe('unauthorized');
    expect(forbidden().code).toBe('forbidden');
    expect(badRequest().code).toBe('bad_request');
    expect(notFound('custom').message).toBe('custom');
  });
});
