import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyToken, type AuthClaims } from './auth.service';

// Augment Express's Request so req.auth is typed everywhere downstream.
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthClaims;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // A pattern of rejections from one IP can indicate stolen-token usage
  // or probing; the reason distinguishes "no credentials" from "bad
  // credentials". reqId ties each line to its morgan access line.
  const header = req.headers.authorization;
  if (!header) {
    req.log.warn({ event: 'auth.reject', reason: 'missing', ip: req.ip }, 'auth rejected');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const [scheme, token, ...rest] = header.split(' ');
  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    req.log.warn({ event: 'auth.reject', reason: 'malformed', ip: req.ip }, 'auth rejected');
    res.status(401).json({ error: 'Invalid Authorization header' });
    return;
  }

  const claims = verifyToken(token);
  if (!claims) {
    req.log.warn(
      { event: 'auth.reject', reason: 'invalid_or_expired', ip: req.ip },
      'auth rejected',
    );
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.auth = claims;
  next();
}

// Authorization guard — layered AFTER requireAuth, which has already set
// req.auth from the verified token. Reads the role straight off the JWT
// claims (no DB hit). 401 means "not authenticated"; 403 means
// "authenticated but insufficient role" — a distinction the client needs,
// since a 401 is refreshable and a 403 is not.
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (req.auth.role !== role) {
      req.log.warn(
        {
          event: 'auth.forbidden',
          userId: req.auth.sub,
          required: role,
          actual: req.auth.role,
          ip: req.ip,
        },
        'forbidden',
      );
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
