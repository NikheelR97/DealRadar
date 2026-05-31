import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { parseParams, parseQuery, validateBody } from './validate.js';
import { AppError } from '../http/errors.js';

const schema = z.object({ n: z.coerce.number().int().positive() });

function reqWith(part: Partial<Request>): Request {
  return part as Request;
}

describe('validateBody', () => {
  it('parses, replaces req.body, and calls next on success', () => {
    const req = reqWith({ body: { n: '5' } });
    const next = vi.fn() as unknown as NextFunction;
    validateBody(schema)(req, {} as Response, next);
    expect(req.body).toEqual({ n: 5 });
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws a validation_error with details on failure', () => {
    const req = reqWith({ body: { n: -1 } });
    expect(() => validateBody(schema)(req, {} as Response, vi.fn() as unknown as NextFunction)).toThrow(AppError);
    try {
      validateBody(schema)(req, {} as Response, vi.fn() as unknown as NextFunction);
    } catch (e) {
      expect((e as AppError).code).toBe('validation_error');
      expect(Array.isArray((e as AppError).details)).toBe(true);
    }
  });
});

describe('parseQuery / parseParams', () => {
  it('returns parsed output on success', () => {
    expect(parseQuery(schema, reqWith({ query: { n: '3' } }))).toEqual({ n: 3 });
    expect(parseParams(schema, reqWith({ params: { n: '4' } }))).toEqual({ n: 4 });
  });

  it('throws validation_error on bad input', () => {
    expect(() => parseQuery(schema, reqWith({ query: { n: 'x' } }))).toThrow(AppError);
    expect(() => parseParams(schema, reqWith({ params: {} }))).toThrow(AppError);
  });
});
