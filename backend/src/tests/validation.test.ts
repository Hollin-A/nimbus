import { describe, it, expect, vi } from 'vitest';
import { z, ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { validateBody, validateQuery } from '../middleware/validation';

const schema = z.object({ name: z.string().min(1) });

function ctx(source: { body?: unknown; query?: unknown }) {
  const req = { body: source.body, query: source.query } as Request;
  const res = { locals: {} } as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('validateBody', () => {
  it('assigns the parsed body and calls next with no error', () => {
    const { req, res, next } = ctx({ body: { name: 'ok' } });
    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'ok' });
  });

  it('forwards a ZodError to next on invalid input', () => {
    const { req, res, next } = ctx({ body: { name: '' } });
    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });
});

describe('validateQuery', () => {
  it('stores the parsed query on res.locals and calls next with no error', () => {
    const { req, res, next } = ctx({ query: { name: 'ok' } });
    validateQuery(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.locals.query).toEqual({ name: 'ok' });
  });

  it('forwards a ZodError to next on invalid input', () => {
    const { req, res, next } = ctx({ query: {} });
    validateQuery(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });
});
