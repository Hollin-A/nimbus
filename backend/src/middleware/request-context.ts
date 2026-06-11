import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger, type Logger } from '../logger';

// Augment Express's Request so req.id and req.log are typed everywhere
// downstream — same pattern auth.middleware uses for req.auth.
declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    log: Logger;
  }
}

// Mints a correlation id for every request, exposes a child logger
// pre-bound with it (req.log), and echoes it back as X-Request-ID so a
// client can quote the id from a failed response and we can grep every
// log line for that one request.
//
// We always generate our own id rather than honouring an inbound
// X-Request-ID: there's no trusted upstream setting one today, and
// accepting a caller-supplied value is a spoofing / log-injection
// vector. Honouring inbound becomes a deliberate choice if we ever sit
// behind a proxy that sets it.
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  req.id = id;
  req.log = logger.child({ reqId: id });
  res.setHeader('X-Request-ID', id);
  next();
}
