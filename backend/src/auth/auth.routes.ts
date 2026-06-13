import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, registerUser } from './auth.service';
import { requireAuth } from './auth.middleware';
import { usersRepo, toPublicUser, DuplicateUsernameError } from './users.repo';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// .strict() is NOT used: unknown keys (e.g. a `role` an attacker adds)
// are stripped by z.object()'s default, so registration can't
// self-elevate. password capped at 72 — bcrypt silently truncates
// beyond that, so a longer value would be a false sense of security.
const registerSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(72),
  displayName: z.string().min(1).max(100),
});

const router = Router();

// 512B comfortably fits username + 72-char password + displayName plus
// JSON overhead, and short-circuits oversized bodies before bcrypt.
router.post(
  '/register',
  express.json({ limit: '512b' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const user = await registerUser(
        parsed.data.username,
        parsed.data.password,
        parsed.data.displayName,
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

// 256B is well above a realistic login body (~80 bytes for the
// demo account) and well below anything an attacker would want to
// throw at bcrypt. The 413 short-circuits the bcrypt compare on
// oversized credentials.
router.post('/login', express.json({ limit: '256b' }), async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const result = await authenticate(parsed.data.username, parsed.data.password);
  if (!result) {
    // Audit trail: failed-login patterns per IP are the brute-force
    // signal the rate limiter stops but never surfaces. Attempted
    // username only — never the password.
    req.log.warn(
      { event: 'auth.login.failure', username: parsed.data.username, ip: req.ip },
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
  res.json({ token: result.token, user: result.user });
});

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
