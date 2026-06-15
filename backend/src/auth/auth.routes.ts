import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  registerUser,
  requestPasswordReset,
  confirmPasswordReset,
  refreshSession,
  logout,
} from './auth.service';
import { requireAuth } from './auth.middleware';
import { validateBody } from '../middleware/validation';
import { usersRepo, toPublicUser, DuplicateUsernameError } from './users.repo';

// Usernames are case-insensitive: trim + lowercase at the validation
// boundary so Admin / ADMIN / admin are one account, and length checks
// apply to the normalised value. displayName keeps the user's casing
// for presentation.
const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

// .strict() is NOT used: unknown keys (e.g. a `role` an attacker adds)
// are stripped by z.object()'s default, so registration can't
// self-elevate. password capped at 72 — bcrypt silently truncates
// beyond that, so a longer value would be a false sense of security.
const registerSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(30),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(100),
});

const resetRequestSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
});
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const resetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

const router = Router();

// 512B comfortably fits username + 72-char password + displayName plus
// JSON overhead, and short-circuits oversized bodies before bcrypt.
router.post(
  '/register',
  express.json({ limit: '512b' }),
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await registerUser(
        req.body.username,
        req.body.password,
        req.body.displayName,
      );
      req.log.info(
        { event: 'auth.register', userId: user.id, username: user.username, ip: req.ip },
        'registered',
      );
      res.status(201).json({ user });
    } catch (err) {
      if (err instanceof DuplicateUsernameError) {
        res.status(409).json({ error: 'Username already taken' });
        return;
      }
      // Unexpected (e.g. DB error): hand to the error handler. A thrown
      // rejection in an async Express 4 handler would otherwise surface
      // as an unhandledRejection, not a 500.
      next(err);
    }
  },
);

// Issues a single-use reset token. With no mail service in this demo the
// raw token is returned in the response (the UI surfaces this), which
// makes accounts enumerable via the 404 below — an accepted trade-off
// for a portfolio app with no private data. The login route, by
// contrast, is deliberately enumeration-resistant. See
// requestPasswordReset for the full reasoning.
router.post(
  '/password-reset/request',
  express.json({ limit: '256b' }),
  validateBody(resetRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const issued = await requestPasswordReset(req.body.username);
      if (!issued) {
        res.status(404).json({ error: 'No account with that username' });
        return;
      }
      req.log.info(
        { event: 'auth.password_reset.request', username: req.body.username, ip: req.ip },
        'password reset requested',
      );
      res.status(200).json({
        token: issued.token,
        expiresAt: issued.expiresAt,
        note: 'This token would normally be emailed; it is returned here because the demo has no mail service.',
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/password-reset/confirm',
  express.json({ limit: '512b' }),
  validateBody(resetConfirmSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ok = await confirmPasswordReset(req.body.token, req.body.password);
      if (!ok) {
        res.status(400).json({ error: 'Invalid or expired reset token' });
        return;
      }
      req.log.info({ event: 'auth.password_reset.confirm', ip: req.ip }, 'password reset confirmed');
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// 256B is well above a realistic login body (~80 bytes for the
// demo account) and well below anything an attacker would want to
// throw at bcrypt. The 413 short-circuits the bcrypt compare on
// oversized credentials.
router.post(
  '/login',
  express.json({ limit: '256b' }),
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const result = await authenticate(req.body.username, req.body.password);
    if (!result) {
      // Audit trail: failed-login patterns per IP are the brute-force
      // signal the rate limiter stops but never surfaces. Attempted
      // username only — never the password.
      req.log.warn(
        { event: 'auth.login.failure', username: req.body.username, ip: req.ip },
        'login failed',
      );
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    req.log.info(
      {
        event: 'auth.login.success',
        userId: result.user.id,
        username: result.user.username,
        ip: req.ip,
      },
      'login succeeded',
    );
    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  },
);

// Exchanges a refresh token for a fresh access + refresh pair (rotation).
// No requireAuth: the access token is expected to be expired by the time
// the client calls this — the refresh token is the credential.
router.post(
  '/refresh',
  express.json({ limit: '512b' }),
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await refreshSession(req.body.refreshToken);
      if (!result) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
        return;
      }
      req.log.info({ event: 'auth.refresh', userId: result.user.id, ip: req.ip }, 'token refreshed');
      res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Revokes the current refresh token. Idempotent (200 even for an unknown
// token); no requireAuth — see logout() for why.
router.post(
  '/logout',
  express.json({ limit: '512b' }),
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await logout(req.body.refreshToken);
      req.log.info({ event: 'auth.logout', ip: req.ip }, 'logged out');
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    // Defensive — requireAuth guarantees req.auth, but TS doesn't know that.
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await usersRepo.findById(claims.sub);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: toPublicUser(user) });
});

export default router;
