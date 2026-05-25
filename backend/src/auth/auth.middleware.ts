import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type AuthClaims } from './auth.service';

// Augment Express's Request so req.auth is typed everywhere downstream.
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthClaims;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const [scheme, token, ...rest] = header.split(' ');
  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    res.status(401).json({ error: 'Invalid Authorization header' });
    return;
  }

  const claims = verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.auth = claims;
  next();
}
