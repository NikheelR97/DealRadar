/**
 * Zod validation boundary (HANDOVER §7 — all bodies validated, all responses typed).
 * `validateBody` is middleware; `parseQuery`/`parseParams` are called inside handlers.
 * Any Zod failure becomes a 400 validation_error with field-level details.
 *
 * Generics infer from the schema and resolve to its OUTPUT type (post-default,
 * post-coerce) — so defaulted fields are non-optional at the call site.
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { AppError } from '../http/errors.js';

function toAppError(err: ZodError): AppError {
  const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return new AppError('validation_error', 'request validation failed', details);
}

export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) throw toAppError(result.error);
    req.body = result.data as output<S>;
    next();
  };
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): output<S> {
  const result = schema.safeParse(req.query);
  if (!result.success) throw toAppError(result.error);
  return result.data;
}

export function parseParams<S extends ZodTypeAny>(schema: S, req: Request): output<S> {
  const result = schema.safeParse(req.params);
  if (!result.success) throw toAppError(result.error);
  return result.data;
}
