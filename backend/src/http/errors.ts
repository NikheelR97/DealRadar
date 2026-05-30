/**
 * Typed application errors. Production responses serialise only { code, message }
 * — never stack traces, file paths, or DB errors (HANDOVER §11).
 */

export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'conflict'
  | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  conflict: 409,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (details !== undefined) this.details = details;
  }
}

export const notFound = (msg = 'not found'): AppError => new AppError('not_found', msg);
export const unauthorized = (msg = 'authentication required'): AppError =>
  new AppError('unauthorized', msg);
export const forbidden = (msg = 'forbidden'): AppError => new AppError('forbidden', msg);
export const badRequest = (msg = 'bad request'): AppError => new AppError('bad_request', msg);
