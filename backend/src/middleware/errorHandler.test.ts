import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../http/errors.js';
import { errorHandler, notFoundHandler } from './errorHandler.js';

function mockRes(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

const noop = vi.fn() as unknown as NextFunction;

afterEach(() => vi.restoreAllMocks());

describe('notFoundHandler', () => {
  it('returns a typed 404', () => {
    const res = mockRes();
    notFoundHandler({} as Request, res);
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: { code: 'not_found', message: 'route not found' } });
  });
});

describe('errorHandler', () => {
  it('serialises validation errors with details', () => {
    const res = mockRes();
    errorHandler(new AppError('validation_error', 'bad', [{ path: 'n' }]), {} as Request, res, noop);
    expect(res._status).toBe(400);
    expect(res._body).toEqual({
      error: { code: 'validation_error', message: 'bad', details: [{ path: 'n' }] },
    });
  });

  it('serialises a plain AppError without details', () => {
    const res = mockRes();
    errorHandler(new AppError('not_found', 'nope'), {} as Request, res, noop);
    expect(res._body).toEqual({ error: { code: 'not_found', message: 'nope' } });
  });

  it('returns a 500 with a visible message in non-production', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    errorHandler(new Error('boom'), {} as Request, res, noop);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: { code: 'internal_error' } });
    expect(JSON.stringify(res._body)).toContain('boom');
  });

  it('hides the message in production', async () => {
    vi.resetModules();
    vi.doMock('../config/env.js', () => ({ isProduction: true }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { errorHandler: prodHandler } = await import('./errorHandler.js');
    const res = mockRes();
    prodHandler(new Error('secret-detail'), {} as Request, res, noop);
    expect(JSON.stringify(res._body)).not.toContain('secret-detail');
    expect(res._body).toEqual({ error: { code: 'internal_error', message: 'internal server error' } });
    vi.doUnmock('../config/env.js');
  });
});
