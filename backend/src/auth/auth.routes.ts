import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from './auth.service';
import { requireAuth } from './auth.middleware';
import { findById, toPublicUser } from './users.store';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const router = Router();

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

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    // Defensive — requireAuth guarantees req.auth, but TS doesn't know that.
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = findById(claims.sub);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: toPublicUser(user) });
});

export default router;
