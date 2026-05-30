/**
 * Central error handler (HANDOVER §11). Production responses contain only
 * { error: { code, message } } — never stack traces, file paths, or DB errors.
 * Validation details are included (they describe the caller's own input, not internals).
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../http/errors.js';
import { isProduction } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'route not found' } });
}

// Express error middleware must keep its 4-arg signature to be recognised.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: { error: { code: string; message: string; details?: unknown } } = {
      error: { code: err.code, message: err.message },
    };
    if (err.code === 'validation_error' && err.details !== undefined) {
      body.error.details = err.details;
    }
    res.status(err.status).json(body);
    return;
  }

  // Unknown error — log server-side, return an opaque 500.
  console.error('[unhandled]', err);
  const message = isProduction ? 'internal server error' : String(err);
  res.status(500).json({ error: { code: 'internal_error', message } });
}
