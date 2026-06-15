import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Validates `req.body` against `schema`, replacing it with the parsed (and
 * defaulted/coerced) result. On failure the ZodError is forwarded to the
 * global error handler, which renders it as a 400. Keeps route handlers free
 * of repeated `safeParse` → 400 boilerplate.
 */
export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Like `validateBody`, but for `req.query`. The parsed result is stored on
 * `res.locals.query` (req.query is a read-only getter in newer Express), so
 * handlers read the validated query from there.
 */
export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
